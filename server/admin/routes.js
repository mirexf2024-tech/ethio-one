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
      "SELECT u.id,u.email,u.email_verified_at,u.status FROM users u JOIN user_roles ur ON ur.user_id=u.id AND ur.role_key='super_admin' WHERE u.id=$1 AND u.status='active' LIMIT 1",
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

router.patch("/modules/:moduleKey", async (req, res) => {
  const moduleKey = String(req.params.moduleKey || "");
  const status = req.body?.status;
  const allowedStatuses = ["planned", "building", "beta", "active", "paused"];
  if (!/^[a-z0-9_-]{2,60}$/.test(moduleKey) || !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "Choose a valid service and status." });
  }
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE platform_modules SET status=$2,updated_at=NOW() WHERE module_key=$1 RETURNING module_key,display_name,status,updated_at",
      [moduleKey, status]
    );
    if (!updated.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Service module not found." });
    }
    await client.query("COMMIT");
    const { recordSecurityEvent } = require("./audit");
    const logged = await recordSecurityEvent(req, {
      type: "platform_module_status_updated",
      severity: status === "paused" ? "warning" : "info",
      userId: req.superAdmin.id,
      metadata: { module_key: moduleKey, status }
    });
    if (!logged) {
      return res.status(503).json({ error: "Status saved, but its audit record could not be confirmed. Contact support." });
    }
    return res.set("Cache-Control", "no-store").json({ ok: true, module: updated.rows[0] });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(503).json({ error: "Service status could not be updated." });
  } finally {
    client.release();
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



router.get("/users", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
  const status = ["active", "suspended", "pending_verification"].includes(req.query.status) ? req.query.status : null;
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
  try {
    const result = await req.app.locals.db.query(
      `SELECT u.id,u.ethio_id,u.full_name,u.username,u.email,u.phone,u.status,u.created_at,
        COALESCE(array_agg(DISTINCT ur.role_key) FILTER (WHERE ur.role_key IS NOT NULL), ARRAY[]::varchar[]) AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id
       WHERE ($1::text='' OR u.full_name ILIKE '%' || $1 || '%' OR u.username ILIKE '%' || $1 || '%' OR
              u.email ILIKE '%' || $1 || '%' OR u.ethio_id ILIKE '%' || $1 || '%' OR u.phone ILIKE '%' || $1 || '%')
         AND ($2::text IS NULL OR u.status=$2)
       GROUP BY u.id ORDER BY u.created_at DESC LIMIT $3 OFFSET $4`,
      [q, status, limit, offset]
    );
    return res.set("Cache-Control", "no-store").json({ users: result.rows, limit, offset });
  } catch {
    return res.status(503).json({ error: "User directory is temporarily unavailable." });
  }
});

router.patch("/users/:userId/status", async (req, res) => {
  const userId = req.params.userId;
  const status = req.body?.status;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !["active", "suspended"].includes(status) ||
      reason.length < 3 || reason.length > 200 || /[\r\n]/.test(reason)) {
    return res.status(400).json({ error: "Choose a valid account status and provide a short reason." });
  }
  if (userId === req.superAdmin.id) {
    return res.status(403).json({ error: "You cannot change your own administrator account." });
  }
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT u.id,u.status,EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_key='super_admin') AS is_super_admin FROM users u WHERE u.id=$1 FOR UPDATE",
      [userId]
    );
    const target = found.rows[0];
    if (!target) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found." });
    }
    if (target.is_super_admin) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Super Admin accounts are protected from this action." });
    }
    if (target.status === "pending_verification") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Pending verification accounts cannot be suspended or restored here." });
    }
    if (target.status === status) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "The account already has this status." });
    }
    const updated = await client.query(
      "UPDATE users SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING id,ethio_id,full_name,status,updated_at",
      [userId, status]
    );
    if (status === "suspended") {
      await client.query("UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL", [userId]);
    }
    await client.query("COMMIT");
    const { recordSecurityEvent } = require("./audit");
    const logged = await recordSecurityEvent(req, {
      type: "user_status_updated",
      severity: status === "suspended" ? "warning" : "info",
      userId: req.superAdmin.id,
      metadata: { target_user_id: userId, status, reason }
    });
    if (!logged) return res.status(503).json({ error: "Account status saved, but audit confirmation failed. Contact support." });
    return res.set("Cache-Control", "no-store").json({ ok: true, user: updated.rows[0] });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(503).json({ error: "Account status could not be updated." });
  } finally {
    client.release();
  }
});


