const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");

const BCRYPT_ROUNDS = 12;

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TypeError("A valid email address is required.");
  }
  return email;
}

function normalizePhone(value) {
  let phone = String(value || "").trim().replace(/[\s()-]/g, "");
  if (/^0[79]\d{8}$/.test(phone)) phone = `+251${phone.slice(1)}`;
  else if (/^251[79]\d{8}$/.test(phone)) phone = `+${phone}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new TypeError("A valid phone number in E.164 format is required.");
  }
  return phone;
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 128 || Buffer.byteLength(password, "utf8") > 72) {
    throw new TypeError("Password must be 8-128 characters and no more than 72 UTF-8 bytes.");
  }
  return password;
}

async function hashPassword(password) {
  validatePassword(password);
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  if (!/^\\$2[aby]\\$12\\$/.test(encoded)) return false;
  try {
    return await bcrypt.compare(password, encoded);
  } catch {
    return false;
  }
}

function createOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function digestChallenge(code, pepper = process.env.AUTH_CHALLENGE_PEPPER) {
  if (!pepper || String(pepper).length < 32) {
    throw new Error("Authentication challenge pepper is not configured.");
  }
  if (!/^\d{6}$/.test(String(code || ""))) {
    throw new TypeError("A six-digit verification code is required.");
  }
  return crypto.createHmac("sha256", pepper).update(String(code)).digest("hex");
}

function createOpaqueToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function digestToken(token) {
  if (typeof token !== "string" || token.length < 32 || token.length > 512) {
    throw new TypeError("Invalid session token.");
  }
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  normalizeEmail,
  normalizePhone,
  validatePassword,
  hashPassword,
  verifyPassword,
  createOtp,
  digestChallenge,
  createOpaqueToken,
  digestToken
};
