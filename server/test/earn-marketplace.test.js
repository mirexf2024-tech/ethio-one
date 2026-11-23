const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routes = fs.readFileSync(path.join(__dirname, "../earn/routes.js"), "utf8");
const audit = fs.readFileSync(path.join(__dirname, "../admin/audit.js"), "utf8");
const marketplace = fs.readFileSync(path.join(__dirname, "../schema/011_ethio_earn_verified_partner_marketplace.sql"), "utf8");
const appeals = fs.readFileSync(path.join(__dirname, "../schema/012_ethio_earn_worker_appeals.sql"), "utf8");

test("only published, moderated and funded campaigns appear in the member marketplace", () => {
  assert.match(routes, /status='published' AND funding_status='verified' AND moderation_status='approved'/);
  assert.match(routes, /status='published' AND funding_status='verified' AND moderation_status='approved' FOR UPDATE/);
});

test("partner task intake requires a verified provider URL, budget coverage and quality criteria", () => {
  assert.match(routes, /router\.post\("\/requests"/);
  assert.match(routes, /safeHttpsUrl/);
  assert.match(routes, /budgetMinor<rewardMinor\*slots/);
  assert.match(routes, /!quality/);
  assert.match(routes, /blockedTaskText/);
});

test("partner requests need both moderator approval and finance funding verification before publishing", () => {
  assert.match(routes, /requireRoles\(req,res,\["moderator","admin","super_admin"\]\)/);
  assert.match(routes, /requireRoles\(req,res,\["finance_manager","admin","super_admin"\]\)/);
  assert.match(routes, /row\.status!=="moderator_approved"\|\|row\.funding_status!=="verified"/);
  assert.match(routes, /status='published',campaign_id=\$2/);
});

test("moderators can review member submissions and rejection reasons are mandatory", () => {
  assert.match(routes, /requireRoles\(req,res,\["moderator","admin","super_admin","finance_manager"\]\)/);
  assert.match(routes, /req\.body\.decision==="rejected"&&note\.length<3/);
  assert.match(routes, /earn_submission_reviewed/);
});

test("worker appeals are limited to rejected work and require accepted appeal before resubmission", () => {
  assert.match(routes, /router\.post\("\/submissions\/:id\/appeal"/);
  assert.match(routes, /Date\.now\(\)-7\*24\*60\*60\*1000/);
  assert.match(routes, /s\.appeal_status!=="accepted"/);
  assert.match(routes, /status='pending',reviewer_id=NULL/);
  assert.match(appeals, /UNIQUE/);
});

test("partner marketplace and appeal audit events are allowlisted", () => {
  for (const event of ["earn_task_request_submitted","earn_task_request_reviewed","earn_task_funding_verified","earn_campaign_moderated","earn_campaign_funding_verified","earn_appeal_reviewed"]) {
    assert.ok(audit.includes(event), event + " must be audited");
  }
});

test("campaign schema tracks provider, skills, quality, funding and moderation", () => {
  for (const field of ["task_type","provider_url","estimated_minutes","skill_level","quality_criteria","funding_status","moderation_status"]) {
    assert.ok(marketplace.includes(field), field + " must exist");
  }
});
