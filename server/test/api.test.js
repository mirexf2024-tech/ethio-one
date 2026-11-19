const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");

async function unusedPort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForApi(child, url) {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API exited early with code ${child.exitCode}`);
    }
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`API did not start: ${lastError?.message || "unknown error"}`);
}

test("API health and safe degraded-mode responses", async (t) => {
  const port = await unusedPort();
  const child = spawn(process.execPath, ["index.js"], {
    cwd: __dirname + "/..",
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: "",
      CORS_ORIGINS: "https://ethio-one.onrender.com"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 3000))
      ]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  });

  const base = `http://127.0.0.1:${port}`;
  const health = await waitForApi(child, `${base}/healthz`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await health.json(), {
    ok: true,
    service: "ethio-one-api",
    version: "0.1.0"
  });

  const readiness = await fetch(`${base}/readyz`);
  assert.equal(readiness.status, 503);
  assert.deepEqual(await readiness.json(), { ok: false, ready: false });

  const status = await fetch(`${base}/api/v1/system/status`);
  assert.equal(status.status, 503);
  assert.equal(status.headers.get("cache-control"), "no-store");
  assert.deepEqual(await status.json(), {
    ok: false,
    service: "ethio-one-api",
    database: "not_configured"
  });

  const modules = await fetch(`${base}/api/v1/modules`);
  assert.equal(modules.status, 503);
  assert.equal(modules.headers.get("cache-control"), "no-store");
  assert.deepEqual(await modules.json(), {
    error: "Service temporarily unavailable"
  });

  const missing = await fetch(`${base}/does-not-exist`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Not found" });

  const allowedOrigin = await fetch(`${base}/healthz`, {
    headers: { Origin: "https://ethio-one.onrender.com" }
  });
  assert.equal(allowedOrigin.status, 200);
  assert.equal(allowedOrigin.headers.get("access-control-allow-origin"), "https://ethio-one.onrender.com");

  const preflight = await fetch(`${base}/api/v1/modules`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://ethio-one.onrender.com",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "content-type"
    }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://ethio-one.onrender.com");

  const blockedOrigin = await fetch(`${base}/healthz`, {
    headers: { Origin: "https://untrusted.example" }
  });
  assert.equal(blockedOrigin.status, 403);

  assert.match(output, /Ethio One API listening/);
});
