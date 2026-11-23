const express = require("express");
const crypto = require("node:crypto");

const router = express.Router();

function readAccessToken(token, secret) {
  if (!secret || String(secret).length < 32 || typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const expected = crypto.createHmac("sha256", secret).update(parts[0] + "." + parts[1]).digest();
    const actual = Buffer.from(parts[2], "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload.sub || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

async function requireSuperAdmin(req, res, next) {
  const env = req.app.locals.authEnv || process.env;
  const db = req.app.locals.db;
  const match = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "");
  const payload = match && readAccessToken(match[1], env.ACCESS_TOKEN_SECRET);
  if (!db) return res.status(503).json({ error: "Lottery administration is temporarily unavailable." });
  if (env.AUTH_ENABLED !== "true" || !env.ADMIN_EMAIL || !payload) {
    return res.status(401).json({ error: "Super Admin authentication required." });
  }
  try {
    const result = await db.query(
      "SELECT u.id,u.email,u.email_verified_at,u.status,COALESCE(array_agg(DISTINCT ur.role_key) FILTER (WHERE ur.role_key IS NOT NULL),ARRAY[]::varchar[]) AS roles FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id WHERE u.id=$1 AND u.status='active' GROUP BY u.id LIMIT 1",
      [payload.sub]
    );
    const user = result.rows[0];
    if (!user || !user.email_verified_at || !user.roles.includes("super_admin") ||
        String(user.email).toLowerCase() !== String(env.ADMIN_EMAIL).trim().toLowerCase()) {
      return res.status(403).json({ error: "Super Admin access denied." });
    }
    req.superAdmin = { id: user.id, email: user.email };
    return next();
  } catch {
    return res.status(503).json({ error: "Lottery administration is temporarily unavailable." });
  }
}

function validId(value) { return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value); }
function cleanText(value, max) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function validHttps(value) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; }
  catch { return null; }
}
async function audit(db, actor, eventKey, entityType, entityId, metadata = {}) {
  await db.query(
    "INSERT INTO raffle_audit_events(actor_user_id,event_key,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)",
    [actor, eventKey, entityType, entityId || null, JSON.stringify(metadata)]
  );
}

// Public, read-only status. Never exposes a purchase or payment operation.
router.get("/status", async (req, res) => {
  const db = req.app.locals.db;
  if (!db) return res.set("Cache-Control", "no-store").status(503).json({
    status: "planned", salesEnabled: false, livePaymentsEnabled: false, liveDrawsEnabled: false
  });
  try {
    const result = await db.query(
      "SELECT public_status FROM raffle_feature_control WHERE id=1"
    );
    const status = result.rows[0]?.public_status || "planned";
    return res.set("Cache-Control", "no-store").json({
      status: status === "active" ? "planned" : status,
      salesEnabled: false, livePaymentsEnabled: false, liveDrawsEnabled: false
    });
  } catch {
    return res.set("Cache-Control", "no-store").status(503).json({
      status: "planned", salesEnabled: false, livePaymentsEnabled: false, liveDrawsEnabled: false
    });
  }
});

// Everything below this point is private Super Admin-only administration.
router.use("/admin", requireSuperAdmin);

