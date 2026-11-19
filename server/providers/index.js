const { sendVerificationEmail } = require("./email");
const { sendVerificationSms } = require("./sms");

module.exports = {
  sendVerificationEmail,
  sendVerificationSms
};
