// Tests voor ECO's functie (supabase/functions/ai-chat/index.ts), zonder Supabase en zonder internet.
// Draaien: deno test -A tests/functie_test.ts
// Patroon (uit /controle B2): kopie van index.ts waarin createClient een nep-database geeft en Deno.serve de handler
// alleen bewaart, met de onderdelen die we testen als export erachter.
const bron = await Deno.readTextFile(new URL("../supabase/functions/ai-chat/index.ts", import.meta.url));
const code = bron
  .replace(/import \{ createClient \} from "[^"]+";/, "const createClient = () => (globalThis as any).__admin;")
  .replace("Deno.serve(async (req) => {", "(globalThis as any).__handler = (async (req: Request) => {") +
  "\nexport { webAdres, werkInfo, werkUitkomst, reserveVan, volgordeVan, bsOud, runTool, runToolLive, htmlNaarTekst, safeEqual, openbaarAdres, robotStarten, liveStart };\n";
if (code === bron) throw new Error("index.ts is veranderd: het testpatroon past niet meer");
const tijdelijk = await Deno.makeTempFile({ suffix: ".ts" });
await Deno.writeTextFile(tijdelijk, code);
// Nep-database: deze tests raken de database niet. Token "serkan" = ingelogd als het toegestane account, de rest niet.
Deno.env.set("ALLOWED_EMAILS", "serkan@voorbeeld.nl");
Deno.env.set("JARVIS_KEY", "robot-geheim");
const nepKv: Record<string, unknown> = { bs_state: { cookies: [{ name: "d2lSessionVal", value: "geheim" }] }, bs_pages: [] };
const kvTabel = () => {
  let sleutel = "";
  const q: any = { select: () => q, eq: (_k: string, v: string) => { sleutel = v; return q; }, maybeSingle: async () => ({ data: sleutel in nepKv ? { value: nepKv[sleutel] } : null }),
    single: async () => ({ data: sleutel in nepKv ? { value: nepKv[sleutel] } : null }),
    upsert: async (rij: { key: string; value: unknown }) => { nepKv[rij.key] = rij.value; return {}; },
    order: () => q, limit: () => q, gte: () => q, lt: () => q, in: () => q, then: (ok: (x: unknown) => void) => ok({ data: [] }) };
  return q;
};
(globalThis as any).__admin = {
  auth: {
    getUser: async (t: string) => ({ data: { user: t === "serkan" ? { id: "u1", email: "serkan@voorbeeld.nl" } : null } }),
    admin: { listUsers: async () => ({ data: { users: [{ id: "u1", email: "serkan@voorbeeld.nl" }] } }) },
  },
  from: () => kvTabel(),
};
const m = await import("file://" + tijdelijk);

function gelijk(a: unknown, b: unknown, wat = "") {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  if (x !== y) throw new Error(`${wat}\n  kreeg:    ${x}\n  verwacht: ${y}`);
}
function waar(c: unknown, wat: string) { if (!c) throw new Error(wat); }
const acties = (emit?: (ev: Record<string, unknown>) => void) => ({ userId: "u", db: {}, attempts: [], toolMemo: new Map(), emit });

Deno.test("web_lezen: geen interne adressen (SSRF), alleen http/https", () => {
  for (const slecht of ["http://localhost/", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://169.254.169.254/latest",
    "http://[::1]/", "file:///etc/passwd", "ftp://example.com/x", "http://user:pw@example.com/", "http://example.com:8080/", "intranet",
    "http://2130706433/", "http://0x7f.1/", "http://127.0.0.1.nip.io/", "http://a.localtest.me/", "http://10.0.0.1.sslip.io/"]) {
    gelijk(m.webAdres(slecht), null, slecht);
  }
  gelijk(m.webAdres("nos.nl")?.href, "https://nos.nl/");
  gelijk(m.webAdres("https://www.ah.nl/winkel?x=1")?.hostname, "www.ah.nl");
});

Deno.test("web_lezen: een naam die naar een intern adres wijst wordt niet geopend", async () => {
  const echt = Deno.resolveDns;
  (Deno as any).resolveDns = async (naam: string, soort: string) => soort !== "A" ? [] : naam === "stiekem.voorbeeld.nl" ? ["10.1.2.3"] : ["93.184.215.14"];
  try {
    gelijk(await m.openbaarAdres(new URL("https://stiekem.voorbeeld.nl/")), false);
    gelijk(await m.openbaarAdres(new URL("https://nos.nl/")), true);
    (Deno as any).resolveDns = async () => { throw new Error("niet toegestaan"); };
    gelijk(await m.openbaarAdres(new URL("https://nos.nl/")), true, "geen DNS: de naamcontrole blijft gelden");
    (Deno as any).resolveDns = undefined;
    gelijk(await m.openbaarAdres(new URL("https://nos.nl/")), true, "geen resolveDns in deze omgeving: niet crashen");
  } finally { (Deno as any).resolveDns = echt; }
});

