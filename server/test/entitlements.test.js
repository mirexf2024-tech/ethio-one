const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const crypto = require("node:crypto");
const foundationRouter = require("../foundation/routes");

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
  app.use("/api/v1/account", foundationRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/api/v1/account/entitlements`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

test("entitlements require an authenticated active account", async (t) => {
  const app = await createApp(async () => ({ rows: [{ id: USER_ID }] }));
  t.after(app.close);
  const response = await fetch(app.url);
  assert.equal(response.status, 401);
});

test("Free access includes only active modules; planned modules remain locked", async (t) => {
  const app = await createApp(async (sql) => {
    if (sql.startsWith("SELECT id,ethio_id")) return { rows: [{ id: USER_ID }] };
    assert.match(sql, /s\.status='active'/);
    assert.match(sql, /t\.status='succeeded'/);
    assert.match(sql, /t\.verified_at IS NOT NULL/);
    return { rows: [
      { module_key: "social", display_name: "Ethio Social", status: "active", plan_key: "free", access_level: "included", available: true, limits: {} },
      { module_key: "tube", display_name: "Ethio Tube", status: "planned", plan_key: "free", access_level: "locked", available: false, limits: {} }
    ] };
  });
  t.after(app.close);
  const response = await fetch(app.url, { headers: { Authorization: "Bearer " + token() } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = await response.json();
  assert.equal(data.planKey, "free");
  assert.equal(data.modules.find((m) => m.moduleKey === "social").available, true);
  assert.equal(data.modules.find((m) => m.moduleKey === "tube").available, false);
});

test("Premium entitlements depend on active verified payment and explicit plan grants", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../foundation/routes.js"), "utf8");
  assert.match(source, /sp\.status='active'/);
  assert.match(source, /t\.status='succeeded'/);
  assert.match(source, /t\.verified_at IS NOT NULL/);
  assert.match(source, /pma\.plan_key=sp\.plan_key AND pma\.module_key=m\.module_key/);
  assert.match(source, /COALESCE\(pma\.access_level IN \('included','limited'\),FALSE\)/);
});
