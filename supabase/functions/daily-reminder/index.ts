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
// Benodigde secrets: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (/ VAPID_SUBJECT).
// SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn binnen een edge function
// automatisch beschikbaar.
// -------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPush } from "../_shared/webpush.ts";

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
