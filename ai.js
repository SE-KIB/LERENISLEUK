// ECO — frontend (holografische HUD). Praat alleen met Supabase; de AI-sleutel staat nooit in de browser.
const SUPABASE_URL = "https://wlpfgbrvnzjclnjocewj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_uzfw5GWuAc7ys44q4DNHsw_r9mDstF9";
// Interne naam (slug) van de Edge Function in Supabase; de weergavenaam daar is "ai-chat".
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/smooth-service`;
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const md = (t) => DOMPurify.sanitize(marked.parse(t));
const plain = (t) => t.replace(/```[\s\S]*?```/g, "").replace(/[*_#`>]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1").trim();
const hhmmss = () => new Date().toLocaleTimeString("nl-NL", { hour12: false });
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const T0 = Date.now();
let currentConv = null, lastLatency = null, justLoggedIn = false, currentUserId = null;

// Oude service worker van de vorige site opruimen (eco-sw.js voor de meldingen blijft).
navigator.serviceWorker?.getRegistrations().then((rs) => rs.forEach((r) => {
  const w = r.active || r.waiting || r.installing;
  if (!/\/eco-sw\.js$/.test(w?.scriptURL || "")) r.unregister();
}));
// Terug van Spotify (koppelen): code aan de server geven en het adres opschonen. Werkt ook in een venster zonder ECO-sessie.
let spNotice = "";
(() => {
  const q = new URLSearchParams(location.search);
  if (!q.has("state") || !(q.has("code") || q.has("error"))) return;
  history.replaceState(null, "", location.pathname + location.hash);
  const done = (t, ok) => {
    spNotice = t;
    const lm = $("loginMsg"); if (lm) { lm.className = "login-msg " + (ok ? "ok" : "err"); lm.textContent = t; }
    if (!$("app").hidden) { typeCaption(t, ok ? "" : "err"); loadSpotify(); }
  };
  if (q.get("error")) return done(q.get("error") === "access_denied" ? "Spotify-koppeling geannuleerd." : "Spotify gaf een fout: " + q.get("error"), false);
  fetch(FUNCTION_URL + "?spotify=callback", { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY }, body: JSON.stringify({ code: q.get("code"), state: q.get("state") }) })
    .then((r) => r.json())
    .then((r) => done(r.ok ? `Spotify gekoppeld${r.naam ? ` (${r.naam})` : ""}.${r.premium === false ? " Zonder Premium kan ECO Spotify alleen openen, niet bedienen." : ""}` : r.fout || "Koppelen mislukt.", !!r.ok))
    .catch(() => done("Spotify koppelen mislukt (geen verbinding).", false));
})();
// Tik op de briefingmelding terwijl ECO al open staat.
navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.type === "briefing" && !$("app").hidden) briefing(); });

// ---------- Toestand ----------
const STATE_LABEL = { idle: "STAND-BY", listening: "LUISTEREN", thinking: "VERWERKEN", speaking: "SPREKEN", error: "STORING" };
function setState(s) {
  document.body.dataset.state = s;
  $("stateLabel").textContent = STATE_LABEL[s];
  wakeOnState(s); // "Hé Eco" luistert alleen in stand-by, niet terwijl ECO luistert, denkt of praat
}

// ---------- Geluid (UI-tonen via Web Audio, geen bestanden) ----------
let actx = null;
function tone(freq, dur = 0.07, type = "sine", vol = 0.035, delay = 0, force = false) {
  if (!$("sfx").checked && !force) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch { /* geen audio, geen probleem */ }
}
const sfx = {
  tick: () => tone(1800, 0.03, "square", 0.012),
  open: () => { tone(520, 0.12); tone(780, 0.14, "sine", 0.035, 0.09); tone(1170, 0.22, "sine", 0.03, 0.18); },
  send: () => { tone(900, 0.05, "triangle"); tone(1350, 0.06, "triangle", 0.03, 0.05); },
  listen: () => tone(1240, 0.09, "sine", 0.04),
  reply: () => { tone(1040, 0.06); tone(780, 0.1, "sine", 0.03, 0.06); },
  error: () => { tone(220, 0.18, "sawtooth", 0.03); tone(170, 0.25, "sawtooth", 0.03, 0.15); },
  // Wekker (ook als GELUID uit staat): vier keer een dubbele piep.
  alarm: () => { for (let i = 0; i < 4; i++) { tone(1320, 0.12, "square", 0.05, i * 0.7, true); tone(1760, 0.16, "square", 0.05, i * 0.7 + 0.16, true); } },
};

// ---------- Arc reactor (SVG, twee keer gebruikt: login en HUD) ----------
// Opbouw zoals de reactor van Iron Man: metalen behuizing met bouten, tien gewikkelde koperspoelen
// rond een fel witblauwe kern, met daaromheen draaiende HUD-ringen.
function reactorSVG(n) {
  const P = (r, a) => `${(Math.cos(a * Math.PI / 180) * r).toFixed(2)} ${(Math.sin(a * Math.PI / 180) * r).toFixed(2)}`;
  const arc = (r, a0, a1, cls, w, extra = "") =>
    `<path class="${cls}" d="M${P(r, a0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${P(r, a1)}" stroke-width="${w}" ${extra}/>`;
  const ticks = (r, count, len, w, op) => {
    let d = "";
    for (let i = 0; i < count; i++) { const a = (i / count) * 360, l = i % 5 ? len : len * 2; d += `M${P(r, a)}L${P(r - l, a)}`; }
    return `<path class="s" d="${d}" stroke-width="${w}" opacity="${op}"/>`;
  };
  let coils = "", bolts = "", spokes = "";
  for (let i = 0; i < 10; i++) {
    const a0 = i * 36 - 90 + 4, a1 = a0 + 28;
    coils += arc(152, a0, a1, "coil-body", 56) + arc(152, a0 + 0.6, a1 - 0.6, "coil-wire", 50, 'stroke-dasharray="0.9 1.9"') +
      arc(181, a0, a1, "coil-edge", 1.4) + arc(123, a0, a1, "coil-edge", 1.4);
    spokes += `<path class="spoke" d="M${P(118, a0 - 4)}L${P(186, a0 - 4)}" stroke-width="5"/>`;
  }
  for (let i = 0; i < 12; i++) bolts += `<circle class="bolt" cx="${(Math.cos(i * Math.PI / 6) * 199).toFixed(2)}" cy="${(Math.sin(i * Math.PI / 6) * 199).toFixed(2)}" r="3.2"/>`;
  return `<svg viewBox="-250 -250 500 500" aria-hidden="true">
    <defs>
      <radialGradient id="bleed${n}"><stop offset=".45" stop-color="#9ff7ff" stop-opacity=".9"/><stop offset=".75" stop-color="#00e1ff" stop-opacity=".45"/><stop offset="1" stop-color="#00e1ff" stop-opacity="0"/></radialGradient>
      <radialGradient id="bleedA${n}"><stop offset=".45" stop-color="#ffe3ad" stop-opacity=".9"/><stop offset=".75" stop-color="#ffb12a" stop-opacity=".45"/><stop offset="1" stop-color="#ffb12a" stop-opacity="0"/></radialGradient>
      <radialGradient id="core${n}"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#e6fdff"/><stop offset=".75" stop-color="#7ff3ff" stop-opacity=".85"/><stop offset="1" stop-color="#00c8ff" stop-opacity=".2"/></radialGradient>
      <linearGradient id="metal${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d808a"/><stop offset=".5" stop-color="#1c2a31"/><stop offset="1" stop-color="#55666f"/></linearGradient>
    </defs>
    <!-- HUD-ringen -->
    <g class="rg r1">${ticks(244, 120, 5, 1, .6)}</g>
    <g class="rg r2">${arc(230, 0, 60, "s", 2)}${arc(230, 80, 100, "s", 2, 'opacity=".5"')}${arc(230, 140, 230, "s", 2)}${arc(230, 250, 262, "s", 2, 'opacity=".5"')}${arc(230, 290, 340, "s", 2)}</g>
    <circle class="s" r="219" stroke-width=".6" opacity=".35" stroke-dasharray="1 4"/>
    <!-- lichtgloed achter de spoelen -->
    <circle class="bleed c" r="196" fill="url(#bleed${n})"/>
    <circle class="bleed a" r="196" fill="url(#bleedA${n})"/>
    <!-- behuizing -->
    <circle r="199" fill="none" stroke="url(#metal${n})" stroke-width="16"/>
    <circle r="207" fill="none" stroke="#9fb7c2" stroke-width=".8" opacity=".6"/>
    <circle r="191" fill="none" stroke="#0b1418" stroke-width="2"/>
    ${bolts}
    <!-- spoelen -->
    <g class="coils">${spokes}${coils}</g>
    <!-- binnenring en kern -->
    <circle r="114" fill="none" stroke="url(#metal${n})" stroke-width="12"/>
    <circle r="107" fill="none" stroke="#bff6ff" stroke-width="1" opacity=".7"/>
    <circle class="core" r="104" fill="url(#core${n})"/>
    <circle r="74" fill="none" stroke="#ffffff" stroke-width="1.2" opacity=".55"/>
    <circle r="46" fill="none" stroke="#ffffff" stroke-width="2" opacity=".35"/>
    <g class="rg r6">${arc(90, 0, 70, "s", 1.5, 'opacity=".6"')}${arc(90, 180, 250, "s", 1.5, 'opacity=".6"')}</g>
  </svg>`;
}
document.querySelectorAll("[data-reactor]").forEach((el, n) => { el.innerHTML = reactorSVG(n); });

// ---------- Audiovisualisatie rond de reactor ----------
const viz = $("viz"), vctx = viz.getContext("2d");
const BARS = 128;
const levels = new Float32Array(BARS);
let energy = 0, energyTarget = 0;
function bump(v) { energy = Math.min(1, energy + v); }
function sizeViz() {
  const r = viz.getBoundingClientRect(), d = devicePixelRatio || 1;
  viz.width = r.width * d; viz.height = r.height * d;
}
new ResizeObserver(sizeViz).observe(viz);
function drawViz(t) {
  const st = document.body.dataset.state;
  energyTarget = { idle: 0.06, listening: 0.45, thinking: 0.25, speaking: 0.35, error: 0.1 }[st] ?? 0.05;
  // Tijdgebaseerd (niet per beeldje), zodat de balk ook op een trage of zuinige telefoon binnen ~2 s op 0% staat in stand-by.
  const dt = Math.min(1000, t - (drawViz.last ?? t)); drawViz.last = t;
  energy += (energyTarget - energy) * (1 - Math.exp(-dt / 400));
  const w = viz.width, h = viz.height, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.41;
  vctx.clearRect(0, 0, w, h);
  const color = st === "listening" ? "255,177,42" : st === "error" ? "255,77,77" : "0,225,255";
  for (let i = 0; i < BARS; i++) {
    const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
    let target;
    if (st === "thinking") target = 0.5 + 0.5 * Math.sin(a * 3 - t / 180);
    else target = Math.random() * (0.4 + 0.6 * Math.abs(Math.sin(a * 2 + t / 900)));
    levels[i] += (target * energy - levels[i]) * 0.25;
    const len = 3 + levels[i] * Math.min(w, h) * 0.085;
    vctx.strokeStyle = `rgba(${color},${Math.min(1, 0.3 + levels[i] * 1.6)})`;
    vctx.lineWidth = Math.max(1.5, w / 300);
    vctx.beginPath();
    vctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    vctx.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len));
    vctx.stroke();
  }
  const pct = Math.round(Math.max(0, Math.min(1, (energy - 0.06) / 0.39)) * 100); // stand-by (0.06) = 0%
  if (pct !== drawViz.pct) { drawViz.pct = pct; $("meterFill").style.width = `${Math.max(3, pct)}%`; $("meterPct").textContent = `${pct}%`; }
  if (!REDUCED) requestAnimationFrame(drawViz);
}

// ---------- Datastroom-uitlezingen naast de reactor ----------
const hex = (n) => Array.from({ length: n }, () => "0123456789ABCDEF"[Math.random() * 16 | 0]).join("");
function readouts() {
  $("roA").textContent = `SYS.${hex(4)}\nMEM ${(40 + Math.random() * 20).toFixed(1)}%\nNRL ${hex(6)}\nΔt ${(Math.random() * 9).toFixed(2)}ms`;
  $("roB").textContent = `${hex(8)}\nFREQ ${(432 + Math.random() * 4).toFixed(2)}Hz\nSYNC ${hex(3)}-${hex(3)}\nLINK ▮▮▮▮▯`;
}

