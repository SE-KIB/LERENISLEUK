// Brightspace bijwerken: opent met de bewaarde sessie elke ingestelde Rooster-pagina, pakt tekst + screenshots
// en laat ECO er de lesplanning van maken (dezelfde import als ROOSTER → + PLANNING). Ververst daarna de sessie.
import { chromium } from "playwright";
import { eco, status, onLogin } from "./common.mjs";

const { state, pages = [], host } = await eco({ bs: "get" });
if (!state?.cookies?.length) { await status(false, "niet gekoppeld: upload eerst een sessie (ROOSTER → SESSIE UPLOADEN)"); process.exit(0); }
if (!pages.length) { await status(false, "geen Rooster-pagina's ingesteld (ROOSTER → + PAGINA)"); process.exit(0); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: state, viewport: { width: 1600, height: 1000 }, locale: "nl-NL", timezoneId: "Europe/Amsterdam" });
const b64 = (s) => Buffer.from(s).toString("base64");
const WEKEN = 6; // alleen de komende weken lezen: veel sneller en betrouwbaarder; de robot draait elke dag

// Tekst van de pagina en van ingesloten frames (Brightspace toont inhoud vaak in een iframe), plus screenshots.
async function capture(page) {
  const texts = [];
  for (const f of page.frames()) {
    const t = await f.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    if (t.trim().length > 80) texts.push(t.trim());
  }
  const shots = [];
  // De inhoud zelf (het diepste frame met een eigen adres op Brightspace) los openen geeft een schone, volledige screenshot.
  const sameHost = (u) => { try { return new URL(u).hostname === host; } catch { return false; } };
  const inner = page.frames().filter((f) => f !== page.mainFrame() && sameHost(f.url())).pop();
  const target = inner ? await ctx.newPage() : page;
  if (inner) await target.goto(inner.url(), { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  const height = await target.evaluate(() => document.documentElement.scrollHeight).catch(() => 1000);
  for (let y = 0; y < Math.min(height, 18000) && shots.length < 3; y += 6000) {
    const buf = await target.screenshot({ type: "jpeg", quality: 80, fullPage: true, clip: { x: 0, y, width: 1600, height: Math.min(6000, height - y) } }).catch(() => null);
    if (buf) shots.push({ mime: "image/jpeg", data: buf.toString("base64") });
  }
  if (inner) await target.close();
  const text = texts.join("\n\n---\n\n").slice(0, 60000);
  return [...(text ? [{ mime: "text/plain", data: b64(text) }] : []), ...shots];
}

let klaar = 0;
const fouten = [], deels = [];
for (const p of pages) {
  const page = await ctx.newPage();
  try {
    await page.goto(p.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
    if (onLogin(page.url(), host)) {
      await status(false, "Brightspace-sessie verlopen: upload een nieuwe sessie (ROOSTER → SESSIE UPLOADEN)");
      console.log("Sessie verlopen.");
      await browser.close();
      process.exit(0);
    }
    const files = await capture(page);
    if (!files.length) throw new Error("pagina leeg");
    // In kleine stukjes, zodat elke aanroep ruim binnen de tijdslimiet van de server blijft: eerst de tekst (snel en volledig),
    // daarna elke screenshot apart (rode afwijkende tijden, opmaak). Elk stuk vervangt alleen de dagen die erin staan.
    const tekst = files.filter((f) => f.mime === "text/plain"), shots = files.filter((f) => f.mime !== "text/plain");
    let gelukt = 0;
    const lees = (deel) => eco({ planning: { vak: p.vak, files: deel, weken: WEKEN } });
    const mislukt = [], stapFouten = [];
    for (const deel of [tekst, ...shots.map((f) => [f])].filter((d) => d.length)) await lees(deel).then(() => gelukt++, () => mislukt.push(deel));
    // Gemini is soms even druk (503) of traag: mislukte delen na een halve minuut nog één keer.
    if (mislukt.length) {
      await new Promise((r) => setTimeout(r, 30000));
      for (const deel of mislukt) await lees(deel).then(() => gelukt++, (e) => stapFouten.push(String(e.message).split("\n")[0]));
    }
    if (!gelukt) throw new Error(stapFouten[0] || "niets gelezen");
    if (stapFouten.length) deels.push(`${p.vak}: ${stapFouten.length} van ${gelukt + stapFouten.length} delen niet gelezen`);
    klaar++;
    console.log(`Vak ${klaar}/${pages.length}: ${gelukt} van ${gelukt + stapFouten.length} delen gelezen.`);
  } catch (e) {
    fouten.push(`${p.vak}: ${String(e.message).split("\n")[0].replace(/https?:\/\/\S+/g, "(link)").slice(0, 240)}`);
    console.log(`Vak ${klaar + fouten.length}/${pages.length} mislukt.`);
  } finally { await page.close(); }
}
// Ververste cookies terugzetten, zodat de koppeling zo lang mogelijk geldig blijft.
await eco({ bs: { actie: "save", state: await ctx.storageState() } }).catch(() => {});
await browser.close();
await status(fouten.length === 0, fouten.length ? `bijgewerkt, maar: ${[...fouten, ...deels].join("; ")}` : `${klaar} vak${klaar === 1 ? "" : "ken"} bijgewerkt${deels.length ? ` (${deels.join("; ")})` : ""}`);
