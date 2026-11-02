// ECO-widget voor Scriptable (gratis app, App Store). Toont je volgende lessen (de Brightspace-planning gaat voor),
// het weer voor de komende 6 uur (zoals de iPhone-weerwidget) met een tip, deadlines, lesuitval uit je schoolmail en actiepunten uit het
// dagrapport. Vanaf 19:00 toont hij alleen morgen (lessen + het weer van morgenochtend). Tik op de widget om ECO te openen.
// Werkt zichzelf één keer per dag bij vanaf sekibar.nl.
// Formaten: klein, middel, groot op het beginscherm, en rechthoekig/rond/inline op het vergrendelscherm.
// Installeren: zie AI-SETUP.md ("iPhone-widget"). Inloggen met je ECO-account (zelfde als sekibar.nl); alleen de
// inlogsessie wordt bewaard in de iOS-sleutelhanger, je wachtwoord niet. Een JARVIS_KEY kan ook (optioneel).
const SUPABASE_URL = "https://wlpfgbrvnzjclnjocewj.supabase.co";
const ANON_KEY = "sb_publishable_uzfw5GWuAc7ys44q4DNHsw_r9mDstF9"; // openbare sleutel, staat ook in de website
const ECO_URL = `${SUPABASE_URL}/functions/v1/smooth-service`;
const SITE = "https://sekibar.nl";
const KEY_NAME = "eco-jarvis-key", SESSION_NAME = "eco-sessie";
const C = {
  bg: new Color("#01070c"), bg2: new Color("#04263a"), cyan: new Color("#00e1ff"), text: new Color("#e9fdff"),
  muted: new Color("#7aa3ae"), amber: new Color("#ffb24a"), red: new Color("#ff6b6b"), zon: new Color("#ffd23f"),
};
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "eco-widget-cache.json");

