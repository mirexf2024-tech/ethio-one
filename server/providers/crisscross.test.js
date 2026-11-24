const test = require("node:test");
const assert = require("node:assert/strict");
const provider = require("./crisscross");

const validMobilePayout = {
  merchantReference: "ETHIO-SANDBOX-0001",
  destinationValue: { minorAmount: 5000, currency: "ETB" },
  paymentMethodId: "mobilemoney",
  paymentLocation: "ETH",
  sender: { fullName: "Test Sender", identity: "nationalId", identityNumber: "TEST-0001" },
  recipient: {
    type: "mobile_money",
    phoneNumber: "251911234567",
    country: "ETH",
    operator: "telebirr",
    name: "Test Recipient"
  }
};

test("CrissCross remains disabled unless explicitly enabled", () => {
  assert.throws(() => provider.getConfig({}), /disabled/i);
});

test("CrissCross requires server-side merchant credentials", () => {
  assert.throws(() => provider.getConfig({ CRISSCROSS_ENABLED: "true" }), /credentials/i);
});

test("accepts a structurally valid Ethiopia ETB mobile wallet payout", () => {
  assert.doesNotThrow(() => provider.validateEthiopiaPayout(validMobilePayout));
});

test("rejects unsupported Ethiopia mobile wallet operators", () => {
  const payload = structuredClone(validMobilePayout);
  payload.recipient.operator = "awashbirr";
  assert.throws(() => provider.validateEthiopiaPayout(payload), /invalid/i);
});

test("rejects non-ETB payout requests", () => {
  const payload = structuredClone(validMobilePayout);
  payload.destinationValue.currency = "USD";
  assert.throws(() => provider.validateEthiopiaPayout(payload), /ETB/i);
});

test("requires exactly one recipient or approved beneficiary reference", () => {
  const payload = { ...validMobilePayout, payoutBeneficiaryId: "beneficiary-12345678" };
  assert.throws(() => provider.validateEthiopiaPayout(payload), /exactly one/i);
});

test("rejects insecure provider API URLs", () => {
  assert.throws(() => provider.getConfig({
    CRISSCROSS_ENABLED: "true",
    CRISSCROSS_CLIENT_ID: "sandbox-id",
    CRISSCROSS_CLIENT_SECRET: "sandbox-secret",
    CRISSCROSS_MERCHANT_ID: "sandbox-merchant",
    CRISSCROSS_API_BASE_URL: "http://api.example.test"
  }), /HTTPS/i);
});

test("requires a unique merchant reference before payout initiation", async () => {
  const payload = { ...validMobilePayout, merchantReference: "" };
  const env = {
    CRISSCROSS_ENABLED: "true",
    CRISSCROSS_CLIENT_ID: "sandbox-id",
    CRISSCROSS_CLIENT_SECRET: "sandbox-secret",
    CRISSCROSS_MERCHANT_ID: "sandbox-merchant"
  };
  await assert.rejects(provider.initiateEthiopiaPayout(payload, env), /merchantReference/i);
});

test("rejects incomplete bank transfer recipient details", () => {
  const payload = {
    ...validMobilePayout,
    paymentMethodId: "banktransfer",
    recipient: { type: "bank_account", country: "ETH", accountNumber: "123456" }
  };
  assert.throws(() => provider.validateEthiopiaPayout(payload), /incomplete/i);
});

test("does not reuse an OAuth token across different sandbox credentials", async () => {
  provider.resetTokenCacheForTests();
  const originalFetch = global.fetch;
  const requestedCredentials = [];
  let sequence = 0;
  global.fetch = async (_url, options) => {
    requestedCredentials.push(JSON.parse(options.body));
    sequence += 1;
    return new Response(JSON.stringify({ access_token: "sandbox-token-" + sequence, expires_in: 3600 }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  try {
    const base = {
      CRISSCROSS_ENABLED: "true",
      CRISSCROSS_CLIENT_SECRET: "sandbox-secret",
      CRISSCROSS_MERCHANT_ID: "sandbox-merchant"
    };
    const first = await provider.getAccessToken({ ...base, CRISSCROSS_CLIENT_ID: "merchant-one" });
    const second = await provider.getAccessToken({ ...base, CRISSCROSS_CLIENT_ID: "merchant-two" });
    assert.equal(first, "sandbox-token-1");
    assert.equal(second, "sandbox-token-2");
    assert.equal(requestedCredentials.length, 2);
  } finally {
    global.fetch = originalFetch;
    provider.resetTokenCacheForTests();
  }
});