// ---------- Klok en systeemstatus ----------
function clock() {
  const d = new Date();
  const [h, m, s] = d.toLocaleTimeString("nl-NL", { hour12: false, timeZone: "Europe/Amsterdam" }).split(":");
  $("clock").innerHTML = `${h}:${m}<small>:${s}</small>`;
  $("date").textContent = d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
  const up = Math.floor((Date.now() - T0) / 1000);
  $("uptime").textContent = [up / 3600, (up / 60) % 60, up % 60].map((v) => String(Math.floor(v)).padStart(2, "0")).join(":");
  $("stNet").textContent = navigator.onLine ? "ONLINE" : "OFFLINE";
  $("stNet").className = navigator.onLine ? "ok" : "bad";

}
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
function initStatus() {
  const canIn = Rec || (navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  $("stVoice").textContent = canIn ? "IN + UIT" : window.speechSynthesis ? "ALLEEN UIT" : "N.V.T.";
  $("stVoice").className = canIn ? "ok" : "warn";
  navigator.getBattery?.().then((b) => {
    const upd = () => { $("stBat").textContent = `${Math.round(b.level * 100)}%${b.charging ? " ⚡" : ""}`; $("stBat").className = b.level < 0.2 ? "warn" : "ok"; };
    upd(); b.addEventListener("levelchange", upd); b.addEventListener("chargingchange", upd);
  }).catch(() => {});
  if (!navigator.getBattery) $("stBat").textContent = "EXTERN";
}

// ---------- Opstartsequentie ----------
async function boot() {
  let skip = false;
  $("boot").onclick = () => { skip = true; };
  try { if (sessionStorage.getItem("eco-booted")) skip = true; } catch { /* privé-venster */ }
  if (/luister|briefing/i.test(location.hash + location.search)) skip = true; // geopend via Siri/Hé Eco/melding: meteen klaar
  const lines = [
    ["E.C.O. KERNEL v4.2.1 — SEKIBAR SYSTEMS", ""],
    ["Kernmodules laden", "OK"],
    ["Neuraal taalmodel koppelen", "OK"],
    ["Spraakherkenning", Rec ? "OK" : "BEPERKT"],
    ["Spraaksynthese", window.speechSynthesis ? "OK" : "BEPERKT"],
    ["Agenda- en mailinterface", "OK"],
    ["Beveiligde verbinding", location.protocol === "https:" ? "OK" : "LOKAAL"],
    ["Holografische interface", "OK"],
  ];
  const log = $("bootLog");
  for (let i = 0; i < lines.length && !skip; i++) {
    const [label, st] = lines[i];
    const dots = st ? " " + ".".repeat(Math.max(2, 30 - label.length)) + " " : "";
    log.innerHTML += `${label}${dots}${st ? `<span class="${st === "OK" ? "ok" : "warn"}">${st}</span>` : ""}\n`;
    $("bootBar").style.width = `${((i + 1) / lines.length) * 100}%`;
    sfx.tick();
    await new Promise((r) => setTimeout(r, 170 + Math.random() * 160));
  }
  if (!skip) { log.innerHTML += `\n<span class="ok">ALLE SYSTEMEN OPERATIONEEL</span>`; await new Promise((r) => setTimeout(r, 500)); }
  try { sessionStorage.setItem("eco-booted", "1"); } catch { /* geen opslag */ }
  $("boot").classList.add("done");
  setTimeout(() => $("boot").remove(), 700);
}

// ---------- Inloggen ----------
const greeting = () => {
  const h = +new Date().toLocaleString("nl-NL", { hour: "numeric", hour12: false, timeZone: "Europe/Amsterdam" });
  return h < 6 ? "Goedenacht" : h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond";
};
function render(session) {
  $("login").hidden = !!session;
  $("app").hidden = !session;
  if (!session) return;
  $("stUser").textContent = (session.user.email || "").split("@")[0].toUpperCase();
  currentUserId = session.user.id;
  loadMemory();
  locate();
  sizeViz();
  requestAnimationFrame(initLayout);
  loadConversations();
  warm();
  startRooster();
  loadLists();
  loadTimers();
  setTimeout(loadPush, 1500);
  setTimeout(loadSpotify, 1700);
  const briefingNu = /briefing/i.test(location.hash);
  if (!$("messages").children.length && !briefingNu) {
    const text = `${greeting()}, Serkan. Alle systemen zijn operationeel. Waarmee kan ik helpen?`;
    typeCaption(text);
    if (justLoggedIn) { sfx.open(); say(text); }
  }
  justLoggedIn = false;
  if (spNotice) setTimeout(() => typeCaption(spNotice), 600);
  // Geopend vanuit de ochtendmelding (sekibar.nl/#briefing).
  if (briefingNu) briefing();
  // Geopend met sekibar.nl/#luister (Siri-opdracht "Start Eco" of "Hé Eco"): meteen luisteren.
  else if (/luister/i.test(location.hash + location.search)) {
    history.replaceState(null, "", location.pathname);
    autoListen();
  } else if (matchMedia("(min-width: 901px)").matches) $("input").focus();
}
function autoListen() {
  setCaption("Ik luister…", "user");
  setTimeout(() => {
    listen();
    // Wil de browser eerst een tik (iOS), toon dan een grote knop.
    setTimeout(() => { if (!recording && !rec) $("tapTalk").hidden = false; }, 1800);
  }, 400);
}
$("tapTalk").onclick = () => { $("tapTalk").hidden = true; unlockAudio(); unlockSpeech(); listen(); };
// Ochtendbriefing (uit de pushmelding). Zonder tik mag iOS niet praten: dan eerst één grote knop.
function briefing() {
  if (/briefing/i.test(location.hash)) history.replaceState(null, "", location.pathname);
  const go = () => { $("tapBrief").hidden = true; unlockAudio(); unlockSpeech(); ask({ text: "Geef mijn ochtendbriefing" }); };
  if (!$("speak").checked || actx?.state === "running") return go();
  $("tapBrief").hidden = false;
  $("tapBrief").onclick = go;
}
let lastUserId;
sb.auth.onAuthStateChange((_e, session) => {
  if ((session?.user.id ?? null) === lastUserId) return; // tokenverversing negeren
  lastUserId = session?.user.id ?? null;
  render(session);
});

$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const panel = $("loginForm"), msg = $("loginMsg");
  panel.classList.add("scanning"); msg.className = "login-msg"; msg.textContent = "BIOMETRIE ANALYSEREN…";
  sfx.tick();
  const [{ error }] = await Promise.all([
    sb.auth.signInWithPassword({ email: $("email").value, password: $("password").value }),
    new Promise((r) => setTimeout(r, 900)),
  ]);
  panel.classList.remove("scanning");
  if (error) { msg.className = "login-msg err"; msg.textContent = "TOEGANG GEWEIGERD — " + error.message.toUpperCase(); sfx.error(); return; }
  msg.className = "login-msg ok"; msg.textContent = "IDENTITEIT BEVESTIGD";
  justLoggedIn = true;
};
async function logout() {
  stopSpeaking(); closeDrawer();
  await sb.auth.signOut({ scope: "local" }).catch(() => {}); // lokaal: werkt ook als de server weigert
  // Ook lokaal wissen, zodat afmelden altijd lukt, zelfs als de server niet bereikbaar is.
  try { Object.keys(localStorage).filter((k) => k.startsWith("sb-")).forEach((k) => localStorage.removeItem(k)); } catch { /* geen opslag */ }
  lastUserId = null; currentConv = null; $("messages").innerHTML = "";
  render(null);
}
$("logout").onclick = $("logoutTop").onclick = logout;
$("newChat").onclick = () => {
  currentConv = null; $("messages").innerHTML = ""; $("convId").textContent = "—"; markActive();
  typeCaption("Nieuw gesprek gestart. Ik luister."); closeDrawer(); $("input").focus();
};
// Menu (links) op mobiel: knop, ✕, tik op de achtergrond of swipen.
function setDrawer(open) {
  $("leftCol").classList.toggle("open", open);
  document.body.classList.toggle("drawer-open", open);
  $("archiveBtn").setAttribute("aria-expanded", String(open));
}
const closeDrawer = () => setDrawer(false);
$("archiveBtn").onclick = () => setDrawer(!$("leftCol").classList.contains("open"));
$("drawerClose").onclick = closeDrawer;
$("scrim").onclick = closeDrawer;
addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
// Swipen: van links naar rechts opent het menu, terug sluit het. Het menu volgt je vinger.
(() => {
  const left = $("leftCol"), scrim = $("scrim");
  let x0 = 0, y0 = 0, t0 = 0, active = false, decided = false, wasOpen = false, w = 300;
  addEventListener("touchstart", (e) => {
    active = false;
    if (matchMedia("(min-width: 901px)").matches || e.touches.length !== 1 || $("app").hidden || !$("voiceLab").hidden) return;
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
    active = true; decided = false; wasOpen = left.classList.contains("open"); w = left.offsetWidth || 300;
  }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (!active) return;
    const t = e.touches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (!decided) {
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
      decided = true;
      // Alleen een duidelijk horizontale beweging in de goede richting; anders gewoon scrollen.
      if (Math.abs(dx) < Math.abs(dy) * 1.5 || (wasOpen ? dx > 0 : dx < 0)) { active = false; return; }
      document.body.classList.add("drawer-drag");
    }
    const offset = wasOpen ? Math.min(0, dx) : Math.min(0, dx - w);
    left.style.transform = `translateX(${offset}px)`;
    scrim.style.opacity = String(Math.max(0, 1 + offset / w));
    scrim.style.pointerEvents = "none";
  }, { passive: true });
  const end = (e) => {
    if (!active || !decided) { active = false; return; }
    active = false;
    const dx = (e.changedTouches?.[0]?.clientX ?? x0) - x0, v = dx / Math.max(1, Date.now() - t0);
    document.body.classList.remove("drawer-drag");
    left.style.transform = ""; scrim.style.opacity = ""; scrim.style.pointerEvents = "";
    setDrawer(wasOpen ? !(dx < -w * 0.3 || v < -0.35) : (dx > w * 0.3 || v > 0.35));
  };
  addEventListener("touchend", end);
  addEventListener("touchcancel", end);
})();
// Panelen in- en uitklappen (mobiel): tik op de titel. PROFIEL begint ingeklapt.
const COLLAPSE_KEY = "eco-collapsed";
let collapsed;
try { collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY)) ?? ["profiel"]); } catch { collapsed = new Set(["profiel"]); }
for (const p of document.querySelectorAll(".right .panel[data-win]")) {
  if (collapsed.has(p.dataset.win)) p.classList.add("collapsed");
  p.querySelector(":scope > .panel-h > span:first-child")?.addEventListener("click", () => {
    if (matchMedia("(min-width: 901px)").matches) return;
    const on = p.classList.toggle("collapsed");
    on ? collapsed.add(p.dataset.win) : collapsed.delete(p.dataset.win);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed])); } catch { /* geen opslag */ }
  });
}

