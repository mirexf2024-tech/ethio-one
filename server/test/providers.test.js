const test = require("node:test");
const assert = require("node:assert/strict");
const { sendVerificationEmail } = require("../providers/email");
const { sendVerificationSms } = require("../providers/sms");

function fakeFetch(response, capture) {
  return async (url, options) => {
    capture.url = url;
    capture.options = options;
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.body
    };
  };
}

test("email provider refuses to run without production configuration", async () => {
  await assert.rejects(
    sendVerificationEmail(
      { to: "person@example.com", code: "123456" },
      { env: {}, fetch: async () => { throw new Error("must not call network"); } }
    ),
    /GMAIL_USER/
  );
});

test("email provider sends a verification message without logging or returning the code", async () => {
  const capture = {};
  const result = await sendVerificationEmail(
    { to: "person@example.com", code: "123456" },
    {
      env: { RESEND_API_KEY: "test-secret", RESEND_FROM: "Ethio One <auth@example.com>" },
      fetch: fakeFetch({ ok: true, status: 200, body: { id: "email_123" } }, capture)
    }
  );
  const body = JSON.parse(capture.options.body);
  assert.equal(capture.url, "https://api.resend.com/emails");
  assert.equal(capture.options.headers.Authorization, "Bearer test-secret");
  assert.equal(body.to[0], "person@example.com");
  assert.match(body.text, /123456/);
  assert.deepEqual(result, { provider: "resend", messageId: "email_123" });
  assert.equal(JSON.stringify(result).includes("123456"), false);
});

test("SMS provider sends an Ethiopia OTP through SMSHub", async () => {
  const capture = {};
  const result = await sendVerificationSms(
    { to: "+251911234567", code: "654321" },
    {
      env: { SMSHUB_API_KEY: "test-secret" },
      fetch: fakeFetch({
        ok: true,
        status: 200,
        body: { status: "success", data: { message_id: "msg_123" } }
      }, capture)
    }
  );
  const body = JSON.parse(capture.options.body);
  assert.equal(capture.url, "https://smshub.et/api/sms");
  assert.equal(capture.options.headers.Authorization, "Bearer test-secret");
  assert.equal(body.msisdn, "+251911234567");
  assert.match(body.text, /654321/);
  assert.deepEqual(result, { provider: "smshub", messageId: "msg_123" });
  assert.equal(JSON.stringify(result).includes("654321"), false);
});

test("SMS provider rejects invalid numbers and provider failures safely", async () => {
  await assert.rejects(
    sendVerificationSms(
      { to: "+12025550123", code: "123456" },
      { env: { SMSHUB_API_KEY: "test-secret" }, fetch: async () => { throw new Error("must not call network"); } }
    ),
    /Ethiopian mobile number/
  );

  await assert.rejects(
    sendVerificationSms(
      { to: "+251911234567", code: "123456" },
      {
        env: { SMSHUB_API_KEY: "test-secret" },
        fetch: fakeFetch({ ok: false, status: 401, body: { error_type: "unauthorized" } }, {})
      }
    ),
    /SMS provider rejected/
  );
});