// Inloggen met e-mail + wachtwoord (één keer, in de app); daarna alleen de sessie verversen.
async function authCall(grant, body) {
  const r = new Request(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`);
  r.method = "POST";
  r.headers = { "content-type": "application/json", apikey: ANON_KEY };
  r.body = JSON.stringify(body);
  const j = await r.loadJSON();
  if (!j || !j.access_token) throw new Error(j && (j.error_description || j.msg || j.error) ? (j.error_description || j.msg || j.error) : "inloggen mislukt");
  Keychain.set(SESSION_NAME, JSON.stringify({ access: j.access_token, refresh: j.refresh_token, exp: Date.now() + ((j.expires_in || 3600) - 120) * 1000 }));
  return j.access_token;
}
async function login() {
  const a = new Alert();
  a.title = "Inloggen bij ECO";
  a.message = "Zelfde e-mail en wachtwoord als op sekibar.nl. Je wachtwoord wordt niet bewaard, alleen de inlogsessie.";
  a.addTextField("E-mail", "");
  a.addSecureTextField("Wachtwoord", "");
  a.addAction("Inloggen");
  a.addCancelAction("Annuleren");
  if ((await a.present()) === -1) return null;
  return await authCall("password", { email: a.textFieldValue(0).trim(), password: a.textFieldValue(1) });
}
// Geeft { auth: headers } of null. Volgorde: JARVIS_KEY (als je die ooit instelde), anders je sessie.
async function getAuth(forceLogin) {
  if (!forceLogin && Keychain.contains(KEY_NAME)) return { "x-jarvis-key": Keychain.get(KEY_NAME) };
  let token = null;
  if (!forceLogin && Keychain.contains(SESSION_NAME)) {
    const ses = JSON.parse(Keychain.get(SESSION_NAME));
    token = ses.exp > Date.now() ? ses.access : await authCall("refresh_token", { refresh_token: ses.refresh }).catch(() => null);
  }
  if (!token && config.runsInApp) token = await login();
  return token ? { Authorization: `Bearer ${token}`, apikey: ANON_KEY } : null;
}

async function loadData(auth) {
  try {
    const r = new Request(ECO_URL);
    r.method = "POST";
    r.headers = { "content-type": "application/json", ...auth };
    r.body = JSON.stringify({ widget: true });
    r.timeoutInterval = 20;
    const j = await r.loadJSON();
    const code = r.response && r.response.statusCode;
    if (code >= 400) throw new Error(j && j.error ? j.error : `fout ${code}`);
    fm.writeString(cachePath, JSON.stringify(j));
    return j;
  } catch (e) {
    if (fm.fileExists(cachePath)) { const old = JSON.parse(fm.readString(cachePath)); old.offline = true; return old; }
    return { fout: String(e.message || e) };
  }
}

// Hulpjes voor tekst in de widget.
function txt(stack, s, size, color, opts = {}) {
  const t = stack.addText(String(s));
  t.font = opts.mono ? Font.semiboldMonospacedSystemFont(size) : opts.bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  if (opts.lines) t.lineLimit = opts.lines;
  if (opts.min) t.minimumScaleFactor = opts.min;
  return t;
}
// "Water in de Stedelijke Delta: Vragenuurtje" → "WSD: Vragenuurtje" (vaknaam uit de planning afkorten tot de hoofdletters)
const short = (t) => String(t).replace(/^([^:]{16,}): /, (_, vak) => {
  const caps = vak.match(/\b[A-ZÀ-Ý]/g) || [];
  return (caps.length > 1 ? caps.join("") : vak.split(/\s+/).filter((w) => w.length > 2).map((w) => w[0].toUpperCase()).join("")) + ": ";
});
function badge(it) {
  if (it.nu) return ["NU", C.cyan];
  if (/vervalt/.test(it.soort)) return ["VERVALT", C.red];
  if (it.wijziging) return ["GEWIJZIGD", C.amber];
  if (/belangrijk|toets|deadline/.test(it.soort)) return ["!", C.amber];
  if (/zelfstudie/.test(it.soort)) return ["ZELFSTUDIE", C.muted];
  if (it.afwijking) return ["ANDERS", C.amber];
  return null;
}
function header(w, data) {
  const h = w.addStack();
  h.centerAlignContent();
  txt(h, "E.C.O.", 11, C.cyan, { mono: true });
  h.addSpacer();
  const now = new Date();
  txt(h, data.offline ? "offline" : `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, 10, C.muted, { mono: true });
}
let avondModus = false; // vanaf 19:00: alles gaat over morgen
function itemRow(w, it, size) {
  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  txt(row, it.tijd.split("–")[0], size, it.nu ? C.cyan : C.text, { mono: true });
  row.addSpacer(6);
  const col = row.addStack();
  col.layoutVertically();
  txt(col, short(it.titel), size, C.text, { lines: 1, min: 0.75 });
  const meta = [it.dag === "morgen" && !avondModus ? "morgen" : "", it.locatie, avondModus && size >= 14 ? it.info : ""].filter(Boolean).join(" · ");
  const b = badge(it);
  if (meta || b) {
    const m = col.addStack();
    if (b) { txt(m, b[0], size - 4, b[1], { mono: true }); if (meta) m.addSpacer(4); }
    if (meta) txt(m, meta, size - 4, C.muted, { lines: 1 });
  }
}
// Weericonen (SF Symbols) in ECO-kleuren: zon geel, regen cyaan, onweer oranje, wolken en maan wit.
const iconKleur = (n) => /^(sun|sunrise|sunset)/.test(n) ? C.zon : /bolt/.test(n) ? C.amber : /rain|drizzle|sleet/.test(n) ? C.cyan : C.text;
function icon(stack, naam, size) {
  const s = naam && SFSymbol.named(naam);
  if (!s) return null;
  s.applyFont(Font.systemFont(size));
  const img = stack.addImage(s.image);
  img.imageSize = new Size(size, size);
  img.tintColor = iconKleur(naam);
  return img;
}
// De komende uren naast elkaar: uur, icoon, temperatuur (zonsondergang/-opkomst met de tijd erbij).
function weerStrip(stack, strip, kolommen, breedte, size) {
  for (let r = 0; r < strip.length; r += kolommen) {
    if (r) stack.addSpacer(4);
    const rij = stack.addStack();
    rij.layoutHorizontally();
    for (const u of strip.slice(r, r + kolommen)) {
      const kol = rij.addStack();
      kol.layoutVertically();
      kol.centerAlignContent();
      kol.size = new Size(breedte / kolommen, 0);
      txt(kol, u.t, size - 2, C.muted, { mono: true, min: 0.7 });
      if (size > 9) kol.addSpacer(2);
      icon(kol, u.icoon, size + 4);
      if (size > 9) kol.addSpacer(2);
      txt(kol, `${u.temp}°`, size, C.text, { bold: true });
    }
  }
}
// Tekst gecentreerd in de hoek (de jas/paraplu-tip onder de onderste rij uren).
function midden(stack, s, size, color, lines) {
  const r = stack.addStack();
  r.layoutHorizontally();
  r.addSpacer();
  const t = txt(r, s, size, color, { lines, min: 0.8 });
  t.centerAlignText();
  r.addSpacer();
}
// De hoek rechts: temperatuur met icoon, daaronder de komende 6 uur (2 rijen van 3) en gecentreerd de tip (of de lopende timer).
function weerHoek(right, wx, family, breedte, metTip) {
  const groot = family === "large";
  const kop = right.addStack();
  kop.centerAlignContent();
  txt(kop, `${wx.temp}°`, groot ? 26 : 20, C.text, { bold: true });
  kop.addSpacer(6);
  icon(kop, wx.icoon, groot ? 22 : 16);
  if (groot) txt(right, wx.omschrijving, 11, C.muted, { lines: 1, min: 0.8 });
  const strip = wx.strip || [];
  if (strip.length) {
    right.addSpacer(groot ? 6 : 3);
    weerStrip(right, strip.slice(0, 6), 3, breedte, groot ? 11 : 9);
  } else if (wx.regen >= 30) txt(right, `${wx.regen}% regen`, 10, C.muted);
  if (metTip && wx.tip) { right.addSpacer(groot ? 5 : 3); midden(right, wx.tip, groot ? 11 : 10, C.amber, groot ? 2 : 1); }
}
// 's Avonds: het weer van morgen (ochtend om 8 uur, min–max, regen) met de tip voor morgen.
function morgenHoek(right, m, family) {
  const groot = family === "large";
  if (groot) txt(right, "MORGEN", 9, C.muted, { mono: true }); // in de middelste staat het al links
  const kop = right.addStack();
  kop.centerAlignContent();
  txt(kop, `${m.min}–${m.max}°`, groot ? 24 : 20, C.text, { bold: true, min: 0.7 });
  kop.addSpacer(6);
  icon(kop, m.icoon, groot ? 22 : 16);
  txt(right, m.omschrijving || "", groot ? 11 : 10, C.muted, { lines: 1, min: 0.8 });
  const r = [m.ochtend != null ? `8:00 ${m.ochtend}°` : "", m.regen >= 20 ? `${m.regen}% regen` : ""].filter(Boolean).join(" · ");
  if (r) txt(right, r, groot ? 11 : 10, C.muted, { lines: 1, min: 0.8 });
  if (m.tip) { right.addSpacer(groot ? 5 : 3); midden(right, m.tip, groot ? 11 : 10, C.amber, groot ? 2 : 1); }
}

