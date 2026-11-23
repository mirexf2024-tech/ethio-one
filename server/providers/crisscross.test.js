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