// ---------- Lijstjes (taken, boodschappen, notities) ----------
const lijstNaam = (t) => t.trim().toLowerCase().replace(/^(de|het|mijn)\s+/, "").replace(/\s*lijst(je)?$/, "").trim().slice(0, 60);
async function loadLists() {
  const sinds = new Date(Date.now() - 12 * 3600000).toISOString(); // afgevinkt: nog even zichtbaar (terugzetten met een tik)
  const { data, error } = await sb.from("ai_items").select("id,lijst,tekst,klaar").or(`klaar.eq.false,klaar_at.gt."${sinds}"`).order("created_at").limit(300);
  const list = $("lsList");
  list.innerHTML = "";
  if (error) { list.innerHTML = `<li class="empty">LIJSTJES WORDEN INGESTELD…</li>`; $("lsCount").textContent = "—"; return; }
  $("lsCount").textContent = String(data.filter((x) => !x.klaar).length);
  if (!data.length) { list.innerHTML = `<li class="empty">LEEG · ZEG BV. "ZET MELK OP MIJN BOODSCHAPPENLIJST"</li>`; return; }
  const per = new Map();
  for (const it of data) (per.get(it.lijst) ?? per.set(it.lijst, []).get(it.lijst)).push(it);
  const namen = [...per.keys()].sort((a, b) => (a === "taken" ? -1 : b === "taken" ? 1 : a.localeCompare(b)));
  for (const naam of namen) {
    const items = per.get(naam);
    const h = document.createElement("li");
    h.className = "ls-h"; h.innerHTML = `<span></span> <i>${items.filter((x) => !x.klaar).length}</i>`;
    h.firstChild.textContent = naam.toUpperCase();
    list.append(h);
    for (const it of items) {
      const li = document.createElement("li");
      li.className = it.klaar ? "done" : "";
      li.innerHTML = `<label><input type="checkbox"><span></span></label><button type="button" title="Verwijderen" aria-label="Verwijderen">✕</button>`;
      li.querySelector("span").textContent = it.tekst;
      const cb = li.querySelector("input");
      cb.checked = it.klaar;
      cb.onchange = async () => {
        li.classList.toggle("done", cb.checked); sfx.tick();
        const { error: e } = await sb.from("ai_items").update({ klaar: cb.checked, klaar_at: cb.checked ? new Date().toISOString() : null }).eq("id", it.id);
        if (e) { typeCaption("Bijwerken mislukt: " + e.message, "err"); loadLists(); return; }
        $("lsCount").textContent = String($("lsList").querySelectorAll("li:not(.ls-h):not(.done)").length);
      };
      li.querySelector("button").onclick = async () => {
        const { error: e } = await sb.from("ai_items").delete().eq("id", it.id);
        if (e) { typeCaption("Verwijderen mislukt: " + e.message, "err"); return; }
        sfx.tick(); loadLists();
      };
      list.append(li);
    }
  }
}
// "boodschappen: melk, brood" → twee punten op de boodschappenlijst; zonder naam op "taken".
$("lsForm").onsubmit = async (e) => {
  e.preventDefault();
  const raw = $("lsInput").value.trim();
  if (!raw || !currentUserId) return;
  const m = /^([\p{L} ]{2,24}):\s*(.+)$/u.exec(raw);
  const lijst = m ? lijstNaam(m[1]) || "taken" : "taken";
  const items = (m ? m[2].split(/\s*,\s*/) : [raw]).map((t) => t.trim().slice(0, 500)).filter(Boolean);
  const { error } = await sb.from("ai_items").insert(items.map((tekst) => ({ user_id: currentUserId, lijst, tekst })));
  if (error) { typeCaption("Toevoegen mislukt: " + error.message, "err"); return; }
  $("lsInput").value = ""; sfx.tick(); loadLists();
};

// ---------- Timers en herinneringen ----------
let timers = [], timerLoop = null;
const duurTekst = (sec) => sec < 90 ? `${Math.round(sec)} seconden` : sec < 5400 ? `${Math.round(sec / 60)} minuten` : `${Math.floor(sec / 3600)} uur${Math.round(sec % 3600 / 60) ? ` en ${Math.round(sec % 3600 / 60)} minuten` : ""}`;
const klokTijd = (ms) => new Date(ms).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
async function loadTimers() {
  const { data, error } = await sb.from("ai_timers").select("id,label,soort,eind,duur_sec").eq("status", "loopt").order("eind").limit(20);
  if (error || !Array.isArray(data)) return;
  const now = Date.now();
  timers = [];
  for (const t of data) {
    const end = Date.parse(t.eind);
    if (now - end > 60000) { // ging af terwijl ECO dicht was (en de klok miste hem): stil afronden en kort melden
      sb.from("ai_timers").update({ status: "klaar" }).eq("id", t.id).eq("status", "loopt").then(() => {});
      typeCaption(`⏰ ${t.label || (t.soort === "herinnering" ? "Herinnering" : "Timer")} ging af om ${klokTijd(end)}.`);
      continue;
    }
    timers.push({ ...t, end });
  }
  renderTimers();
}
function renderTimers() {
  const box = $("timers");
  box.innerHTML = "";
  if (!timers.length) { clearInterval(timerLoop); timerLoop = null; return; }
  for (const t of timers) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "timer-chip"; b.title = `Gaat af om ${klokTijd(t.end)} · tik om te stoppen`;
    b.innerHTML = `<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="tr-bg"/><circle cx="18" cy="18" r="15" class="tr-fg"/></svg><b></b><span></span>`;
    b.querySelector("span").textContent = (t.label || (t.soort === "herinnering" ? `om ${klokTijd(t.end)}` : "timer")).toUpperCase();
    b.onclick = () => stopTimer(t);
    t.el = b; box.append(b);
  }
  tickTimers();
  timerLoop ||= setInterval(tickTimers, 250);
}
const fmtLeft = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};
function tickTimers() {
  const now = Date.now();
  for (const t of [...timers]) {
    const left = t.end - now, total = Math.max(1, (t.duur_sec || 60) * 1000);
    if (t.el) {
      t.el.querySelector("b").textContent = fmtLeft(left);
      t.el.querySelector(".tr-fg").style.strokeDashoffset = String(94.25 * (1 - Math.max(0, Math.min(1, left / total))));
      t.el.classList.toggle("soon", left < 60000);
    }
    if (left <= 0) timerDone(t);
  }
}
async function stopTimer(t) {
  timers = timers.filter((x) => x !== t); renderTimers(); sfx.tick();
  await sb.from("ai_timers").update({ status: "gestopt" }).eq("id", t.id);
  typeCaption(`Timer ${t.label ? `voor ${t.label} ` : ""}gestopt.`);
}
async function timerDone(t) {
  timers = timers.filter((x) => x !== t); renderTimers();
  const tekst = t.soort === "herinnering" ? `Herinnering: ${t.label || "het is tijd"}.` : t.label ? `Je timer voor ${t.label} is klaar.` : `Je timer van ${duurTekst(t.duur_sec || 60)} is klaar.`;
  sfx.alarm();
  typeCaption("⏰ " + tekst);
  if ($("speak").checked && document.body.dataset.state === "idle") setTimeout(() => say(tekst), 2900);
  // Afvinken op de server, zodat de klok geen dubbele melding stuurt. Lukte dat en staat ECO op de achtergrond: zelf een melding.
  const { data } = await sb.from("ai_timers").update({ status: "klaar" }).eq("id", t.id).eq("status", "loopt").select("id");
  if (data?.length && document.hidden && window.Notification?.permission === "granted") {
    navigator.serviceWorker?.getRegistration().then((r) => r?.showNotification(`⏰ ${t.label || "ECO"}`, { body: tekst, tag: `eco-timer-${t.id}`, icon: "icons/icon-192.png" })).catch(() => {});
  }
}

// ---------- Archief ----------
async function loadConversations() {
  const { data } = await sb.from("ai_conversations").select("id,title").order("updated_at", { ascending: false }).limit(100);
  const list = $("convList");
  list.innerHTML = "";
  if (!data?.length) list.innerHTML = `<li class="empty">GEEN OPGESLAGEN SESSIES</li>`;
  for (const c of data ?? []) {
    const li = document.createElement("li");
    li.dataset.id = c.id;
    li.innerHTML = `<span class="conv-title"></span><span class="conv-btns">` +
      `<button type="button" title="Naam wijzigen" aria-label="Naam wijzigen">✎</button>` +
      `<button type="button" title="Verwijderen" aria-label="Verwijderen" class="del">✕</button></span>`;
    li.querySelector(".conv-title").textContent = c.title;
    li.onclick = () => { if (!li.classList.contains("editing")) { openConversation(c.id); closeDrawer(); } };
    const [ren, del] = li.querySelectorAll(".conv-btns button");
    ren.onclick = (e) => { e.stopPropagation(); renameConversation(li, c); };
    del.onclick = (e) => { e.stopPropagation(); deleteConversation(li, c); };
    list.append(li);
  }
  markActive();
}
function renameConversation(li, c) {
  li.classList.add("editing");
  const title = li.querySelector(".conv-title");
  const input = document.createElement("input");
  input.className = "conv-edit"; input.value = c.title; input.maxLength = 80;
  title.replaceWith(input); input.focus(); input.select();
  let done = false;
  const finish = async (save) => {
    if (done) return; done = true;
    const name = input.value.trim();
    input.replaceWith(title); li.classList.remove("editing");
    if (!save || !name || name === c.title) return;
    const { error } = await sb.from("ai_conversations").update({ title: name }).eq("id", c.id);
    if (error) { typeCaption("Naam wijzigen mislukt: " + error.message, "err"); return; }
    c.title = name; title.textContent = name; sfx.tick();
  };
  input.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); };
  input.onblur = () => finish(true);
  input.onclick = (e) => e.stopPropagation();
}
async function deleteConversation(li, c) {
  if (!confirm(`Gesprek "${c.title}" verwijderen? Dit kan niet ongedaan worden.`)) return;
  const { error } = await sb.from("ai_conversations").delete().eq("id", c.id); // berichten gaan mee (cascade)
  if (error) { typeCaption("Verwijderen mislukt: " + error.message, "err"); return; }
  li.remove(); sfx.tick();
  if (currentConv === c.id) { currentConv = null; $("messages").innerHTML = ""; $("convId").textContent = "—"; typeCaption("Gesprek verwijderd."); }
  if (!$("convList").children.length) $("convList").innerHTML = `<li class="empty">GEEN OPGESLAGEN SESSIES</li>`;
}
function markActive() {
  for (const li of $("convList").children) li.classList.toggle("active", li.dataset.id === currentConv);
}
async function openConversation(id) {
  currentConv = id; markActive(); sfx.tick();
  $("convId").textContent = id.slice(0, 8).toUpperCase();
  const { data } = await sb.from("ai_messages").select("role,content,created_at").eq("conversation_id", id).order("id");
  $("messages").innerHTML = "";
  for (const m of data ?? []) entry(m.role, m.content, new Date(m.created_at).toLocaleTimeString("nl-NL", { hour12: false }));
  const last = (data ?? []).filter((m) => m.role === "assistant").pop();
  typeCaption(last ? plain(last.content) : "");
}

// ---------- Locatie en weer ----------
// Locatie (alleen met toestemming) gaat mee met elke vraag, zodat ECO het weer kent; het paneel haalt het weer direct op.
let myLoc = null, wxTimer = null;
const WMO_NL = { 0: "onbewolkt", 1: "overwegend helder", 2: "half bewolkt", 3: "bewolkt", 45: "mist", 48: "rijpmist", 51: "lichte motregen",
  53: "motregen", 55: "motregen", 56: "ijzel", 57: "ijzel", 61: "lichte regen", 63: "regen", 65: "zware regen", 66: "ijsregen", 67: "ijsregen",
  71: "lichte sneeuw", 73: "sneeuw", 75: "zware sneeuw", 77: "sneeuwkorrels", 80: "lichte buien", 81: "buien", 82: "zware buien",
  85: "sneeuwbuien", 86: "sneeuwbuien", 95: "onweer", 96: "onweer met hagel", 99: "onweer met hagel" };
function locate() {
  if (!navigator.geolocation) { $("wxDesc").textContent = "Locatie niet beschikbaar"; return; }
  navigator.geolocation.getCurrentPosition((p) => {
    const first = !myLoc;
    myLoc = { lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) };
    if (first) { lastWarm = 0; warm(); }
    $("wxAllow").hidden = true; loadWeather();
    clearInterval(wxTimer); wxTimer = setInterval(loadWeather, 15 * 60000);
  }, () => { $("wxDesc").textContent = "Locatie staat uit"; $("wxAllow").hidden = false; }, { maximumAge: 10 * 60000, timeout: 15000 });
}
$("wxAllow").onclick = locate;
function careTip(w) {
  const feel = w.current.apparent_temperature, code = w.current.weather_code, uv = w.current.uv_index ?? 0, wind = w.current.wind_speed_10m;
  const rain = Math.max(...w.hourly.precipitation_probability.slice(w._i, w._i + 4));
  const tips = [];
  if (rain >= 50 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82)) tips.push("Neem een paraplu of regenjas mee.");
  if (code >= 71 && code <= 86) tips.push("Het sneeuwt, kleed je warm aan en doe voorzichtig.");
  if (feel <= 5) tips.push("Het is koud: warme jas, en misschien een sjaal.");
  else if (feel <= 12) tips.push("Trek wel een jas aan.");
  else if (feel <= 17) tips.push("Een vest of dunne jas is prettig.");
  else if (feel >= 25) tips.push("Lekker warm, t-shirtweer. Vergeet niet genoeg te drinken.");
  if (uv >= 6) tips.push("De zon is sterk, smeer je in.");
  if (wind >= 40) tips.push("Het waait flink.");
  return tips.slice(0, 2).join(" ");
}
async function loadWeather() {
  if (!myLoc) return;
  try {
    const q = new URLSearchParams({ latitude: myLoc.lat, longitude: myLoc.lon, timezone: "Europe/Amsterdam", forecast_days: 1,
      current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,uv_index", hourly: "precipitation_probability" });
    const [w, place] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${q}`).then((r) => r.json()),
      fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${myLoc.lat}&longitude=${myLoc.lon}&localityLanguage=nl`)
        .then((r) => r.json()).then((j) => j.city || j.locality || "").catch(() => ""),
    ]);
    w._i = Math.max(0, w.hourly.time.findIndex((t) => t >= w.current.time.slice(0, 13)));
    $("wxTemp").textContent = `${Math.round(w.current.temperature_2m)}°`;
    $("wxDesc").textContent = WMO_NL[w.current.weather_code] ?? "";
    $("wxFeel").textContent = `VOELT ALS ${Math.round(w.current.apparent_temperature)}° · WIND ${Math.round(w.current.wind_speed_10m)} KM/U`;
    $("wxPlace").textContent = (place || "HIER").toUpperCase();
    $("wxTip").textContent = careTip(w);
  } catch { $("wxDesc").textContent = "Weer tijdelijk niet beschikbaar"; }
}