function build(family, data) {
  const w = new ListWidget();
  w.url = SITE;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60000);
  const items = data.items || [];
  avondModus = !!data.avond;
  const next = items.find((i) => !/vervalt/.test(i.soort)) || items[0]; // een vervallen les is niet "volgende"
  const wxKort = avondModus && data.weer && data.weer.morgen
    ? { temp: `${data.weer.morgen.min}–${data.weer.morgen.max}`, tip: data.weer.morgen.tip, icoon: data.weer.morgen.icoon, omschrijving: `morgen ${data.weer.morgen.omschrijving || ""}`.trim() }
    : data.weer;

  // Vergrendelscherm
  if (family === "accessoryInline") {
    w.addText(next ? `${next.tijd.split("–")[0]} ${short(next.titel)}` : wxKort ? `${wxKort.temp}° ${wxKort.omschrijving}` : "ECO");
    return w;
  }
  if (family === "accessoryCircular") {
    const s = w.addStack(); s.layoutVertically(); s.centerAlignContent();
    txt(s, data.weer ? `${data.weer.temp}°` : "–", 16, Color.white(), { bold: true, min: 0.6 });
    txt(s, next ? next.tijd.split("–")[0] : "ECO", 10, Color.white(), { mono: true });
    return w;
  }
  if (family === "accessoryRectangular") {
    if (next) {
      txt(w, `${next.nu ? "NU" : next.dag === "morgen" ? "MORGEN" : "VOLGENDE"} · ${next.tijd}`, 11, Color.white(), { mono: true });
      txt(w, short(next.titel), 13, Color.white(), { bold: true, lines: 2, min: 0.8 });
    } else txt(w, avondModus ? "Morgen geen lessen" : "Geen lessen meer", 13, Color.white(), { bold: true });
    if (wxKort) txt(w, `${wxKort.temp}°${wxKort.tip ? " · " + wxKort.tip : ""}`, 11, Color.white(), { lines: 1 });
    return w;
  }

  // Beginscherm
  const g = new LinearGradient();
  g.colors = [C.bg2, C.bg];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.setPadding(12, 14, 12, 14);
  header(w, data);
  w.addSpacer(6);
  if (data.fout) { txt(w, data.fout, 12, C.red, { lines: 4 }); return w; }

  if (family === "small") {
    if (next) {
      txt(w, next.nu ? "NU BEZIG" : next.dag === "morgen" ? "MORGEN" : "VOLGENDE", 9, C.muted, { mono: true });
      txt(w, next.tijd, 18, next.nu ? C.cyan : C.text, { mono: true, min: 0.7 });
      txt(w, short(next.titel), 13, C.text, { bold: true, lines: 2, min: 0.8 });
      if (next.locatie) txt(w, next.locatie, 10, C.muted, { lines: 1 });
    } else txt(w, avondModus ? "Morgen geen lessen" : "Geen lessen meer vandaag", 13, C.text, { bold: true, lines: 2 });
    w.addSpacer();
    if (wxKort) {
      const r = w.addStack();
      r.centerAlignContent();
      icon(r, wxKort.icoon, 12);
      if (wxKort.icoon) r.addSpacer(4);
      txt(r, `${wxKort.temp}°${wxKort.tip ? " · " + wxKort.tip : ""}`, 10, wxKort.tip ? C.amber : C.muted, { lines: 1, min: 0.7 });
    }
    return w;
  }

  const body = w.addStack();
  body.layoutHorizontally();
  const left = body.addStack();
  left.layoutVertically();
  const rows = family === "large" ? 5 : 3;
  if (avondModus) { txt(left, "MORGEN", 9, C.cyan, { mono: true }); left.addSpacer(3); }
  if (!items.length) txt(left, avondModus ? "Morgen geen lessen" : "Geen lessen meer vandaag of morgen", 13, C.text, { lines: 2 });
  items.slice(0, rows).forEach((it, i) => { if (i) left.addSpacer(5); itemRow(left, it, family === "large" ? 14 : 13); });
  body.addSpacer(10);
  const right = body.addStack();
  right.layoutVertically();
  const breedte = family === "large" ? 136 : 116;
  right.size = new Size(breedte, 0);
  const timerLoopt = data.timer && new Date(data.timer.eind) > new Date();
  // In de middelste widget is er plek voor óf de tip óf de timer; de timer gaat voor.
  if (avondModus && data.weer && data.weer.morgen) morgenHoek(right, data.weer.morgen, family);
  else if (data.weer) weerHoek(right, data.weer, family, breedte, family === "large" || !timerLoopt);
  // Lopende timer: telt live af op het beginscherm.
  if (timerLoopt) {
    right.addSpacer(4);
    txt(right, `⏱ ${data.timer.label}`, 10, C.muted, { lines: 1, min: 0.8 });
    const d = right.addDate(new Date(data.timer.eind));
    d.applyTimerStyle(); d.font = Font.boldMonospacedSystemFont(14); d.textColor = C.cyan;
  }
  const extra = [...(data.deadlines || []).map((d) => `⚑ ${d}`), ...(family === "large" ? (data.actie || []).map((a) => `✉ ${a}`) : []),
    ...(family === "large" ? (data.taken || []).map((t) => `☐ ${t}`) : []), ...(data.melding ? [`⚠ ${data.melding}`] : [])];
  // Groot: onderaan over de hele breedte. Middel: links onder de lessen (rechts staan nu 2 rijen weer, dus onderaan is geen plek).
  if (extra.length && family === "large") {
    w.addSpacer(8);
    extra.slice(0, 6).forEach((e) => txt(w, e, 11, e.startsWith("☐") ? C.text : C.amber, { lines: 1, min: 0.8 }));
  } else if (extra.length) {
    left.addSpacer(4);
    extra.slice(0, items.length >= 3 ? 1 : 2).forEach((e) => txt(left, e, 10, C.amber, { lines: 1, min: 0.8 }));
  }
  w.addSpacer();
  return w;
}

