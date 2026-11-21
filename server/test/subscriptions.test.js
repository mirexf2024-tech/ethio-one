const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const crypto = require("node:crypto");
const subscriptionsRouter = require("../subscriptions/routes");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "test-secret-that-is-long-enough-for-hmac-signing";

function token() {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: USER_ID, exp: Math.floor(Date.now() / 1000) + 300 })).toString("base64url");
  const input = header + "." + payload;
  return input + "." + crypto.createHmac("sha256", SECRET).update(input).digest("base64url");
}

async function createApp(query) {
  const app = express();
  app.locals.authEnv = { AUTH_ENABLED: "true", ACCESS_TOKEN_SECRET: SECRET };
  app.locals.db = { query };
  app.use(express.json());
  app.use("/api/v1/subscriptions", subscriptionsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}/api/v1/subscriptions`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

test("subscription plans show draft paid plans as unavailable without a price", async (t) => {
  const app = await createApp(async () => ({
    rows: [
      { plan_key: "free", display_name: "Ethio One Free", description: "Free access", currency: "ETB", amount_minor: 0, billing_interval: "none", status: "active" },
      { plan_key: "premium", display_name: "Ethio One Premium", description: "Preview", currency: "ETB", amount_minor: 0, billing_interval: "month", status: "draft" },
      { plan_key: "pro", display_name: "Ethio One Pro", description: "Preview", currency: "ETB", amount_minor: 0, billing_interval: "month", status: "draft" }
    ]
  }));
  t.after(app.close);
  const response = await fetch(app.base + "/plans");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = await response.json();
  assert.equal(data.plans.length, 3);
  assert.equal(data.plans[0].planKey, "free");
  assert.equal(data.plans[0].available, true);
  assert.deepEqual(data.plans[0].price, { amountMinor: 0, currency: "ETB", interval: "none" });
  assert.equal(data.plans[1].available, false);
  assert.equal(data.plans[1].price, null);
  assert.equal(data.plans[2].available, false);
  assert.equal(data.plans[2].price, null);
});

test("subscription account endpoint requires a valid active user session", async (t) => {
  const app = await createApp(async () => ({ rows: [{ id: USER_ID }] }));
  t.after(app.close);
  const response = await fetch(app.base + "/me");
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Please sign in again." });
});

test("paid access is false until a successful verified payment exists", async (t) => {
  const app = await createApp(async (sql) => {
    if (sql.startsWith("SELECT id FROM users")) return { rows: [{ id: USER_ID }] };
    return { rows: [{
      subscription_id: "22222222-2222-4222-8222-222222222222",
      plan_key: "premium",
      status: "active",
      starts_at: null,
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      display_name: "Ethio One Premium",
      description: "Premium preview",
      plan_status: "active",
      payment_verified: false
    }] };
  });
  t.after(app.close);
  const response = await fetch(app.base + "/me", { headers: { Authorization: "Bearer " + token() } });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.subscription.planKey, "premium");
  assert.equal(data.paidAccessEnabled, false);
});

test("paid access becomes eligible only after the payment is verified", async (t) => {
  const app = await createApp(async (sql) => {
    if (sql.startsWith("SELECT id FROM users")) return { rows: [{ id: USER_ID }] };
    return { rows: [{
      subscription_id: "22222222-2222-4222-8222-222222222222",
      plan_key: "premium",
      status: "active",
      starts_at: null,
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      display_name: "Ethio One Premium",
      description: "Premium preview",
      plan_status: "active",
      payment_verified: true
    }] };
  });
  t.after(app.close);
  const response = await fetch(app.base + "/me", { headers: { Authorization: "Bearer " + token() } });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.paidAccessEnabled, true);
});
