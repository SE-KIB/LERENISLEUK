// Edge Function "ai-chat": de enige plek die het taalmodel aanroept.
// - Controleert dat de gebruiker is ingelogd (Supabase-JWT).
// - Bewaakt een daglimiet per gebruiker (AI_DAILY_LIMIT, standaard 50).
// - Slaat vraag + antwoord op en streamt het antwoord terug (Server-Sent Events).
// Secrets (supabase secrets set ...): ANTHROPIC_API_KEY, optioneel AI_MODEL, AI_DAILY_LIMIT, AI_SYSTEM_PROMPT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://sekibar.nl",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODEL = Deno.env.get("AI_MODEL") ?? "claude-sonnet-5-5";
const DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "50");
const SYSTEM = Deno.env.get("AI_SYSTEM_PROMPT") ??
  "Je bent de AI-assistent van sekibar.nl. Antwoord behulpzaam, eerlijk en beknopt, in de taal van de gebruiker.";
const HISTORY = 30; // max. aantal eerdere berichten dat meegaat als context

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Alleen POST" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: "Niet ingelogd" }, 401);

  let body: { conversationId?: string; message?: string };
  try { body = await req.json(); } catch { return json({ error: "Ongeldige JSON" }, 400); }
  const message = (body.message ?? "").trim();
  if (!message || message.length > 8000) return json({ error: "Bericht leeg of te lang (max 8000 tekens)" }, 400);

  // Daglimiet
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin.from("ai_usage").select("*").eq("user_id", user.id).eq("day", today).maybeSingle();
  if ((usage?.requests ?? 0) >= DAILY_LIMIT) return json({ error: `Daglimiet van ${DAILY_LIMIT} berichten bereikt` }, 429);

  // Gesprek ophalen of aanmaken
  let convId = body.conversationId;
  if (convId) {
    const { data: conv } = await admin.from("ai_conversations").select("id").eq("id", convId).eq("user_id", user.id).maybeSingle();
    if (!conv) return json({ error: "Gesprek niet gevonden" }, 404);
  } else {
    const { data: conv, error } = await admin.from("ai_conversations")
      .insert({ user_id: user.id, title: message.slice(0, 60) }).select("id").single();
    if (error) return json({ error: error.message }, 500);
    convId = conv.id;
  }

  const { data: past } = await admin.from("ai_messages").select("role, content")
    .eq("conversation_id", convId).order("id", { ascending: false }).limit(HISTORY);
  const messages = [...(past ?? []).reverse(), { role: "user", content: message }];
  await admin.from("ai_messages").insert({ conversation_id: convId, user_id: user.id, role: "user", content: message });

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 2048, system: SYSTEM, messages, stream: true }),
  });
  if (!upstream.ok || !upstream.body) {
    console.error("Model-fout", upstream.status, await upstream.text());
    return json({ error: "Het AI-model gaf een fout. Probeer het later opnieuw." }, 502);
  }

  // Stream doorgeven aan de browser, tegelijk het volledige antwoord opbouwen.
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (obj: unknown) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      send({ type: "start", conversationId: convId });
      let answer = "", inTok = 0, outTok = 0, buf = "";
      const reader = upstream.body!.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop()!;
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
            answer += ev.delta.text;
            send({ type: "delta", text: ev.delta.text });
          } else if (ev.type === "message_start") inTok = ev.message?.usage?.input_tokens ?? 0;
          else if (ev.type === "message_delta") outTok = ev.usage?.output_tokens ?? outTok;
        }
      }
      await admin.from("ai_messages").insert({ conversation_id: convId, user_id: user.id, role: "assistant", content: answer });
      await admin.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
      await admin.from("ai_usage").upsert({
        user_id: user.id, day: today,
        requests: (usage?.requests ?? 0) + 1,
        input_tokens: (usage?.input_tokens ?? 0) + inTok,
        output_tokens: (usage?.output_tokens ?? 0) + outTok,
      });
      send({ type: "done" });
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
});
