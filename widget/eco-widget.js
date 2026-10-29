// ECO-widget voor Scriptable (gratis app, App Store). Toont je volgende lessen (de Brightspace-planning gaat voor),
// het weer met een tip, deadlines en actiepunten uit het dagrapport. Tik op de widget om ECO te openen.
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
  muted: new Color("#7aa3ae"), amber: new Color("#ffb24a"), red: new Color("#ff6b6b"),
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
function itemRow(w, it, size) {
  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  txt(row, it.tijd.split("–")[0], size, it.nu ? C.cyan : C.text, { mono: true });
  row.addSpacer(6);
  const col = row.addStack();
  col.layoutVertically();
  txt(col, short(it.titel), size, C.text, { lines: 1, min: 0.75 });
  const meta = [it.dag === "morgen" ? "morgen" : "", it.locatie].filter(Boolean).join(" · ");
  const b = badge(it);
  if (meta || b) {
    const m = col.addStack();
    if (b) { txt(m, b[0], size - 4, b[1], { mono: true }); if (meta) m.addSpacer(4); }
    if (meta) txt(m, meta, size - 4, C.muted, { lines: 1 });
  }
}
function weatherLine(stack, wx, size) {
  if (!wx) return;
  txt(stack, `${wx.temp}° ${wx.omschrijving}${wx.regen >= 30 ? ` · ${wx.regen}% regen` : ""}`, size, C.text, { lines: 1, min: 0.8 });
  if (wx.tip) txt(stack, wx.tip, size - 1, C.amber, { lines: 1, min: 0.8 });
}

function build(family, data) {
  const w = new ListWidget();
  w.url = SITE;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60000);
  const items = data.items || [];
  const next = items[0];

  // Vergrendelscherm
  if (family === "accessoryInline") {
    w.addText(next ? `${next.tijd.split("–")[0]} ${short(next.titel)}` : data.weer ? `${data.weer.temp}° ${data.weer.omschrijving}` : "ECO");
    return w;
  }
  if (family === "accessoryCircular") {
    const s = w.addStack(); s.layoutVertically(); s.centerAlignContent();
    txt(s, data.weer ? `${data.weer.temp}°` : "–", 16, Color.white(), { bold: true });
    txt(s, next ? next.tijd.split("–")[0] : "ECO", 10, Color.white(), { mono: true });
    return w;
  }
  if (family === "accessoryRectangular") {
    if (next) {
      txt(w, `${next.nu ? "NU" : next.dag === "morgen" ? "MORGEN" : "VOLGENDE"} · ${next.tijd}`, 11, Color.white(), { mono: true });
      txt(w, short(next.titel), 13, Color.white(), { bold: true, lines: 2, min: 0.8 });
    } else txt(w, "Geen lessen meer", 13, Color.white(), { bold: true });
    if (data.weer) txt(w, `${data.weer.temp}°${data.weer.tip ? " · " + data.weer.tip : ""}`, 11, Color.white(), { lines: 1 });
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
    } else txt(w, "Geen lessen meer vandaag", 13, C.text, { bold: true, lines: 2 });
    w.addSpacer();
    if (data.weer) txt(w, `${data.weer.temp}°${data.weer.tip ? " · " + data.weer.tip : ""}`, 10, data.weer.tip ? C.amber : C.muted, { lines: 1, min: 0.7 });
    return w;
  }

  const body = w.addStack();
  body.layoutHorizontally();
  const left = body.addStack();
  left.layoutVertically();
  const rows = family === "large" ? 5 : 3;
  if (!items.length) txt(left, "Geen lessen meer vandaag of morgen", 13, C.text, { lines: 2 });
  items.slice(0, rows).forEach((it, i) => { if (i) left.addSpacer(5); itemRow(left, it, family === "large" ? 14 : 13); });
  body.addSpacer(10);
  const right = body.addStack();
  right.layoutVertically();
  right.size = new Size(family === "large" ? 110 : 96, 0);
  if (data.weer) {
    txt(right, `${data.weer.temp}°`, 26, C.text, { bold: true });
    txt(right, data.weer.omschrijving, 11, C.muted, { lines: 2, min: 0.8 });
    if (data.weer.regen >= 30) txt(right, `${data.weer.regen}% regen`, 10, C.muted);
    if (data.weer.tip) { right.addSpacer(3); txt(right, data.weer.tip, 10, C.amber, { lines: 2, min: 0.8 }); }
  }
  // Lopende timer: telt live af op het beginscherm.
  if (data.timer && new Date(data.timer.eind) > new Date()) {
    right.addSpacer(4);
    txt(right, `⏱ ${data.timer.label}`, 10, C.muted, { lines: 1, min: 0.8 });
    const d = right.addDate(new Date(data.timer.eind));
    d.applyTimerStyle(); d.font = Font.boldMonospacedSystemFont(14); d.textColor = C.cyan;
  }
  const extra = [...(data.deadlines || []).map((d) => `⚑ ${d}`), ...(family === "large" ? (data.actie || []).map((a) => `✉ ${a}`) : []),
    ...(family === "large" ? (data.taken || []).map((t) => `☐ ${t}`) : []), ...(data.melding ? [`⚠ ${data.melding}`] : [])];
  if (extra.length) {
    w.addSpacer(family === "large" ? 8 : 4);
    extra.slice(0, family === "large" ? 6 : 1).forEach((e) => txt(w, e, family === "large" ? 11 : 10, e.startsWith("☐") ? C.text : C.amber, { lines: 1, min: 0.8 }));
  }
  w.addSpacer();
  return w;
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
}
Script.complete();