// ---------- Rooster: wat ECO op een dag in je agenda's ziet (per bron, ter controle naast Brightspace) ----------
let rsOffset = 0, rsTimer = null;
const rsDate = () => new Date(Date.now() + rsOffset * 86400000);
async function loadRooster() {
  const d = rsDate(), dag = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  $("rsDay").textContent = rsOffset === 0 ? "VANDAAG" : rsOffset === 1 ? "MORGEN" : rsOffset === -1 ? "GISTEREN"
    : d.toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "short" }).toUpperCase();
  const list = $("rsList");
  const li = (cls, text) => { const el = document.createElement("li"); el.className = cls; el.textContent = text; return el; };
  try {
    const data = await callFn({ agenda: dag });
    if (dag !== rsDate().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" })) return; // intussen andere dag gekozen
    const items = [], notes = [];
    for (const [bron, v] of Object.entries(data.bronnen || {})) {
      const events = Array.isArray(v) ? v : v?.afspraken;
      if (!events) { if (v?.fout) notes.push(`${bron}: ${v.fout}`); continue; }
      for (const e of events) items.push({ ...e, bron });
      for (const b of v?.bijzonderheden || []) notes.push(b);
    }
    const hm = (t) => /(\d\d:\d\d)/.exec(t || "")?.[1] || "";
    items.sort((a, b) => hm(a.start).localeCompare(hm(b.start)));
    list.replaceChildren();
    if (data.fout) list.append(li("empty", data.fout));
    else if (!items.length) list.append(li("empty", "Niets gepland"));
    for (const e of items) {
      const el = document.createElement("li");
      if (/^\(vervallen\)/.test(e.titel) || e.soort === "vervalt") el.className = "off";
      if (e.vervangen) el.className = "replaced";
      const time = document.createElement("time");
      time.textContent = /hele dag/.test(e.start) ? "HELE DAG" : `${hm(e.start)}${hm(e.eind) ? "–" + hm(e.eind) : ""}`;
      const title = document.createElement("span");
      title.textContent = e.titel + (e.locatie ? ` · ${e.locatie}` : "");
      const meta = document.createElement("small");
      meta.textContent = String(e.bron).toUpperCase();
      for (const extra of [e.soort, e.afwijking, e.verzet, e.vervangen && "vervangen door planning", e.info && e.bron === "Brightspace-planning" && e.info].filter(Boolean)) {
        const em = document.createElement("em"); em.textContent = ` · ${extra}`; meta.append(em);
      }
      if (e.ruw) el.title = `Ruw uit de link: ${e.ruw}`;
      el.append(time, title, meta);
      list.append(el);
    }
    for (const n of notes) list.append(li("note", n));
  } catch (err) { list.replaceChildren(li("empty", "Rooster niet beschikbaar: " + err.message)); }
}
$("rsPrev").onclick = () => { rsOffset--; loadRooster(); };
$("rsNext").onclick = () => { rsOffset++; loadRooster(); };
$("rsDay").onclick = () => { rsOffset = 0; loadRooster(); };
// Lesplanning uit Brightspace inlezen: screenshots (verkleind tot max 2800 px) of een PDF → Gemini leest de tabel.
const toB64 = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
async function filePart(file) {
  if (file.type === "application/pdf") {
    if (file.size > 8e6) throw new Error(`${file.name} is te groot (max 8 MB)`);
    return { mime: "application/pdf", data: await toB64(file) };
  }
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  return { mime: "image/jpeg", data: await toB64(blob) };
}
async function loadVakken() {
  try {
    const { vakken } = await callFn({ planning: "lijst" });
    const box = $("rsVakken");
    box.replaceChildren(...(vakken || []).map((v) => {
      const el = document.createElement("span");
      el.className = "vak"; el.title = `${v.aantal} activiteiten, t/m ${v.tot}`;
      el.textContent = v.vak;
      const del = document.createElement("button");
      del.type = "button"; del.textContent = "✕"; del.setAttribute("aria-label", `Planning ${v.vak} wissen`);
      del.onclick = async () => {
        if (!confirm(`Planning van "${v.vak}" wissen?`)) return;
        await callFn({ planning: { wis: v.vak } }).catch(() => {});
        loadVakken(); loadRooster();
      };
      el.append(del);
      return el;
    }));
  } catch { /* geen planning */ }
}
$("rsAdd").onclick = () => $("rsFile").click();
$("rsFile").onchange = async (e) => {
  const files = [...e.target.files].slice(0, 6);
  e.target.value = "";
  if (!files.length) return;
  let last = ""; try { last = localStorage.getItem("eco-vak") || ""; } catch { /* geen opslag */ }
  const vak = (prompt("Voor welk vak is deze planning?", last) || "").trim();
  if (!vak) return;
  try { localStorage.setItem("eco-vak", vak); } catch { /* geen opslag */ }
  const note = (t, cls = "note") => { const li = document.createElement("li"); li.className = cls; li.textContent = t; $("rsList").prepend(li); return li; };
  const busy = note(`Planning van ${vak} lezen… dit duurt 20 tot 60 seconden.`);
  $("rsAdd").disabled = true;
  try {
    const parts = await Promise.all(files.map(filePart));
    const r = await callFn({ planning: { vak, files: parts } });
    busy.remove();
    sfx.reply();
    await loadRooster(); loadVakken();
    note(`✓ ${r.aantal} activiteiten van ${vak} ingelezen (${r.van} t/m ${r.tot}). Deze planning gaat voor het rooster.`);
  } catch (err) { busy.textContent = "Planning inlezen mislukt: " + err.message; busy.className = "empty"; }
  finally { $("rsAdd").disabled = false; }
};

// Brightspace-koppeling: status, Rooster-pagina's (worden elke ochtend door GitHub Actions opgehaald) en sessie uploaden.
let bsPages = [];
async function loadBs() {
  try {
    const info = await callFn({ bs: "info" });
    bsPages = info.pages || [];
    const st = info.status, el = $("bsStatus");
    const when = st?.at ? new Date(st.at).toLocaleString("nl-NL", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "";
    el.textContent = !info.gekoppeld ? "niet gekoppeld" : st ? `${st.ok ? "✓" : "⚠"} ${st.tekst}${when ? ` · ${when}` : ""}` : "✓ gekoppeld";
    el.className = info.gekoppeld && st?.ok !== false ? "ok" : "warn";
    $("bsPages").replaceChildren(...bsPages.map((p, i) => {
      const chip = document.createElement("span");
      chip.className = "vak"; chip.title = "Rooster-pagina in Brightspace"; chip.textContent = p.vak;
      const del = document.createElement("button");
      del.type = "button"; del.textContent = "✕"; del.setAttribute("aria-label", `Pagina ${p.vak} weghalen`);
      del.onclick = async () => { await callFn({ bs: { actie: "pages", pages: bsPages.filter((_, j) => j !== i) } }).catch(() => {}); loadBs(); };
      chip.append(del);
      return chip;
    }));
  } catch { $("bsStatus").textContent = "niet beschikbaar"; }
}
$("bsPage").onclick = async () => {
  let vak = (prompt("Stap 1 van 2. Hoe heet het vak? (bv. Water in de Stedelijke Delta)") || "").trim();
  if (!vak) return;
  let url = "";
  if (/^https?:\/\//i.test(vak)) { url = vak; vak = (prompt("Dat was een link. Hoe heet het vak?") || "").trim(); if (!vak) return; }
  else url = (prompt("Stap 2 van 2. Plak de link van de Rooster-pagina van dit vak (open die pagina in Brightspace en kopieer het adres):") || "").trim();
  if (!url) return;
  if (/\/d2l\/home\/?$/i.test(url) || !/\/d2l\/(le|lor)\//i.test(url)) {
    if (!confirm("Dit lijkt de startpagina van Brightspace, niet de Rooster-pagina van een vak. Open in Brightspace het vak → de pagina 'Rooster' en kopieer dát adres. Toch opslaan?")) return;
  }
  try {
    const r = await callFn({ bs: { actie: "pages", pages: [...bsPages, { vak, url }] } });
    if (r.pages.length === bsPages.length) alert("Die link wordt niet herkend: hij moet beginnen met https://brightspace.hhs.nl/");
  } catch (err) { alert("Opslaan mislukt: " + err.message); }
  loadBs();
};
$("bsUpload").onclick = () => $("bsFile").click();
$("bsFile").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const state = JSON.parse(await file.text());
    await callFn({ bs: { actie: "save", state } });
    sfx.reply();
  } catch (err) { alert("Sessie uploaden mislukt: " + err.message); }
  loadBs();
};

function startRooster() { loadRooster(); loadVakken(); loadBs(); clearInterval(rsTimer); rsTimer = setInterval(() => { if (document.visibilityState === "visible") loadRooster(); }, 10 * 60000); }

// ---------- Geheugen (PROFIEL) ----------
async function loadMemory() {
  const { data, error } = await sb.from("ai_memory").select("id,fact").order("created_at", { ascending: false }).limit(200);
  const list = $("memList");
  list.innerHTML = "";
  if (error) { list.innerHTML = `<li class="empty">GEHEUGEN WORDT INGESTELD…</li>`; $("memCount").textContent = "—"; return; }
  $("memCount").textContent = String(data.length);
  if (!data.length) list.innerHTML = `<li class="empty">NOG NIETS ONTHOUDEN · ZEG BV. "ONTHOUD DAT…"</li>`;
  for (const m of data) {
    const li = document.createElement("li");
    li.innerHTML = `<span></span><button type="button" title="Vergeten" aria-label="Vergeten">✕</button>`;
    li.firstChild.textContent = m.fact;
    li.lastChild.onclick = async () => {
      const { error: e } = await sb.from("ai_memory").delete().eq("id", m.id);
      if (e) { typeCaption("Vergeten mislukt: " + e.message, "err"); return; }
      sfx.tick(); loadMemory();
    };
    list.append(li);
  }
}
$("memForm").onsubmit = async (e) => {
  e.preventDefault();
  const fact = $("memInput").value.trim();
  if (!fact || !currentUserId) return;
  const { error } = await sb.from("ai_memory").insert({ user_id: currentUserId, fact });
  if (error) { typeCaption("Onthouden mislukt: " + error.message, "err"); return; }
  $("memInput").value = ""; sfx.tick(); loadMemory();
};

// ---------- Transcript en ondertiteling ----------
function entry(role, text, time = hhmmss()) {
  const div = document.createElement("div");
  div.className = "entry " + role;
  div.innerHTML = `<div class="meta">${role === "user" ? "SERKAN" : "E.C.O."} · ${time}</div><div class="body"></div>`;
  const body = div.lastChild;
  if (role === "assistant") body.innerHTML = md(text);
  else {
    body.textContent = text;
    // Verkeerd verstaan? Tik op je bericht om het te verbeteren en opnieuw te sturen.
    div.title = "Tik om te verbeteren";
    div.onclick = () => { $("input").value = body.textContent; $("input").focus(); $("input").dispatchEvent(new Event("input")); };
  }
  $("messages").append(div);
  $("messages").scrollTop = $("messages").scrollHeight;
  return body;
}
let typeTimer = null;
function typeCaption(text, cls = "") {
  clearInterval(typeTimer);
  const el = $("caption");
  el.className = "caption " + cls;
  if (REDUCED || !text) { el.textContent = text; return; }
  let i = 0;
  el.innerHTML = '<span></span><i class="cursor"></i>';
  const span = el.firstChild;
  const step = Math.max(1, Math.round(text.length / 160));
  typeTimer = setInterval(() => {
    i += step; span.textContent = text.slice(0, i);
    if (i >= text.length) { clearInterval(typeTimer); setTimeout(() => el.querySelector(".cursor")?.remove(), 1200); }
  }, 22);
}