router.get("/admin/overview", async (req, res) => {
  const db = req.app.locals.db;
  try {
    const [control, licence, providers, campaigns, counts, events] = await Promise.all([
      db.query("SELECT public_status,sales_enabled,live_payments_enabled,live_draws_enabled,updated_at FROM raffle_feature_control WHERE id=1"),
      db.query("SELECT id,authority,licence_type,reference_number,status,valid_from,valid_until,document_url,notes,created_at,updated_at FROM raffle_licence_records ORDER BY created_at DESC LIMIT 10"),
      db.query("SELECT provider_key,provider_name,status,merchant_reference,approval_document_url,updated_at FROM raffle_provider_approvals ORDER BY provider_name"),
      db.query("SELECT id,campaign_name,status,currency,ticket_price_minor,prize_description,rules_text,starts_at,ends_at,draw_at,created_at,updated_at FROM raffle_campaigns ORDER BY created_at DESC LIMIT 50"),
      db.query("SELECT (SELECT COUNT(*)::int FROM raffle_campaigns) AS campaigns,(SELECT COUNT(*)::int FROM raffle_tickets) AS sandbox_tickets,(SELECT COUNT(*)::int FROM raffle_payment_records) AS simulated_payments,(SELECT COUNT(*)::int FROM raffle_draw_records) AS sandbox_draws"),
      db.query("SELECT id,event_key,entity_type,entity_id,metadata,created_at FROM raffle_audit_events ORDER BY created_at DESC LIMIT 30")
    ]);
    return res.set("Cache-Control", "no-store").json({
      control: control.rows[0] || { public_status: "planned", sales_enabled: false, live_payments_enabled: false, live_draws_enabled: false },
      licences: licence.rows, providers: providers.rows, campaigns: campaigns.rows,
      counts: counts.rows[0], auditEvents: events.rows,
      safety: { publicSales: false, livePayments: false, liveDraws: false, environment: "sandbox_only" }
    });
  } catch {
    return res.status(503).json({ error: "Lottery admin data is temporarily unavailable." });
  }
});

router.post("/admin/campaigns", async (req, res) => {
  const name = cleanText(req.body?.campaignName, 160);
  const prize = cleanText(req.body?.prizeDescription, 3000);
  const rules = cleanText(req.body?.rulesText, 10000);
  const ticketPriceMinor = req.body?.ticketPriceMinor == null || req.body.ticketPriceMinor === ""
    ? null : Number(req.body.ticketPriceMinor);
  if (!name || !rules || (ticketPriceMinor !== null &&
      (!Number.isSafeInteger(ticketPriceMinor) || ticketPriceMinor < 0 || ticketPriceMinor > 100000000))) {
    return res.status(400).json({ error: "Enter a campaign name, rules and a valid optional ticket price." });
  }
  try {
    const result = await req.app.locals.db.query(
      "INSERT INTO raffle_campaigns(campaign_name,status,currency,ticket_price_minor,prize_description,rules_text,created_by) VALUES($1,'draft','ETB',$2,$3,$4,$5) RETURNING id,campaign_name,status,currency,ticket_price_minor,prize_description,rules_text,created_at",
      [name, ticketPriceMinor, prize, rules, req.superAdmin.id]
    );
    await audit(req.app.locals.db, req.superAdmin.id, "sandbox_campaign_created", "campaign", result.rows[0].id);
    return res.status(201).json({ campaign: result.rows[0], publicSales: false });
  } catch {
    return res.status(503).json({ error: "Campaign draft could not be saved." });
  }
});

router.patch("/admin/campaigns/:id", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid campaign." });
  const name = cleanText(req.body?.campaignName, 160);
  const prize = cleanText(req.body?.prizeDescription, 3000);
  const rules = cleanText(req.body?.rulesText, 10000);
  if (!name || !rules) return res.status(400).json({ error: "Campaign name and rules are required." });
  try {
    const result = await req.app.locals.db.query(
      "UPDATE raffle_campaigns SET campaign_name=$2,prize_description=$3,rules_text=$4,updated_at=NOW() WHERE id=$1 AND status IN ('draft','planned','pending_approval') RETURNING id,campaign_name,status,prize_description,rules_text,updated_at",
      [req.params.id, name, prize, rules]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Draft campaign not found or not editable." });
    await audit(req.app.locals.db, req.superAdmin.id, "sandbox_campaign_updated", "campaign", req.params.id);
    return res.json({ campaign: result.rows[0], publicSales: false });
  } catch {
    return res.status(503).json({ error: "Campaign draft could not be updated." });
  }
});

