const express = require("express");
const crypto = require("node:crypto");

const router = express.Router();

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function bearerPayload(req, env) {
  const match = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "");
  if (!match || match[1].length > 2048) return null;
  const parts = match[1].split(".");
  if (parts.length !== 3) return null;
  try {
    const expected = crypto.createHmac("sha256", env.ACCESS_TOKEN_SECRET).update(parts[0] + "." + parts[1]).digest();
    const actual = Buffer.from(parts[2], "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.sub && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now()/1000) ? payload : null;
  } catch { return null; }
}
async function telegramRequest(env, method, body) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram bot is not configured.");
  const response = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) throw new Error("Telegram request failed.");
  return result.result;
}

router.post("/link/start", async (req, res) => {
  const env = req.app.locals.authEnv || process.env;
  const db = req.app.locals.db;
  if (env.AUTH_ENABLED !== "true" || !db || !env.ACCESS_TOKEN_SECRET || String(env.ACCESS_TOKEN_SECRET).length < 32 ||
      !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_BOT_USERNAME) {
    return res.status(503).json({ error: "Telegram linking is temporarily unavailable." });
  }
  const user = bearerPayload(req, env);
  if (!user) return res.status(401).json({ error: "Please sign in again." });
  try {
    const account = await db.query("SELECT id FROM users WHERE id=$1 AND status='active'", [user.sub]);
    if (!account.rows[0]) return res.status(401).json({ error: "Please sign in again." });
    const token = crypto.randomBytes(32).toString("base64url");
    await db.query(
      "INSERT INTO telegram_link_challenges (user_id, token_digest, expires_at) VALUES ($1,$2,NOW()+INTERVAL '10 minutes')",
      [user.sub, digest(token)]
    );
    const bot = String(env.TELEGRAM_BOT_USERNAME).replace(/^@/, "");
    return res.status(201).json({
      ok: true,
      bot: "@" + bot,
      link: "https://t.me/" + bot + "?start=" + token,
      expiresIn: 600
    });
  } catch {
    return res.status(503).json({ error: "Telegram linking is temporarily unavailable." });
  }
});

router.post("/webhook", async (req, res) => {
  const env = req.app.locals.authEnv || process.env;
  const db = req.app.locals.db;
  const supplied = req.get("x-telegram-bot-api-secret-token") || "";
  const expected = env.TELEGRAM_WEBHOOK_SECRET || "";
  if (!expected || supplied.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.sendStatus(401);
  }
  if (!db || !env.TELEGRAM_BOT_TOKEN) return res.sendStatus(503);
  const message = req.body && req.body.message;
  const chatId = message && message.chat && message.chat.id;
  const text = message && message.text;
  if (!chatId || typeof text !== "string" || !text.startsWith("/start")) return res.sendStatus(200);
  const match = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{32,128})$/.exec(text.trim());
  if (!match) {
    await telegramRequest(env, "sendMessage", {
      chat_id: String(chatId),
      text: "Welcome to Ethio One. To link your account, open the secure Telegram link from your signed-in Ethio One app."
    }).catch(() => {});
    return res.sendStatus(200);
  }
  const tokenDigest = digest(match[1]);
  const client = await db.connect();
  let linked = false;
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT id,user_id FROM telegram_link_challenges WHERE token_digest=$1 AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE",
      [tokenDigest]
    );
    const challenge = found.rows[0];
    if (challenge) {
      await client.query(
        "INSERT INTO telegram_accounts (user_id,chat_id,linked_at) VALUES ($1,$2,NOW()) ON CONFLICT (user_id) DO UPDATE SET chat_id=EXCLUDED.chat_id, linked_at=NOW()",
        [challenge.user_id, String(chatId)]
      );
      await client.query("UPDATE telegram_link_challenges SET consumed_at=NOW() WHERE id=$1", [challenge.id]);
      linked = true;
    }
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
  } finally { client.release(); }
  await telegramRequest(env, "sendMessage", {
    chat_id: String(chatId),
    text: linked
      ? "Your Telegram account is now linked to Ethio One. Keep this chat private. Never share verification codes."
      : "This linking link is invalid or expired. Please create a new link in Ethio One."
  }).catch(() => {});
  return res.sendStatus(200);
});

module.exports = router;