// ---------- Versturen (gestreamd: tekst verschijnt en wordt uitgesproken terwijl ECO nog nadenkt) ----------
$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("chatForm").requestSubmit(); }
});
$("input").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; });

// Stemtags (<short pause>, <chuckle>) zijn voor de stem; in beeld halen we ze weg, ook een half binnengekomen tag.
const VOCAL = /\s*<(?:short pause|long pause|chuckle|laugh|sigh|breath)>\s*/gi;
const TAGS = ["short pause", "long pause", "chuckle", "laugh", "sigh", "breath"];
// Tijdens het streamen kan een tag half binnen zijn ("<short pa"); die tijdelijk verbergen.
const partialTag = (t) => { const m = /<([a-z ]{0,11})$/i.exec(t); return m && TAGS.some((x) => x.startsWith(m[1].toLowerCase())) ? t.slice(0, m.index) : t; };
const visible = (t, streaming = false) => (streaming ? partialTag(t) : t).replace(VOCAL, " ").replace(/ {2,}/g, " ").replace(/ ([.,!?;:])/g, "$1");
// Voor de stem: opmaak weg, stemtags houden (plain() zou de > van de tags weghalen).
const speakable = (t) => t.replace(/```[\s\S]*?```/g, "").replace(/[*_#`]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1").replace(/^\s*>\s?/gm, "").trim();
const TOOL_LABEL = {
  agenda_bekijken: "Agenda bekijken", afspraak_maken: "Afspraak inplannen", weer: "Weer ophalen", web_zoeken: "Op internet zoeken",
  rekenen: "Rekenen", valuta: "Koers ophalen", tijd: "Tijd opzoeken", mail_zoeken: "Mail doorzoeken", mail_lezen: "Mail lezen",
  mail_concept_maken: "Concept schrijven", dagrapport: "Dagrapport lezen", onthouden: "Onthouden", vergeten: "Vergeten", route_plannen: "Route plannen",
  lijst: "Lijstje bijwerken", timer: "Timer zetten", spotify: "Spotify", whatsapp: "WhatsApp klaarzetten", ochtendbriefing: "Briefing maken", gesprekken_beheren: "Archief bijwerken", eco_status: "Status bekijken",
};
function setCaption(text, cls = "") {
  clearInterval(typeTimer);
  const el = $("caption");
  el.className = "caption " + cls;
  el.textContent = text;
}
async function authHeaders(json = true) {
  const { data: { session } } = await sb.auth.getSession();
  return { ...(json ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY };
}
// Server-Sent Events lezen uit een fetch-antwoord.
async function readEvents(res, on) {
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (data) on(JSON.parse(data));
    }
  }
}
// Opwarmen: zet de server alvast klaar (koude start, weer, agenda, dagrapport). Hooguit eens per minuut.
let lastWarm = 0;
async function warm() {
  if (Date.now() - lastWarm < 60000) return;
  lastWarm = Date.now();
  try { fetch(FUNCTION_URL, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ warm: true, loc: myLoc }) }).catch(() => {}); } catch { /* niet ingelogd */ }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !$("app").hidden) { warm(); loadTimers(); loadLists(); } });
$("input").addEventListener("focus", warm); // je gaat typen: server alvast klaarzetten

let turn = 0; // nummer van de lopende vraag; een nieuwe vraag maakt de oude ongeldig
// Stand van de interface, zodat ECO vragen over zichzelf kan beantwoorden.
const uiState = () => ({ stem: $("speak").checked, geluid: $("sfx").checked, gespreksmodus: !!$("convo")?.checked, he_eco: !!$("wake")?.checked,
  versie: $("version").textContent.trim(), scherm: matchMedia("(min-width: 901px)").matches ? "computer" : "telefoon" });
