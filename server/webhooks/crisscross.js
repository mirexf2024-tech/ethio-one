const crypto = require("node:crypto");

function verifyCrissCrossWebhook({ rawBody, headers, secret, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300 }) {
  if (!Buffer.isBuffer(rawBody)) throw new Error("Webhook raw body must be a Buffer.");
  if (!secret || typeof secret !== "string" || !secret.startsWith("whsec_")) throw new Error("Webhook signing secret is not configured.");
  const id = headers && headers["svix-id"];
  const timestamp = headers && headers["svix-timestamp"];
  const signatureHeader = headers && headers["svix-signature"];
  if (typeof id !== "string" || !id || typeof timestamp !== "string" || !/^\d+$/.test(timestamp) ||
      typeof signatureHeader !== "string" || !signatureHeader) {
    throw new Error("Required webhook signature headers are missing.");
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    throw new Error("Webhook timestamp is outside the allowed window.");
  }

  let secretBytes;
  try {
    secretBytes = Buffer.from(secret.slice("whsec_".length), "base64");
  } catch {
    throw new Error("Webhook signing secret is invalid.");
  }
  if (!secretBytes.length) throw new Error("Webhook signing secret is invalid.");

  const signedContent = Buffer.concat([
    Buffer.from(id + "." + timestamp + ".", "utf8"),
    rawBody
  ]);
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest();
  const candidates = signatureHeader.split(" ").map((entry) => entry.trim()).filter(Boolean);
  for (const candidate of candidates) {
    const comma = candidate.indexOf(",");
    if (comma < 0 || candidate.slice(0, comma) !== "v1") continue;
    let received;
    try { received = Buffer.from(candidate.slice(comma + 1), "base64"); } catch { continue; }
    if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) return true;
  }
  throw new Error("Webhook signature verification failed.");
}

module.exports = { verifyCrissCrossWebhook };
