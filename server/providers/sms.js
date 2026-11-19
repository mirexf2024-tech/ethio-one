const SMSHUB_URL = "https://smshub.et/api/sms";

function requiredEnv(name, env) {
  const value = env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`SMS delivery is not configured (${name}).`);
  }
  return String(value).trim();
}

async function sendVerificationSms({ to, code, expiresMinutes = 5 }, options = {}) {
  const phone = String(to || "").replace(/[\s()-]/g, "");
  if (!/^\+?251[79]\d{8}$/.test(phone)) {
    throw new TypeError("An Ethiopian mobile number in +251 format is required.");
  }
  if (!/^\d{6}$/.test(String(code || ""))) {
    throw new TypeError("A six-digit verification code is required.");
  }

  const env = options.env || process.env;
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("SMS transport is unavailable.");

  const apiKey = requiredEnv("SMSHUB_API_KEY", env);
  const response = await fetchImpl(SMSHUB_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      msisdn: phone,
      text: `Ethio One verification code: ${code}. Expires in ${expiresMinutes} min. Do not share it. Ignore if not requested.`
    }),
    signal: AbortSignal.timeout(10000)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status !== "success" || !payload.data?.message_id) {
    const error = new Error("SMS provider rejected the verification message.");
    error.providerStatus = response.status;
    error.providerCode = typeof payload.error_type === "string" ? payload.error_type : undefined;
    throw error;
  }
  return { provider: "smshub", messageId: payload.data.message_id };
}

module.exports = { sendVerificationSms };