// ECO bedient zijn eigen interface (tool "interface").
function applyUi(ev, afterDone) {
  const set = (id, on) => { const el = $(id); if (el && el.checked !== on) { el.checked = on; el.dispatchEvent(new Event("change")); } };
  if (ev.onderdeel === "stem") { set("speak", ev.aan); if (!ev.aan) stopSpeaking(); }
  else if (ev.onderdeel === "geluid") set("sfx", ev.aan);
  else if (ev.onderdeel === "gespreksmodus") set("convo", ev.aan);
  else if (ev.onderdeel === "he_eco") set("wake", ev.aan);
  else if (ev.onderdeel === "menu") setDrawer(true);
  else if (ev.onderdeel === "nieuw_gesprek") afterDone.push(() => $("newChat").click());
  else if (ev.onderdeel === "archief") afterDone.push(() => loadConversations());
  else if (ev.onderdeel === "lijstjes") loadLists();
  else if (ev.onderdeel === "spotify") { setTimeout(loadSpotify, 4000); setTimeout(loadSpotify, 25000); }
  else if (ev.onderdeel === "timer" || ev.onderdeel === "timers") loadTimers();
}
async function ask({ text = "", audio = null }) {
  const my = ++turn;
  const t0 = performance.now();
  let full = "", body = null, firstText = 0, rendered = false, heardExit = false, heardNothing = false, unsure = false, done = null;
  const afterDone = [];
  stopSpeaking();
  speech.open = true; speech.fromAsk = true;
  let audioAt = 0, modelFirst = null;
  const showLat = () => {
    const parts = [firstText && `TEKST ${(firstText / 1000).toFixed(1)}S${modelFirst != null ? ` (MODEL ${(modelFirst / 1000).toFixed(1)}S)` : ""}`, audioAt && `STEM ${(audioAt / 1000).toFixed(1)}S`].filter(Boolean);
    if (parts.length) $("stLat").textContent = parts.join(" · ");
  };
  speech.onFirstAudio = (ms) => { audioAt = ms - t0; showLat(); };
  setState("thinking"); sfx.send();
  if (text) { entry("user", text); setCaption("› " + text, "user"); }
  else setCaption("Uitschrijven…", "user");
  let streaming = true;
  let final = false; // na het slot geen late (requestAnimationFrame) render meer: die zou de knop eronder wissen
  const render = () => {
    rendered = false;
    if (!body || my !== turn || final) return;
    const shown = visible(full, streaming);
    body.innerHTML = md(shown);
    setCaption(plain(shown));
    $("messages").scrollTop = $("messages").scrollHeight;
  };
  try {
    let res;
    if (audio) {
      const fd = new FormData();
      fd.append("file", audio.blob, `spraak.${audio.ext}`);
      fd.append("chat", "1");
      if (currentConv) fd.append("conversationId", currentConv);
      if (myLoc) { fd.append("lat", myLoc.lat); fd.append("lon", myLoc.lon); }
      fd.append("ui", JSON.stringify(uiState()));
      res = await fetch(FUNCTION_URL, { method: "POST", headers: await authHeaders(false), body: fd });
      if (res.status === 501) { whisper = false; setState("idle"); if (Rec) listenBrowser(); return; }
    } else {
      res = await fetch(FUNCTION_URL, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ conversationId: currentConv, message: text, loc: myLoc, stream: true, ui: uiState() }) });
    }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fout ${res.status}`);
    await readEvents(res, (ev) => {
      if (my !== turn) return;
      if (ev.t === "heard") {
        if (!ev.text) { heardNothing = true; setState("idle"); setCaption("Ik heb niets verstaan.", "user"); speech.open = false; convoNext(false); return; }
        const you = entry("user", ev.text); setCaption("› " + ev.text, "user");
        if (ev.q) you.parentElement.title = `Tik om te verbeteren · zekerheid ${ev.q.logprob} · geen spraak ${ev.q.noSpeech}`;
        if (ev.unsure) {
          // Whisper twijfelt: niet raden, maar vragen om het nog eens te zeggen.
          unsure = true;
          you.parentElement.classList.add("unsure");
          full = "Sorry, dat verstond ik niet goed. Wil je het nog een keer zeggen?";
          body = entry("assistant", full); firstText = performance.now() - t0;
          setCaption(full);
          return;
        }
        heardExit = /^(stop|stoppen|dank je( wel)?|bedankt|dat was (het|alles)|klaar|tot (straks|later|zo)|doei|later)[.!]*$/i.test(ev.text.trim());
        $("stVoice").textContent = "WHISPER";
      } else if (ev.t === "conv") {
        currentConv = ev.id; $("convId").textContent = currentConv.slice(0, 8).toUpperCase();
      } else if (ev.t === "ui") {
        applyUi(ev, afterDone);
      } else if (ev.t === "tool") {
        if (!full) setCaption((TOOL_LABEL[ev.name] || "Bezig") + "…", "tool");
        if (ev.name === "afspraak_maken") setTimeout(loadRooster, 4000);
      } else if (ev.t === "delta") {
        if (!body) { body = entry("assistant", ""); firstText = performance.now() - t0; sfx.reply(); }
        full += ev.text;
        speech.feed(full);
        if (!rendered) { rendered = true; requestAnimationFrame(render); }
      } else if (ev.t === "done") {
        done = ev;
        modelFirst = ev.ms?.first ?? null;
      } else if (ev.t === "error") {
        throw new Error(ev.error);
      }
    });
    if (my !== turn) return;
    if (!done) {
      if (heardNothing) return;
      if (unsure) { setState("idle"); speech.finish(full); return; }
      throw new Error("verbinding viel weg");
    }
    if (!full) full = done.reply || "";
    if (!body) { body = entry("assistant", ""); firstText = performance.now() - t0; }
    streaming = false;
    render();
    final = true;
    if (heardExit) convo.paused = true; // vóór finish(): met de stem uit eindigt de beurt meteen
    speech.finish(full);
    lastLatency = Math.round(performance.now() - t0);
    showLat();
    if (done.model) $("stModel").textContent = done.model.replace(/^openai\/|^gemini-|^claude-/, "").toUpperCase();
    if (done.open) { // Google Maps, WhatsApp of Spotify
      const a = document.createElement("a"), mobiel = matchMedia("(pointer: coarse)").matches;
      a.href = done.open; a.className = "action"; a.textContent = done.openLabel || "▶ OPENEN";
      if (!mobiel) { a.target = "_blank"; a.rel = "noopener"; }
      body.append(a);
      // Eerst laten voorlezen, dan de app openen; op de computer in een nieuw tabblad (ECO blijft open).
      setTimeout(() => { if (my !== turn) return; if (mobiel) location.href = done.openApp || done.open; else window.open(done.open, "_blank", "noopener"); }, 1800);
    }
    if (done.convDeleted) { currentConv = null; $("convId").textContent = "—"; }
    loadConversations();
    if (done.memoryChanged) loadMemory();
    afterDone.forEach((f) => setTimeout(f, 300));
  } catch (err) {
    if (my !== turn) return;
    speech.open = false; speech.fromAsk = false;
    setState("error"); sfx.error();
    setCaption("Storing: " + err.message, "err");
    entry("assistant", "⚠ " + err.message);
    setTimeout(() => document.body.dataset.state === "error" && setState("idle"), 2500);
  }
}
$("chatForm").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("input").value.trim();
  if (!text) return;
  $("input").value = ""; $("input").style.height = "auto"; $("send").disabled = true;
  try { await ask({ text }); } finally {
    $("send").disabled = false;
    if (matchMedia("(min-width: 901px)").matches) $("input").focus();
  }
};

// ---------- Spraak uit ----------
// De server stuurt kale PCM (16-bit mono) terwijl de stem nog wordt gemaakt; Web Audio speelt elk stukje direct af.
// Het eerste stuk (eerste zin) gaat al naar de stem terwijl de rest van het antwoord nog binnenkomt.
const player = new Audio();
player.preload = "auto";
let premiumVoice = true, analyser = null, outNode = null, lastVoiceError = "", voiceGen = 0, pcmEnd = 0;
const pcmSources = new Set();
// 0,1 s stilte als WAV, om de speler te ontgrendelen.
const SILENCE = (() => {
  const n = 800, b = new DataView(new ArrayBuffer(44 + n * 2)), w = (o, t) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); b.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, 8000, true); b.setUint32(28, 16000, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, "data"); b.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
})();
function audioOut() {
  actx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (!outNode) {
    outNode = actx.createGain();
    try { analyser = actx.createAnalyser(); analyser.fftSize = 64; outNode.connect(analyser).connect(actx.destination); }
    catch { analyser = null; outNode.connect(actx.destination); }
  }
  return outNode;
}
// iOS staat afspelen pas toe na een tik: ontgrendel de speler en Web Audio bij de eerste interactie.
function unlockAudio() {
  if (player.dataset.unlocked) return;
  player.dataset.unlocked = "1";
  player.src = SILENCE; player.play().catch(() => {});
  try {
    const out = audioOut();
    actx.resume();
    actx.createMediaElementSource(player).connect(out);
  } catch { /* zonder visualisatie */ }
}
// iOS spreekt pas hardop als de spraak één keer binnen een tik is gestart.
function unlockSpeech() {
  if (!window.speechSynthesis || unlockSpeech.done) return;
  unlockSpeech.done = true;
  const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u);
}
["pointerdown", "keydown", "touchend"].forEach((ev) => addEventListener(ev, () => { unlockAudio(); unlockSpeech(); }, { once: true }));
const freq = new Uint8Array(32);
function voiceLevel() {
  if (document.body.dataset.state !== "speaking") return;
  if (analyser) { analyser.getByteFrequencyData(freq); bump((freq.reduce((a, b) => a + b, 0) / freq.length / 255) * 0.35); }
  requestAnimationFrame(voiceLevel);
}
function speakingNow() {
  if (document.body.dataset.state !== "speaking") { setState("speaking"); voiceLevel(); }
  if (speech.onFirstAudio) { speech.onFirstAudio(performance.now()); speech.onFirstAudio = null; }
}
player.onplay = () => { if (player.src !== SILENCE) speakingNow(); };

async function ttsFetch(text) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 20000);
  const res = await fetch(FUNCTION_URL, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ tts: text, stream: true }), signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
  if (res.status === 501 || res.status === 400) { premiumVoice = false; throw new Error("geen stem ingesteld"); }
  if (!res.ok || !(res.headers.get("content-type") || "").includes("audio")) throw new Error((await res.json().catch(() => ({}))).error || "stem " + res.status);
  return res;
}
// Kale PCM afspelen terwijl hij binnenkomt; elk stukje sluit naadloos aan op het vorige.
async function playPcm(res, gen, item) {
  const rate = +res.headers.get("x-audio-rate") || 24000;
  const out = audioOut();
  if (actx.state !== "running") await Promise.race([actx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 1000))]);
  if (actx.state !== "running") { res.body.cancel().catch(() => {}); throw new Error("audio staat stil (tik eerst op het scherm)"); }
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch { /* oudere Safari */ }
  const reader = res.body.getReader();
  let carry = null;
  for (;;) {
    let stall; // geen nieuwe audio binnen 10 s: stoppen in plaats van eindeloos wachten
    const { value, done } = await Promise.race([reader.read(), new Promise((r) => { stall = setTimeout(() => r({ done: true }), 10000); })]);
    clearTimeout(stall);
    if (done) { reader.cancel().catch(() => {}); break; }
    if (gen !== voiceGen) { reader.cancel().catch(() => {}); return; }
    let bytes = value;
    if (carry !== null) { const b = new Uint8Array(bytes.length + 1); b[0] = carry; b.set(bytes, 1); bytes = b; carry = null; }
    if (bytes.length % 2) { carry = bytes[bytes.length - 1]; bytes = bytes.subarray(0, bytes.length - 1); }
    if (!bytes.length) continue;
    const n = bytes.length / 2, dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const buf = actx.createBuffer(1, n, rate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = dv.getInt16(i * 2, true) / 32768;
    const src = actx.createBufferSource();
    src.buffer = buf; src.connect(out);
    const lead = pcmEnd > actx.currentTime ? 0 : 0.12; // kleine buffer bij de start of na een hapering
    const at = Math.max(actx.currentTime + lead, pcmEnd);
    src.start(at); pcmEnd = at + buf.duration;
    pcmSources.add(src); src.onended = () => pcmSources.delete(src);
    item.played = true;
    speakingNow();
  }
}
// Wacht tot alles is afgespeeld; met een klokdeadline, want een gepauzeerde AudioContext (iOS: telefoontje, Siri) staat stil.
const pcmDone = (gen) => new Promise((r) => {
  const deadline = Date.now() + (actx ? Math.max(0, pcmEnd - actx.currentTime) * 1000 : 0) + 1500;
  const check = () => (gen !== voiceGen || !actx || actx.currentTime >= pcmEnd - 0.02 || Date.now() > deadline
    ? r() : setTimeout(check, Math.max(20, Math.min(250, (pcmEnd - actx.currentTime) * 1000 + 20))));
  check();
});
async function playBlob(res, gen) {
  await pcmDone(gen);
  if (gen !== voiceGen) return;
  const url = URL.createObjectURL(await res.blob());
  player.src = url;
  await new Promise((r) => { player.onended = player.onerror = r; player.play().catch(r); });
  URL.revokeObjectURL(url);
}
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("nl"));
  return vs.find((v) => /xander|frank|male|man|google/i.test(v.name)) || vs[0];
}
function sayBrowser(text, gen) {
  $("stVoice").textContent = "BROWSER (ROBOT)"; $("stVoice").className = "warn"; $("stVoice").title = lastVoiceError || "Geen natuurlijke stem ingesteld";
  if (!window.speechSynthesis) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "nl-NL"; u.rate = 1.04; u.pitch = 0.88;
    const v = pickVoice(); if (v) u.voice = v;
    u.onstart = speakingNow;
    u.onboundary = () => bump(0.5);
    u.onend = u.onerror = () => resolve();
    if (gen !== voiceGen) return resolve();
    speechSynthesis.speak(u);
    setTimeout(() => { if (!speechSynthesis.speaking && !speechSynthesis.pending) resolve(); }, 2500);
  });
}
// Spreekrij voor één antwoord: feed() tijdens het binnenkomen, finish() aan het eind.
// running = de gen (beurt) die nu afspeelt; een oude afspeelronde mag die nooit meer wissen.
const speech = {
  open: false, fromAsk: false, items: [], running: 0, spoken: 0, onFirstAudio: null,
  push(text) {
    const t = speakable(text);
    if (!t || !$("speak").checked) return;
    const item = { text: t, played: false, res: premiumVoice ? ttsFetch(t) : null };
    item.res?.catch(() => {}); // fouten worden bij het afspelen afgehandeld
    this.items.push(item);
    if (this.running !== voiceGen) this.run(voiceGen);
  },
  // Eerste zin(nen) meteen laten inspreken zodra er ~30 tekens met een zinseinde zijn; de rest aan het eind in één keer.
  feed(full) {
    if (this.spoken) return;
    const m = /^[\s\S]{30,}?[.!?…](?=\s)/.exec(full);
    if (m) { this.spoken = m[0].length; this.push(m[0]); }
  },
  finish(full) {
    this.open = false;
    const rest = full.slice(this.spoken);
    this.spoken = full.length;
    if (rest.trim()) this.push(rest);
    if (this.running !== voiceGen && !this.items.length) { const gen = voiceGen; pcmDone(gen).then(() => this.ended(gen)); }
  },
  async run(gen) {
    this.running = gen;
    while (this.items.length && gen === voiceGen) {
      const item = this.items.shift();
      try {
        if (!item.res) throw new Error(lastVoiceError || "browserstem");
        const res = await item.res;
        if (gen !== voiceGen) break;
        const ct = res.headers.get("content-type") || "";
        const v = res.headers.get("x-voice");
        $("stVoice").textContent = (v || (ct.includes("l16") ? "NATUURLIJK" : "ELEVENLABS")).toUpperCase(); $("stVoice").className = "ok";
        if (ct.includes("l16")) await playPcm(res, gen, item); else await playBlob(res, gen);
      } catch (e) {
        if (gen !== voiceGen) break;
        if (item.res) { console.warn("Natuurlijke stem niet beschikbaar:", e.message); lastVoiceError = e.message; }
        if (item.played) continue; // al deels gesproken: niet opnieuw beginnen met de browserstem
        await pcmDone(gen);
        await sayBrowser(plain(visible(item.text)), gen);
      }
    }
    if (this.running !== gen) return; // een nieuwere beurt heeft het overgenomen
    this.running = 0;
    if (gen === voiceGen && !this.open) { await pcmDone(gen); this.ended(gen); }
  },
  ended(gen) {
    if (gen !== voiceGen) return;
    try { if (navigator.audioSession) navigator.audioSession.type = "auto"; } catch { /* oudere Safari */ }
    if (document.body.dataset.state === "speaking" || document.body.dataset.state === "thinking") setState("idle");
    const wasAsk = this.fromAsk;
    this.fromAsk = false;
    if (wasAsk) convoNext(true); // alleen na een echte vraag opnieuw luisteren (niet na begroeting of Stemlab)
  },
};
// Los iets uitspreken (begroeting, Stemlab): eerste zin apart, rest erachteraan.
function say(text) {
  if (!$("speak").checked) { if (document.body.dataset.state !== "error") setState("idle"); return; }
  stopSpeaking();
  speech.open = true;
  speech.feed(text);
  speech.finish(text);
}
function stopSpeaking() {
  voiceGen++;
  speech.items = []; speech.running = 0; speech.spoken = 0; speech.open = false; speech.fromAsk = false; speech.onFirstAudio = null;
  speechSynthesis?.cancel(); player.pause();
  try { if (navigator.audioSession) navigator.audioSession.type = "auto"; } catch { /* oudere Safari */ }
  for (const s of pcmSources) { try { s.stop(); } catch { /* al gestopt */ } }
  pcmSources.clear(); pcmEnd = 0;
}
speechSynthesis?.getVoices();

// ---------- Gespreksmodus: na elk antwoord vanzelf weer luisteren (handsfree) ----------
const convo = { get on() { return $("convo")?.checked; }, paused: false };
try { if ($("convo")) $("convo").checked = localStorage.getItem("eco-convo") === "1"; } catch { /* geen opslag */ }
$("convo")?.addEventListener("change", (e) => {
  try { localStorage.setItem("eco-convo", e.target.checked ? "1" : "0"); } catch { /* geen opslag */ }
  convo.paused = false;
  if (e.target.checked && document.body.dataset.state === "idle") { unlockAudio(); listen(); }
});
function convoNext(answered) {
  if (!convo.on || !whisper && !Rec) return;
  if (convo.paused || !answered) { convo.paused = false; setCaption("Gespreksmodus wacht. Tik op de microfoon om verder te gaan.", "user"); return; }
  setTimeout(() => { if (convo.on && document.body.dataset.state === "idle" && !rec && !recording) listen(); }, 350);
}

// ---------- "Hé Eco": wekwoord zolang ECO open staat (spraakherkenning van de browser) ----------
// Zegt je "Hé Eco" (of "hey echo", "oké eco"), dan luistert ECO met Whisper naar je vraag. Zeg je alles in één adem
// ("Hé Eco, hoe laat begint water?"), dan gaat de rest meteen als vraag naar ECO.
var wakeRec = null, wakeTimer = null, wakeFails = 0;
const WAKE = /(?:^|\b)(?:h[eé]+[jy]?|hoi|hallo|ok[eé]?|yo)[\s,!.]*(?:eco|echo|ecco|eko|ekko|ego|eggo)\b[\s,!.]*(.*)$/i;
const wakeOn = () => !!(Rec && $("wake")?.checked && !$("app").hidden && document.visibilityState === "visible");
function wakeOnState(s) {
  clearTimeout(wakeTimer);
  if (s === "idle") wakeTimer = setTimeout(wakeStart, 700); else wakeStop();
}
function wakeStart() {
  document.body.dataset.wake = wakeOn() ? "on" : "off";
  if (!wakeOn() || wakeRec || rec || recording || document.body.dataset.state !== "idle") return;
  const r = new Rec();
  r.lang = "nl-NL"; r.continuous = true; r.interimResults = false;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const m = WAKE.exec(e.results[i][0].transcript.trim());
      if (m) { wakeFails = 0; wakeHit(m[1].trim()); return; }
    }
  };
  r.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      $("wake").checked = false; document.body.dataset.wake = "off";
      setCaption("Hé Eco heeft toegang tot de microfoon nodig.", "err");
    } else if (e.error !== "no-speech" && e.error !== "aborted") wakeFails++;
  };
  r.onend = () => {
    if (wakeRec !== r) return;
    wakeRec = null;
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(wakeStart, Math.min(8000, 300 + wakeFails * 1500)); // blijven luisteren, rustiger na fouten
  };
  try { r.start(); wakeRec = r; } catch { /* al bezig */ }
}
function wakeStop() {
  clearTimeout(wakeTimer);
  const r = wakeRec; wakeRec = null;
  try { r?.abort(); } catch { /* al gestopt */ }
}
function wakeHit(rest) {
  wakeStop();
  sfx.listen();
  if (rest.replace(/[^a-zà-ÿ0-9]/gi, "").length > 3) { setCaption("› " + rest, "user"); ask({ text: rest }); }
  else listen();
}
if (!Rec && $("wakeSwitch")) $("wakeSwitch").hidden = true;
try { if ($("wake")) $("wake").checked = localStorage.getItem("eco-wake") === "1"; } catch { /* geen opslag */ }
$("wake")?.addEventListener("change", (e) => {
  try { localStorage.setItem("eco-wake", e.target.checked ? "1" : "0"); } catch { /* geen opslag */ }
  if (e.target.checked) { unlockAudio(); wakeStart(); setCaption("Zeg \"Hé Eco\" als je iets wilt vragen.", "user"); }
  else { wakeStop(); document.body.dataset.wake = "off"; }
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") wakeStart(); else wakeStop(); });

// ---------- Spraak in ----------
// Voorkeur: opnemen en laten uitschrijven door Whisper (Groq) via de Edge Function — verstaat Nederlands
// veel beter. Stopt vanzelf na een korte stilte. Terugval: de spraakherkenning van de browser.
const CAN_RECORD = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
let whisper = CAN_RECORD, rec = null, recording = null;
if (!CAN_RECORD && !Rec) $("mic").hidden = true;

function listen() {
  if (rec || recording) return;
  wakeStop(); $("tapTalk").hidden = true;
  stopSpeaking(); turn++;
  warm();
  if (whisper) recordWhisper(); else listenBrowser();
}
function stopListening() {
  if (recording) recording.stop();
  else if (rec) rec.stop();
}
function micOn(on) {
  $("mic").classList.toggle("on", on);
  if (on) { setState("listening"); sfx.listen(); typeCaption("Ik luister…", "user"); }
  else if (document.body.dataset.state === "listening") setState("idle");
}

async function recordWhisper() {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { typeCaption("Geen toegang tot de microfoon: " + e.message, "err"); return; }
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
  const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const parts = [];
  mr.ondataavailable = (e) => e.data.size && parts.push(e.data);

  // Stiltedetectie op het echte microfoonsignaal (ook voor de visualisatie).
  let ctx, an, raf, spoke = false, quietSince = 0;
  const started = Date.now();
  try {
    ctx = actx || (actx = new (window.AudioContext || window.webkitAudioContext)());
    ctx.resume();
    an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
  } catch { an = null; }
  // Drempel past zich aan het achtergrondgeluid aan (eerste ~0,4 s). Na 1,3 s stilte is de vraag klaar
  // (na een langere zin 1,1 s); pauzes binnen een zin zijn korter dan dat.
  const buf = new Float32Array(512);
  const MAX_MS = 120000, NO_SPEECH_MS = 8000;
  let spokeSince = 0;
  let floor = 0, floorN = 0;
  const watch = () => {
    if (mr.state !== "recording") return;
    const now = Date.now();
    if (an) {
      an.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length);
      bump(Math.min(0.6, rms * 8));
      // Achtergrondniveau = laagste niveau in de eerste 0,4 s (ook als je meteen begint te praten), met een plafond.
      if (now - started < 400) { floor = floorN++ ? Math.min(floor, rms) : rms; }
      else {
        const threshold = Math.min(0.03, Math.max(0.006, floor * 2.5));
        if (rms > threshold) { if (!spoke) spokeSince = now; spoke = true; quietSince = 0; }
        else if (spoke) { quietSince ||= now; if (now - quietSince > (quietSince - spokeSince > 4000 ? 1100 : 1300)) return mr.stop(); }
        if (!spoke && now - started > NO_SPEECH_MS) return mr.stop();   // niets gezegd
      }
    }
    if (now - started > MAX_MS) return mr.stop();                       // maximaal 2 minuten
    raf = requestAnimationFrame(watch);
  };

  mr.onstop = async () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    recording = null; micOn(false);
    if (an && !spoke) { // niets gezegd of per ongeluk getikt
      if (convo.on) setCaption("Gespreksmodus wacht. Tik op de microfoon om verder te gaan.", "user"); else typeCaption("");
      return;
    }
    const blob = new Blob(parts, { type: mr.mimeType || type || "audio/webm" });
    const ext = /mp4|m4a/.test(blob.type) ? "m4a" : /ogg/.test(blob.type) ? "ogg" : "webm";
    ask({ audio: { blob, ext } }); // uitschrijven en antwoorden in één verzoek
  };
  recording = mr;
  mr.start(250);
  micOn(true);
  watch();
}

function listenBrowser() {
  if (!Rec) return;
  rec = new Rec();
  rec.lang = "nl-NL"; rec.interimResults = true;
  rec.onresult = (e) => {
    const said = [...e.results].map((r) => r[0].transcript).join("");
    $("input").value = said; typeCaption("› " + said, "user"); bump(0.6);
  };
  rec.onend = () => {
    rec = null; micOn(false);
    if ($("input").value.trim()) $("chatForm").requestSubmit();
  };
  rec.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") typeCaption("Microfoon: " + e.error, "err"); };
  micOn(true);
  rec.start();
}
$("mic").onclick = () => (rec || recording ? stopListening() : listen());
// Spatie ingedrukt houden buiten het tekstvak = praten.
addEventListener("keydown", (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target?.isContentEditable;
  if (e.code === "Space" && !typing && !$("app").hidden && $("voiceLab").hidden && !e.repeat) { e.preventDefault(); listen(); }
});
addEventListener("keyup", (e) => { if (e.code === "Space" && (rec || recording)) stopListening(); });

// ---------- Vrije indeling: panelen verplaatsen, schalen en inklappen (alleen desktop) ----------
const LAYOUT_KEY = "eco-layout-v1";
const DESKTOP = matchMedia("(min-width: 901px)");
const hud = $("app");
const wins = [...hud.querySelectorAll("[data-win]")];
const MIN = { kern: [260, 260], cmd: [320, 58] };
const AUTO_H = new Set(["cmd", "bediening", "weer"]); // hoogte volgt de inhoud
let zTop = 10;
const loadLayout = () => { try { return JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch { return {}; } };
const saveLayout = () => {
  const l = {};
  for (const w of wins) l[w.dataset.win] = { x: w.offsetLeft, y: w.offsetTop, w: w.offsetWidth, h: w.offsetHeight, z: +w.style.zIndex || 2, docked: w.classList.contains("docked") ? w.dataset.side : "" };
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)); } catch { /* geen opslag: indeling geldt alleen deze sessie */ }
};
const titleOf = (w) => w.dataset.title || w.querySelector(".panel-h span")?.textContent || w.dataset.win.toUpperCase();

// Knoppen en grepen één keer toevoegen.
for (const w of wins) {
  let head = w.querySelector(":scope > .panel-h");
  if (!head) {
    head = document.createElement("div");
    head.className = "win-h";
    head.innerHTML = w.dataset.win === "cmd" ? `<span class="grip" title="Slepen om te verplaatsen">⋮⋮</span>` : `<span>${titleOf(w)}</span>`;
    w.prepend(head);
  }
  const btns = document.createElement("span");
  btns.className = "win-btns";
  btns.innerHTML = `<button type="button" title="Inklappen naar de zijkant" aria-label="${titleOf(w)} inklappen">–</button>`;
  head.append(btns);
  btns.firstChild.onclick = (e) => { e.stopPropagation(); dock(w); };
  const rs = document.createElement("div");
  rs.className = "win-rs"; rs.title = "Slepen om te vergroten of te verkleinen";
  w.append(rs);
  drag(head, w, "move");
  drag(rs, w, "size");
  w.addEventListener("pointerdown", () => { if (hud.classList.contains("free")) w.style.zIndex = ++zTop; });
}

function place(w, r) {
  w.style.left = r.x + "px"; w.style.top = r.y + "px";
  w.style.width = r.w + "px";
  if (!AUTO_H.has(w.dataset.win)) w.style.height = r.h + "px";
  if (r.z) { w.style.zIndex = r.z; zTop = Math.max(zTop, r.z); }
}
function clamp(w) {
  const top = hud.querySelector(".topbar").offsetHeight + 14;
  const maxX = hud.clientWidth - 40, maxY = hud.clientHeight - 30;
  w.style.left = Math.min(Math.max(-w.offsetWidth + 60, w.offsetLeft), maxX) + "px";
  // Onderkant binnen beeld houden als het paneel daar past.
  const fitY = hud.clientHeight - w.offsetHeight - 14;
  w.style.top = Math.min(Math.max(top, Math.min(w.offsetTop, fitY >= top ? fitY : maxY)), maxY) + "px";
}
function initLayout() {
  if (!DESKTOP.matches || hud.hidden || hud.classList.contains("free")) return;
  let saved = loadLayout();
  const base = hud.getBoundingClientRect();
  if (wins.some((w) => !saved[w.dataset.win])) saved = {}; // nieuw paneel (bv. LIJSTJES): standaardindeling, anders overlapt het
  // Startposities = de standaardindeling zoals de grid die nu toont.
  const measured = new Map(wins.map((w) => {
    const r = w.getBoundingClientRect();
    return [w, { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }];
  }));
  hud.classList.add("free");
  for (const w of wins) {
    const s = saved[w.dataset.win];
    place(w, s ? s : measured.get(w));
    clamp(w);
    if (s?.docked) dock(w, s.docked, false);
  }
}
function resetLayout() {
  try { localStorage.removeItem(LAYOUT_KEY); } catch { /* niets */ }
  hud.classList.remove("free");
  for (const w of wins) { w.removeAttribute("style"); w.classList.remove("docked"); }
  $("dockL").innerHTML = $("dockR").innerHTML = "";
  requestAnimationFrame(initLayout);
}
$("resetLayout").onclick = resetLayout;

function dock(w, side, save = true) {
  side ||= w.offsetLeft + w.offsetWidth / 2 < hud.clientWidth / 2 ? "l" : "r";
  w.dataset.side = side;
  w.classList.add("docked");
  const tab = document.createElement("button");
  tab.type = "button"; tab.textContent = titleOf(w); tab.title = "Uitklappen";
  tab.onclick = () => { tab.remove(); w.classList.remove("docked"); w.style.zIndex = ++zTop; clamp(w); saveLayout(); sfx.tick(); };
  $(side === "l" ? "dockL" : "dockR").append(tab);
  sfx.tick();
  if (save) saveLayout();
}

function drag(handle, w, mode) {
  handle.addEventListener("pointerdown", (e) => {
    if (!hud.classList.contains("free") || e.button !== 0) return;
    if (mode === "move" && e.target.closest("button, a, input, label")) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, ox = w.offsetLeft, oy = w.offsetTop, ow = w.offsetWidth, oh = w.offsetHeight;
    const [mw, mh] = MIN[w.dataset.win] || [180, 90];
    w.classList.add("dragging"); w.style.zIndex = ++zTop;
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (mode === "move") { w.style.left = ox + dx + "px"; w.style.top = oy + dy + "px"; }
      else {
        w.style.width = Math.max(mw, ow + dx) + "px";
        if (!AUTO_H.has(w.dataset.win)) w.style.height = Math.max(mh, oh + dy) + "px";
      }
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      w.classList.remove("dragging");
      clamp(w); saveLayout();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up, { once: true });
    handle.addEventListener("pointercancel", up, { once: true });
  });
}
DESKTOP.addEventListener("change", () => {
  if (DESKTOP.matches) requestAnimationFrame(initLayout);
  else { hud.classList.remove("free"); for (const w of wins) { w.removeAttribute("style"); w.classList.remove("docked"); } $("dockL").innerHTML = $("dockR").innerHTML = ""; }
});
addEventListener("resize", () => { if (hud.classList.contains("free")) wins.forEach(clamp); });

// ---------- Stemlab: eigen stem ontwerpen via ElevenLabs ----------
const LAB_PRESETS = {
  brits: "A calm, refined British male AI assistant in his forties. Polite, highly intelligent and subtly dry-humoured. Smooth, warm baritone with crisp, precise articulation and an unhurried pace. A faint polished, digital quality, like a sophisticated computer butler. Studio quality, close microphone.",
  nl: "A calm, refined male AI assistant in his forties, native Dutch speaker. Polite, highly intelligent and subtly dry-humoured. Smooth, warm baritone with crisp, precise articulation and an unhurried pace. A faint polished, digital quality, like a sophisticated computer butler. Studio quality, close microphone.",
};
const LAB_TEXT = "Goedenavond, Serkan. Alle systemen zijn operationeel. Je hebt morgen om tien uur een afspraak bij de tandarts. Zal ik de route alvast klaarzetten?";
async function callFn(payload) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fout ${res.status}`);
  return data;
}
// ---------- Ochtendbriefing: pushmelding op je telefoon ----------
const pushMsg = (t, cls = "") => { $("pushMsg").className = "login-msg push-msg " + cls; $("pushMsg").textContent = t; };
const b64uBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const pushOk = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
async function currentSub() {
  if (!pushOk()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg && /\/eco-sw\.js$/.test((reg.active || reg.waiting || reg.installing)?.scriptURL || "") ? await reg.pushManager.getSubscription() : null;
}
async function loadPush() {
  const [st, sub] = await Promise.all([callFn({ push: "status" }).catch(() => null), currentSub().catch(() => null)]);
  if (st?.tijd) $("pushTime").value = st.tijd;
  const on = !!(sub && st?.aan && Notification.permission === "granted");
  $("pushBtn").textContent = on ? "MELDINGEN AAN" : "MELDINGEN UIT";
  $("pushBtn").dataset.on = on ? "1" : "";
  $("pushBtn").title = on ? "Tik om de meldingen op dit apparaat uit te zetten" : "Tik om elke ochtend een melding te krijgen als je briefing klaarstaat";
}
$("pushBtn").onclick = async () => {
  if ($("pushBtn").dataset.on) {
    const sub = await currentSub().catch(() => null);
    await sub?.unsubscribe().catch(() => {});
    await callFn({ push: { actie: "stop", endpoint: sub?.endpoint || "" } }).catch(() => {});
    pushMsg("Meldingen op dit apparaat staan uit.");
    return loadPush();
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (!pushOk()) {
    return pushMsg(ios && !standalone ? "Op iPhone: tik in Safari op Delen → Zet op beginscherm, open ECO vanaf je beginscherm en tik dan hier opnieuw." : "Deze browser ondersteunt geen meldingen.", "err");
  }
  try {
    pushMsg("Toestemming vragen…");
    const perm = await Notification.requestPermission(); // moet direct in de tik (iOS)
    if (perm !== "granted") return pushMsg(ios ? "Geen toestemming. Zet meldingen voor ECO aan via Instellingen → Meldingen → ECO." : "Geen toestemming voor meldingen.", "err");
    const reg = await navigator.serviceWorker.register("eco-sw.js");
    await navigator.serviceWorker.ready;
    const { publicKey } = await callFn({ push: "sleutel" });
    let sub = await reg.pushManager.getSubscription();
    if (sub && b64uBytes(publicKey).join() !== new Uint8Array(sub.options?.applicationServerKey || []).join()) { await sub.unsubscribe().catch(() => {}); sub = null; }
    sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(publicKey) });
    const tijd = $("pushTime").value || "07:30";
    await callFn({ push: { actie: "abonneer", sub: sub.toJSON(), tijd } });
    const t = await callFn({ push: { actie: "test" } });
    if (t.verstuurd) pushMsg(`Aan. Elke ochtend om ${tijd} je briefing; er komt nu een testmelding.`, "ok");
    else pushMsg(`Aangemeld, maar de testmelding lukte niet: ${(t.fouten || [t.fout]).filter(Boolean).join("; ")}`, "err");
  } catch (e) { pushMsg("Meldingen aanzetten mislukt: " + e.message, "err"); }
  loadPush();
};
$("pushTime").onchange = () => {
  if (!/^\d{2}:\d{2}$/.test($("pushTime").value)) return;
  callFn({ push: { actie: "instellen", tijd: $("pushTime").value } }).then((r) => pushMsg(`Briefing elke ochtend om ${r.tijd}.`, "ok")).catch((e) => pushMsg(e.message, "err"));
};

