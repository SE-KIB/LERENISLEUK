// -------------------------------------------------------------------------
// Gedeelde helper: pushmeldingen versturen vanuit een Edge Function.
//
// Gebruikt de npm-bibliotheek 'web-push'. De VAPID-sleutels komen uit secrets:
//   VAPID_PUBLIC_KEY   -> dezelfde publieke sleutel als in app.js
//   VAPID_PRIVATE_KEY  -> de privésleutel (NOOIT in de website zetten!)
//   VAPID_SUBJECT      -> contact (mailto:... of https://...); optioneel
//
// Zie DOCENT-SETUP.md voor het genereren van de sleutels en het zetten van de
// secrets.
// -------------------------------------------------------------------------
import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface SubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return false;
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:serkan07eren@gmail.com";
  webpush.setVapidDetails(subject, pub, priv);
  vapidReady = true;
  return true;
}

// Stuurt 'payload' naar alle subscriptions in 'rows'. Verlopen aanmeldingen
// (statuscode 404/410 = het abonnement bestaat niet meer) worden meteen uit de
// tabel push_subscriptions opgeruimd, zodat we geen dooie endpoints houden.
export async function sendPush(
  sb: SupabaseClient,
  rows: SubRow[],
  payload: PushPayload,
): Promise<{ sent: number; removed: number; failed: number }> {
  if (!ensureVapid()) {
    throw new Error("VAPID_PUBLIC_KEY of VAPID_PRIVATE_KEY ontbreekt");
  }
  const body = JSON.stringify(payload);
  let sent = 0, removed = 0, failed = 0;

  await Promise.all((rows || []).map(async (row) => {
    const subscription = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };
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
