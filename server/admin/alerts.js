function senderUsesSharedSandbox(value) {
  const match = /<([^>]+)>/.exec(String(value || ""));
  const address = (match ? match[1] : String(value || "")).trim().toLowerCase();
  return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.endsWith("@resend.dev");
}

async function sendSecurityAlert(event, env = process.env, fetchImpl = globalThis.fetch) {
  if (env.SECURITY_ALERTS_ENABLED !== "true" ||
      !env.RESEND_API_KEY ||
      !env.ADMIN_EMAIL ||
      !env.ALERTS_FROM ||
      senderUsesSharedSandbox(env.ALERTS_FROM) ||
      typeof fetchImpl !== "function") return false;

  const severity = ["high", "critical"].includes(event?.severity) ? event.severity : null;
  if (!severity) return false;
  const type = String(event.type || "security_event").slice(0, 80);
  const occurredAt = event.createdAt instanceof Date ? event.createdAt.toISOString() : new Date().toISOString();
  const text = [
    "Ethio One security notification",
    "",
    "Severity: " + severity.toUpperCase(),
    "Event: " + type,
    "Time: " + occurredAt,
    "",
    "This alert contains minimized diagnostic metadata only. No passwords, OTPs, tokens, raw IP addresses, or private messages are included."
  ].join("\n");

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.ALERTS_FROM,
        to: [env.ADMIN_EMAIL],
        subject: "[Ethio One] " + severity.toUpperCase() + " security event",
        text
      }),
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

module.exports = { sendSecurityAlert, senderUsesSharedSandbox };
