// Payment integrations remain deliberately disabled until ELS and each provider
// grant written approval. This module performs no network requests.
const PROVIDERS = Object.freeze({
  cbe: Object.freeze({ key: "cbe", label: "Commercial Bank of Ethiopia", enabled: false, mode: "disabled", approvalRequired: true }),
  telebirr: Object.freeze({ key: "telebirr", label: "Telebirr", enabled: false, mode: "disabled", approvalRequired: true }),
  mpesa: Object.freeze({ key: "mpesa", label: "M-PESA Ethiopia", enabled: false, mode: "disabled", approvalRequired: true })
});

function listProviders() {
  return Object.values(PROVIDERS).map((provider) => ({ ...provider }));
}

function getProvider(key) {
  return PROVIDERS[key] || null;
}

function assertLivePaymentsDisabled() {
  const error = new Error("Live lottery payments are disabled pending written approvals.");
  error.code = "LOTTERY_PROVIDER_APPROVAL_REQUIRED";
  throw error;
}

module.exports = { PROVIDERS, listProviders, getProvider, assertLivePaymentsDisabled };