router.patch("/users/:userId/roles", async (req, res) => {
  const userId = req.params.userId;
  const roleKey = req.body?.roleKey;
  const action = req.body?.action;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const managedRoles = ["content_manager", "finance_manager", "moderator", "support"];
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !managedRoles.includes(roleKey) ||
      !["grant", "revoke"].includes(action) || reason.length < 3 || reason.length > 200 ||
      /[\r\n]/.test(reason)) {
    return res.status(400).json({ error: "Choose an allowed role, action and short reason." });
  }
  if (userId === req.superAdmin.id) {
    return res.status(403).json({ error: "You cannot change roles on your own account." });
  }
  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query(
      "SELECT u.id,u.status,EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_key='super_admin') AS is_super_admin FROM users u WHERE u.id=$1 FOR UPDATE",
      [userId]
    );
    if (!target.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found." });
    }
    if (target.rows[0].is_super_admin) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Super Admin roles are protected." });
    }
    if (target.rows[0].status !== "active") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Only active accounts can have roles changed." });
    }
    if (action === "grant") {
      await client.query(
        "INSERT INTO user_roles (user_id,role_key,granted_by) VALUES ($1,$2,$3) ON CONFLICT (user_id,role_key) DO NOTHING",
        [userId, roleKey, req.superAdmin.id]
      );
    } else {
      await client.query(
        "DELETE FROM user_roles WHERE user_id=$1 AND role_key=$2",
        [userId, roleKey]
      );
    }
    const roles = await client.query(
      "SELECT role_key FROM user_roles WHERE user_id=$1 ORDER BY role_key",
      [userId]
    );
    await client.query("COMMIT");
    const { recordSecurityEvent } = require("./audit");
    const logged = await recordSecurityEvent(req, {
      type: "user_role_updated",
      severity: "warning",
      userId: req.superAdmin.id,
      metadata: { target_user_id: userId, role_key: roleKey, action, reason }
    });
    if (!logged) return res.status(503).json({ error: "Role saved, but audit confirmation failed. Contact support." });
    return res.set("Cache-Control", "no-store").json({ ok: true, roles: roles.rows.map(row => row.role_key) });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(503).json({ error: "User role could not be updated." });
  } finally {
    client.release();
  }
});

router.get("/identity-verifications", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending_review";
  const allowed = ["unverified", "pending_review", "verified", "needs_more_info", "rejected"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid verification status." });
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
  try {
    const result = await req.app.locals.db.query(
      "SELECT id,ethio_id,full_name,email,phone,identity_verification_status,identity_verification_updated_at,created_at FROM users WHERE identity_verification_status=$1 ORDER BY identity_verification_updated_at ASC LIMIT $2 OFFSET $3",
      [status, limit, offset]
    );
    return res.set("Cache-Control", "no-store").json({ applications: result.rows, status, limit, offset });
  } catch {
    return res.status(503).json({ error: "Identity review queue is temporarily unavailable." });
  }
});

router.patch("/users/:userId/identity-verification", async (req, res) => {
  const userId = req.params.userId;
  const status = req.body?.status;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const allowed = ["pending_review", "verified", "needs_more_info", "rejected"];
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !allowed.includes(status) ||
      reason.length > 500 || /[\r\n]/.test(reason) ||
      (["needs_more_info", "rejected"].includes(status) && reason.length < 3)) {
    return res.status(400).json({ error: "Check the verification decision and review note." });
  }
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT id,identity_verification_status FROM users WHERE id=$1 AND status='active' FOR UPDATE",
      [userId]
    );
    if (!found.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found." });
    }
    const updated = await client.query(
      "UPDATE users SET identity_verification_status=$2,identity_verification_updated_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id,ethio_id,full_name,identity_verification_status,identity_verification_updated_at",
      [userId, status]
    );
    await client.query("COMMIT");
    const { recordSecurityEvent } = require("./audit");
    const logged = await recordSecurityEvent(req, {
      type: "identity_verification_updated",
      severity: status === "rejected" ? "high" : "info",
      userId: req.superAdmin.id,
      metadata: {
        route: req.path,
        method: req.method,
        reason: status + (reason ? ": " + reason.slice(0, 60) : ""),
        target_user_id: userId
      }
    });
    if (!logged) {
      return res.status(503).json({ error: "Decision saved, but the audit record could not be confirmed. Contact support." });
    }
    return res.set("Cache-Control", "no-store").json({ ok: true, user: updated.rows[0] });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(503).json({ error: "Identity verification decision could not be saved." });
  } finally {
    client.release();
  }
});

module.exports = router;