router.post("/admin/licences", async (req, res) => {
  const reference = cleanText(req.body?.referenceNumber, 120) || null;
  const status = ["not_applied","preparing","submitted","under_review","approved","rejected","expired"].includes(req.body?.status)
    ? req.body.status : "preparing";
  const documentUrl = validHttps(req.body?.documentUrl);
  if (status === "approved" && (!reference || !documentUrl || !req.body?.validUntil)) {
    return res.status(400).json({ error: "An approved licence requires a reference, document URL and expiry date." });
  }
  try {
    const result = await req.app.locals.db.query(
      "INSERT INTO raffle_licence_records(authority,licence_type,reference_number,status,valid_from,valid_until,document_url,verified_by,verified_at,notes) VALUES('Ethiopian Lottery Service','own_raffle',$1,$2,$3,$4,$5,$6,CASE WHEN $2='approved' THEN NOW() ELSE NULL END,$7) RETURNING id,status,reference_number,valid_from,valid_until,document_url,notes",
      [reference, status, req.body?.validFrom || null, req.body?.validUntil || null, documentUrl, req.superAdmin.id, cleanText(req.body?.notes, 2000)]
    );
    await audit(req.app.locals.db, req.superAdmin.id, "licence_record_created", "licence", result.rows[0].id, { status });
    return res.status(201).json({ licence: result.rows[0], liveActivation: false });
  } catch {
    return res.status(503).json({ error: "Licence record could not be saved." });
  }
});

