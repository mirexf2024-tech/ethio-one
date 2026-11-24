const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("Payo webhook is mounted before JSON parsing so HMAC uses raw bytes", () => {
  const source = fs.readFileSync(path.join(root, "index.js"), "utf8");
  const webhook = source.indexOf('app.post("/api/payment-webhook", express.raw');
  const jsonParser = source.indexOf("app.use(express.json");
  assert.ok(webhook >= 0);
  assert.ok(jsonParser > webhook);
  assert.match(source, /app\.use\("\/api\/v1\/payments", payoRouter\)/);
});

test("Payo checkout is disabled by default and requires an active priced ETB plan", () => {
  const source = fs.readFileSync(path.join(root, "payments/payo.js"), "utf8");
  assert.match(source, /env\.PAYO_ENABLED !== "true"/);
  assert.match(source, /status='active' AND amount_minor>0 AND currency='ETB'/);
  assert.match(source, /metadata:\s*\{[\s\S]*userId:[\s\S]*subscriptionId:[\s\S]*transactionId:/);
});

test("Payo webhook verifies HMAC and only activates a pending subscription on APPROVED", () => {
  const source = fs.readFileSync(path.join(root, "payments/payo.js"), "utf8");
  assert.match(source, /x-pygate-signature/);
  assert.match(source, /createHmac\("sha256", apiKey\)\.update\(req\.body\)\.digest\("hex"\)/);
  assert.match(source, /status === "APPROVED"/);
  assert.match(source, /row\.subscription_status !== "pending"/);
  assert.match(source, /status='succeeded'/);
  assert.match(source, /status='failed'/);
});

test("Premium payment integration does not reference Ethio Earn reward or payout ledgers", () => {
  const source = fs.readFileSync(path.join(root, "payments/payo.js"), "utf8");
  assert.doesNotMatch(source, /earn_ledger|earn_payout|earn_sponsor/);
});
