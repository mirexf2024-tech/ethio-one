"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: true },
  max: 1,
  connectionTimeoutMillis: 10000
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [74120261125]);
    const directory = path.join(__dirname, "..", "schema");
    const files = fs.readdirSync(directory)
      .filter((name) => /^\d+_[a-z0-9_]+\.sql$/i.test(name))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

    if (!files.length) throw new Error("No numbered SQL migrations were found.");

    for (const file of files) {
      const version = file.replace(/\.sql$/i, "");
      const ledger = await client.query("SELECT to_regclass('public.schema_migrations') AS table_name");
      if (ledger.rows[0].table_name) {
        const applied = await client.query(
          "SELECT 1 FROM schema_migrations WHERE version = $1",
          [version]
        );
        if (applied.rowCount) continue;
      } else if (version !== "001_initial") {
        throw new Error("Migration ledger is missing before the initial migration.");
      }

      const sql = fs.readFileSync(path.join(directory, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT(version) DO NOTHING",
          [version]
        );
        await client.query("COMMIT");
        console.log("Applied migration:", version);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
    }
    console.log("Database migrations are up to date.");
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [74120261125]).catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Database migration failed:", error && error.message ? error.message : "unknown error");
  process.exitCode = 1;
});