// ---------- Spotify koppelen (PKCE; alleen een Client ID nodig, geen geheime sleutel) ----------
const spMsg = (t, cls = "") => { $("spMsg").className = "login-msg push-msg " + cls; $("spMsg").textContent = t; };
let spState = null;
async function loadSpotify() {
  const st = await callFn({ spotify: "status" }).catch(() => null);
  if (!st) return;
  spState = st;
  $("spBtn").textContent = st.gekoppeld ? "SPOTIFY GEKOPPELD" : "SPOTIFY KOPPELEN";
  $("spBtn").dataset.on = st.gekoppeld ? "1" : "";
  $("spBtn").title = st.gekoppeld
    ? `${st.naam || "Gekoppeld"}${st.premium === false ? " · zonder Premium opent ECO alleen links" : ""} · tik om te ontkoppelen`
    : "Koppel Spotify zodat ECO muziek kan bedienen (Premium nodig). Zonder koppeling opent ECO Spotify-links.";
  if (st.fout && !st.gekoppeld) spMsg(`Spotify: ${st.fout}. Koppel opnieuw.`, "err");
  else if (st.log?.[0]) spMsg(`Laatst (${new Date(st.log[0].at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}): ${st.log[0].tekst}`, /mislukt|weigerde|niet binnen/.test(st.log[0].tekst) ? "err" : "");
}
$("spBtn").onclick = async () => {
  if ($("spBtn").dataset.on) {
    if (!confirm("Spotify ontkoppelen?")) return;
    await callFn({ spotify: "ontkoppel" }).catch(() => {});
    spMsg("Spotify ontkoppeld.");
    return loadSpotify();
  }
  let clientId;
  if (!spState?.clientId) {
    clientId = prompt(`Client ID van je Spotify-app (developer.spotify.com → Dashboard → je app → Settings).\nZet daar als Redirect URI: ${spState?.redirect || "https://sekibar.nl/"}`);
    if (!clientId) return;
  }
  try {
    spMsg("Naar Spotify…");
    const { url } = await callFn({ spotify: { actie: "start", ...(clientId ? { clientId: clientId.trim() } : {}) } });
    location.href = url;
  } catch (e) { spMsg(e.message, "err"); }
};

