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
    return payload.sub && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch { return null; }
}

async function requireUser(req, res, next) {
  const env = req.app.locals.authEnv || process.env;
  const db = req.app.locals.db;
  if (env.AUTH_ENABLED !== "true" || !db) {
    return res.status(503).json({ error: "Subscription services are temporarily unavailable." });
  }
  const match = /^Bearer\\s+(.+)$/i.exec(req.get("authorization") || "");
  const payload = match && readAccessToken(match[1], env.ACCESS_TOKEN_SECRET);
  if (!payload) return res.status(401).json({ error: "Please sign in again." });
  try {
    const result = await db.query(
      "SELECT id FROM users WHERE id=$1 AND status='active' LIMIT 1",
      [payload.sub]
    );
    if (!result.rows[0]) return res.status(401).json({ error: "Please sign in again." });
    req.subscriptionUser = result.rows[0];
    return next();
  } catch {
    return res.status(503).json({ error: "Subscription services are temporarily unavailable." });
  }
}

// Draft plans are visible as previews only. Their unset prices are never represented as free.
router.get("/plans", async (req, res) => {
  const db = req.app.locals.db;
  if (!db) return res.status(503).json({ error: "Subscription services are temporarily unavailable." });
  try {
    const result = await db.query(
      "SELECT plan_key,display_name,description,currency,amount_minor,billing_interval,status FROM subscription_plans ORDER BY CASE plan_key WHEN 'free' THEN 1 WHEN 'premium' THEN 2 WHEN 'pro' THEN 3 ELSE 4 END"
    );
    const plans = result.rows.map((plan) => ({
      planKey: plan.plan_key,
      name: plan.display_name,
      description: plan.description,
      status: plan.status,
      available: plan.status === "active",
      price: plan.status === "active" ? { amountMinor: Number(plan.amount_minor), currency: plan.currency, interval: plan.billing_interval } : null
    }));
    return res.set("Cache-Control", "no-store").json({ plans });
  } catch {
    return res.status(503).json({ error: "Subscription plans are temporarily unavailable." });
  }
});

router.get("/me", requireUser, async (req, res) => {
  try {
    const result = await req.app.locals.db.query(
      "SELECT s.id AS subscription_id,s.plan_key,s.status,s.starts_at,s.current_period_start,s.current_period_end,s.cancel_at_period_end,p.display_name,p.description,p.status AS plan_status, EXISTS (SELECT 1 FROM payment_transactions t WHERE t.subscription_id=s.id AND t.user_id=s.user_id AND t.status='succeeded' AND t.verified_at IS NOT NULL) AS payment_verified FROM user_subscriptions s JOIN subscription_plans p ON p.plan_key=s.plan_key WHERE s.user_id=$1 AND s.status IN ('trialing','active','past_due') ORDER BY s.created_at DESC LIMIT 1",
      [req.subscriptionUser.id]
    );
    const current = result.rows[0];
    if (!current) {
      return res.set("Cache-Control", "no-store").json({
        subscription: { planKey: "free", name: "Ethio One Free", status: "active", source: "default" },
        paidAccessEnabled: false
      });
    }
    return res.set("Cache-Control", "no-store").json({
      subscription: {
        id: current.subscription_id,
        planKey: current.plan_key,
        name: current.display_name,
        status: current.status,
        startsAt: current.starts_at,
        currentPeriodStart: current.current_period_start,
        currentPeriodEnd: current.current_period_end,
        cancelAtPeriodEnd: current.cancel_at_period_end
      },
      paidAccessEnabled: current.plan_key !== "free" && current.status === "active" && current.plan_status === "active" && current.payment_verified === true
    });
  } catch {
    return res.status(503).json({ error: "Your subscription is temporarily unavailable." });
  }
});

module.exports = router;
