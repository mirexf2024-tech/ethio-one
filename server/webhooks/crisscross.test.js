const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { verifyCrissCrossWebhook } = require("./crisscross");

const secretBytes = Buffer.from("crisscross-webhook-test-secret");
const secret = "whsec_" + secretBytes.toString("base64");

function makeHeaders(rawBody, nowSeconds) {
  const id = "msg_test_123";
  const timestamp = String(nowSeconds);
  const signed = Buffer.concat([Buffer.from(id + "." + timestamp + ".", "utf8"), rawBody]);
  const signature = crypto.createHmac("sha256", secretBytes).update(signed).digest("base64");
  return { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": "v1," + signature };
}

test("accepts a valid signed webhook with raw bytes", () => {
  const now = 1_800_000_000;
  const rawBody = Buffer.from('{"transactionId":"test","status":"COMPLETED"}');
  assert.equal(verifyCrissCrossWebhook({ rawBody, headers: makeHeaders(rawBody, now), secret, nowSeconds: now }), true);
});

test("rejects a modified webhook body", () => {
  const now = 1_800_000_000;
  const rawBody = Buffer.from('{"status":"COMPLETED"}');
  const headers = makeHeaders(rawBody, now);
  assert.throws(() => verifyCrissCrossWebhook({
    rawBody: Buffer.from('{"status":"FAILED"}'), headers, secret, nowSeconds: now
  }), /signature/i);
});

test("rejects stale webhook timestamps", () => {
  const now = 1_800_000_000;
  const rawBody = Buffer.from("{}");
  assert.throws(() => verifyCrissCrossWebhook({
    rawBody, headers: makeHeaders(rawBody, now - 301), secret, nowSeconds: now
  }), /timestamp/i);
});

test("rejects missing signature headers", () => {
  assert.throws(() => verifyCrissCrossWebhook({
    rawBody: Buffer.from("{}"), headers: {}, secret, nowSeconds: 1_800_000_000
  }), /headers/i);
});

test("requires a raw Buffer body", () => {
  assert.throws(() => verifyCrissCrossWebhook({
    rawBody: "{}", headers: {}, secret, nowSeconds: 1_800_000_000
  }), /Buffer/i);
});
