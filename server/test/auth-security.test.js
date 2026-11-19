const test = require("node:test");
const assert = require("node:assert/strict");
const security = require("../auth/security");

test("normalizes email and Ethiopian phone numbers", () => {
  assert.equal(security.normalizeEmail("  Person@Example.COM "), "person@example.com");
  assert.equal(security.normalizePhone("0911234567"), "+251911234567");
  assert.equal(security.normalizePhone("0711234567"), "+251711234567");
  assert.equal(security.normalizePhone("+251 911 234 567"), "+251911234567");
  assert.throws(() => security.normalizeEmail("not-an-email"), /valid email/);
  assert.throws(() => security.normalizePhone("12345"), /E.164/);
});

test("password hashes are salted, verifiable, and never equal plaintext", async () => {
  const first = await security.hashPassword("correct horse battery staple");
  const second = await security.hashPassword("correct horse battery staple");
  assert.notEqual(first, "correct horse battery staple");
  assert.notEqual(first, second);
  assert.equal(await security.verifyPassword("correct horse battery staple", first), true);
  assert.equal(await security.verifyPassword("wrong password", first), false);
  assert.equal(await security.verifyPassword("correct horse battery staple", "invalid"), false);
  await assert.rejects(security.hashPassword("short"), /between 8 and 128/);
});

test("OTP generation and challenge digests are secure and configuration-gated", () => {
  const otp = security.createOtp();
  assert.match(otp, /^\d{6}$/);
  assert.throws(() => security.digestChallenge(otp, ""), /pepper is not configured/);
  assert.throws(() => security.digestChallenge("123", "x".repeat(32)), /six-digit/);
  const digest = security.digestChallenge(otp, "p".repeat(48));
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, security.digestChallenge(otp, "p".repeat(48)));
  assert.notEqual(digest, security.digestChallenge(otp, "q".repeat(48)));
});

test("opaque session tokens are random and stored as one-way digests", () => {
  const token = security.createOpaqueToken();
  assert.ok(token.length >= 64);
  assert.notEqual(token, security.digestToken(token));
  assert.equal(security.digestToken(token), security.digestToken(token));
  assert.throws(() => security.digestToken("tiny"), /Invalid session token/);
});
