const RESEND_URL = "https://api.resend.com/emails";

function requiredEnv(name, env) {
  const value = env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Email delivery is not configured (${name}).`);
  }
  return String(value).trim();
}

async function sendVerificationEmail({ to, code, expiresMinutes = 5 }, options = {}) {
  if (!/^\S+@\S+\.\S+$/.test(String(to || ""))) {
    throw new TypeError("A valid email destination is required.");
  }
  if (!/^\d{6}$/.test(String(code || ""))) {
    throw new TypeError("A six-digit verification code is required.");
  }

  const env = options.env || process.env;
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("Email transport is unavailable.");

  const apiKey = requiredEnv("RESEND_API_KEY", env);
  const from = requiredEnv("RESEND_FROM", env);
  const response = await fetchImpl(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [String(to).trim()],
      subject: "Your Ethio One verification code",
      text: `Your Ethio One verification code is ${code}. It expires in ${expiresMinutes} minutes. Do not share this code with anyone. If you did not request it, ignore this email.`,
      html: `<p>Your Ethio One verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in ${expiresMinutes} minutes. Do not share this code with anyone. If you did not request it, ignore this email.</p>`
    }),
    signal: AbortSignal.timeout(10000)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) {
    const error = new Error("Email provider rejected the verification message.");
    error.providerStatus = response.status;
    throw error;
  }
  return { provider: "resend", messageId: payload.id };
}

module.exports = { sendVerificationEmail };