// Zelf bijwerken: één keer per dag de nieuwste versie van sekibar.nl ophalen (zoals NOVA). Werkt vanaf de volgende keer.
async function bijwerken() {
  try {
    const stempel = fm.joinPath(fm.documentsDirectory(), "eco-widget-bijgewerkt.txt");
    if (fm.fileExists(stempel) && Date.now() - Number(fm.readString(stempel)) < 24 * 3600000) return;
    fm.writeString(stempel, String(Date.now()));
    const r = new Request(`${SITE}/widget/eco-widget.js`);
    r.timeoutInterval = 10;
    const code = await r.loadString();
    if (r.response.statusCode !== 200 || !code.startsWith("// ECO-widget voor Scriptable") || !code.includes("Script.complete()")) return;
    const eigen = module.filename.includes("Mobile Documents") ? FileManager.iCloud() : FileManager.local();
    if (eigen.readString(module.filename) !== code) eigen.writeString(module.filename, code);
  } catch (e) { /* geen internet of geen schrijfrecht: dan blijft deze versie */ }
}

// Start
const fam = config.widgetFamily || "medium";
if (config.runsInApp) {
  const ingelogd = Keychain.contains(SESSION_NAME) || Keychain.contains(KEY_NAME);
  const menu = new Alert();
  menu.title = "ECO-widget";
  menu.message = ingelogd ? "Je bent ingelogd." : "Log eerst in met je ECO-account.";
  ["Voorbeeld klein", "Voorbeeld middel", "Voorbeeld groot", "Opnieuw inloggen"].forEach((t) => menu.addAction(t));
  menu.addCancelAction("Klaar");
  const choice = await menu.present();
  let auth = null;
  try { auth = await getAuth(choice === 3 || !ingelogd); } catch (e) { const f = new Alert(); f.title = "Inloggen mislukt"; f.message = String(e.message || e); f.addAction("OK"); await f.present(); }
  if (auth && choice >= 0 && choice <= 2) {
    const data = await loadData(auth);
    const w = build(["small", "medium", "large"][choice], data);
    await [w.presentSmall.bind(w), w.presentMedium.bind(w), w.presentLarge.bind(w)][choice]();
  }
} else {
  const auth = await getAuth(false).catch(() => null);
  const data = auth ? await loadData(auth) : { fout: "Open de app Scriptable en tik op het script ECO om in te loggen." };
  Script.setWidget(build(fam, data));
  await bijwerken();
}
Script.complete();
