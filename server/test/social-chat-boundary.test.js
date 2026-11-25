const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const socialRouter = require("../social/routes");

test("Ethio Social hands private messaging, calls and community chat to Ethio Chat", async (t) => {
  const app = express();
  app.locals.db = {};
  app.use(express.json());
  app.use("/api/v1/social", socialRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const base = `http://127.0.0.1:${server.address().port}/api/v1/social`;
  const cases = [
    ["/conversations", "GET"],
    ["/conversations", "POST"],
    ["/conversations/00000000-0000-4000-8000-000000000000/messages", "GET"],
    ["/calls/ice-servers", "GET"],
    ["/calls/incoming", "GET"],
    ["/groups/00000000-0000-4000-8000-000000000000/messages", "GET"],
    ["/groups/00000000-0000-4000-8000-000000000000/messages/00000000-0000-4000-8000-000000000000", "DELETE"]
  ];

  for (const [path, method] of cases) {
    const response = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined });
    assert.equal(response.status, 410, `${method} ${path} should be retired from Ethio Social`);
    const body = await response.json();
    assert.equal(body.service, "ethio-chat");
    assert.match(body.error, /not available in Ethio Social/);
  }
});

test("Ethio Social UI does not expose its retired inbox or group-chat composer", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../social.html"), "utf8");
  assert.match(html, /id="messagesBtn"[^>]*data-coming-soon="ethioChat"/);
  assert.match(html, /data-coming-soon="ethioChat"[^>]*Ethio Chat|data-coming-soon="ethioChat"/);
  assert.doesNotMatch(html, /data-menu-action="messages"/);
  assert.match(html, /async function openInbox\(\)\{\s*toast\("Ethio Chat is being built separately/);
  assert.match(html, /async function startConversation\(userId,displayName\)\{\s*toast\("Ethio Chat is being built separately/);
});

test("Ethio Social exposes communities as the canonical alias for legacy group membership", async (t) => {
  const app = express();
  app.locals.db = {};
  app.use(express.json());
  app.use("/api/v1/social", socialRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/social`;
  const [communities, legacyGroups] = await Promise.all([
    fetch(base + "/communities"),
    fetch(base + "/groups")
  ]);
  assert.equal(communities.status, legacyGroups.status);
  assert.notEqual(communities.status, 404);
  assert.notEqual(communities.status, 410);
});

test("canonical /communities API returns community-shaped data and preserves /groups compatibility", async (t) => {
  const app = express();
  const userId = "00000000-0000-4000-8000-000000000001";
  const secret = "test-social-secret";
  app.locals.authEnv = { ACCESS_TOKEN_SECRET: secret };
  app.locals.db = {
    query: async (sql) => {
      if (sql.includes("FROM users WHERE id=$1 AND status='active'")) return { rows: [{ id: userId }] };
      if (sql.includes("FROM social_groups g JOIN social_group_members")) return { rows: [{ id: "00000000-0000-4000-8000-000000000002", name: "Readers", member_count: 1, role: "admin" }] };
      throw new Error("Unexpected query in community API contract test");
    }
  };
  app.use(express.json());
  app.use("/api/v1/social", socialRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ sub: userId, exp: Math.floor(Date.now() / 1000) + 300 });
  const signature = crypto.createHmac("sha256", secret).update(header + "." + payload).digest("base64url");
  const authorization = "Bearer " + header + "." + payload + "." + signature;
  const base = `http://127.0.0.1:${server.address().port}/api/v1/social`;
  const [communitiesResponse, groupsResponse] = await Promise.all([
    fetch(base + "/communities", { headers: { authorization } }),
    fetch(base + "/groups", { headers: { authorization } })
  ]);
  assert.equal(communitiesResponse.status, 200);
  assert.equal(groupsResponse.status, 200);
  const communities = await communitiesResponse.json();
  const groups = await groupsResponse.json();
  assert.equal(communities.communities[0].name, "Readers");
  assert.equal(groups.groups[0].name, "Readers");
  assert.equal(communities.groups, undefined);
  assert.equal(groups.communities, undefined);
});
