export function createSupabaseRestAdapter({ supabaseUrl, anonKey }) {
  if (!supabaseUrl || !anonKey) return null;

  const headers = {
    "Content-Type": "application/json",
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`
  };

  return {
    async saveProfile(user) {
      const res = await fetch(`${supabaseUrl}/rest/v1/profiles?on_conflict=ethio_id_code`, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify([
          {
            ethio_id_code: user.ethioId,
            full_name: user.fullName,
            phone_or_email: user.contact,
            avatar_url: user.avatarUrl || "",
            preferred_lang: user.language || "om"
          }
        ])
      });

      if (!res.ok) {
        const errText = await res.text();
        return { ok: false, error: errText };
      }
      return { ok: true };
    },

    async getJobs() {
      const res = await fetch(`${supabaseUrl}/rest/v1/jobs?select=*&order=created_at.desc`, {
        headers
      });
      if (!res.ok) return null;
      const rows = await res.json();
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        company: r.company,
        location: r.location,
        description: r.description,
        mediaUrl: r.job_banner_url || "",
        postedBy: r.posted_by_ethio_id || "ETHIO-ONE",
        createdAt: r.created_at
      }));
    },

    async insertJob(job) {
      const res = await fetch(`${supabaseUrl}/rest/v1/jobs`, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify([
          {
            posted_by_ethio_id: job.postedBy && job.postedBy !== "GUEST" ? job.postedBy : null,
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description,
            job_banner_url: job.mediaUrl || "",
            status: "open"
          }
        ])
      });

      if (!res.ok) {
        const errText = await res.text();
        return { ok: false, error: errText };
      }
      return { ok: true };
    }
  };
}
