function requiredEnv(name, env) {
  const value = env[name];
  if (!value || !String(value).trim()) throw new Error("Email delivery is not configured (" + name + ").");
  return String(value).trim();
}

function messageContent(code, expiresMinutes) {
  return {
    subject: "Your Ethio One verification code",
    text: "Your Ethio One verification code is " + code + ". It expires in " + expiresMinutes + " minutes. Do not share this code with anyone.",
    html: "<p>Your Ethio One verification code is:</p><p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">" + code + "</p><p>It expires in " + expiresMinutes + " minutes. Do not share this code with anyone.</p>"
  };
}

async function sendVerificationEmail({ to, code, expiresMinutes = 5 }, options = {}) {
  if (!/^\S+@\S+\.\S+$/.test(String(to || ""))) throw new TypeError("A valid email destination is required.");
  if (!/^\d{6}$/.test(String(code || ""))) throw new TypeError("A six-digit verification code is required.");
  const env = options.env || process.env;
  const content = messageContent(code, expiresMinutes);
  const brevoKey = String(env.BREVO_API_KEY || "").trim();

  // Brevo HTTPS API works without opening SMTP ports on the hosting platform.
  if (brevoKey) {
    console.info("Verification email provider selected: Brevo API");
    const fromEmail = requiredEnv("BREVO_FROM_EMAIL", env);
    const fromName = String(env.BREVO_FROM_NAME || "Ethio One").trim();
    const response = await (options.fetch || fetch)("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: String(to).trim() }],
        subject: content.subject,
        textContent: content.text,
        htmlContent: content.html
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("Brevo email delivery failed.");
      error.code = "BREVO_HTTP_" + response.status;
      throw error;
    }
    return { provider: "brevo", messageId: result.messageId || null };
  }

  const apiKey = String(env.RESEND_API_KEY || "").trim();

  // Prefer HTTPS email delivery; this avoids SMTP connection timeouts on hosted platforms.
  if (apiKey) {
    console.info("Verification email provider selected: Resend API");
    const from = requiredEnv("RESEND_FROM", env);
    const response = await (options.fetch || fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [String(to).trim()], ...content })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("Resend email delivery failed.");
      error.code = "RESEND_HTTP_" + response.status;
      throw error;
    }
    return { provider: "resend", messageId: result.id || null };
  }

  // Keep Gmail SMTP as a fallback for deployments that have not configured Resend yet.
  console.warn("Verification email provider selected: Gmail SMTP fallback (RESEND_API_KEY is not configured).");
  const user = requiredEnv("GMAIL_USER", env);
  const pass = requiredEnv("GMAIL_APP_PASSWORD", env).replace(/\s+/g, "");
  const from = String(env.GMAIL_FROM || user).trim();
  const nodemailer = options.nodemailer || require("nodemailer");
  const transport = options.transport || nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user, pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000
  });
  const info = await transport.sendMail({
    from: "Ethio One <" + from + ">", to: String(to).trim(), ...content
  });
  return { provider: "gmail-smtp", messageId: info.messageId };
}

module.exports = { sendVerificationEmail };
