// Tests voor ECO's functie (supabase/functions/ai-chat/index.ts), zonder Supabase en zonder internet.
// Draaien: deno test -A tests/functie_test.ts
// Patroon (uit /controle B2): kopie van index.ts waarin createClient een nep-database geeft en Deno.serve de handler
// alleen bewaart, met de onderdelen die we testen als export erachter.
const bron = await Deno.readTextFile(new URL("../supabase/functions/ai-chat/index.ts", import.meta.url));
const code = bron
  .replace(/import \{ createClient \} from "[^"]+";/, "const createClient = () => (globalThis as any).__admin;")
  .replace("Deno.serve(async (req) => {", "(globalThis as any).__handler = (async (req: Request) => {") +
  "\nexport { webAdres, werkInfo, werkUitkomst, reserveVan, volgordeVan, bsOud, runTool, runToolLive, htmlNaarTekst };\n";
if (code === bron) throw new Error("index.ts is veranderd: het testpatroon past niet meer");
const tijdelijk = await Deno.makeTempFile({ suffix: ".ts" });
await Deno.writeTextFile(tijdelijk, code);
// Nep-database: deze tests raken de database niet; een onbekende gebruiker is niet ingelogd.
(globalThis as any).__admin = { auth: { getUser: async () => ({ data: { user: null }, error: { message: "geen sessie" } }) } };
const m = await import("file://" + tijdelijk);

function gelijk(a: unknown, b: unknown, wat = "") {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  if (x !== y) throw new Error(`${wat}\n  kreeg:    ${x}\n  verwacht: ${y}`);
}
function waar(c: unknown, wat: string) { if (!c) throw new Error(wat); }
const acties = (emit?: (ev: Record<string, unknown>) => void) => ({ userId: "u", db: {}, attempts: [], toolMemo: new Map(), emit });

Deno.test("web_lezen: geen interne adressen (SSRF), alleen http/https", () => {
  for (const slecht of ["http://localhost/", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://169.254.169.254/latest",
    "http://[::1]/", "file:///etc/passwd", "ftp://example.com/x", "http://user:pw@example.com/", "http://example.com:8080/", "intranet"]) {
    gelijk(m.webAdres(slecht), null, slecht);
  }
  gelijk(m.webAdres("nos.nl")?.href, "https://nos.nl/");
  gelijk(m.webAdres("https://www.ah.nl/winkel?x=1")?.hostname, "www.ah.nl");
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
