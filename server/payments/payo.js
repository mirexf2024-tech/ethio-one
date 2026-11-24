const express = require("express");
const crypto = require("node:crypto");
const rateLimit = require("express-rate-limit");
const router = express.Router();

function readAccessToken(req, env) {
  const header = req.get("authorization") || "";
  if (!/^Bearer /i.test(header) || !env.ACCESS_TOKEN_SECRET || String(env.ACCESS_TOKEN_SECRET).length < 32) return null;
  const parts = header.slice(7).trim().split(".");
  if (parts.length !== 3) return null;
  try {
    const expected = crypto.createHmac("sha256", env.ACCESS_TOKEN_SECRET)
      .update(parts[0] + "." + parts[1]).digest();
    const actual = Buffer.from(parts[2], "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.sub && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now() / 1000)
      ? payload : null;
  } catch { return null; }
}

function secureEqualText(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function amountToMinor(value) {
  const raw = typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : String(value || "");
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  const result = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

function callbackUrl(env) {
  return env.PAYO_CALLBACK_URL || "https://ethio-one-api.onrender.com/api/payment-webhook";
}

router.post("/payo/orders", rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false
}), async (req, res) => {
  const env = req.app.locals.authEnv || process.env;
  const db = req.app.locals.db;
  if (env.PAYO_ENABLED !== "true" || !env.PAYO_API_KEY || !db) {
    return res.status(503).json({ error: "Premium payments are not available yet." });
  }
  if (env.AUTH_ENABLED !== "true") return res.status(503).json({ error: "Account payments are temporarily unavailable." });
  const token = readAccessToken(req, env);
  if (!token) return res.status(401).json({ error: "Please sign in again." });
  const planKey = typeof req.body?.planKey === "string" ? req.body.planKey.trim() : "premium";
  if (!["premium", "pro"].includes(planKey)) return res.status(400).json({ error: "Choose a valid Premium plan." });

  try {
    const userResult = await db.query("SELECT id,status FROM users WHERE id=$1 AND status='active'", [token.sub]);
    if (!userResult.rowCount) return res.status(401).json({ error: "Please sign in again." });

    const planResult = await db.query(
      "SELECT plan_key,display_name,description,currency,amount_minor,billing_interval FROM subscription_plans WHERE plan_key=$1 AND status='active' AND amount_minor>0 AND currency='ETB'",
      [planKey]
    );
    const plan = planResult.rows[0];
    if (!plan) return res.status(409).json({ error: "This Premium plan has not been priced and enabled yet." });

    const current = await db.query(
      "SELECT s.id FROM user_subscriptions s WHERE s.user_id=$1 AND s.status IN ('trialing','active','past_due') AND s.plan_key<>'free' LIMIT 1",
      [token.sub]
    );
    if (current.rowCount) return res.status(409).json({ error: "Your account already has an active subscription." });

    const amountMinor = Number(plan.amount_minor);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 100) {
      return res.status(409).json({ error: "This Premium plan has an invalid price configuration." });
    }

    const client = await db.connect();
    let subscriptionId, transactionId;
    try {
      await client.query("BEGIN");
      const sub = await client.query(
        "INSERT INTO user_subscriptions(user_id,plan_key,status) VALUES($1,$2,'pending') RETURNING id",
        [token.sub, plan.plan_key]
      );
      subscriptionId = sub.rows[0].id;
      const tx = await client.query(
        "INSERT INTO payment_transactions(user_id,subscription_id,provider,amount_minor,currency,status,description) VALUES($1,$2,'payo',$3,'ETB','pending',$4) RETURNING id",
        [token.sub, subscriptionId, amountMinor, "ETHIO ONE " + plan.display_name]
      );
      transactionId = tx.rows[0].id;
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error && error.code === "23505") return res.status(409).json({ error: "A subscription is already active for this account." });
      throw error;
    } finally {
      client.release();
    }

    const amount = amountMinor / 100;
    let response;
    try {
      response = await fetch(env.PAYO_API_URL || "https://checkout.payment.et/api/v1/orders", {
        method: "POST",
        headers: { "x-api-key": env.PAYO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          description: "ETHIO ONE " + plan.display_name,
          expiresInSeconds: 600,
          callbackUrl: callbackUrl(env),
          items: [{ name: "ETHIO ONE " + plan.display_name, qty: 1, price: amount }],
          metadata: {
            userId: token.sub,
            subscriptionId,
            transactionId,
            planKey: plan.plan_key
          }
        }),
        signal: AbortSignal.timeout(12000)
      });
    } catch {
      await db.query(
        "UPDATE payment_transactions SET status='failed',updated_at=NOW() WHERE id=$1 AND status='pending'",
        [transactionId]
      ).catch(() => {});
      await db.query(
        "UPDATE user_subscriptions SET status='failed',updated_at=NOW() WHERE id=$1 AND status='pending'",
        [subscriptionId]
      ).catch(() => {});
      return res.status(502).json({ error: "Payo checkout could not be reached. Please try again." });
    }

    const result = await response.json().catch(() => ({}));
    const paymentUrl = typeof result.paymentUrl === "string" ? result.paymentUrl : "";
    const orderId = typeof result.orderId === "string" ? result.orderId.trim() : "";
    let parsedUrl;
    try { parsedUrl = new URL(paymentUrl); } catch { parsedUrl = null; }
    if (!response.ok || !orderId || !parsedUrl || parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "checkout.payment.et") {
      await db.query(
        "UPDATE payment_transactions SET status='failed',updated_at=NOW() WHERE id=$1 AND status='pending'",
        [transactionId]
      ).catch(() => {});
      await db.query(
        "UPDATE user_subscriptions SET status='failed',updated_at=NOW() WHERE id=$1 AND status='pending'",
        [subscriptionId]
      ).catch(() => {});
      return res.status(502).json({ error: "Payo did not return a valid checkout order." });
    }

    await db.query(
      "UPDATE payment_transactions SET provider_reference=$2,updated_at=NOW() WHERE id=$1 AND provider='payo' AND status='pending'",
      [transactionId, orderId]
    );
    return res.status(201).json({
      ok: true,
      orderId,
      paymentUrl: parsedUrl.toString(),
      expiresInSeconds: 600,
      plan: { planKey: plan.plan_key, name: plan.display_name, amountMinor, currency: "ETB" }
    });
  } catch {
    return res.status(503).json({ error: "The Premium checkout could not be created." });
  }
});

