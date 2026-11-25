const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const wallet = fs.readFileSync(path.join(__dirname, "..", "wallet.html"), "utf8");

test("landing page exposes all 20 service cards", () => {
  assert.equal((html.match(/class="tile"/g) || []).length, 20);
});

test("all visible translated labels exist in all three languages", () => {
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(keys.length >= 30, "expected translated UI labels");
  for (const key of new Set(keys)) {
    const count = (html.match(new RegExp(`\\b${key}\\s*:`, "g")) || []).length;
    assert.ok(count >= 3, `missing translation for ${key} in one or more languages`);
  }
});

test("language switch and accessible label are present", () => {
  assert.match(html, /id="languageToggle"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /setLanguage\(currentLanguage\)/);
  assert.match(html, /order = \["OM","AM","EN"\]/);
});

test("keyboard users can skip to the main content", () => {
  assert.match(html, /class="skip-link" href="#mainContent"/);
  assert.match(html, /<main id="mainContent">/);
  assert.match(html, /:focus-visible/);
});

test("reduced-motion preferences are respected", () => {
  assert.match(html, /prefers-reduced-motion:reduce/);
});

test("brand artwork has an accessible image label", () => {
  assert.match(html, /<img src="[^"]*ETHIO[^"]*" alt="Ethio One logo">/);
});

test("runtime telemetry reports only fixed event types and no error payloads", () => {
  assert.match(html, /api\/v1\/telemetry\/client-error/);
  assert.match(html, /window_error/);
  assert.match(html, /unhandled_rejection/);
  assert.doesNotMatch(html, /error\.stack|event\.message|event\.reason/);
});

test("Ethio Wallet service tile opens the wallet page", () => {
  assert.ok(html.includes('<a class="tile" href="/wallet.html" aria-label="Open Ethio Wallet">'));
});

test("wallet uses the shared authenticated session and stays read-only", () => {
  assert.match(wallet, /sessionStorage\.getItem\(k\)/);
  assert.match(wallet, /sessionStorage\.setItem\(k,v\)/);
  assert.match(wallet, /WALLET=API\+"\/wallet"/);
  assert.match(wallet, /withdrawals are not enabled/i);
  assert.match(wallet, /disabled data-i="withdraw"/);
});

const finance = fs.readFileSync(path.join(__dirname, "..", "finance.html"), "utf8");
const admin = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8");

test("admin center links to the read-only finance dashboard", () => {
  assert.match(admin, /href="\/finance\.html"/);
});

test("finance dashboard uses protected finance APIs and does not enable payouts", () => {
  assert.match(finance, /\/admin\/finance\/summary/);
  assert.match(finance, /\/admin\/payouts\?status=/);
  assert.match(finance, /withdrawal requests|withdrawals|payouts/i);
  assert.match(finance, /cannot approve or dispatch payments/i);
  assert.match(finance, /sessionStorage\.setItem/);
  assert.doesNotMatch(finance, /fetch\([^)]*\/admin\/payouts[^)]*method:\s*["']PATCH/i);
});
