/**
 * ETHIO ONE media upload helper.
 * Uses the existing authenticated account-media signing and registration API.
 * The browser receives a stable HTTPS media URL; no file data is stored in
 * localStorage, sessionStorage, or the application database.
 */
import { getEthioIdAccessToken } from "../auth/ethioId.js";

const API_BASE = `${(globalThis.ETHIO_ONE_API_BASE || "https://ethio-one-api.onrender.com").replace(/\\/$/, "")}/api/v1/account`;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function authHeaders() {
  const token = getEthioIdAccessToken();
  if (!token) throw new Error("Suuraa olkaa'uuf jalqaba Ethio ID seeni.");
  return { Authorization: `Bearer ${token}` };
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Suuraa olkaa'uun yeroo ammaa hin danda'amne.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function isApprovedCloudinaryUrl(value, resourceType = "image") {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com" &&
      url.pathname.includes(`/${resourceType}/upload/`);
  } catch {
    return false;
  }
}

/** Upload one approved image and return only its registered HTTPS URL. */
export async function uploadMediaAndGetUrl(file) {
  try {
    if (!file || typeof file !== "object") throw new Error("Suuraa filadhu.");
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new Error("Gosti suuraa JPG, PNG ykn WEBP ta'uu qaba.");
    }
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_IMAGE_BYTES) {
      throw new Error("Guddinni suuraa 5 MB caaluu hin qabu.");
    }

    const headers = authHeaders();
    const signResponse = await fetch(`${API_BASE}/media/sign`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ resourceType: "image" }),
      cache: "no-store"
    });
    const signed = await readJson(signResponse);
    if (!signed.cloudName || !signed.apiKey || !signed.signature || !signed.folder || !signed.timestamp) {
      throw new Error("Qindaa'inni media upload guutuu miti.");
    }

    const uploadBody = new FormData();
    uploadBody.append("file", file);
    uploadBody.append("api_key", signed.apiKey);
    uploadBody.append("timestamp", String(signed.timestamp));
    uploadBody.append("folder", signed.folder);
    uploadBody.append("signature", signed.signature);

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/image/upload`,
      { method: "POST", body: uploadBody }
    );
    const uploaded = await readJson(uploadResponse);
    if (uploaded.resource_type !== "image" || !isApprovedCloudinaryUrl(uploaded.secure_url)) {
      throw new Error("Cloudinary URL suuraa kanaa hin mirkanoofne.");
    }
    if (typeof uploaded.public_id !== "string" || !Number.isSafeInteger(uploaded.bytes) || uploaded.bytes < 1) {
      throw new Error("Ragaan suuraa upload ta'e guutuu miti.");
    }

    // Register ownership with ETHIO ONE before exposing the URL to another module.
    const registerResponse = await fetch(`${API_BASE}/media`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        publicId: uploaded.public_id,
        secureUrl: uploaded.secure_url,
        resourceType: uploaded.resource_type,
        bytes: uploaded.bytes
      }),
      cache: "no-store"
    });
    const registered = await readJson(registerResponse);
    const mediaUrl = registered.media?.secure_url || uploaded.secure_url;
    if (!isApprovedCloudinaryUrl(mediaUrl)) throw new Error("URL media galmee keessatti hin mirkanoofne.");

    return { ok: true, mediaUrl };
  } catch (error) {
    return { ok: false, error: error.message || "Media upload hin milkoofne." };
  }
}
