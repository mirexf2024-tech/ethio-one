const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "social.html"), "utf8");
const routes = fs.readFileSync(path.join(root, "server", "social", "routes.js"), "utf8");

test("Ethio Social browser scripts parse without syntax errors", () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  assert.ok(scripts.length > 0, "social.html should contain its application script");
  for (const [index, source] of scripts.entries()) {
    assert.doesNotThrow(() => new vm.Script(source, { filename: `social-inline-${index}.js` }));
  }
});

test("Ethio Social keeps its core user workflows in the page", () => {
  for (const id of [
    "feed", "storiesBar", "postModal", "storyCreateModal", "profileEditModal",
    "notificationsModal", "messagesModal", "callModal", "incomingCallModal",
    "groupManageModal", "notificationPrefsModal", "postActionsModal",
    "savedPostsModal", "memberProfileModal", "actionDownload"
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing UI workflow: ${id}`);
  }
});

test("Ethio Social frontend retains its implemented API workflows", () => {
  for (const endpoint of [
    "/feed", "/stories", "/conversations", "/groups", "/calls/ice-servers",
    "/creator/analytics", "/video-view-preference", "/bookmarks", "/reports"
  ]) {
    assert.ok(html.includes(endpoint), `missing frontend API reference: ${endpoint}`);
  }
});

test("Group chats keep group refreshes separate from private conversations", () => {
  assert.match(html, /activeConversationKind==="group"\?loadGroupMessages\(window\.activeConversation\):loadMessages\(window\.activeConversation\)/);
  assert.match(html, /if\(activeConversationKind!=="group"\|\|window\.activeConversation!==id\)return/);
  assert.match(html, /if\(activeConversationKind!=="private"\|\|window\.activeConversation!==id\)return/);
});

test("Group information includes members and an add-member flow", () => {
  for (const id of ["groupInfoHero", "groupInfoSummary", "groupAddMemberBtn", "groupMemberSearch", "groupMemberList"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing group information element: ${id}`);
  }
  assert.match(html, /activeGroupMembers\.some/);
});

test("Ethio Social API keeps authentication, media validation and core routes", () => {
  for (const route of [
    'router.get("/feed"', 'router.post("/posts"',
    'router.post("/stories"', 'router.get("/conversations"',
    'router.post("/conversations/:id/messages"',
    'router.post("/groups"', 'router.get("/calls/ice-servers"',
    'router.post("/posts/:id/view"', 'router.get("/creator/analytics"'
  ]) {
    assert.ok(routes.includes(route), `missing API route: ${route}`);
  }
  assert.match(routes, /function requireAuth/);
  assert.match(routes, /const safeMedia\s*=/);
  assert.match(routes, /SOCIAL_TURN_URLS/);
});
