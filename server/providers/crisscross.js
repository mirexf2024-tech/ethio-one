const DEFAULT_BASE_URL = "https://api.crisscross.money";

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function getConfig(env = process.env) {
  const enabled = env.CRISSCROSS_ENABLED === "true";
  const clientId = String(env.CRISSCROSS_CLIENT_ID || "").trim();
  const clientSecret = String(env.CRISSCROSS_CLIENT_SECRET || "");
  const merchantId = String(env.CRISSCROSS_MERCHANT_ID || "").trim();
  const baseUrl = String(env.CRISSCROSS_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");

  if (!enabled) throw new Error("CrissCross integration is disabled.");
  if (!clientId || !clientSecret || !merchantId) {
    throw new Error("CrissCross sandbox credentials are not configured.");
  }
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new Error("CrissCross API URL is invalid."); }
  if (parsed.protocol !== "https:") throw new Error("CrissCross API URL must use HTTPS.");
  return { clientId, clientSecret, merchantId, baseUrl };
}

async function parseResponse(response) {
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!response.ok) {
    const error = new Error("CrissCross request failed.");
    error.status = response.status;
    error.providerMessage = typeof body.error === "string" ? body.error.slice(0, 240)
      : typeof body.message === "string" ? body.message.slice(0, 240) : "Provider returned an error.";
    throw error;
  }
  return body;
}

async function getAccessToken(env = process.env) {
  const config = getConfig(env);
  if (cachedToken && Date.now() < cachedTokenExpiresAt - 60_000) return cachedToken;

  const response = await fetch(config.baseUrl + "/v1/auth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret }),
    signal: AbortSignal.timeout(10_000)
  });
  const body = await parseResponse(response);
  if (typeof body.access_token !== "string" || !Number.isFinite(Number(body.expires_in))) {
    throw new Error("CrissCross returned an invalid authentication response.");
  }
  cachedToken = body.access_token;
  cachedTokenExpiresAt = Date.now() + Math.max(60, Number(body.expires_in)) * 1000;
  return cachedToken;
}

async function providerRequest(path, { method = "GET", body, env = process.env } = {}) {
  const config = getConfig(env);
  const token = await getAccessToken(env);
  const response = await fetch(config.baseUrl + path, {
    method,
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000)
  });
  return parseResponse(response);
}

function validateEthiopiaPayout(input) {
  if (!input || typeof input !== "object") throw new Error("Payout details are required.");
  const amount = input.destinationValue && input.destinationValue.minorAmount;
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Payout amount must be a positive integer in minor units.");
  if (input.destinationValue.currency !== "ETB" || input.paymentLocation !== "ETH") {
    throw new Error("Only Ethiopia ETB payouts are supported by this integration.");
  }
  if (!["mobilemoney", "banktransfer"].includes(input.paymentMethodId)) {
    throw new Error("Unsupported Ethiopia payout method.");
  }
  if (!input.sender || !input.sender.fullName || !input.sender.identity || !input.sender.identityNumber) {
    throw new Error("Verified sender identity details are required.");
  }
  if ((Boolean(input.recipient) ? 1 : 0) + (Boolean(input.payoutBeneficiaryId) ? 1 : 0) !== 1) {
    throw new Error("Provide exactly one recipient or approved payout beneficiary.");
  }
  if (input.paymentMethodId === "mobilemoney") {
    const recipient = input.recipient;
    if (recipient && (recipient.type !== "mobile_money" || recipient.country !== "ETH" ||
      !["telebirr", "mpesa", "cbebirr", "yaya"].includes(recipient.operator) ||
      !/^251[79]\d{8}$/.test(String(recipient.phoneNumber || "")))) {
      throw new Error("Ethiopia mobile wallet details are invalid.");
    }
  }
  if (input.paymentMethodId === "banktransfer" && input.recipient &&
      (input.recipient.type !== "bank_account" || input.recipient.country !== "ETH" ||
       !input.recipient.accountNumber || !input.recipient.bankCode || !input.recipient.accountHolderName)) {
    throw new Error("Ethiopia bank account details are incomplete.");
  }
}

async function initiateEthiopiaPayout(input, env = process.env) {
  const config = getConfig(env);
  validateEthiopiaPayout(input);
  const payload = { ...input, merchantId: config.merchantId };
  // Do not automatically retry payout creation: a timeout can occur after the
  // provider has accepted the request. merchantReference must be unique and
  // persisted by the caller before this function is invoked.
  if (typeof payload.merchantReference !== "string" ||
      !/^[A-Za-z0-9._:-]{8,100}$/.test(payload.merchantReference)) {
    throw new Error("A unique persisted merchantReference is required.");
  }
  return providerRequest("/v1/payout/initiate", { method: "POST", body: payload, env });
}

async function getPayout(transactionId, env = process.env) {
  if (typeof transactionId !== "string" || !/^[A-Za-z0-9-]{8,100}$/.test(transactionId)) {
    throw new Error("Invalid CrissCross transaction ID.");
  }
  return providerRequest("/v1/payout/" + encodeURIComponent(transactionId), { env });
}

function resetTokenCacheForTests() {
  cachedToken = null;
  cachedTokenExpiresAt = 0;
}

module.exports = {
  getConfig,
  getAccessToken,
  initiateEthiopiaPayout,
  getPayout,
  validateEthiopiaPayout,
  resetTokenCacheForTests
};