async function handlePayoWebhook(req, res) {
  const env = req.app.locals.authEnv || process.env;
  const db = req.app.locals.db;
  const apiKey = env.PAYO_API_KEY;
  if (!apiKey || !db || !Buffer.isBuffer(req.body)) return res.status(503).json({ error: "Webhook is not configured." });

  const supplied = req.get("x-pygate-signature") || "";
  const expected = "sha256=" + crypto.createHmac("sha256", apiKey).update(req.body).digest("hex");
  if (!secureEqualText(supplied, expected)) return res.status(401).json({ error: "Invalid webhook signature." });

  let event;
  try { event = JSON.parse(req.body.toString("utf8")); } catch { return res.status(400).json({ error: "Invalid webhook payload." }); }
  const orderId = typeof event.orderId === "string" ? event.orderId.trim() : "";
  const status = typeof event.status === "string" ? event.status.toUpperCase() : "";
  const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata : {};
  const transactionId = typeof metadata.transactionId === "string" ? metadata.transactionId : "";
  const userId = typeof metadata.userId === "string" ? metadata.userId : "";
  const receivedMinor = amountToMinor(event.amount);
  if (!orderId || orderId.length > 160 || (transactionId && !/^[0-9a-f-]{36}$/i.test(transactionId)) ||
      !/^[0-9a-f-]{36}$/i.test(userId) || !["APPROVED", "REJECTED"].includes(status) || receivedMinor === null) {
    return res.status(400).json({ error: "Invalid payment event fields." });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT p.id,p.user_id,p.subscription_id,p.amount_minor,p.status,p.provider_reference,s.plan_key,s.status AS subscription_status,s.current_period_start,s.current_period_end,sp.billing_interval FROM payment_transactions p JOIN user_subscriptions s ON s.id=p.subscription_id JOIN subscription_plans sp ON sp.plan_key=s.plan_key WHERE p.provider_reference=$1 AND p.provider='payo' FOR UPDATE OF p,s",
      [orderId]
    );
    const row = found.rows[0];
    if (!row || row.user_id !== userId || (transactionId && row.id !== transactionId) || Number(row.amount_minor) !== receivedMinor) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Payment order details do not match." });
    }
    if (row.status === "succeeded" || row.status === "failed" || row.status === "reversed") {
      await client.query("COMMIT");
      return res.status(200).json({ ok: true, duplicate: true });
    }
    if (row.status !== "pending" || row.subscription_status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Payment is not awaiting confirmation." });
    }

    const reference = await client.query(
      "UPDATE payment_transactions SET provider_reference=COALESCE(provider_reference,$2),status=$3,verified_at=CASE WHEN $3='succeeded' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$1 AND provider='payo' AND status='pending' AND (provider_reference IS NULL OR provider_reference=$2) RETURNING id",
      [transactionId, orderId, status === "APPROVED" ? "succeeded" : "failed"]
    );
    if (!reference.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Payment order reference does not match." });
    }

    if (status === "APPROVED") {
      await client.query(
        "UPDATE user_subscriptions SET status='expired',updated_at=NOW() WHERE user_id=$1 AND status IN ('trialing','active','past_due')",
        [row.user_id]
      );
      const interval = row.billing_interval === "year" ? "1 year" : "1 month";
      await client.query(
        "UPDATE user_subscriptions SET status='active',starts_at=NOW(),current_period_start=NOW(),current_period_end=NOW() + $2::interval,updated_at=NOW() WHERE id=$1 AND status='pending'",
        [row.subscription_id, interval]
      );
    } else {
      await client.query(
        "UPDATE user_subscriptions SET status='failed',updated_at=NOW() WHERE id=$1 AND status='pending'",
        [row.subscription_id]
      );
    }
    await client.query("COMMIT");
    return res.status(200).json({ ok: true });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(503).json({ error: "Webhook processing is temporarily unavailable." });
  } finally {
    client.release();
  }
}

module.exports = { router, handlePayoWebhook };
