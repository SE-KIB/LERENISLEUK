// Hulpfuncties voor sync.mjs. Praat met ECO via de x-jarvis-key (secret JARVIS_KEY).
// Let op: GitHub-logs van deze (openbare) repo zijn openbaar; print dus nooit links, sessies of pagina-inhoud.
export const ECO_URL = process.env.ECO_URL || "https://wlpfgbrvnzjclnjocewj.supabase.co/functions/v1/smooth-service";

export async function eco(body) {
  if (!process.env.JARVIS_KEY) throw new Error("JARVIS_KEY ontbreekt (GitHub → Settings → Secrets → Actions)");
  const r = await fetch(ECO_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-jarvis-key": process.env.JARVIS_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(170000), // de functie stopt zelf na ~150 s
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`ECO ${r.status}: ${String(j.error ?? "").slice(0, 200)}`);
  return j;
}

// Status voor de HUD (ROOSTER-paneel) en voor ECO zelf.
export const status = (ok, tekst, extra = {}) =>
  eco({ bs: { actie: "status", status: { ok, tekst, ...extra } } }).catch((e) => console.log("status niet opgeslagen:", e.message));

// Staat de browser op een inlogpagina (Microsoft/HHS) in plaats van in Brightspace?
export const onLogin = (url, host) => {
  try { const u = new URL(url); return u.hostname !== host || /\/d2l\/login/i.test(u.pathname); } catch { return true; }
};