const labMsg = (t, cls = "") => { $("labMsg").className = "login-msg " + cls; $("labMsg").textContent = t; };
let labAudio = null;
const GEM_STYLES = {
  natuurlijk: "a warm, natural and friendly human personal assistant speaking fluent, native Dutch. Conversational and relaxed, with natural intonation, small pauses and genuine warmth; confident and calm, never robotic or monotone",
  butler: "a calm, refined British-sounding personal butler speaking Dutch: composed, intelligent, subtly dry-humoured, warm and human, unhurried natural pace, never robotic",
  energiek: "an upbeat, friendly and lively human personal assistant speaking native Dutch: cheerful, expressive, natural rhythm, smiling voice",
};
const GEM_STYLE = GEM_STYLES.natuurlijk;
const gemMsg = (t, cls = "") => { $("gemMsg").className = "login-msg " + cls; $("gemMsg").textContent = t; };
$("labOpen").onclick = () => {
  closeDrawer();
  if (!$("gemStyle").value) $("gemStyle").value = GEM_STYLE;
  callFn({ voice: "status" }).then((st) => {
    if (st.geminiVoice) $("gemVoice").value = st.geminiVoice;
    if (st.geminiStyle) $("gemStyle").value = st.geminiStyle;
    gemMsg(st.tts === "gemini" ? `Actief: Gemini-stem ${st.geminiVoice || "Charon"}.` : st.tts === "elevenlabs" ? "Actief: ElevenLabs-stem." : "");
  }).catch(() => {});
  if (!$("labDesc").value) $("labDesc").value = LAB_PRESETS.brits;
  if (!$("labText").value) $("labText").value = LAB_TEXT;
  $("voiceLab").hidden = false; labMsg("");
};
const closeLab = () => { $("voiceLab").hidden = true; labAudio?.pause(); };
$("labClose").onclick = closeLab;
$("voiceLab").addEventListener("click", (e) => { if (e.target === $("voiceLab")) closeLab(); });
document.querySelectorAll("[data-preset]").forEach((b) => { b.onclick = () => { $("labDesc").value = LAB_PRESETS[b.dataset.preset]; }; });
$("labForm").onsubmit = async (e) => {
  e.preventDefault();
  $("labGen").disabled = true; $("labPreviews").innerHTML = "";
  labMsg("STEMMEN ONTWERPEN… (kan 10–30 seconden duren)");
  try {
    const { previews } = await callFn({ voice: "design", description: $("labDesc").value, text: $("labText").value });
    if (!previews?.length) throw new Error("geen voorbeelden ontvangen");
    labMsg("Luister en kies je favoriet.", "ok");
    previews.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "lab-item";
      row.innerHTML = `<b>VERSIE ${i + 1}</b><div><button type="button" class="chip">▶ AFSPELEN</button><button type="button" class="btn-primary">GEBRUIK DEZE</button></div>`;
      const [play, use] = row.querySelectorAll("button");
      play.onclick = () => {
        labAudio?.pause();
        document.querySelectorAll(".lab-item").forEach((r) => r.classList.remove("playing"));
        labAudio = new Audio(p.audio); labAudio.play(); row.classList.add("playing");
        labAudio.onended = () => row.classList.remove("playing");
      };
      use.onclick = async () => {
        use.disabled = true; labMsg("STEM OPSLAAN…");
        try {
          await callFn({ voice: "save", generatedVoiceId: p.id, name: "ECO", description: $("labDesc").value });
          premiumVoice = true;
          labMsg("Opgeslagen. ECO gebruikt nu deze stem.", "ok");
          setTimeout(closeLab, 900);
          say("Goedenavond, Serkan. Dit is mijn nieuwe stem. Alle systemen zijn operationeel.");
        } catch (err) { use.disabled = false; labMsg("Opslaan mislukt: " + err.message, "err"); }
      };
      $("labPreviews").append(row);
    });
  } catch (err) {
    labMsg(/paid plan|feature_not_available/i.test(err.message)
      ? "Stemmen maken via ECO vraagt een betaald ElevenLabs-abonnement. Gebruik hieronder een stem-ID (gratis)."
      : "Mislukt: " + err.message, "err");
  } finally { $("labGen").disabled = false; }
};
document.querySelectorAll("[data-gem]").forEach((b) => { b.onclick = () => { $("gemStyle").value = GEM_STYLES[b.dataset.gem]; }; });
$("gemTry").onclick = async () => {
  $("gemTry").disabled = true; gemMsg("STEM GENEREREN…");
  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ tts: $("labText").value || LAB_TEXT, ttsVoice: $("gemVoice").value, ttsStyle: $("gemStyle").value, preview: true }),
    });
    if (!res.ok || !(res.headers.get("content-type") || "").includes("audio")) throw new Error((await res.json().catch(() => ({}))).error || `Fout ${res.status}`);
    labAudio?.pause();
    labAudio = new Audio(URL.createObjectURL(await res.blob()));
    await labAudio.play();
    gemMsg(`Je hoort ${$("gemVoice").value}. Bevalt hij? Klik GEBRUIK GEMINI-STEM.`, "ok");
  } catch (err) { gemMsg("Mislukt: " + err.message, "err"); }
  finally { $("gemTry").disabled = false; }
};
$("gemUse").onclick = async () => {
  try {
    await callFn({ voice: "gemini", ttsVoice: $("gemVoice").value, ttsStyle: $("gemStyle").value });
    premiumVoice = true;
    gemMsg(`Ingesteld: ${$("gemVoice").value}. ECO gebruikt nu deze stem.`, "ok");
    say("Goedenavond, Serkan. Dit is mijn nieuwe stem. Alle systemen zijn operationeel.");
  } catch (err) { gemMsg("Mislukt: " + err.message, "err"); }
};
$("labSet").onclick = async () => {
  const id = $("labVoiceId").value.trim();
  if (!id) { labMsg("Plak eerst een stem-ID.", "err"); return; }
  $("labSet").disabled = true; labMsg("STEM CONTROLEREN…");
  try {
    const { name } = await callFn({ voice: "set", generatedVoiceId: id });
    premiumVoice = true;
    labMsg(`Ingesteld${name ? ": " + name : ""}. ECO gebruikt nu deze stem.`, "ok");
    say("Goedenavond, Serkan. Dit is mijn nieuwe stem. Alle systemen zijn operationeel.");
  } catch (err) { labMsg("Mislukt: " + err.message, "err"); }
  finally { $("labSet").disabled = false; }
};
$("labReset").onclick = async () => {
  try { await callFn({ voice: "reset" }); premiumVoice = true; labMsg("Standaardstem hersteld.", "ok"); }
  catch (err) { labMsg("Mislukt: " + err.message, "err"); }
};

// ---------- Start ----------
$("versionLogin").textContent = $("version").textContent; // volledige PR-badge op het inlogscherm
$("brandVer").textContent = $("version").textContent.split("|")[0].trim(); // klein "PR78" naast E.C.O.
initStatus();
clock(); setInterval(clock, 1000);
readouts(); setInterval(readouts, 1400);
sizeViz(); requestAnimationFrame(drawViz);
boot();
