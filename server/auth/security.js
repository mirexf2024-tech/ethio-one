const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

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
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new TypeError("Password must be between 8 and 128 characters.");
  }
  return password;
}

async function hashPassword(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64, SCRYPT_OPTIONS);
  return [
    "scrypt",
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt.toString("base64url"),
    Buffer.from(derived).toString("base64url")
  ].join("$");
}

async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (N !== SCRYPT_OPTIONS.N || r !== SCRYPT_OPTIONS.r || p !== SCRYPT_OPTIONS.p) return false;
  try {
    const salt = Buffer.from(parts[4], "base64url");
    const expected = Buffer.from(parts[5], "base64url");
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = Buffer.from(await scrypt(password, salt, expected.length, SCRYPT_OPTIONS));
    return crypto.timingSafeEqual(actual, expected);
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
