const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Ethio ID review queue is behind super-admin middleware and limits statuses", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../admin/routes.js"), "utf8");
  assert.match(routes, /router\.use\(requireSuperAdmin\)/);
  assert.match(routes, /router\.get\("\/identity-verifications"/);
  assert.match(routes, /WHERE identity_verification_status=\$1/);
  assert.match(routes, /LIMIT \$2 OFFSET \$3/);
});

test("only server-side admin review can change identity verification status", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../admin/routes.js"), "utf8");
  assert.match(routes, /router\.patch\("\/users\/:userId\/identity-verification"/);
  assert.match(routes, /\["pending_review", "verified", "needs_more_info", "rejected"\]/);
  assert.match(routes, /identity_verification_updated_at=NOW\(\)/);
  assert.match(routes, /FOR UPDATE/);
  assert.match(routes, /req\.superAdmin\.id/);
  assert.match(routes, /identity_verification_updated/);
  assert.match(routes, /target_user_id: userId/);
});

test("admin verification decisions require a review note for more information or rejection", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../admin/routes.js"), "utf8");
  assert.match(routes, /\["needs_more_info", "rejected"\]\.includes\(status\) && reason\.length < 3/);
});

test("identity verification audit events and target user metadata are allowlisted", () => {
  const audit = fs.readFileSync(path.join(__dirname, "../admin/audit.js"), "utf8");
  assert.match(audit, /identity_verification_updated/);
  assert.match(audit, /target_user_id/);
});


test("signed-in users can request review but cannot set their own verified status", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../foundation/routes.js"), "utf8");
  assert.match(routes, /router\.post\("\/identity-verification\/request"/);
  assert.match(routes, /WHERE id=\$1 AND status='active' FOR UPDATE/);
  assert.match(routes, /\["unverified",\s*"needs_more_info"\]\.includes\(status\)/);
  assert.match(routes, /identity_verification_status='pending_review'/);
  assert.doesNotMatch(routes, /identity_verification_status=req\.body/);
  assert.match(routes, /identity_verification_requested/);
});

test("identity verification request audit event is allowlisted", () => {
  const audit = fs.readFileSync(path.join(__dirname, "../admin/audit.js"), "utf8");
  assert.match(audit, /identity_verification_requested/);
});
