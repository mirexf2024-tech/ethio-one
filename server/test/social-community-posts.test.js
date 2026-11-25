const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const socialRouter = require("../social/routes");

test("community posts are private to members and support publishing", async (t) => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const communityId = "00000000-0000-4000-8000-000000000002";
  const postId = "00000000-0000-4000-8000-000000000003";
  const secret = "community-post-test-secret";
  const calls = [];
  let isMember = true;
  const app = express();
  app.locals.authEnv = { ACCESS_TOKEN_SECRET: secret };
  app.locals.db = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM users WHERE id=$1 AND status='active'")) return { rows: [{ id: userId }] };
      if (sql.includes("SELECT 1 FROM social_group_members WHERE group_id=$1 AND user_id=$2")) return { rowCount: isMember ? 1 : 0, rows: isMember ? [{}] : [] };
      if (sql.includes("FROM social_community_posts p JOIN users u")) return { rows: [{ id: postId, community_id: communityId, body: "Hello community", author_id: userId, comment_count: 0 }] };
      if (sql.includes("INSERT INTO social_community_posts")) return { rowCount: 1, rows: [{ id: postId, community_id: communityId, user_id: userId, body: "Hello community", media: [] }] };
      throw new Error("Unexpected query in community post test: " + sql);
    }
  };
  app.use(express.json());
  app.use("/api/v1/social", socialRouter);
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ sub: userId, exp: Math.floor(Date.now() / 1000) + 300 });
  const signature = crypto.createHmac("sha256", secret).update(header + "." + payload).digest("base64url");
  const authorization = "Bearer " + header + "." + payload + "." + signature;
  const base = `http://127.0.0.1:${server.address().port}/api/v1/social/communities/${communityId}/posts`;

  const feed = await fetch(base, { headers: { authorization } });
  assert.equal(feed.status, 200);
  assert.equal((await feed.json()).posts[0].body, "Hello community");

  const published = await fetch(base, { method: "POST", headers: { authorization, "content-type": "application/json" }, body: JSON.stringify({ body: "Hello community", media: [] }) });
  assert.equal(published.status, 201);
  assert.equal((await published.json()).post.id, postId);

  isMember = false;
  const deniedFeed = await fetch(base, { headers: { authorization } });
  assert.equal(deniedFeed.status, 403);
  const deniedPublish = await fetch(base, { method: "POST", headers: { authorization, "content-type": "application/json" }, body: JSON.stringify({ body: "Not a member", media: [] }) });
  assert.equal(deniedPublish.status, 403);
  assert.ok(calls.some(call => call.sql.includes("social_community_posts")));
});
