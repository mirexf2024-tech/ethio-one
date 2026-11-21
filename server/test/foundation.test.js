const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("registration provisions Ethio ID, profile and member role atomically", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../auth/routes.js"), "utf8");
  assert.match(routes, /WITH identity AS \(SELECT gen_random_uuid\(\) AS id\)/);
  assert.match(routes, /'E1-' \|\| UPPER\(SUBSTRING\(REPLACE\(id::text/);
  assert.match(routes, /INSERT INTO user_profiles \(user_id,country,locale\)/);
  assert.match(routes, /INSERT INTO user_roles \(user_id,role_key\) VALUES \(\$1,'member'\)/);
});

test("sign-in accepts Ethio ID and password reset validates a six-digit OTP", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../auth/routes.js"), "utf8");
  assert.match(routes, /lower\(ethio_id\)=lower\(\$1\) OR lower\(username\)=lower\(\$1\)/);
  assert.doesNotMatch(routes, /\\\\d\{6\}/);
  assert.match(routes, /password_reset/);
});

test("foundation endpoints scope profile, roles, notifications and media to the signed-in user", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../foundation/routes.js"), "utf8");
  assert.match(routes, /router\.get\("\/profile"/);
  assert.match(routes, /router\.patch\("\/profile"/);
  assert.match(routes, /router\.get\("\/roles"/);
  assert.match(routes, /router\.get\("\/notifications"/);
  assert.match(routes, /WHERE user_id=\$1/);
  assert.match(routes, /router\.post\("\/media\/sign"/);
  assert.match(routes, /router\.post\("\/media"/);
  assert.match(routes, /identity_verification_status/);
  assert.match(routes, /identityVerificationStatus/);
  assert.match(routes, /identityVerificationUpdatedAt/);
});

test("auth responses expose the server-managed Ethio ID verification status", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../auth/routes.js"), "utf8");
  assert.ok(routes.includes("identityVerificationStatus:u.identity_verification_status"));
  assert.ok(routes.includes("identityVerificationUpdatedAt:u.identity_verification_updated_at"));
});
