const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("Super Admin page contains a parseable browser script and secure session handling", () => {
  const html = fs.readFileSync(path.join(__dirname, "../admin.html"), "utf8");
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, "admin page must include its application script");
  assert.doesNotThrow(() => new vm.Script(match[1]), "admin page JavaScript must parse");
  assert.match(html, /name="robots" content="noindex,nofollow"/);
  assert.match(html, /request\("\/admin\/overview"\)/);
  assert.match(html, /setInterval\(/, "dashboard must refresh monitoring data periodically");
  assert.match(html, /location\.origin\s*\+\s*"\/"|fetch\(location\.origin\s*\+\s*"\/"/, "dashboard must check website availability");
  assert.match(html, /\/auth\/refresh/, "dashboard must rotate expired access sessions");
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
  assert.match(html, /\bAUTH_ENABLED\b|Authentication is currently disabled|Authentication ammaaf cufameera/);
});

test("Super Admin page polls while visible and clears the password on logout", () => {
  const html = fs.readFileSync(path.join(__dirname, "../admin.html"), "utf8");
  assert.match(html, /document\.visibilityState===\"visible\"/);
  assert.match(html, /\$\("password"\)\.value=\"\"/);
});

test("Super Admin page has all three supported interface languages", () => {
  const html = fs.readFileSync(path.join(__dirname, "../admin.html"), "utf8");
  assert.match(html, /value="om"/);
  assert.match(html, /value="am"/);
  assert.match(html, /value="en"/);
});


test("Ethio Lottery planning console is private and its browser script parses", () => {
  const html = fs.readFileSync(path.join(__dirname, "../lottery-admin.html"), "utf8");
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, "lottery planning console must include its application script");
  assert.doesNotThrow(() => new vm.Script(match[1]), "lottery planning console JavaScript must parse");
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html, /PLANNED ONLY/);
  assert.match(html, /sales OFF/);
  assert.doesNotMatch(html, /\/api\/v1\/lottery\/(?:tickets|payments|draws)/);
});
