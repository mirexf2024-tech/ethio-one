const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const schema = read("schema/019_ethio_lottery_planned_raffle.sql");
const routes = read("lottery/routes.js");
const providers = read("lottery/providers.js");
const server = read("index.js");

test("Ethio Lottery is registered as planned and every live release switch is database-locked off", () => {
  assert.match(schema, /\('lottery',\s*'Ethio Lottery',\s*'planned'\)/);
  for (const flag of ["sales_enabled","public_enabled","live_payments_enabled","live_draws_enabled"]) {
    assert.match(schema, new RegExp(flag + "\\s+BOOLEAN NOT NULL DEFAULT FALSE CHECK \\(" + flag + "=FALSE\\)", "i"));
  }
});

test("the planning API is mounted separately and is protected by verified Super Admin access", () => {
  assert.match(server, /app\.use\("\/api\/v1\/lottery"/);
  assert.match(routes, /router\.use\(requireSuperAdmin\)/);
  assert.match(routes, /roles\.includes\("super_admin"\)/);
  assert.match(routes, /user\.email_verified_at/);
  assert.match(routes, /env\.ADMIN_EMAIL/);
});

test("campaign operations can only create and manage private draft/prepared/archived records", () => {
  assert.match(routes, /'draft',FALSE,FALSE/);
  assert.match(routes, /\["draft","prepared","archived"\]/);
  assert.doesNotMatch(routes, /router\.(?:post|put|patch)\(["']\/tickets/);
  assert.doesNotMatch(routes, /router\.(?:post|put|patch)\(["']\/payments/);
  assert.doesNotMatch(routes, /router\.(?:post|put|patch)\(["']\/draws/);
});

test("payment provider adapters perform no live network requests and remain disabled", () => {
  for (const key of ["cbe","telebirr","mpesa"]) {
    assert.match(providers, new RegExp(key + ": Object\\.freeze"));
  }
  assert.match(providers, /enabled: false/);
  assert.match(providers, /mode: "disabled"/);
  assert.match(providers, /assertLivePaymentsDisabled/);
  assert.doesNotMatch(providers, /fetch\(|axios\.|https?:\/\//);
});

test("sandbox simulations are explicitly fake and cannot create real ticket or winner records", () => {
  assert.match(routes, /\/sandbox\/run/);
  assert.match(routes, /SBX-/);
  assert.match(routes, /simulation_only/);
  assert.match(routes, /No money, real ticket, winner or draw was created/);
  assert.match(schema, /CHECK\(simulation_only=TRUE\)/);
  assert.match(schema, /does NOT create live ticket, payment, or draw tables/);
});

test("approval tracker starts with ELS and all three payment providers not requested", () => {
  assert.match(schema, /VALUES\s*\('els'\),\('cbe'\),\('telebirr'\),\('mpesa'\)/);
  assert.match(schema, /status VARCHAR\(24\) NOT NULL DEFAULT 'not_started'/);
});

test("planning actions are stored in a dedicated audit log", () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS lottery_audit_logs/);
  assert.match(routes, /raffle_campaign_draft_created/);
  assert.match(routes, /raffle_campaign_draft_updated/);
  assert.match(routes, /raffle_sandbox_simulated/);
});
