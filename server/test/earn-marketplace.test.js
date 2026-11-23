const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routes = fs.readFileSync(path.join(__dirname, "../earn/routes.js"), "utf8");
const audit = fs.readFileSync(path.join(__dirname, "../admin/audit.js"), "utf8");
const marketplace = fs.readFileSync(path.join(__dirname, "../schema/011_ethio_earn_verified_partner_marketplace.sql"), "utf8");
const appeals = fs.readFileSync(path.join(__dirname, "../schema/012_ethio_earn_worker_appeals.sql"), "utf8");
const finance = fs.readFileSync(path.join(__dirname, "../schema/013_ethio_earn_platform_fee_ledger.sql"), "utf8");
const payouts = fs.readFileSync(path.join(__dirname, "../schema/019_ethio_earn_sponsors_payouts.sql"), "utf8");
const earnPage = fs.readFileSync(path.join(__dirname, "../../earn.html"), "utf8");

test("only published, moderated and funded campaigns appear in the member marketplace", () => {
  assert.match(routes, /status='published' AND funding_status='verified' AND moderation_status='approved'/);
  assert.match(routes, /status='published' AND funding_status='verified' AND moderation_status='approved' FOR UPDATE/);
});

test("partner task intake requires a verified provider URL, budget coverage and quality criteria", () => {
  assert.match(routes, /router\.post\("\/requests"/);
  assert.match(routes, /safeHttpsUrl/);
  assert.match(routes, /rewardPoolMinor=Number\.isSafeInteger\(rewardMinor\)&&Number\.isInteger\(slots\)\?rewardMinor\*slots:0/);
  assert.match(routes, /platformFeeMinor=Math\.ceil\(rewardPoolMinor\*platformFeeBps\/10000\)/);
  assert.match(routes, /budgetMinor!==rewardPoolMinor\+platformFeeMinor/);
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
  assert.match(routes, /requireRoles\(req,res,\["moderator","admin","super_admin"\]\)/);
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

test("partner tasks include a transparent 10 percent service fee and funded reward ledger", () => {
  assert.match(routes, /platformFeeBps=1000/);
  assert.match(routes, /Math\.ceil\(rewardPoolMinor\*platformFeeBps\/10000\)/);
  assert.match(routes, /earn_platform_revenue/);
  assert.match(routes, /rewards_credited_minor=rewards_credited_minor\+\$2/);
  assert.match(finance, /platform_fee_minor/);
  assert.match(finance, /earn_platform_revenue/);
});

test("payout requests remain disabled until the owner configures a high-entropy encryption key and release flag", () => {
  assert.match(routes, /env\.EARN_PAYOUTS_ENABLED==="true"/);
  assert.match(routes, /EARN_PAYOUT_ENCRYPTION_KEY/);
  assert.match(routes, /secret\.length<32/);
});

test("payout account details are encrypted at rest with AES-256-GCM and never returned in the member history", () => {
  assert.match(routes, /createCipheriv\("aes-256-gcm"/);
  assert.match(routes, /createDecipheriv\("aes-256-gcm"/);
  assert.match(routes, /account_ciphertext,account_iv,account_tag,account_hint/);
  assert.match(routes, /SELECT id,amount_minor,payout_method,account_hint,account_holder_name,status/);
});

test("payout requests reserve only available rewards and enforce a 50 ETB minimum", () => {
  assert.match(routes, /amountMinor<5000/);
  assert.match(routes, /status IN \('pending','processing','paid'\)/);
  assert.match(routes, /earn_ledger/);
  assert.match(routes, /earn_sponsor_ad_credits/);
  assert.match(routes, /FOR UPDATE/);
});

test("finance payout completion requires explicit confirmation and creates a unique payout ledger record", () => {
  assert.match(routes, /req\.body\?\.confirmPaid!==true/);
  assert.match(routes, /INSERT INTO earn_payout_ledger/);
  assert.match(routes, /requireRoles\(req,res,\["finance_manager","admin","super_admin"\]\)/);
});

test("payout schema stores encrypted account data and prevents duplicate payout ledger entries", () => {
  for (const field of ["account_ciphertext","account_iv","account_tag","account_hint","account_holder_name","earn_payout_ledger"]) {
    assert.ok(payouts.includes(field), field + " must exist");
  }
  assert.match(payouts, /UNIQUE REFERENCES earn_payout_requests/);
});

test("payout audit events are allowlisted without account details", () => {
  assert.match(audit, /earn_payout_requested/);
  assert.match(audit, /earn_payout_reviewed/);
  assert.match(audit, /payout_request_id/);
});

test("Ethio Earn payout controls are present, localized and disabled by default", () => {
  for (const id of ["payoutPanel","payoutForm","payoutMethod","payoutHolder","payoutAccount","payoutAmount","payoutSubmit","payoutHistory","payoutQueue"]) {
    assert.ok(earnPage.includes('id="' + id + '"'), id + " must exist");
  }
  for (const lang of ["OM","AM","EN"]) {
    assert.match(earnPage, new RegExp(lang + ":\\\\{[\\\\s\\\\S]*?payoutTitle"));
    assert.match(earnPage, new RegExp(lang + ":\\\\{[\\\\s\\\\S]*?payoutDisabled"));
  }
  assert.doesNotMatch(earnPage, /[\\u4e00-\\u9fff]/);
  assert.match(earnPage, /id="payoutSubmit" type="submit" disabled/);
});
