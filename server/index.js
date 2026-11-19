require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");

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

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "100kb" }));
app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true, service: "ethio-one-api", version: "0.1.0" });
});

app.get("/api/v1/system/status", async (_req, res) => {
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

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, _req, res, _next) => {
  if (err && err.message === "Origin not allowed") {
    return res.status(403).json({ error: "Request origin not allowed" });
  }
  return res.status(400).json({ error: "Invalid request" });
});

const server = app.listen(port, () => {
  console.log(`Ethio One API listening on port ${port}`);
});

async function shutdown() {
  server.close(async () => {
    if (pool) await pool.end().catch(() => {});
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
