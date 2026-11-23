const express = require("express");
const crypto = require("node:crypto");
const { listProviders } = require("./providers");

const router = express.Router();
const uuid = (value) => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function readAccessToken(token, secret) {
  if (!secret || String(secret).length < 32 || typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const expected = crypto.createHmac("sha256", secret).update(parts[0] + "." + parts[1]).digest();
    const actual = Buffer.from(parts[2], "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.sub && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now() / 1000)
      ? payload : null;
  } catch { return null; }
}

async function requireSuperAdmin(req, res, next) {
  const db = req.app.locals.db;
  const env = req.app.locals.authEnv || process.env;
  if (!db) return res.status(503).json({ error: "Lottery planning service is temporarily unavailable." });
  const match = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "");
  const payload = match && readAccessToken(match[1], env.ACCESS_TOKEN_SECRET);
  if (env.AUTH_ENABLED !== "true" || !env.ADMIN_EMAIL || !payload) {
    return res.status(401).json({ error: "Super Admin authentication required." });
  }
  try {
    const result = await db.query(
      "SELECT u.id,u.email,u.email_verified_at,COALESCE(array_agg(DISTINCT r.role_key) FILTER (WHERE r.role_key IS NOT NULL),ARRAY[]::varchar[]) AS roles FROM users u LEFT JOIN user_roles r ON r.user_id=u.id WHERE u.id=$1 AND u.status='active' GROUP BY u.id LIMIT 1",
      [payload.sub]
    );
    const user = result.rows[0];
    const roles = user?.roles || [];
    const allowed = !!user && !!user.email_verified_at && roles.includes("super_admin") &&
      String(user.email || "").toLowerCase() === String(env.ADMIN_EMAIL).trim().toLowerCase();
    if (!allowed) return res.status(403).json({ error: "Super Admin access denied." });
    req.lotteryAdmin = { id: user.id };
    return next();
  } catch {
    return res.status(503).json({ error: "Lottery planning service is temporarily unavailable." });
  }
}

async function audit(db, actorId, action, targetType, targetId, metadata = {}) {
  await db.query(
    "INSERT INTO lottery_audit_logs(actor_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)",
    [actorId, action, targetType, targetId || null, JSON.stringify(metadata)]
  );
}

router.use(requireSuperAdmin);

router.get("/overview", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const [control, approvals, campaigns, simulations] = await Promise.all([
      db.query("SELECT release_state,licence_status,sales_enabled,public_enabled,live_payments_enabled,live_draws_enabled,updated_at FROM lottery_control WHERE singleton=TRUE"),
      db.query("SELECT scope_key,status,reference_code,checked_at,updated_at FROM lottery_approvals ORDER BY CASE scope_key WHEN 'els' THEN 0 WHEN 'cbe' THEN 1 WHEN 'telebirr' THEN 2 ELSE 3 END"),
      db.query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='draft')::int AS drafts,COUNT(*) FILTER(WHERE status='prepared')::int AS prepared FROM lottery_raffle_campaigns"),
      db.query("SELECT COUNT(*)::int AS total FROM lottery_sandbox_runs")
    ]);
    return res.set("Cache-Control", "no-store").json({
      mode: "planned_only",
      publicAccess: false,
      control: control.rows[0] || null,
      approvals: approvals.rows,
      campaigns: campaigns.rows[0],
      sandboxRuns: simulations.rows[0]?.total || 0,
      providers: listProviders()
    });
  } catch {
    return res.status(503).json({ error: "Lottery planning schema is not installed or unavailable." });
  }
});

router.get("/campaigns", async (req, res) => {
  try {
    const result = await req.app.locals.db.query(
      "SELECT id,title,description,prize_summary,rules,ticket_price_minor,currency,status,sales_enabled,public_visible,created_at,updated_at FROM lottery_raffle_campaigns ORDER BY updated_at DESC LIMIT 100"
    );
    return res.set("Cache-Control", "no-store").json({ campaigns: result.rows });
  } catch {
    return res.status(503).json({ error: "Lottery campaign drafts are unavailable." });
  }
});

router.post("/campaigns", async (req, res) => {
  const body = req.body || {};
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const prizeSummary = typeof body.prizeSummary === "string" ? body.prizeSummary.trim() : "";
  const rules = typeof body.rules === "string" ? body.rules.trim() : "";
  const ticketPriceMinor = body.ticketPriceMinor === "" || body.ticketPriceMinor === null ||
    body.ticketPriceMinor === undefined ? null : Number(body.ticketPriceMinor);
  if (title.length < 3 || title.length > 120 || description.length > 1200 ||
      prizeSummary.length > 1200 || rules.length < 10 || rules.length > 6000 ||
      (ticketPriceMinor !== null && (!Number.isSafeInteger(ticketPriceMinor) || ticketPriceMinor < 0 || ticketPriceMinor > 100000000000))) {
    return res.status(400).json({ error: "Check the draft title, description, prize summary, rules and optional draft price." });
  }
  const db = req.app.locals.db;
  let client;
  try {
    client = await db.connect();
    await client.query("BEGIN");
    const inserted = await client.query(
      "INSERT INTO lottery_raffle_campaigns(title,description,prize_summary,rules,ticket_price_minor,status,sales_enabled,public_visible,created_by,updated_by) VALUES($1,$2,$3,$4,$5,'draft',FALSE,FALSE,$6,$6) RETURNING id,title,status,sales_enabled,public_visible,created_at",
      [title, description, prizeSummary, rules, ticketPriceMinor, req.lotteryAdmin.id]
    );
    await audit(client, req.lotteryAdmin.id, "raffle_campaign_draft_created", "campaign", inserted.rows[0].id, { status: "draft" });
    await client.query("COMMIT");
    return res.status(201).set("Cache-Control", "no-store").json({ ok: true, campaign: inserted.rows[0] });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(503).json({ error: "Draft campaign could not be saved." });
  } finally {
    if (client) client.release();
  }
});

