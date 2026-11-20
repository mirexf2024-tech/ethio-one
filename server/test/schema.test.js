const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("identity hardening migration supports phone-only signup safely", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../schema/003_identity_hardening.sql"), "utf8");
  assert.match(sql, /ALTER COLUMN email DROP NOT NULL/i);
  assert.match(sql, /ALTER COLUMN status SET DEFAULT 'pending_verification'/i);
  assert.match(sql, /CHECK \(email IS NOT NULL OR phone IS NOT NULL\)/i);
  assert.match(sql, /email_verified_at TIMESTAMPTZ/i);
  assert.match(sql, /phone_verified_at TIMESTAMPTZ/i);
  assert.match(sql, /terms_version VARCHAR\(40\) NOT NULL/i);
  assert.match(sql, /003_identity_hardening/);
});

test("identity base schema never stores plaintext passwords", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../schema/002_identity_foundation.sql"), "utf8");
  assert.match(sql, /password_hash TEXT NOT NULL/i);
  assert.doesNotMatch(sql, /password\s+VARCHAR/i);
});

test("security audit migration stores only minimized event metadata", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../schema/005_security_events.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS security_events/i);
  assert.match(sql, /event_type VARCHAR\(80\)/i);
  assert.match(sql, /severity VARCHAR\(12\)/i);
  assert.match(sql, /ip_digest CHAR\(64\)/i);
  assert.match(sql, /metadata JSONB/i);
  assert.doesNotMatch(sql, /password|otp_code|refresh_token|message_body/i);
  assert.match(sql, /005_security_events/);
});
