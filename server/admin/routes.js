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
  if (!db) {
    return res.status(503).json({ error: "Admin service is temporarily unavailable." });
  }
  if (env.AUTH_ENABLED !== "true" || !env.ADMIN_EMAIL || !payload) {
    const { recordSecurityEvent } = require("./audit");
    await recordSecurityEvent(req, {
      type: "admin_access_denied",
      severity: "warning",
      metadata: { route: req.path, method: req.method, reason: "missing_or_invalid_session" }
    });
    return res.status(401).json({ error: "Super Admin authentication required." });
  }
  try {
    const result = await db.query(
      "SELECT id,email,email_verified_at,status FROM users WHERE id=$1 AND status='active' LIMIT 1",
      [payload.sub]
    );
    const user = result.rows[0];
    if (!user || !user.email_verified_at ||
        String(user.email || "").toLowerCase() !== String(env.ADMIN_EMAIL).trim().toLowerCase()) {
      const { recordSecurityEvent } = require("./audit");
      await recordSecurityEvent(req, { type: "admin_access_denied", severity: "high", userId: user?.id || null,
        metadata: { route: req.path, method: req.method, reason: "not_allowlisted" } });
      return res.status(403).json({ error: "Super Admin access denied." });
    }
    req.superAdmin = { id: user.id, email: user.email };
    return next();
  } catch {
    return res.status(503).json({ error: "Admin service is temporarily unavailable." });
  }
}

router.use(requireSuperAdmin);

router.get("/overview", async (req, res) => {
  const db = req.app.locals.db;
  try {
    const [users, modules, events, recent] = await Promise.all([
      db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='active')::int AS active, COUNT(*) FILTER (WHERE status='pending_verification')::int AS pending, COUNT(*) FILTER (WHERE status='suspended')::int AS suspended FROM users"),
      db.query("SELECT status, COUNT(*)::int AS count FROM platform_modules GROUP BY status ORDER BY status"),
      db.query("SELECT COUNT(*)::int AS total_24h, COUNT(*) FILTER (WHERE severity IN ('high','critical'))::int AS high_24h FROM security_events WHERE created_at >= NOW() - INTERVAL '24 hours'"),
      db.query("SELECT id,event_type,severity,created_at,metadata FROM security_events ORDER BY created_at DESC LIMIT 8")
    ]);
    return res.set("Cache-Control", "no-store").json({
      generatedAt: new Date().toISOString(),
      users: users.rows[0],
      modules: modules.rows,
      security: events.rows[0],
      recentEvents: recent.rows
    });
  } catch {
    return res.status(503).json({ error: "Admin monitoring data is not ready. Check the approved database migration." });
  }
});

router.get("/events", async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
  const severity = ["info", "warning", "high", "critical"].includes(req.query.severity)
    ? req.query.severity : null;
  try {
    const result = await req.app.locals.db.query(
      "SELECT id,event_type,severity,created_at,metadata FROM security_events WHERE ($1::text IS NULL OR severity=$1) ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [severity, limit, offset]
    );
    return res.set("Cache-Control", "no-store").json({ events: result.rows, limit, offset });
  } catch {
    return res.status(503).json({ error: "Security event history is not ready." });
  }
});

router.get("/modules", async (req, res) => {
  try {
    const result = await req.app.locals.db.query(
      "SELECT module_key,display_name,status,updated_at FROM platform_modules ORDER BY display_name"
    );
    return res.set("Cache-Control", "no-store").json({ modules: result.rows });
  } catch {
    return res.status(503).json({ error: "Module monitoring is temporarily unavailable." });
  }
});

module.exports = router;