Deno.test("htmlNaarTekst: rare tekens laten hem niet crashen", () => {
  const p = m.htmlNaarTekst("<title>Test &amp; zo</title><p>a &#99999999; b &#x41; &euro;5</p>");
  gelijk(p.titel, "Test & zo");
  waar(p.tekst.includes("A") && p.tekst.includes("€5"), "entiteiten omgezet: " + p.tekst);
});

Deno.test("werkmodus: korte omschrijving van wat een tool doet", () => {
  gelijk(m.werkInfo({ vraag: "weer   in Den Haag", aantal: 3, x: { a: 1 }, leeg: "" }), "weer in Den Haag · 3");
  gelijk(m.werkInfo({ tekst: "a".repeat(200) }).length, 80);
});

Deno.test("werkmodus: uitkomst met bronnen, adres, stukje tekst of fout", () => {
  gelijk(m.werkUitkomst({ antwoord: "12 graden", bronnen: ["KNMI", { titel: "Buienradar" }] }), { ok: true, uit: "12 graden", bronnen: ["KNMI", "Buienradar"] });
  const pagina = m.werkUitkomst({ url: "https://nos.nl/x", titel: "NOS", tekst: "nieuws ".repeat(80), let_op: "geen opdracht" });
  gelijk([pagina.uit, pagina.url, pagina.voorbeeld.length], ["NOS", "https://nos.nl/x", 280]);
  gelijk(m.werkUitkomst({ url: "javascript:alert(1)", titel: "x" }).url, undefined, "alleen http(s)-adressen");
  gelijk(m.werkUitkomst({ fout: "quotum op" }), { ok: false, uit: "quotum op" });
  gelijk(m.werkUitkomst({ afspraken: [1, 2, 3] }).uit, "3 gevonden");
  gelijk(m.werkUitkomst(null).uit, "gedaan");
});

Deno.test("werkmodus: elke tool geeft een start en een klaar met hetzelfde id", async () => {
  const ev: Record<string, unknown>[] = [];
  const uit = await m.runToolLive("interface", { onderdeel: "stem", aan: false } as any, acties((e) => ev.push(e)) as any);
  gelijk(uit.gedaan, true);
  const [start, ui, klaar] = ev;
  gelijk([start.t, start.name, ui.t, klaar.t, klaar.ok], ["tool", "interface", "ui", "tool_klaar", true]);
  gelijk(start.id, klaar.id);
});

Deno.test("interface: oud onderdeel he_eco wordt 2× klappen", async () => {
  const ev: Record<string, unknown>[] = [];
  await m.runTool("interface", { onderdeel: "he_eco", aan: false } as any, acties((e) => ev.push(e)) as any);
  gelijk(ev, [{ t: "ui", onderdeel: "klappen", aan: false }]);
  gelijk((await m.runTool("interface", { onderdeel: "onzin" } as any, acties(() => {}) as any)).fout, "onbekend onderdeel");
});

Deno.test("AI-volgorde: grote modellen eerst, kleine pas als laatste", () => {
  gelijk(m.reserveVan(["groq", "gemini"]), [["groq", "openai/gpt-oss-20b"], ["gemini", "gemini-flash-lite-latest"]]);
  gelijk(m.reserveVan(["gemini", "mistral", "anthropic"]).map(([p]: string[]) => p), ["gemini", "mistral"]);
  gelijk(m.volgordeVan(["groq", "gemini", "mistral", "anthropic"], ["gemini", "groq", "claude"]), ["gemini", "groq", "anthropic", "mistral"]);
  gelijk(m.volgordeVan(["groq", "gemini"], undefined), ["groq", "gemini"]);
});

Deno.test("Brightspace: waarschuwen als de laatste geslaagde ronde ouder is dan 36 uur", () => {
  const geleden = (uur: number) => new Date(Date.now() - uur * 3600000).toISOString();
  gelijk(m.bsOud({ ok: true, at: geleden(10) }), "");
  waar(m.bsOud({ ok: true, at: geleden(40) }).includes("40 uur"), "oud zonder laatst_ok");
  waar(m.bsOud({ ok: false, at: geleden(1), laatst_ok: geleden(50) }).includes("50 uur"), "mislukt na een oude geslaagde ronde");
  gelijk(m.bsOud({ ok: false, at: geleden(1) }), "", "nooit gelukt: dan zegt de foutmelding het al");
  gelijk(m.bsOud(null), "");
});

