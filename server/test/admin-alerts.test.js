const test = require("node:test");
const assert = require("node:assert/strict");
const { sendSecurityAlert, senderUsesSharedSandbox } = require("../admin/alerts");

test("security alerts stay disabled for shared Resend sandbox senders", async () => {
  assert.equal(senderUsesSharedSandbox("Ethio One <onboarding@resend.dev>"), true);
  let called = false;
  const ok = await sendSecurityAlert(
    { type: "refresh_reuse", severity: "high" },
    { SECURITY_ALERTS_ENABLED: "true", RESEND_API_KEY: "test", ADMIN_EMAIL: "admin@example.com", ALERTS_FROM: "Ethio One <onboarding@resend.dev>" },
    async () => { called = true; return { ok: true }; }
  );
  assert.equal(ok, false);
  assert.equal(called, false);
});

test("security alerts send only minimal high-severity information through configured sender", async () => {
  let request;
  const ok = await sendSecurityAlert(
    { type: "refresh_reuse", severity: "high", createdAt: new Date("2026-11-20T10:00:00Z"), userId: "private-user-id", ip: "203.0.113.1", metadata: { token: "secret" } },
    { SECURITY_ALERTS_ENABLED: "true", RESEND_API_KEY: "secret-key", ADMIN_EMAIL: "admin@example.com", ALERTS_FROM: "Ethio One <alerts@example.org>" },
    async (url, options) => { request = { url, options }; return { ok: true }; }
  );
  assert.equal(ok, true);
  assert.equal(request.url, "https://api.resend.com/emails");
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.to, ["admin@example.com"]);
  assert.match(body.text, /refresh_reuse/);
  assert.doesNotMatch(body.text, /private-user-id|203\.0\.113\.1|secret/);
});

test("low-severity events do not send email", async () => {
  let called = false;
  const ok = await sendSecurityAlert(
    { type: "login_failed", severity: "warning" },
    { SECURITY_ALERTS_ENABLED: "true", RESEND_API_KEY: "secret", ADMIN_EMAIL: "admin@example.com", ALERTS_FROM: "alerts@example.org" },
    async () => { called = true; return { ok: true }; }
  );
  assert.equal(ok, false);
  assert.equal(called, false);
});
