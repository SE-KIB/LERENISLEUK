// Edge Function: notify-completion
// -------------------------------------------------------------------------
// Meldt de docent zodra een leerling een les AFRONDT — via e-mail én via een
// pushmelding op de telefoon. "Afgerond" betekent hier: een poging met 100%
// (foutloos) — zie PASS_PCT.
//
// Deze functie wordt aangeroepen door een Supabase *Database Webhook* die
// afgaat bij elke INSERT in de tabel `public.attempts`. De webhook stuurt de
// nieuwe rij mee als `record`. We controleren hier of het echt een afronding
// is en of de leerling deze les niet eerder al had afgerond (zo voorkomen we
// dubbele meldingen bij oefenen/herhalen).
//
// Benodigde secrets (Project → Edge Functions → Secrets, of `supabase secrets set`):
//   E-mail (optioneel):
//     RESEND_API_KEY   -> API-sleutel van https://resend.com (gratis tier volstaat)
//     NOTIFY_TO        -> ontvanger, bijv. serkan07eren@gmail.com
//     NOTIFY_FROM      -> geverifieerd afzender-adres bij Resend
//                         (bijv. "Calis Artik Da <meldingen@sekibar.nl>";
//                          zonder eigen domein werkt "onboarding@resend.dev")
//   Pushmelding (optioneel):
//     VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT  (zie _shared/webpush.ts)
//
// SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY worden automatisch als env
// beschikbaar gesteld binnen een edge function.
// -------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPush } from "../_shared/webpush.ts";

const PASS_PCT = 100; // e-mail alleen bij een volledig foutloze afronding (100%)

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload?.record;

    // Alleen reageren op nieuwe pogingen die als 'afgerond' tellen.
    if (!record || typeof record.pct !== "number" || record.pct < PASS_PCT) {
      return new Response(JSON.stringify({ skipped: "geen afronding" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Was deze les door deze leerling al eerder afgerond? Dan geen nieuwe mail.
    const { count } = await supabase
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", record.user_id)
      .eq("lesson", record.lesson)
      .gte("pct", PASS_PCT)
      .neq("id", record.id);

    if ((count ?? 0) > 0) {
      return new Response(JSON.stringify({ skipped: "les al eerder afgerond" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Naam van de leerling opzoeken (val terug op e-mail).
    let naam = record.email || "Een leerling";
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name,email")
      .eq("id", record.user_id)
      .maybeSingle();
    if (prof?.full_name) naam = prof.full_name;
    else if (prof?.email) naam = prof.email;

    const les = String(record.lesson);
    const pct = record.pct;
    const score = record.score;
    const total = record.total;
    const mode = record.mode || "oefening";
    const wanneer = new Date(record.created_at || Date.now()).toLocaleString(
      "nl-NL",
      { timeZone: "Europe/Amsterdam" },
    );

    // ---- 1) Pushmelding naar de docent(en) op de telefoon ----
    // Alle aanmeldingen met rol 'teacher'. Best-effort: mislukt dit, dan gaat
    // de e-mail hieronder gewoon door.
    let pushResult: unknown = { skipped: "geen pushconfig" };
    try {
      const { data: teacherSubs } = await supabase
        .from("push_subscriptions")
        .select("endpoint,p256dh,auth")
        .eq("role", "teacher");
      if (teacherSubs && teacherSubs.length) {
        pushResult = await sendPush(supabase, teacherSubs, {
          title: `✅ Les ${les} afgerond`,
          body: `${naam} heeft les ${les} foutloos afgerond (${pct}%).`,
          url: "./index.html",
          tag: `afronding-${record.user_id}-${les}`,
        });
      } else {
        pushResult = { sent: 0, note: "geen docent-aanmeldingen" };
      }
    } catch (e) {
      pushResult = { error: String(e) };
    }

    // ---- 2) E-mail naar de docent (optioneel) ----
    const to = Deno.env.get("NOTIFY_TO");
    const from = Deno.env.get("NOTIFY_FROM") || "onboarding@resend.dev";
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (!resendKey || !to) {
      // Geen mailconfig? Prima — de pushmelding is dan het enige kanaal.
      return new Response(
        JSON.stringify({ push: pushResult, email: "niet ingesteld" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const subject = `✅ ${naam} heeft les ${les} afgerond (${pct}%)`;
    const html = `
      <div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#222">
        <h2 style="margin:0 0 8px">Les afgerond 🎉</h2>
        <p><b>${escapeHtml(naam)}</b> heeft <b>les ${escapeHtml(les)}</b> afgerond.</p>
        <ul style="line-height:1.6">
          <li>Resultaat: <b>${pct}%</b> (${score} van ${total} goed)</li>
          <li>Spelvorm: ${escapeHtml(mode)}</li>
          <li>Tijdstip: ${escapeHtml(wanneer)}</li>
        </ul>
        <p style="color:#666;font-size:13px">Automatische melding vanuit Calis Artik Da.</p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      const detail = await res.text();
      // E-mail mislukt, maar de push kan wél gelukt zijn — meld beide.
      return new Response(JSON.stringify({ push: pushResult, email: "mislukt", detail }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ push: pushResult, email: "verstuurd" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
