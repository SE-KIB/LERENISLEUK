// Edge Function "ai-chat": JARVIS, de persoonlijke assistent.
// Toegang: (a) ingelogde Supabase-gebruiker uit ALLOWED_EMAILS, of
//          (b) header "x-jarvis-key" = JARVIS_KEY (voor de iPhone-opdracht / Siri).
// Het model kan tools gebruiken (agenda bekijken/maken); de functie voert die uit en
// geeft het eindantwoord als JSON terug: { conversationId, reply }.
// Secrets: ANTHROPIC_API_KEY, ALLOWED_EMAILS, JARVIS_KEY, JARVIS_USER_ID,
//          GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
//          optioneel AI_MODEL, TIMEZONE, ALLOWED_ORIGIN.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const CORS = {
  "Access-Control-Allow-Origin": env("ALLOWED_ORIGIN", "https://sekibar.nl"),
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-jarvis-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODEL = env("AI_MODEL", "claude-sonnet-5-5");
const TZ = env("TIMEZONE", "Europe/Amsterdam");
const ALLOWED = env("ALLOWED_EMAILS").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
const HISTORY = 20;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function systemPrompt() {
  const now = new Date().toLocaleString("nl-NL", { timeZone: TZ, dateStyle: "full", timeStyle: "short" });
  return `Je bent JARVIS, de persoonlijke assistent van Serkan — zoals JARVIS van Iron Man: kalm, slim, ` +
    `licht droog-humoristisch, en altijd to the point. Je antwoorden worden vaak hardop voorgelezen, ` +
    `dus houd ze kort (1–3 zinnen), zonder opmaak, lijstjes of emoji, tenzij om meer gevraagd wordt. ` +
    `Spreek Nederlands, tenzij Serkan een andere taal gebruikt. Het is nu ${now} (tijdzone ${TZ}). ` +
    `Gebruik de agenda-tools voor vragen over afspraken; verzin nooit afspraken. ` +
    `Bevestig bij een nieuwe afspraak kort wat je hebt ingepland.`;
}

// ---------- Google Agenda ----------
async function googleToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"),
      refresh_token: env("GOOGLE_REFRESH_TOKEN"), grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error("Google-login mislukt: " + await r.text());
  return (await r.json()).access_token as string;
}
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const TOOLS = [
  {
    name: "agenda_bekijken",
    description: "Haalt afspraken op uit Serkans Google Agenda tussen twee tijdstippen.",
    input_schema: {
      type: "object",
      properties: {
        van: { type: "string", description: "Begin, ISO 8601 met tijdzone, bv. 2026-10-29T00:00:00+01:00" },
        tot: { type: "string", description: "Eind, ISO 8601 met tijdzone" },
      },
      required: ["van", "tot"],
    },
  },
  {
    name: "afspraak_maken",
    description: "Zet een nieuwe afspraak in Serkans Google Agenda.",
    input_schema: {
      type: "object",
      properties: {
        titel: { type: "string" },
        start: { type: "string", description: "ISO 8601 met tijdzone" },
        eind: { type: "string", description: "ISO 8601 met tijdzone; standaard 1 uur na start" },
        locatie: { type: "string" },
      },
      required: ["titel", "start"],
    },
  },
];

async function runTool(name: string, input: Record<string, string>) {
  if (!env("GOOGLE_REFRESH_TOKEN")) return { fout: "Google Agenda is nog niet gekoppeld." };
  const token = await googleToken();
  const auth = { Authorization: `Bearer ${token}` };
  if (name === "agenda_bekijken") {
    const q = new URLSearchParams({ timeMin: input.van, timeMax: input.tot, singleEvents: "true", orderBy: "startTime", maxResults: "50", timeZone: TZ });
    const r = await fetch(`${CAL}?${q}`, { headers: auth });
    if (!r.ok) return { fout: await r.text() };
    const items = (await r.json()).items ?? [];
    return items.map((e: any) => ({ titel: e.summary, start: e.start?.dateTime ?? e.start?.date, eind: e.end?.dateTime ?? e.end?.date, locatie: e.location }));
  }
  if (name === "afspraak_maken") {
    const start = new Date(input.start);
    const eind = input.eind ?? new Date(start.getTime() + 3600_000).toISOString();
    const r = await fetch(CAL, {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ summary: input.titel, location: input.locatie, start: { dateTime: input.start, timeZone: TZ }, end: { dateTime: eind, timeZone: TZ } }),
    });
    if (!r.ok) return { fout: await r.text() };
    const e = await r.json();
    return { gemaakt: true, titel: e.summary, start: e.start?.dateTime };
  }
  return { fout: "Onbekende tool" };
}

async function callModel(messages: unknown[]) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: systemPrompt(), tools: TOOLS, messages }),
  });
  if (!r.ok) throw new Error(`Model-fout ${r.status}: ${await r.text()}`);
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Alleen POST" }, 405);
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  // Wie vraagt er?
  let userId: string | null = null;
  const key = req.headers.get("x-jarvis-key");
  if (key && env("JARVIS_KEY") && key === env("JARVIS_KEY")) {
    userId = env("JARVIS_USER_ID") || null;
  } else {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (user && ALLOWED.includes((user.email ?? "").toLowerCase())) userId = user.id;
  }
  if (!userId) return json({ error: "Geen toegang" }, 401);

  let body: { conversationId?: string; message?: string };
  try { body = await req.json(); } catch { return json({ error: "Ongeldige JSON" }, 400); }
  const message = (body.message ?? "").trim();
  if (!message || message.length > 8000) return json({ error: "Bericht leeg of te lang" }, 400);

  // Gesprek: opgegeven id, anders een nieuw gesprek.
  let convId = body.conversationId;
  if (convId) {
    const { data } = await admin.from("ai_conversations").select("id").eq("id", convId).eq("user_id", userId).maybeSingle();
    if (!data) return json({ error: "Gesprek niet gevonden" }, 404);
  } else {
    const { data } = await admin.from("ai_conversations")
      .insert({ user_id: userId, title: (key ? "🎙️ " : "") + message.slice(0, 60) }).select("id").single();
    convId = data!.id;
  }

  const { data: past } = await admin.from("ai_messages").select("role, content")
    .eq("conversation_id", convId).order("id", { ascending: false }).limit(HISTORY);
  const messages: any[] = [...(past ?? []).reverse(), { role: "user", content: message }];

  let reply = "";
  try {
    for (let i = 0; i < 5; i++) {
      const res = await callModel(messages);
      messages.push({ role: "assistant", content: res.content });
      if (res.stop_reason !== "tool_use") {
        reply = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
        break;
      }
      const results = [];
      for (const b of res.content.filter((b: any) => b.type === "tool_use")) {
        const out = await runTool(b.name, b.input).catch((e) => ({ fout: String(e) }));
        results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out) });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    console.error(e);
    return json({ error: "Het AI-model gaf een fout. Probeer het later opnieuw." }, 502);
  }
  reply ||= "Daar kom ik niet uit, sorry.";

  await admin.from("ai_messages").insert([
    { conversation_id: convId, user_id: userId, role: "user", content: message },
    { conversation_id: convId, user_id: userId, role: "assistant", content: reply },
  ]);
  await admin.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
  return json({ conversationId: convId, reply });
});