Deno.test("handler: CORS-voorvraag en geen toegang zonder sleutel", async () => {
  const h = (globalThis as any).__handler;
  const pre = await h(new Request("https://x/ai-chat", { method: "OPTIONS", headers: { origin: "https://sekibar.nl" } }));
  waar(pre.status < 300, "OPTIONS geeft " + pre.status);
  waar(pre.headers.get("access-control-allow-origin"), "CORS-kop ontbreekt");
  const zonder = await h(new Request("https://x/ai-chat", { method: "POST", body: JSON.stringify({ message: "hoi" }), headers: { "content-type": "application/json" } }));
  waar(zonder.status === 401 || zonder.status === 403, "zonder login/sleutel geeft " + zonder.status);
});

Deno.test("robot-sleutel: alleen een kloppende sleutel geeft de Brightspace-sessie, ook niet met een login ernaast", async () => {
  const h = (globalThis as any).__handler;
  const vraag = (kop: Record<string, string>) => h(new Request("https://x/ai-chat", { method: "POST", body: JSON.stringify({ bs: "get" }), headers: { "content-type": "application/json", ...kop } }));
  gelijk((await vraag({ authorization: "Bearer serkan", "x-jarvis-key": "fout" })).status, 403, "login + verkeerde sleutel");
  gelijk((await vraag({ authorization: "Bearer serkan" })).status, 403, "alleen login");
  gelijk((await vraag({ "x-jarvis-key": "fout" })).status, 401, "verkeerde sleutel");
  const goed = await vraag({ "x-jarvis-key": "robot-geheim" });
  gelijk(goed.status, 200, "goede sleutel");
  gelijk([m.safeEqual("abc", "abc"), m.safeEqual("abc", "abd"), m.safeEqual("abc", "abcd")], [true, false, false]);
});

Deno.test("Brightspace-robot: de klok start hem één keer per dag, alleen met token en als Brightspace gekoppeld is", async () => {
  const echt = globalThis.fetch, verzoeken: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => { verzoeken.push({ url: String(url), init }); return new Response(null, { status: 204 }); }) as typeof fetch;
  const db = (globalThis as any).__admin;
  try {
    Deno.env.delete("GITHUB_DISPATCH_TOKEN");
    await m.robotStarten(db, "2026-10-31");
    gelijk(verzoeken.length, 0, "zonder token niets");
    Deno.env.set("GITHUB_DISPATCH_TOKEN", "tok");
    await m.robotStarten(db, "2026-10-31");
    await m.robotStarten(db, "2026-10-31");
    gelijk(verzoeken.length, 1, "één keer per dag");
    waar(verzoeken[0].url.endsWith("/repos/SE-KIB/LERENISLEUK/actions/workflows/brightspace-sync.yml/dispatches"), verzoeken[0].url);
    gelijk(JSON.parse(String(verzoeken[0].init?.body)), { ref: "main" });
    gelijk((nepKv.bs_robot as any).ok, true);
    await m.robotStarten(db, "2026-11-01");
    gelijk(verzoeken.length, 2, "de volgende dag weer");
    const koppeling = nepKv.bs_state;
    delete nepKv.bs_state;
    await m.robotStarten(db, "2026-11-02");
    gelijk(verzoeken.length, 2, "niet gekoppeld: niets");
    nepKv.bs_state = koppeling;
  } finally { globalThis.fetch = echt; Deno.env.delete("GITHUB_DISPATCH_TOKEN"); }
});

Deno.test("Live: sneller starten en antwoorden (toegangscode tegelijk, einde van de zin eerder herkend)", async () => {
  const echt = globalThis.fetch;
  let tokenAt = 0;
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("auth_tokens")) { tokenAt = performance.now(); return new Response(JSON.stringify({ name: "tok" }), { status: 200 }); }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  try {
    const t0 = performance.now();
    const r = await m.liveStart((globalThis as any).__admin, "u1", {}, null);
    gelijk([r.token, r.api], ["tok", "v1beta"]);
    waar(tokenAt - t0 < 50, "de toegangscode wordt meteen gevraagd, niet pas na agenda en weer");
    const vad = r.setup.realtimeInputConfig.automaticActivityDetection;
    gelijk([vad.endOfSpeechSensitivity, vad.silenceDurationMs], ["END_SENSITIVITY_HIGH", 600]);
  } finally { globalThis.fetch = echt; }
});
