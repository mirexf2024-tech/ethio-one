const test = require("node:test");
const assert = require("node:assert/strict");
const { safeMetadata, digestIp } = require("../admin/audit");

test("security audit metadata is strictly allowlisted and bounded", () => {
  assert.deepEqual(safeMetadata({
    channel: "email",
    reason: "incorrect_code",
    password: "must-not-be-kept",
    token: "secret-token",
    message: "private text",
    route: "/auth/login",
    oversized: "x".repeat(200)
  }), {
    channel: "email",
    reason: "incorrect_code",
    route: "/auth/login"
  });
});

test("client IP is stored only as a keyed digest", () => {
  assert.equal(digestIp("203.0.113.10", ""), null);
  const digest = digestIp("203.0.113.10", "s".repeat(40));
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, "203.0.113.10");
  assert.equal(digest, digestIp("203.0.113.10", "s".repeat(40)));
  assert.notEqual(digest, digestIp("203.0.113.10", "t".repeat(40)));
});
