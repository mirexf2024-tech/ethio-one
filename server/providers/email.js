const nodemailer = require("nodemailer");

function requiredEnv(name, env) {
  const value = env[name];
  if (!value || !String(value).trim()) throw new Error("Email delivery is not configured (" + name + ").");
  return String(value).trim();
}

async function sendVerificationEmail({ to, code, expiresMinutes = 5 }, options = {}) {
  if (!/^\S+@\S+\.\S+$/.test(String(to || ""))) throw new TypeError("A valid email destination is required.");
  if (!/^\d{6}$/.test(String(code || ""))) throw new TypeError("A six-digit verification code is required.");
  const env = options.env || process.env;
  const user = requiredEnv("GMAIL_USER", env);
  const pass = requiredEnv("GMAIL_APP_PASSWORD", env).replace(/\s+/g, "");
  const from = String(env.GMAIL_FROM || user).trim();
  const transport = options.transport || nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user, pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000
  });
  const info = await transport.sendMail({
    from: "Ethio One <" + from + ">", to: String(to).trim(),
    subject: "Your Ethio One verification code",
    text: "Your Ethio One verification code is " + code + ". It expires in " + expiresMinutes + " minutes. Do not share this code with anyone.",
    html: "<p>Your Ethio One verification code is:</p><p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">" + code + "</p><p>It expires in " + expiresMinutes + " minutes. Do not share this code with anyone.</p>"
  });
  return { provider: "gmail-smtp", messageId: info.messageId };
}

module.exports = { sendVerificationEmail };
