import { uploadMediaAndGetUrl } from "../../core/storage/mediaUploader.js";
import { listJobs, createJobPost } from "./jobsService.js";
import { getEthioIdUser } from "../../core/auth/ethioId.js";

const styles = `
  .jobs-module{margin-top:18px;padding:clamp(16px,3vw,24px);border:1px solid #dce4ef;border-radius:20px;background:#fff;color:#10233a;box-shadow:0 12px 34px #082b590d}
  .jobs-module h2{margin:0 0 6px;color:#082b59;font-size:clamp(21px,4vw,28px)}
  .jobs-muted{margin:0 0 18px;color:#667085;font-size:13px;line-height:1.6}
  .jobs-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;margin-bottom:20px}
  .jobs-form input,.jobs-form textarea{width:100%;min-width:0;padding:11px 12px;border:1px solid #d6deea;border-radius:11px;background:#f8faff;color:#10233a;font:inherit;font-size:14px}
  .jobs-form textarea,.jobs-form .jobs-wide{grid-column:1/-1}
  .jobs-form label{grid-column:1/-1;color:#667085;font-size:12px}
  .jobs-form button{justify-self:start;padding:11px 17px;border:0;border-radius:11px;background:#d9a928;color:#082b59;font-weight:800;cursor:pointer}
  .jobs-form button:disabled{opacity:.55;cursor:not-allowed}
  .jobs-status{padding:11px 13px;margin:0 0 14px;border-radius:10px;background:#f1f5f9;color:#475467;font-size:13px;line-height:1.55}
  .jobs-list{display:grid;gap:12px}
  .jobs-item{padding:14px;border:1px solid #e4eaf2;border-radius:13px;background:#fbfcff}
  .jobs-item h3{margin:0 0 5px;color:#082b59;font-size:17px}
  .jobs-item p{margin:8px 0 0;color:#344054;font-size:13px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
  .jobs-item small{color:#667085;font-size:12px}
  .jobs-item img{display:block;max-width:260px;width:100%;max-height:190px;object-fit:cover;border-radius:10px;margin-top:10px}
  @media(max-width:560px){.jobs-form{grid-template-columns:1fr}.jobs-form textarea,.jobs-form .jobs-wide,.jobs-form label{grid-column:1}}
`;

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com" && url.pathname.includes("/image/upload/")
      ? url.href : "";
  } catch { return ""; }
}

function renderJob(job) {
  const card = makeElement("article", "jobs-item");
  const title = makeElement("h3", "", job.title || "Hojii");
  const meta = makeElement("small", "", [job.company, job.location].filter(Boolean).join(" · "));
  const description = makeElement("p", "", job.description || "");
  card.append(title, meta, description);
  const imageUrl = safeImageUrl(job.mediaUrl);
  if (imageUrl) {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = job.title ? `Suuraa hojii: ${job.title}` : "Suuraa beeksisa hojii";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    card.append(image);
  }
  return card;
}

/** Render the starter ETHIO JOBS view inside the supplied container. */
export async function renderJobsModule(container, currentUser = getEthioIdUser()) {
  if (!container || typeof container.replaceChildren !== "function") {
    throw new TypeError("Container ETHIO JOBS sirrii kenni.");
  }

  const style = makeElement("style");
  style.textContent = styles;
  const root = makeElement("section", "jobs-module");
  const heading = makeElement("h2", "", "ETHIO JOBS — Carraawwan Hojii");
  const intro = makeElement("p", "jobs-muted", "Carraawwan hojii dhugaa barbaadi; dhaabbata kee irraa beeksisa hojii maxxansi.");
  const status = makeElement("div", "jobs-status", "Odeeffannoo hojii fe'aa jira...");
  const form = makeElement("form", "jobs-form");
  form.noValidate = false;

  const title = document.createElement("input");
  title.type = "text"; title.name = "title"; title.placeholder = "Maqaa hojii (fkn: Frontend Developer)"; title.maxLength = 140; title.required = true;
  const company = document.createElement("input");
  company.type = "text"; company.name = "company"; company.placeholder = "Maqaa dhaabbataa / daldalaa"; company.maxLength = 120; company.required = true;
  const location = document.createElement("input");
  location.type = "text"; location.name = "location"; location.placeholder = "Bakka (Adama, Finfinnee, Remote)"; location.maxLength = 120; location.className = "jobs-wide";
  const description = document.createElement("textarea");
  description.name = "description"; description.rows = 4; description.maxLength = 3000; description.placeholder = "Ibsa hojii, dandeettii barbaachisu fi ulaagaalee..."; description.required = true;
  const fileLabel = makeElement("label", "", "Suuraa beeksisa hojii (JPG, PNG ykn WEBP — hanga 5 MB)");
  const file = document.createElement("input");
  file.type = "file"; file.name = "jobImage"; file.accept = "image/jpeg,image/png,image/webp"; fileLabel.append(file);
  const submit = makeElement("button", "", "Hojii Maxxansi");
  submit.type = "submit";
  form.append(title, company, location, description, fileLabel, submit);

  const jobsList = makeElement("div", "jobs-list");
  root.append(heading, intro, status, form, jobsList);
  container.replaceChildren(style, root);

  if (!currentUser?.id || !currentUser?.ethioId) {
    status.textContent = "Beeksisa hojii maxxansuuf dura Ethio ID seeni. Hojiiwwan uummataa ilaaluufis API ETHIO JOBS barbaachisa.";
    form.hidden = true;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    status.textContent = "Beeksisa hojii qopheessaa jira...";
    try {
      let mediaUrl = "";
      if (file.files?.[0]) {
        status.textContent = "Suuraa gara kuusaa miidiyaa olkaa'aa jira...";
        const uploaded = await uploadMediaAndGetUrl(file.files[0]);
        if (!uploaded.ok) throw new Error(uploaded.error);
        mediaUrl = uploaded.mediaUrl;
      }
      const result = await createJobPost({
        title: title.value,
        company: company.value,
        location: location.value,
        description: description.value,
        mediaUrl,
        user: currentUser
      });
      if (!result.ok) throw new Error(result.error);
      form.reset();
      await refreshJobs();
      status.textContent = "Beeksisni hojii kee ergameera.";
    } catch (error) {
      status.textContent = error.message || "Hojii maxxansuun hin danda'amne.";
    } finally {
      submit.disabled = false;
    }
  });

  async function refreshJobs() {
    jobsList.replaceChildren();
    try {
      const jobs = await listJobs();
      status.textContent = jobs.length ? `${jobs.length} carraa hojii argame.` : "Ammaaf beeksisni hojii hin jiru.";
      if (!jobs.length) jobsList.append(makeElement("p", "jobs-muted", "Beeksisni hojii yeroo ammaa hin jiru."));
      jobs.forEach((job) => jobsList.append(renderJob(job)));
    } catch (error) {
      status.textContent = error.message || "Tajaajilli ETHIO JOBS yeroo ammaa hin argamu.";
      if (error.status === 404 || error.status === 503) {
        submit.disabled = true;
        file.disabled = true;
        title.disabled = true;
        company.disabled = true;
        location.disabled = true;
        description.disabled = true;
      }
    }
  }

  await refreshJobs();
  return { refresh: refreshJobs };
}
