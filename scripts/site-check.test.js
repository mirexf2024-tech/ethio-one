const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("landing page exposes all 19 service cards", () => {
  assert.equal((html.match(/class="tile"/g) || []).length, 19);
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

test("brand artwork has an accessible image role and label", () => {
  assert.match(html, /role="img" aria-label="Ethio One E1 brand artwork"/);
});

test("runtime telemetry reports only fixed event types and no error payloads", () => {
  assert.match(html, /api\/v1\/telemetry\/client-error/);
  assert.match(html, /window_error/);
  assert.match(html, /unhandled_rejection/);
  assert.doesNotMatch(html, /error\.stack|event\.message|event\.reason/);
});
