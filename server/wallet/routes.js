const express = require("express");
const crypto = require("node:crypto");
const router = express.Router();

function readToken(req, env) {
  const header = req.get("authorization") || "";
  if (!/^Bearer /i.test(header) || !env.ACCESS_TOKEN_SECRET || String(env.ACCESS_TOKEN_SECRET).length < 32) return null;
  const parts = header.slice(7).trim().split(".");
  if (parts.length !== 3) return null;
  try {
    const expected = crypto.createHmac("sha256", env.ACCESS_TOKEN_SECRET).update(parts[0] + "." + parts[1]).digest();
    const actual = Buffer.from(parts[2], "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.sub && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch { return null; }
}

router.use(async (req, res, next) => {
  const env = req.app.locals.authEnv || process.env;
  const db = req.app.locals.db;
  if (env.AUTH_ENABLED !== "true" || !db) return res.status(503).json({ error: "Ethio Wallet is temporarily unavailable." });
  const payload = readToken(req, env);
  if (!payload) return res.status(401).json({ error: "Please sign in again." });
  try {
    const result = await db.query("SELECT id FROM users WHERE id=$1 AND status='active'", [payload.sub]);
    if (!result.rows[0]) return res.status(401).json({ error: "Please sign in again." });
    req.walletUser = result.rows[0];
    return next();
  } catch {
    return res.status(503).json({ error: "Ethio Wallet is temporarily unavailable." });
  }
});

// Read-only bridge over the existing Earn ledgers. No balance is copied and no
// second wallet ledger is created here, preventing double-counting during phase 1.
router.get("/summary", async (req, res) => {
  const db = req.app.locals.db;
  try {
    const [taskCredits, sponsorCredits, pendingTasks, paidOut, reserved, activity] = await Promise.all([
      db.query("SELECT COALESCE(SUM(amount_minor),0)::bigint AS total FROM earn_ledger WHERE user_id=$1", [req.walletUser.id]),
      db.query("SELECT COALESCE(SUM(amount_minor),0)::bigint AS total FROM earn_sponsor_ad_credits WHERE user_id=$1", [req.walletUser.id]),
      db.query("SELECT COALESCE(SUM(c.reward_minor),0)::bigint AS total FROM earn_submissions s JOIN earn_campaigns c ON c.id=s.campaign_id WHERE s.user_id=$1 AND s.status='pending'", [req.walletUser.id]),
      db.query("SELECT COALESCE(SUM(amount_minor),0)::bigint AS total FROM earn_payout_ledger WHERE user_id=$1", [req.walletUser.id]),
      db.query("SELECT COALESCE(SUM(amount_minor),0)::bigint AS total FROM earn_payout_requests WHERE user_id=$1 AND status IN ('pending','processing')", [req.walletUser.id]),
      db.query(
        "SELECT kind,amount_minor,status,created_at,reference FROM (" +
        "SELECT 'task_reward'::text AS kind,amount_minor,'approved'::text AS status,created_at,campaign_id::text AS reference FROM earn_ledger WHERE user_id=$1 " +
        "UNION ALL SELECT 'sponsor_reward',amount_minor,'approved',created_at,campaign_id::text FROM earn_sponsor_ad_credits WHERE user_id=$1 " +
        "UNION ALL SELECT 'withdrawal',amount_minor,status,created_at,COALESCE(provider_reference,id::text) FROM earn_payout_requests WHERE user_id=$1" +
        ") entries ORDER BY created_at DESC LIMIT 30", [req.walletUser.id])
    ]);
    const taskMinor = Number(taskCredits.rows[0].total);
    const sponsorMinor = Number(sponsorCredits.rows[0].total);
    const pendingMinor = Number(pendingTasks.rows[0].total);
    const paidMinor = Number(paidOut.rows[0].total);
    const heldMinor = Number(reserved.rows[0].total);
    const grossEarnedMinor = taskMinor + sponsorMinor;
    const availableMinor = Math.max(0, grossEarnedMinor - paidMinor - heldMinor);
    return res.set("Cache-Control", "no-store").json({
      currency: "ETB",
      balances: {
        availableMinor,
        pendingMinor,
        onHoldMinor: heldMinor,
        paidOutMinor: paidMinor,
        totalApprovedMinor: grossEarnedMinor
      },
      sources: { ethioEarnMinor: taskMinor, sponsorRewardsMinor: sponsorMinor },
      withdrawalsEnabled: false,
      phase: "read_only_earnings_bridge",
      activity: activity.rows
    });
  } catch {
    return res.status(503).json({ error: "Your wallet summary is temporarily unavailable." });
  }
});

module.exports = router;
