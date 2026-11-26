/**
 * Ethio ID client.
 *
 * Auth dhugaa API ETHIO ONE irratti raawwatama; maqaa/ID ofumaan uumuun
 * localStorage keessatti account sobaa hin uumamu.
 * Access/refresh tokens sessionStorage keessatti qofa turu.
 */
const AUTH_BASE = `${(globalThis.ETHIO_ONE_API_BASE || "https://ethio-one-api.onrender.com").replace(/\/$/, "")}/api/v1/auth`;
const SESSION_KEYS = Object.freeze({
  access: "ethioOneAccessToken",
  refresh: "ethioOneRefreshToken",
  user: "ethioOneUser"
});

function sessionStore() {
  try { return globalThis.sessionStorage || null; } catch { return null; }
}
function read(key) {
  try { return sessionStore()?.getItem(key) || null; } catch { return null; }
}
function writeSession(data) {
  const store = sessionStore();
  if (!store) throw new Error("This browser cannot securely keep an active session.");
  if (!data?.accessToken || !data?.refreshToken || !data?.user) {
    throw new Error("The authentication server returned an incomplete session.");
  }
  store.setItem(SESSION_KEYS.access, data.accessToken);
  store.setItem(SESSION_KEYS.refresh, data.refreshToken);
  store.setItem(SESSION_KEYS.user, JSON.stringify(data.user));
}
function clearSession() {
  const store = sessionStore();
  if (!store) return;
  Object.values(SESSION_KEYS).forEach((key) => store.removeItem(key));
}
async function request(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${AUTH_BASE}${path}`, {
    method,
    credentials: "omit",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Tajaajilli Ethio ID yeroo ammaa hin argamu.");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

/** Odeeffannoo profile cache irraa dubbisa; account dhugaa mirkaneessuuf getEthioIdProfile fayyadami. */
export function getEthioIdUser() {
  const raw = read(SESSION_KEYS.user);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    return user && typeof user.id === "string" && typeof user.ethioId === "string" ? user : null;
  } catch {
    return null;
  }
}

export function getEthioIdAccessToken() {
  return read(SESSION_KEYS.access);
}

/** Ethio ID, username, email ykn bilbilaan password waliin seena. */
export async function signInEthioId({ identity, password }) {
  if (typeof identity !== "string" || !identity.trim() || typeof password !== "string" || !password) {
    return { ok: false, error: "Ethio ID/username/email fi password galchi." };
  }
  try {
    const data = await request("/login", { method: "POST", body: { identity: identity.trim(), password } });
    writeSession(data);
    return { ok: true, user: data.user };
  } catch (error) {
    return { ok: false, error: error.message, status: error.status, data: error.data };
  }
}

/** Account haaraa uuma; OTP ergamee akka mirkanaa'u deebisa. */
export async function registerEthioId(details) {
  const data = await request("/register", { method: "POST", body: details });
  return { ok: true, ...data };
}

/** OTP mirkaneessa; API session kenna. */
export async function verifyEthioId({ userId, channel = "email", code }) {
  const data = await request("/verify", { method: "POST", body: { userId, channel, code } });
  writeSession(data);
  return { ok: true, user: data.user };
}

/** Profile server irraa haaromsa; yeroo barbaachisutti refresh token naannessa. */
export async function getEthioIdProfile() {
  let accessToken = read(SESSION_KEYS.access);
  const refreshToken = read(SESSION_KEYS.refresh);
  if (!accessToken && !refreshToken) return null;

  try {
    let data;
    try {
      if (!accessToken) throw Object.assign(new Error("Access token missing"), { status: 401 });
      data = await request("/me", { token: accessToken });
    } catch (error) {
      if (error.status !== 401 || !refreshToken) throw error;
      const renewed = await request("/refresh", { method: "POST", body: { refreshToken } });
      writeSession({ ...renewed, user: getEthioIdUser() });
      accessToken = renewed.accessToken;
      data = await request("/me", { token: accessToken });
    }
    if (!data.user) throw new Error("Profile Ethio ID hin argamne.");
    const store = sessionStore();
    store?.setItem(SESSION_KEYS.user, JSON.stringify(data.user));
    return data.user;
  } catch (error) {
    if (error.status === 401) clearSession();
    throw error;
  }
}

/** Session server irratti cufa; browser cache irrattis haqa. */
export async function signOutEthioId() {
  const refreshToken = read(SESSION_KEYS.refresh);
  try {
    if (refreshToken) await request("/logout", { method: "POST", body: { refreshToken } });
  } finally {
    clearSession();
  }
}
