const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
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
    assert.equal(body.redirect, "/chat");
  }
});
