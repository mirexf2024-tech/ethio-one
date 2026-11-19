const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("landing page exposes all 16 service cards", () => {
  assert.equal((html.match(/class="tile"/g) || []).length, 16);
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
