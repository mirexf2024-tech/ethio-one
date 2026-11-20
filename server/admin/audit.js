const crypto = require("node:crypto");

const ALLOWED_TYPES = new Set([
  "login_failed", "otp_invalid", "otp_expired", "refresh_reuse",
  "admin_access_denied", "auth_rate_limited", "provider_delivery_failed", "api_error", "api_not_found", "api_rate_limited", "client_error"
]);
const ALLOWED_SEVERITIES = new Set(["info", "warning", "high", "critical"]);
const ALLOWED_METADATA_KEYS = new Set(["channel", "reason", "route", "method", "provider", "component"]);

function safeMetadata(input = {}) {
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (typeof value !== "string" || value.length > 80) continue;
    if (/[\r\n]/.test(value)) continue;
    output[key] = value;
  }
  return output;
}

function digestIp(ip, pepper) {
  if (!pepper || String(pepper).length < 32 || typeof ip !== "string" || !ip) return null;
  return crypto.createHmac("sha256", pepper).update(ip).digest("hex");
}

async function recordSecurityEvent(req, event = {}) {
  const db = req?.app?.locals?.db;
  if (!db) return false;
  const type = ALLOWED_TYPES.has(event.type) ? event.type : null;
  const severity = ALLOWED_SEVERITIES.has(event.severity) ? event.severity : "warning";
  if (!type) return false;
  const env = req.app.locals.authEnv || process.env;
  const ip = typeof req.ip === "string" ? req.ip : "";
  const ipDigest = digestIp(ip, env.AUDIT_LOG_PEPPER);
  const userId = typeof event.userId === "string" && /^[0-9a-f-]{36}$/i.test(event.userId)
    ? event.userId : null;
  try {
    await db.query(
      "INSERT INTO security_events (event_type,severity,user_id,ip_digest,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)",
      [type, severity, userId, ipDigest, JSON.stringify(safeMetadata(event.metadata))]
    );
    if (severity === "high" || severity === "critical") {
      const { sendSecurityAlert } = require("./alerts");
      void sendSecurityAlert({ type, severity, createdAt: new Date() }, env).catch(() => {});
    }
    return true;
  } catch {
    // Logging must never break authentication or disclose internal database errors.
    return false;
  }
}

module.exports = { safeMetadata, digestIp, recordSecurityEvent };