router.patch("/campaigns/:id", async (req, res) => {
  if (!uuid(req.params.id)) return res.status(400).json({ error: "Invalid campaign." });
  const body = req.body || {};
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const prizeSummary = typeof body.prizeSummary === "string" ? body.prizeSummary.trim() : "";
  const rules = typeof body.rules === "string" ? body.rules.trim() : "";
  const status = body.status;
  const ticketPriceMinor = body.ticketPriceMinor === "" || body.ticketPriceMinor === null ||
    body.ticketPriceMinor === undefined ? null : Number(body.ticketPriceMinor);
  if (title.length < 3 || title.length > 120 || description.length > 1200 ||
      prizeSummary.length > 1200 || rules.length < 10 || rules.length > 6000 ||
      !["draft","prepared","archived"].includes(status) ||
      (ticketPriceMinor !== null && (!Number.isSafeInteger(ticketPriceMinor) || ticketPriceMinor < 0 || ticketPriceMinor > 100000000000))) {
    return res.status(400).json({ error: "Only draft, prepared or archived campaign details can be saved." });
  }
  const db = req.app.locals.db;
  let client;
  try {
    client = await db.connect();
    await client.query("BEGIN");
    const result = await client.query(
      "UPDATE lottery_raffle_campaigns SET title=$2,description=$3,prize_summary=$4,rules=$5,ticket_price_minor=$6,status=$7,updated_by=$8,updated_at=NOW() WHERE id=$1 RETURNING id,title,status,sales_enabled,public_visible,updated_at",
      [req.params.id,title,description,prizeSummary,rules,ticketPriceMinor,status,req.lotteryAdmin.id]
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Campaign draft not found." });
    }
    await audit(client, req.lotteryAdmin.id, "raffle_campaign_draft_updated", "campaign", req.params.id, { status });
    await client.query("COMMIT");
    return res.set("Cache-Control", "no-store").json({ ok: true, campaign: result.rows[0] });
  } catch {
    if (client) await client.query("ROLLBACK").catch(() => {});
    return res.status(503).json({ error: "Campaign draft could not be updated." });
  } finally {
    if (client) client.release();
  }
});

router.get("/sandbox/runs", async (req, res) => {
  try {
    const result = await req.app.locals.db.query(
      "SELECT id,simulation_ref,simulation_kind,provider_key,simulated_result,simulation_only,created_at FROM lottery_sandbox_runs ORDER BY created_at DESC LIMIT 50"
    );
    return res.set("Cache-Control", "no-store").json({ runs: result.rows });
  } catch {
    return res.status(503).json({ error: "Sandbox history is unavailable." });
  }
});

router.post("/sandbox/run", async (req, res) => {
  const body = req.body || {};
  const kind = body.kind;
  const provider = body.provider || null;
  const result = body.result;
  if (!["payment","ticket_preview","draw_preview"].includes(kind) ||
      !["success","failure"].includes(result) ||
      (kind === "payment" && !["cbe","telebirr","mpesa"].includes(provider)) ||
      (kind !== "payment" && provider !== null)) {
    return res.status(400).json({ error: "Choose a valid sandbox simulation. No real provider or draw is called." });
  }
  const simulationRef = "SBX-" + crypto.randomBytes(7).toString("hex").toUpperCase();
  try {
    const inserted = await req.app.locals.db.query(
      "INSERT INTO lottery_sandbox_runs(simulation_ref,simulation_kind,provider_key,simulated_result,simulation_only,created_by) VALUES($1,$2,$3,$4,TRUE,$5) RETURNING id,simulation_ref,simulation_kind,provider_key,simulated_result,simulation_only,created_at",
      [simulationRef,kind,provider,result === "success" ? "simulated_success" : "simulated_failure",req.lotteryAdmin.id]
    );
    await audit(req.app.locals.db, req.lotteryAdmin.id, "raffle_sandbox_simulated", "sandbox_run", inserted.rows[0].id, { kind, provider: provider || "internal", result: inserted.rows[0].simulated_result });
    return res.status(201).set("Cache-Control", "no-store").json({ ok: true, simulation: inserted.rows[0], notice: "Sandbox only. No money, real ticket, winner or draw was created." });
  } catch {
    return res.status(503).json({ error: "Sandbox simulation could not be recorded." });
  }
});

module.exports = router;
