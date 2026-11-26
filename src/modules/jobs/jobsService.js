/**
 * ETHIO JOBS client service.
 * The authenticated API contract is reserved at /api/v1/jobs. The route is
 * not mounted in the current production API yet; no demo jobs or local store
 * are substituted when the backend is unavailable.
 */
import { getEthioIdAccessToken } from "../../core/auth/ethioId.js";

const JOBS_API = `${(globalThis.ETHIO_ONE_API_BASE || "https://ethio-one-api.onrender.com").replace(/\\/$/, "")}/api/v1/jobs`;

async function request(path = "", { method = "GET", body } = {}) {
  const token = getEthioIdAccessToken();
  if (!token) throw new Error("Tajaajila ETHIO JOBS fayyadamuuf Ethio ID seeni.");

  const response = await fetch(`${JOBS_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(response.status === 404
      ? "ETHIO JOBS API amma hin banamne. Backend fi database isaa erga qophaa'anii booda tajaajilli ni jalqaba."
      : data.error || "Odeeffannoo hojii argachuun hin danda'amne.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function listJobs() {
  const data = await request("", { method: "GET" });
  return Array.isArray(data.jobs) ? data.jobs : [];
}

export async function createJobPost({ title, company, location = "", description, mediaUrl = "", user }) {
  const cleanTitle = typeof title === "string" ? title.trim() : "";
  const cleanCompany = typeof company === "string" ? company.trim() : "";
  const cleanLocation = typeof location === "string" ? location.trim() : "";
  const cleanDescription = typeof description === "string" ? description.trim() : "";

  if (!user?.id || !user?.ethioId) {
    return { ok: false, error: "Hojii maxxansuuf account Ethio ID sirrii seeni." };
  }
  if (cleanTitle.length < 3 || cleanTitle.length > 140 ||
      cleanCompany.length < 2 || cleanCompany.length > 120 ||
      cleanLocation.length > 120 || cleanDescription.length < 10 || cleanDescription.length > 3000) {
    return { ok: false, error: "Mata-duree, maqaa dhaabbataa, bakka fi ibsa hojii sirreessi." };
  }
  if (mediaUrl && (typeof mediaUrl !== "string" || mediaUrl.length > 1000 ||
      !mediaUrl.startsWith("https://res.cloudinary.com/"))) {
    return { ok: false, error: "URL suuraa hojii sirrii miti." };
  }

  try {
    const data = await request("", {
      method: "POST",
      body: { title: cleanTitle, company: cleanCompany, location: cleanLocation, description: cleanDescription, mediaUrl }
    });
    return { ok: true, job: data.job || null };
  } catch (error) {
    return { ok: false, error: error.message, status: error.status };
  }
}
