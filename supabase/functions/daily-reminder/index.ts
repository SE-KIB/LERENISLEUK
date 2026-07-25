// Edge Function: daily-reminder
// -------------------------------------------------------------------------
// Stuurt een oefen-herinnering (pushmelding) naar alle LEERLINGEN die zich
// voor meldingen hebben aangemeld. Bedoeld om 1× per dag te draaien via een
// Supabase Cron (pg_cron) — zie DOCENT-SETUP.md.
//
// Je mag een eigen tekst meesturen in de body van het verzoek, bijv.:
//   { "title": "Nog even oefenen 📚", "body": "Doe vandaag les 3 af!" }
// Zonder body wordt een standaardtekst gebruikt.
//
// Benodigde secrets:
//   VAPID_PUBLIC_KEY   -> dezelfde publieke sleutel als in app.js
//   VAPID_PRIVATE_KEY  -> de privésleutel (NOOIT in de website)
//   VAPID_SUBJECT      -> contact (mailto:... of https://...); optioneel
// SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn binnen een edge function
// automatisch beschikbaar.
// -------------------------------------------------------------------------
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// --- web-push helper (zelfstandig, zodat deze functie los te deployen is) ---
interface SubRow { endpoint: string; p256dh: string; auth: string }
interface PushPayload { title: string; body: string; url?: string; tag?: string }

let __vapidReady = false;
function ensureVapid(): boolean {
  if (__vapidReady) return true;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") || "mailto:serkan07eren@gmail.com", pub, priv,
  );
  __vapidReady = true;
  return true;
}

async function sendPush(sb: SupabaseClient, rows: SubRow[], payload: PushPayload) {
  if (!ensureVapid()) throw new Error("VAPID_PUBLIC_KEY of VAPID_PRIVATE_KEY ontbreekt");
  const body = JSON.stringify(payload);
  let sent = 0, removed = 0, failed = 0;
  await Promise.all((rows || []).map(async (row) => {
    const subscription = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
    try {
      await webpush.sendNotification(subscription, body);
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) {
        await sb.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
        removed++;
      } else {
        failed++;
      }
    }
  }));
  return { sent, removed, failed };
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Optionele eigen tekst (een leeg/ongeldig verzoek is prima).
    let custom: { title?: string; body?: string } = {};
    try { custom = await req.json(); } catch (_) { /* geen body → standaardtekst */ }

    // Alle leerling-aanmeldingen (alles wat geen docent is).
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .neq("role", "teacher");
    if (error) throw error;

    if (!subs || subs.length === 0) {
      return json({ sent: 0, note: "geen aanmeldingen" });
    }

    const result = await sendPush(supabase, subs, {
      title: custom.title || "Tijd om te oefenen! 📚",
      body: custom.body ||
        "Doe vandaag even een lesje Nederlands — elke dag een beetje werkt het best 💪",
      url: "./index.html",
      tag: "oefen-herinnering",
    });

    return json({ ok: true, ...result });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