router.patch("/admin/providers/:providerKey", async (req, res) => {
  const key = req.params.providerKey;
  const status = req.body?.status;
  const allowed = ["not_requested","requested","under_review","approved","rejected","suspended"];
  const merchant = cleanText(req.body?.merchantReference, 120) || null;
  const documentUrl = validHttps(req.body?.approvalDocumentUrl);
  if (!["cbe","telebirr","mpesa"].includes(key) || !allowed.includes(status)) {
    return res.status(400).json({ error: "Invalid provider or approval status." });
  }
  if (status === "approved" && (!merchant || !documentUrl)) {
    return res.status(400).json({ error: "Provider approval requires a merchant reference and approval document." });
  }
  try {
    const result = await req.app.locals.db.query(
      "UPDATE raffle_provider_approvals SET status=$2,merchant_reference=$3,approval_document_url=$4,verified_by=$5,verified_at=CASE WHEN $2='approved' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE provider_key=$1 RETURNING provider_key,provider_name,status,merchant_reference,approval_document_url,updated_at",
      [key, status, merchant, documentUrl, req.superAdmin.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Payment provider not found." });
    await audit(req.app.locals.db, req.superAdmin.id, "provider_approval_updated", "provider", null, { provider: key, status });
    return res.json({ provider: result.rows[0], livePaymentsEnabled: false });
  } catch {
    return res.status(503).json({ error: "Provider approval record could not be updated." });
  }
});

router.post("/admin/sandbox/tickets", async (req, res) => {
  const campaignId = req.body?.campaignId;
  const count = Number(req.body?.count || 1);
  if (!validId(campaignId) || !Number.isInteger(count) || count < 1 || count > 20) {
    return res.status(400).json({ error: "Choose a campaign and request 1–20 sandbox tickets." });
  }
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const campaign = await client.query("SELECT id FROM raffle_campaigns WHERE id=$1 AND status IN ('draft','planned','pending_approval') FOR UPDATE", [campaignId]);
    if (!campaign.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Editable campaign not found." }); }
    const tickets = [];
    for (let i = 0; i < count; i++) {
      const code = "TEST-" + crypto.randomBytes(7).toString("hex").toUpperCase();
      const qrHash = crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex");
      const inserted = await client.query(
        "INSERT INTO raffle_tickets(campaign_id,user_id,ticket_code,qr_payload_hash,status) VALUES($1,$2,$3,$4,'sandbox') RETURNING id,ticket_code,status,created_at",
        [campaignId, req.superAdmin.id, code, qrHash]
      );
      tickets.push(inserted.rows[0]);
    }
    await client.query(
      "INSERT INTO raffle_audit_events(actor_user_id,event_key,entity_type,entity_id,metadata) VALUES($1,'sandbox_tickets_generated','campaign',$2,$3::jsonb)",
      [req.superAdmin.id, campaignId, JSON.stringify({ count, environment: "sandbox" })]
    );
    await client.query("COMMIT");
    return res.status(201).json({ tickets, environment: "sandbox", validForSale: false });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(503).json({ error: "Sandbox tickets could not be generated." });
  } finally { client.release(); }
});

router.post("/admin/sandbox/payments", async (req, res) => {
  const campaignId = req.body?.campaignId;
  const provider = req.body?.providerKey;
  const amountMinor = Number(req.body?.amountMinor);
  const idempotencyKey = cleanText(req.body?.idempotencyKey, 120) || crypto.randomUUID();
  if (!validId(campaignId) || !["cbe","telebirr","mpesa"].includes(provider) ||
      !Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > 100000000) {
    return res.status(400).json({ error: "Choose a campaign, provider and valid simulation amount." });
  }
  try {
    const result = await req.app.locals.db.query(
      "INSERT INTO raffle_payment_records(campaign_id,user_id,provider_key,merchant_reference,amount_minor,currency,environment,status,idempotency_key) SELECT $1,$2,$3,'SANDBOX-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),$4,'ETB','sandbox','simulated',$5 WHERE EXISTS(SELECT 1 FROM raffle_campaigns WHERE id=$1 AND status IN ('draft','planned','pending_approval')) RETURNING id,provider_key,amount_minor,currency,environment,status,created_at",
      [campaignId, req.superAdmin.id, provider, amountMinor, idempotencyKey]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Editable campaign not found." });
    await audit(req.app.locals.db, req.superAdmin.id, "sandbox_payment_simulated", "payment", result.rows[0].id, { provider, amountMinor, environment: "sandbox" });
    return res.status(201).json({ payment: result.rows[0], moneyCollected: false });
  } catch (error) {
    if (error && error.code === "23505") return res.status(409).json({ error: "This simulation key has already been used." });
    return res.status(503).json({ error: "Sandbox payment could not be simulated." });
  }
});

router.post("/admin/sandbox/draw", async (req, res) => {
  const campaignId = req.body?.campaignId;
  if (!validId(campaignId)) return res.status(400).json({ error: "Invalid campaign." });
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const campaign = await client.query("SELECT id FROM raffle_campaigns WHERE id=$1 AND status IN ('draft','planned','pending_approval') FOR UPDATE", [campaignId]);
    if (!campaign.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Editable campaign not found." }); }
    const pool = await client.query("SELECT id,ticket_code FROM raffle_tickets WHERE campaign_id=$1 AND status='sandbox' ORDER BY id", [campaignId]);
    if (!pool.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Generate sandbox tickets before testing a draw." }); }
    const chosen = pool.rows[crypto.randomInt(0, pool.rowCount)];
    const seed = crypto.randomBytes(32).toString("hex");
    const commitment = crypto.createHash("sha256").update(seed).digest("hex");
    const resultHash = crypto.createHash("sha256").update(chosen.id + ":" + seed).digest("hex");
    const draw = await client.query(
      "INSERT INTO raffle_draw_records(campaign_id,environment,algorithm_version,seed_commitment,result_hash,status,conducted_at) VALUES($1,'sandbox','sandbox-rng-v1',$2,$3,'simulated',NOW()) RETURNING id,status,environment,algorithm_version,seed_commitment,result_hash,conducted_at",
      [campaignId, commitment, resultHash]
    );
    await client.query(
      "INSERT INTO raffle_audit_events(actor_user_id,event_key,entity_type,entity_id,metadata) VALUES($1,'sandbox_draw_simulated','draw',$2,$3::jsonb)",
      [req.superAdmin.id, draw.rows[0].id, JSON.stringify({ campaignId, selectedTicketId: chosen.id, ticketCode: chosen.ticket_code, poolSize: pool.rowCount, resultHash, environment: "sandbox", notARealWinner: true })]
    );
    await client.query("COMMIT");
    return res.status(201).json({ draw: draw.rows[0], preview: { ticketCode: chosen.ticket_code, poolSize: pool.rowCount }, winnerDeclared: false, prizePaid: false });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error && error.code === "23505") return res.status(409).json({ error: "A sandbox draw already exists for this campaign." });
    return res.status(503).json({ error: "Sandbox draw could not be completed." });
  } finally { client.release(); }
});

module.exports = router;
