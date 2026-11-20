require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const authRouter = require("./auth/routes");
const adminRouter = require("./admin/routes");
const telegramRouter = require("./telegram/routes");
const { recordSecurityEvent } = require("./admin/audit");

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigins = (process.env.CORS_ORIGINS || "https://ethio-one.onrender.com")
  .split(",").map((value) => value.trim()).filter(Boolean);

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: true },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    })
  : null;

if (pool) {
  pool.on("error", () => {
    console.error("Database pool reported an idle-client error.");
  });
}

app.disable("x-powered-by");
// Render terminates TLS at its edge and forwards the original client address.
// Trust only the single proxy hop so rate limits use the real client IP.
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Telegram-Bot-Api-Secret-Token"]
}));
app.use(express.json({ limit: "100kb" }));
app.locals.db = pool;
app.locals.authEnv = process.env;
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.post("/api/v1/telemetry/client-error", rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: "Telemetry rate limit reached." })
}), async (req, res) => {
  const kind = req.body && req.body.kind;
  if (!["window_error", "unhandled_rejection"].includes(kind)) {
    return res.status(400).json({ error: "Invalid telemetry event." });
  }
  const saved = await recordSecurityEvent(req, {
    type: "client_error",
    severity: "warning",
    metadata: { component: "web", reason: kind, route: "/" }
  });
  if (!saved) return res.status(503).json({ error: "Telemetry is temporarily unavailable." });
  return res.status(202).json({ ok: true });
});

app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: async (req, res) => {
    await recordSecurityEvent(req, {
      type: "api_rate_limited",
      severity: "high",
      metadata: { route: req.path, method: req.method }
    });
    return res.status(429).json({ error: "Too many requests. Please wait and try again." });
  }
}));

app.use("/api/v1/auth", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: async (req, res) => {
    await recordSecurityEvent(req, {
      type: "auth_rate_limited",
      severity: "high",
      metadata: { route: req.path, method: req.method }
    });
    return res.status(429).json({ error: "Too many authentication attempts. Please wait and try again." });
  }
}));
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/telegram/link/start", rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false }));
app.use("/api/v1/telegram", telegramRouter);
app.use("/api/v1/admin", rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false }));
app.use("/api/v1/admin", adminRouter);

app.get("/healthz", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({ ok: true, service: "ethio-one-api", version: "0.1.0" });
});

app.get("/readyz", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  if (!pool) return res.status(503).json({ ok: false, ready: false });
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({ ok: true, ready: true });
  } catch {
    return res.status(503).json({ ok: false, ready: false });
  }
});

app.get("/api/v1/modules", async (_req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }
  try {
    const result = await pool.query(
      "SELECT module_key, display_name, status FROM platform_modules ORDER BY display_name"
    );
    return res.json({ modules: result.rows });
  } catch {
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }
});

app.get("/api/v1/system/status", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  if (!pool) {
    return res.status(503).json({ ok: false, service: "ethio-one-api", database: "not_configured" });
  }
  try {
    await pool.query("SELECT 1");
    return res.json({ ok: true, service: "ethio-one-api", database: "connected" });
  } catch {
    return res.status(503).json({ ok: false, service: "ethio-one-api", database: "unavailable" });
  }
});

app.use(async (req, res) => {
  if (req.path.startsWith("/api/")) {
    await recordSecurityEvent(req, {
      type: "api_not_found",
      severity: "info",
      metadata: { route: req.path, method: req.method, reason: "route_not_found" }
    });
  }
  return res.status(404).json({ error: "Not found" });
});
app.use(async (err, req, res, _next) => {
  if (req.path.startsWith("/api/")) {
    await recordSecurityEvent(req, {
      type: "api_error",
      severity: "warning",
      metadata: {
        route: req.path,
        method: req.method,
        reason: err && err.message === "Origin not allowed" ? "origin_not_allowed" : "invalid_request"
      }
    });
  }
  if (err && err.message === "Origin not allowed") {
    return res.status(403).json({ error: "Request origin not allowed" });
  }
  return res.status(400).json({ error: "Invalid request" });
});

const server = app.listen(port, () => {
  console.log(`Ethio One API listening on port ${port}`);
  // Register the Telegram webhook from server-side secrets; never expose the bot token.
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET) {
    const webhookUrl = "https://ethio-one-api.onrender.com/api/v1/telegram/webhook";
    fetch("https://api.telegram.org/bot" + process.env.TELEGRAM_BOT_TOKEN + "/setWebhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ["message"],
        drop_pending_updates: false
      }),
      signal: AbortSignal.timeout(10000)
    }).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) {
        console.error("Telegram webhook registration failed.");
        return;
      }
      console.log("Telegram webhook registered.");
    }).catch(() => console.error("Telegram webhook registration failed."));
  }
});

async function shutdown() {
  server.close(async () => {
    if (pool) await pool.end().catch(() => {});
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
