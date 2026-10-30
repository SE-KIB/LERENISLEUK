// ECO — frontend (holografische HUD). Praat alleen met Supabase; de AI-sleutel staat nooit in de browser.
const SUPABASE_URL = "https://wlpfgbrvnzjclnjocewj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_uzfw5GWuAc7ys44q4DNHsw_r9mDstF9";
// Interne naam (slug) van de Edge Function in Supabase; de weergavenaam daar is "ai-chat".
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/smooth-service`;
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
// Geen plaatjes in antwoorden: een plaatje laadt vanzelf en kan zo gegevens naar buiten sturen (![](https://…?data=…)).
const md = (t) => DOMPurify.sanitize(marked.parse(t), { FORBID_TAGS: ["img", "picture", "source", "video", "audio", "iframe", "form", "input", "style"] });
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

const CAN_RECORD_EARLY = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
// ---------- Toestand ----------
const STATE_LABEL = { idle: "STAND-BY", listening: "LUISTEREN", thinking: "VERWERKEN", speaking: "SPREKEN", error: "STORING" };
function setState(s) {
  document.body.dataset.state = s;
  $("stateLabel").textContent = STATE_LABEL[s];
  wakeOnState(s); // 2× klappen luistert alleen in stand-by, niet terwijl ECO luistert, denkt of praat
  bargeOnState(s); // onderbreken: tijdens het praten luistert ECO of jij ertussen praat
  if (s === "idle") werk?.rust(); // werkmodus: na het antwoord schuift de reactor terug
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

// ---------- Uitlezingen naast de reactor: echte waarden uit de laatste systeemcheck ----------
function readouts() {
  const v = (id) => { const x = lastCheck?.find((i) => i.id === id); return x ? stTxt(x) : "…"; };
  const srv = lastCheck?.find((i) => i.id === "server");
  $("roA").textContent = `SRV  ${!srv ? "…" : srv.ok ? /\d+ ms/.exec(srv.tekst)?.[0] ?? "OK" : "STORING"}\nDB   ${v("database")}\nAI   ${v("taalmodel")}\nDENK ${v("denken")}`;
  $("roB").textContent = `STEM ${v("stem")}\nAGND ${v("agenda")}\nBRSP ${v("brightspace")}\nKLOK ${v("klok")}`;
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

// ---------- Systeemcheck: bij het opstarten echt testen of alles werkt (geen nep-lijstje) ----------
// De server test database, taalmodel, denkwerk, spraak, stem, agenda, Brightspace, Spotify, meldingen, klok en mail;
// hier komen het netwerk, de reactietijd van de server en de microfoontoestemming van dit apparaat erbij.
let sysCheck = null, lastCheck = null; // sysCheck = { at, promise }
const permState = async (name) => { try { return (await navigator.permissions.query({ name })).state; } catch { return ""; } };
const binnen = (ms, msg) => new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));
async function runCheck() {
  const items = [{ id: "netwerk", naam: "Netwerk", ok: navigator.onLine, tekst: navigator.onLine ? "online" : "offline" }];
  const { data: { session } } = await sb.auth.getSession();
  const t = performance.now();
  try {
    if (session) {
      const r = await Promise.race([callFn({ check: true }), binnen(15000, "geen antwoord binnen 15 s")]);
      items.push({ id: "server", naam: "Server", ok: true, tekst: `${Math.round(performance.now() - t)} ms` }, ...(r.onderdelen ?? []));
    } else {
      await Promise.race([fetch(FUNCTION_URL, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY }, body: "{}" }), binnen(10000, "geen antwoord binnen 10 s")]);
      items.push({ id: "server", naam: "Server", ok: true, tekst: `bereikbaar in ${Math.round(performance.now() - t)} ms; log in voor de rest` });
    }
  } catch (e) { items.push({ id: "server", naam: "Server", ok: false, tekst: navigator.onLine ? e.message : "geen internet" }); }
  const mic = await permState("microphone");
  items.push({ id: "microfoon", naam: "Microfoon", ok: mic === "granted" ? true : mic === "denied" ? false : null,
    tekst: { granted: "toegestaan", denied: "geweigerd: zet hem aan in de instellingen", prompt: "vraagt toestemming bij gebruik" }[mic] || "niet uit te lezen op dit apparaat" });
  items.sessie = !!session;
  return items;
}
function startCheck() {
  const promise = runCheck().then((items) => { lastCheck = items; showCheck(items); return items; });
  sysCheck = { at: Date.now(), promise };
  return promise;
}
const stCls = (x) => x.ok === true ? "ok" : x.ok === false ? "bad" : "off";
const stTxt = (x) => x.ok === true ? "OK" : x.ok === false ? "STORING" : "UIT";
function showCheck(items) {
  const actief = items.filter((x) => x.ok !== null), goed = actief.filter((x) => x.ok).length;
  const kapot = items.filter((x) => x.ok === false);
  $("stSys").textContent = `${goed}/${actief.length} OK ▾`;
  $("stSys").className = kapot.length ? "bad" : "ok";
  $("sysLine").textContent = kapot.length ? `STORING: ${kapot.map((x) => x.naam.replace(/ \(.*\)$/, "")).join(", ").toUpperCase()}` : "ALLE SYSTEMEN OPERATIONEEL";
  document.querySelector("#sysTop .dot").className = `dot${kapot.length ? " bad" : ""}`;
  $("sysList").innerHTML = "";
  for (const x of items) {
    if (x.id === "netwerk") continue; // staat al bovenaan in SYSTEEMSTATUS
    const li = document.createElement("li"), s = document.createElement("span"), b = document.createElement("b");
    s.textContent = x.naam.toUpperCase();
    b.textContent = x.ok === true ? x.tekst || "OK" : `${stTxt(x)}${x.tekst ? " · " + x.tekst : ""}`;
    b.className = stCls(x); b.title = x.tekst;
    li.append(s, b); $("sysList").append(li);
  }
  readouts();
}
// Storingen in gewone taal: "Brightspace en de klok werken nu niet goed".
const ZEG = { database: "de database", taalmodel: "het taalmodel", denken: "het denkwerk", spraak: "de spraakherkenning", stem: "de stem", agenda: "de agenda", brightspace: "Brightspace",
  spotify: "Spotify", meldingen: "de meldingen", klok: "de klok", mail: "de mail", netwerk: "het netwerk", server: "de server", microfoon: "de microfoon" };
function storingZin(kapot) {
  const namen = kapot.map((x) => ZEG[x.id] || x.naam);
  return `${namen.length > 1 ? `${namen.slice(0, -1).join(", ")} en ${namen.at(-1)}` : namen[0]} ${namen.length > 1 ? "werken" : "werkt"} nu niet goed`;
}
$("sysRow").onclick = () => { $("sysBox").hidden = !$("sysBox").hidden; };
$("sysAgain").onclick = () => { $("stSys").textContent = "TESTEN…"; $("stSys").className = ""; startCheck(); };
// Terug naar de app na een tijdje (de iPhone opent hem vaak zonder opnieuw te laden): stil opnieuw testen en storingen melden.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !sysCheck || Date.now() - sysCheck.at < 10 * 60000 || $("app").hidden) return;
  startCheck().then((items) => {
    const kapot = items.filter((x) => x.ok === false);
    if (kapot.length && document.body.dataset.state === "idle") typeCaption(`Let op: ${storingZin(kapot)}.`);
  });
});

// ---------- Opstartsequentie: toont de echte systeemcheck ----------
async function boot() {
  let skip = false;
  $("boot").onclick = () => { skip = true; };
  try { if (sessionStorage.getItem("eco-booted")) skip = true; } catch { /* privé-venster */ }
  if (/luister|briefing/i.test(location.hash + location.search)) skip = true; // geopend via Siri/Hé Eco/melding: meteen klaar
  const check = startCheck(); // loopt ook door als het scherm wordt overgeslagen
  const log = $("bootLog"), bar = $("bootBar");
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  if (!skip) {
    log.textContent = "E.C.O. — SEKIBAR SYSTEMS\nAlle systemen testen…\n";
    let p = 4;
    const kruip = setInterval(() => { p = Math.min(88, p + (88 - p) * 0.07); bar.style.width = `${p}%`; }, 120);
    const items = await Promise.race([check, new Promise((r) => { const t = setInterval(() => { if (skip) { clearInterval(t); r(null); } }, 100); })]);
    clearInterval(kruip);
    if (items && !skip) {
      log.textContent = "E.C.O. — SEKIBAR SYSTEMS\n";
      for (let i = 0; i < items.length && !skip; i++) {
        const x = items[i], dots = " " + ".".repeat(Math.max(2, 26 - x.naam.length)) + " ";
        log.innerHTML += `${esc(x.naam)}${dots}<span class="${stCls(x)}">${stTxt(x)}</span>${x.ok === true ? "" : ` <small>${esc(x.tekst)}</small>`}\n`;
        bar.style.width = `${88 + ((i + 1) / items.length) * 12}%`;
        sfx.tick();
        await pause(80);
      }
      const kapot = items.filter((x) => x.ok === false);
      log.innerHTML += kapot.length
        ? `\n<span class="warn">${kapot.length} ${kapot.length === 1 ? "ONDERDEEL" : "ONDERDELEN"} MET STORING — details bij SYSTEEMSTATUS</span>`
        : `\n<span class="ok">ALLE SYSTEMEN OPERATIONEEL</span>`;
      if (!skip) await pause(kapot.length ? 2200 : 700);
    }
  }
  try { sessionStorage.setItem("eco-booted", "1"); } catch { /* geen opslag */ }
  $("boot").classList.add("done");
  setTimeout(() => $("boot").remove(), 700);
}

// Groet op basis van de echte systeemcheck; bij een storing zegt ECO wat er niet werkt.
async function greet(spreek) {
  const wacht = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), 6000))]);
  let items = sysCheck ? await wacht(sysCheck.promise) : null;
  if (!sysCheck || (items && !items.sessie)) items = await wacht(startCheck()); // eerst zonder login getest: nu alles
  if ($("messages").children.length || document.body.dataset.state !== "idle" || spNotice) return; // intussen al iets anders begonnen
  const kapot = (items ?? []).filter((x) => x.ok === false);
  const text = !items ? `${greeting()}, Serkan. De systeemcheck duurt langer dan normaal; ik houd het in de gaten. Waarmee kan ik helpen?`
    : kapot.length ? `${greeting()}, Serkan. Let op: ${storingZin(kapot)}; de rest is operationeel. Waarmee kan ik helpen?`
    : `${greeting()}, Serkan. Alle systemen zijn operationeel. Waarmee kan ik helpen?`;
  typeCaption(text);
  if (spreek) { sfx.open(); say(text); }
  if (!items) sysCheck?.promise.then((later) => {
    const k = later.filter((x) => x.ok === false);
    if (k.length && document.body.dataset.state === "idle") typeCaption(`Let op: ${storingZin(k)}.`);
  });
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
  const briefingNu = /briefing/i.test(location.hash), luisterNu = /luister/i.test(location.hash + location.search);
  const liveNu = !briefingNu && !luisterNu && liveWanted();
  if (!$("messages").children.length && !briefingNu) greet(justLoggedIn && !liveNu);
  justLoggedIn = false;
  if (spNotice) setTimeout(() => typeCaption(spNotice), 600);
  // Geopend vanuit de ochtendmelding (sekibar.nl/#briefing).
  if (briefingNu) briefing();
  // Geopend met sekibar.nl/#luister (Siri-opdracht "Start Eco" of "Hé Eco"): meteen luisteren.
  else if (/luister/i.test(location.hash + location.search)) {
    history.replaceState(null, "", location.pathname);
    autoListen();
  } else if (liveNu) setTimeout(() => liveStart("", true), 900); // Live is de standaard: meteen praten
  else if (matchMedia("(min-width: 901px)").matches) $("input").focus();
}
function autoListen() {
  if (liveWanted()) return void setTimeout(() => liveStart(), 400);
  setCaption("Ik luister…", "user");
  setTimeout(() => {
    listen();
    // Wil de browser eerst een tik (iOS), toon dan een grote knop.
    setTimeout(() => { if (!recording && !rec) $("tapTalk").hidden = false; }, 1800);
  }, 400);
}
$("tapTalk").onclick = () => { $("tapTalk").hidden = true; hervat(); unlockAudio(); unlockSpeech(); if (liveWanted()) liveStart(); else listen(); };
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
// Zoeken: in titels en in de tekst van alle berichten (Nederlandse woordvormen).
let archT = null;
$("archZoek").oninput = () => { clearTimeout(archT); archT = setTimeout(() => loadConversations(), 300); };
async function zoekIds(q) {
  const [m, t] = await Promise.all([
    sb.from("ai_messages").select("conversation_id").textSearch("content", q, { config: "dutch", type: "websearch" }).order("created_at", { ascending: false }).limit(300),
    sb.from("ai_conversations").select("id").ilike("title", `%${q}%`).limit(100),
  ]);
  return [...new Set([...(t.data ?? []).map((x) => x.id), ...(m.data ?? []).map((x) => x.conversation_id)])].slice(0, 100);
}
async function loadConversations() {
  const q = $("archZoek").value.trim();
  let query = sb.from("ai_conversations").select("id,title").order("updated_at", { ascending: false }).limit(100);
  if (q) {
    const ids = await zoekIds(q);
    if (q !== $("archZoek").value.trim()) return; // er is intussen verder getypt
    if (!ids.length) { $("convList").innerHTML = `<li class="empty">NIETS GEVONDEN VOOR "${q.replace(/[<>&"]/g, "").toUpperCase()}"</li>`; return; }
    query = query.in("id", ids);
  }
  const { data } = await query;
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
  }, (e) => {
    // De browser vraagt niet opnieuw als de site eerder geweigerd is; dan helpt alleen het slotje naast het adres.
    $("wxDesc").textContent = e.code === 1 ? "Geblokkeerd: slotje links van het adres → Locatie → Toestaan, dan herladen"
      : e.code === 2 ? "Locatie onbekend: zet locatie aan in je apparaat (Windows: Instellingen → Privacy → Locatie)"
      : "Locatie duurde te lang, probeer opnieuw";
    $("wxAllow").hidden = false;
  }, { maximumAge: 10 * 60000, timeout: 15000 });
}
$("wxAllow").onclick = () => { $("wxDesc").textContent = "Locatie opvragen…"; locate(); };
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
    el.textContent = !info.gekoppeld ? "niet gekoppeld" : st ? `${st.ok && !info.oud ? "✓" : "⚠"} ${st.tekst}${when ? ` · ${when}` : ""}${info.oud ? ` · ${info.oud}` : ""}` : "✓ gekoppeld";
    el.className = info.gekoppeld && st?.ok !== false && !info.oud ? "ok" : "warn";
    el.title = info.klok_start ? `ECO's klok start de robot elke ochtend om 05:30${info.robot?.at ? ` (laatst: ${new Date(info.robot.at).toLocaleString("nl-NL")}${info.robot.ok === false ? `, fout ${info.robot.status}` : ""})` : ""}` : "De robot draait via GitHub (vaak later). Sneller: GITHUB_DISPATCH_TOKEN, zie AI-SETUP.md";
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
// Alleen de naam van de dienst in beeld (GROQ, GEMINI, MISTRAL, CLAUDE), niet het hele model ("openai/gpt-oss-120b").
const dienstNaam = (m) => /^gemini|^models\/gemini/i.test(m) ? "GEMINI" : /^claude/i.test(m) ? "CLAUDE"
  : /^(mistral|magistral|codestral|ministral)/i.test(m) ? "MISTRAL" : "GROQ";
const TOOL_LABEL = {
  agenda_bekijken: "Agenda bekijken", afspraak_maken: "Afspraak inplannen", weer: "Weer ophalen", web_zoeken: "Op internet zoeken",
  rekenen: "Rekenen", valuta: "Koers ophalen", tijd: "Tijd opzoeken", mail_zoeken: "Mail doorzoeken", mail_lezen: "Mail lezen",
  mail_concept_maken: "Concept schrijven", dagrapport: "Dagrapport lezen", onthouden: "Onthouden", vergeten: "Vergeten", route_plannen: "Route plannen",
  lijst: "Lijstje bijwerken", timer: "Timer zetten", spotify: "Spotify", whatsapp: "WhatsApp klaarzetten", ochtendbriefing: "Briefing maken", gesprekken_beheren: "Archief bijwerken", eco_status: "Status bekijken",
  nadenken: "Nadenken", diep_nadenken: "Diep nadenken", archief_zoeken: "Archief doorzoeken", volgen: "Onderwerp volgen", ongedaan_maken: "Ongedaan maken",
  web_lezen: "Pagina lezen", pc: "Laptop bedienen", tv: "Tv bedienen", interface: "Interface aanpassen",
};
// ---------- Werkmodus: zien wat ECO doet ----------
// Gebruikt ECO een tool (zoeken, een pagina lezen, je agenda, de laptop), dan schuift de reactor naar rechtsonder en zie je
// live elke stap: wat hij doet, waarmee, en wat eruit kwam (bronnen, paginatitel, een stukje van de tekst). Na het antwoord
// schuift hij na een paar seconden terug. Alles komt van ECO's eigen server en staat alleen op jouw scherm.
const WERK_ICOON = { web_zoeken: "🔎", web_lezen: "📄", agenda_bekijken: "📅", afspraak_maken: "📅", pc: "💻", spotify: "🎵", tv: "📺",
  weer: "🌦", mail_zoeken: "✉", mail_lezen: "✉", mail_concept_maken: "✉", nadenken: "🧠", diep_nadenken: "🧠", onthouden: "💾",
  vergeten: "🗑", route_plannen: "🧭", rekenen: "🧮", valuta: "💱", lijst: "📝", timer: "⏱", archief_zoeken: "🗂", whatsapp: "💬",
  tijd: "🕒", dagrapport: "📊", ochtendbriefing: "☀", volgen: "👁", ongedaan_maken: "↩", eco_status: "📟", interface: "🎛", gesprekken_beheren: "🗂" };
// Schuift de reactor vloeiend naar zijn nieuwe plek (FLIP): eerst meten, dan veranderen, dan het verschil wegspelen.
function flip(verander) {
  const el = document.querySelector(".main-reactor"), voor = el?.getBoundingClientRect();
  verander();
  if (!el || !voor?.width || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const na = el.getBoundingClientRect();
  if (!na.width) return;
  el.animate([{ transformOrigin: "0 0", transform: `translate(${voor.left - na.left}px,${voor.top - na.top}px) scale(${voor.width / na.width})` },
    { transformOrigin: "0 0", transform: "none" }], { duration: 480, easing: "cubic-bezier(.2,.8,.2,1)" });
}
var werk = {
  kaarten: new Map(), timer: 0, vers: true,
  aan: () => $("werkmodus")?.checked !== false,
  open: () => document.body.dataset.werk === "on",
  beurt() { this.vers = true; clearTimeout(this.timer); if (this.open()) this.sluit(); }, // nieuwe vraag: schone lijst
  start(ev) {
    if (!this.aan() || !$("werk")) return;
    clearTimeout(this.timer);
    if (this.vers) { $("werkLijst").textContent = ""; this.kaarten.clear(); this.vers = false; }
    if (!this.open()) { flip(() => { document.body.dataset.werk = "on"; $("werk").hidden = false; }); rustig(true); }
    const li = document.createElement("li");
    li.className = "werk-stap bezig";
    li.innerHTML = "<i></i><div><b></b><span></span><em></em></div><time></time>";
    li.querySelector("i").textContent = WERK_ICOON[ev.name] || "⚙";
    li.querySelector("b").textContent = TOOL_LABEL[ev.name] || String(ev.name || "Bezig").replace(/_/g, " ");
    li.querySelector("span").textContent = ev.info || "";
    $("werkLijst").append(li);
    this.kaarten.set(ev.id || `${ev.name}-${Date.now()}`, { li, t: performance.now() });
    $("werkLijst").scrollTop = $("werkLijst").scrollHeight;
  },
  klaar(ev) {
    const k = this.kaarten.get(ev.id);
    if (!k) return;
    this.kaarten.delete(ev.id);
    const { li } = k, em = li.querySelector("em");
    li.classList.remove("bezig"); li.classList.add(ev.ok === false ? "mis" : "ok");
    li.querySelector("time").textContent = `${((ev.ms ?? performance.now() - k.t) / 1000).toFixed(1)} s`;
    em.textContent = ev.uit || "";
    if (ev.url && /^https?:\/\//.test(ev.url)) {
      const a = document.createElement("a");
      a.href = ev.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      try { a.textContent = new URL(ev.url).hostname.replace(/^www\./, ""); } catch { a.textContent = "link"; }
      em.append(" · ", a);
    }
    if (ev.bronnen?.length) {
      const ul = document.createElement("ul");
      for (const b of ev.bronnen) ul.appendChild(document.createElement("li")).textContent = b;
      li.querySelector("div").append(ul);
    }
    if (ev.voorbeeld) li.querySelector("div").appendChild(document.createElement("q")).textContent = ev.voorbeeld;
  },
  klaarAlles() { for (const id of [...this.kaarten.keys()]) this.klaar({ id, ok: true }); }, // het antwoord komt: niets meer "bezig"
  rust() { if (this.open()) { this.klaarAlles(); clearTimeout(this.timer); this.timer = setTimeout(() => this.sluit(), 9000); } },
  sluit() {
    clearTimeout(this.timer);
    if (!this.open()) return;
    flip(() => { document.body.dataset.werk = "off"; $("werk").hidden = true; });
    rustig(false);
  },
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
const uiState = () => ({ stem: $("speak").checked, geluid: $("sfx").checked, gespreksmodus: !!$("convo")?.checked, klappen: !!$("klap")?.checked,
  versie: $("version").textContent.trim(), scherm: matchMedia("(min-width: 901px)").matches ? "computer" : "telefoon" });
// ECO bedient zijn eigen interface (tool "interface").
function applyUi(ev, afterDone) {
  const set = (id, on) => { const el = $(id); if (el && el.checked !== on) { el.checked = on; el.dispatchEvent(new Event("change")); } };
  if (ev.onderdeel === "stem") { set("speak", ev.aan); if (!ev.aan) stopSpeaking(); }
  else if (ev.onderdeel === "geluid") set("sfx", ev.aan);
  else if (ev.onderdeel === "gespreksmodus") set("convo", ev.aan);
  else if (ev.onderdeel === "klappen" || ev.onderdeel === "he_eco") set("klap", ev.aan);
  else if (ev.onderdeel === "menu") setDrawer(true);
  else if (ev.onderdeel === "nieuw_gesprek") afterDone.push(() => $("newChat").click());
  else if (ev.onderdeel === "archief") afterDone.push(() => loadConversations());
  else if (ev.onderdeel === "lijstjes") loadLists();
  else if (ev.onderdeel === "spotify") { setTimeout(loadSpotify, 4000); setTimeout(loadSpotify, 25000); }
  else if (ev.onderdeel === "timer" || ev.onderdeel === "timers") loadTimers();
}
async function ask({ text = "", audio = null }) {
  const my = ++turn;
  const imgs = takeFotos(); // foto's die klaarstaan gaan mee met deze vraag (getypt of ingesproken)
  const t0 = performance.now();
  let full = "", body = null, firstText = 0, rendered = false, heardExit = false, heardNothing = false, unsure = false, done = null;
  const afterDone = [];
  stopSpeaking();
  werk.beurt();
  speech.open = true; speech.fromAsk = true;
  let audioAt = 0, modelFirst = null;
  const showLat = () => {
    const parts = [firstText && `TEKST ${(firstText / 1000).toFixed(1)}S${modelFirst != null ? ` (MODEL ${(modelFirst / 1000).toFixed(1)}S)` : ""}`, audioAt && `STEM ${(audioAt / 1000).toFixed(1)}S`].filter(Boolean);
    if (parts.length) $("stLat").textContent = parts.join(" · ");
  };
  speech.onFirstAudio = (ms) => { audioAt = ms - t0; showLat(); };
  setState("thinking"); sfx.send();
  const bijlage = imgs.some((f) => f.mime === "application/pdf") ? "📄 document" : "📷 foto";
  if (text || (imgs.length && !audio)) { fotoThumbs(entry("user", text || bijlage.slice(0, 2)), imgs); setCaption("› " + (text || bijlage), "user"); }
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
      if (imgs.length) fd.append("images", JSON.stringify(imgs.map(({ mime, data }) => ({ mime, data }))));
      res = await fetch(FUNCTION_URL, { method: "POST", headers: await authHeaders(false), body: fd });
      if (res.status === 501) { whisper = false; setState("idle"); if (Rec) listenBrowser(); return; }
    } else {
      res = await fetch(FUNCTION_URL, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ conversationId: currentConv, message: text, loc: myLoc, stream: true, ui: uiState(), ...(imgs.length ? { images: imgs.map(({ mime, data }) => ({ mime, data })) } : {}) }) });
    }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fout ${res.status}`);
    await readEvents(res, (ev) => {
      if (my !== turn) return;
      if (ev.t === "heard") {
        if (!ev.text) { heardNothing = true; setState("idle"); setCaption("Ik heb niets verstaan.", "user"); speech.open = false; convoNext(false); return; }
        if (!imgs.length && isStop(ev.text)) { entry("user", ev.text); stopLuisteren(); return; }
        if (!imgs.length && isEcho(ev.text)) { stopLuisteren("Ik hoorde mezelf terug, dus ik wacht even. Tik op de microfoon om verder te praten (met oortjes gaat het beter)."); return; }
        const you = entry("user", ev.text); setCaption("› " + ev.text, "user");
        fotoThumbs(you, imgs);
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
        heardExit = isStop(ev.text);
        $("stVoice").textContent = "WHISPER";
      } else if (ev.t === "conv") {
        currentConv = ev.id; $("convId").textContent = currentConv.slice(0, 8).toUpperCase();
      } else if (ev.t === "ui") {
        applyUi(ev, afterDone);
      } else if (ev.t === "tool") {
        if (!full) setCaption((TOOL_LABEL[ev.name] || "Bezig") + "…", "tool");
        werk.start(ev);
        if (ev.name === "afspraak_maken") setTimeout(loadRooster, 4000);
      } else if (ev.t === "tool_klaar") {
        werk.klaar(ev);
      } else if (ev.t === "delta") {
        if (!body) { body = entry("assistant", ""); firstText = performance.now() - t0; sfx.reply(); werk.klaarAlles(); }
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
    lastEco = full;
    speech.finish(full);
    lastLatency = Math.round(performance.now() - t0);
    showLat();
    if (done.model) $("stModel").textContent = dienstNaam(done.model);
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
  if (!text && !fotos.length) return;
  $("input").value = ""; $("input").style.height = "auto";
  if (live.on && text && !fotos.length) return liveText(text); // ECO antwoordt hardop in het live gesprek
  $("send").disabled = true;
  try { await ask({ text }); } finally {
    $("send").disabled = false;
    if (matchMedia("(min-width: 901px)").matches) $("input").focus();
  }
};

// ---------- Foto's en PDF's bij een vraag (camera, bibliotheek, bestanden, plakken of slepen) ----------
let fotos = []; // { mime, data, url } of { mime: "application/pdf", data, naam }
const takeFotos = () => { const f = fotos; fotos = []; renderFotos(); return f; };
function fotoThumbs(body, imgs) {
  if (!body || !imgs?.length) return;
  const box = document.createElement("div");
  box.className = "fotos";
  for (const f of imgs) {
    if (f.mime === "application/pdf") { const d = document.createElement("span"); d.className = "doc"; d.textContent = "📄 " + f.naam; box.append(d); continue; }
    const img = document.createElement("img"); img.src = f.url; img.alt = "foto"; box.append(img);
  }
  body.prepend(box);
}
// Verkleinen naar hooguit 1600 px (JPEG): snel te versturen en scherp genoeg voor tekst op een foto.
async function verklein(file, max = 1600) {
  const bron = await createImageBitmap(file).catch(() => new Promise((res, rej) => {
    const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error("onbekend beeldformaat")); img.src = URL.createObjectURL(file);
  }));
  const k = Math.min(1, max / Math.max(bron.width, bron.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bron.width * k)); c.height = Math.max(1, Math.round(bron.height * k));
  c.getContext("2d").drawImage(bron, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.82);
  return { mime: "image/jpeg", data: url.split(",")[1], url };
}
const isPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
async function addFotos(files) {
  for (const f of [...files].filter((f) => f && (f.type.startsWith("image/") || isPdf(f) || /\.(heic|heif)$/i.test(f.name || "")))) {
    if (fotos.length >= 3) { typeCaption("Hooguit drie foto's of PDF's per vraag.", "err"); break; }
    try {
      if (isPdf(f)) {
        if (f.size > 8e6) throw new Error(`${f.name} is te groot (max 8 MB)`);
        fotos.push({ mime: "application/pdf", data: await toB64(f), naam: f.name || "document.pdf" });
      } else fotos.push(await verklein(f));
    } catch (e) { typeCaption((isPdf(f) ? "PDF" : "Foto") + " lezen mislukt: " + e.message, "err"); }
  }
  renderFotos();
  if (fotos.length) { sfx.tick(); if (matchMedia("(min-width: 901px)").matches) $("input").focus(); }
}
function renderFotos() {
  const box = $("fotoChips");
  box.innerHTML = "";
  box.hidden = !fotos.length;
  $("camBtn").classList.toggle("has", fotos.length > 0);
  $("input").placeholder = fotos.some((f) => f.mime === "application/pdf") ? "Vraag iets over het document…" : fotos.length ? "Vraag iets over de foto…" : "Opdracht…";
  fotos.forEach((f, i) => {
    const fig = document.createElement("figure");
    if (f.mime === "application/pdf") {
      fig.className = "pdf";
      fig.title = f.naam;
      fig.innerHTML = `<span>PDF</span><button type="button" aria-label="PDF weghalen">✕</button>`;
    } else {
      fig.innerHTML = `<img alt="foto"><button type="button" aria-label="Foto weghalen">✕</button>`;
      fig.querySelector("img").src = f.url;
    }
    fig.querySelector("button").onclick = () => { fotos.splice(i, 1); renderFotos(); };
    box.append(fig);
  });
}
$("camBtn").onclick = () => $("camFile").click();
$("camFile").onchange = async () => { await addFotos($("camFile").files); $("camFile").value = ""; };
$("input").addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.items ?? [])].filter((i) => i.type.startsWith("image/") || i.type === "application/pdf").map((i) => i.getAsFile());
  if (files.length) { e.preventDefault(); addFotos(files); }
});
$("chatForm").addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); $("chatForm").classList.add("drop"); } });
$("chatForm").addEventListener("dragleave", () => $("chatForm").classList.remove("drop"));
$("chatForm").addEventListener("drop", (e) => { e.preventDefault(); $("chatForm").classList.remove("drop"); addFotos(e.dataTransfer.files); });

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
  try { if (navigator.audioSession) navigator.audioSession.type = bargeOn() ? "play-and-record" : "playback"; } catch { /* oudere Safari */ }
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
  lastEco = text;
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
  try { if (navigator.audioSession && !live?.on) navigator.audioSession.type = "auto"; } catch { /* oudere Safari */ }
  for (const s of pcmSources) { try { s.stop(); } catch { /* al gestopt */ } }
  pcmSources.clear(); pcmEnd = 0;
}
speechSynthesis?.getVoices();

// ---------- "Stop" betekent stop: niet meer luisteren tot je zelf weer op de microfoon tikt ----------
// Herkent ook "oké stop", "stop maar", "laat maar", "dat was het", maar niet "stop de muziek", "bedankt, hoe laat is het" of een vraag.
let luisterPauze = false, lastEco = "";
const woorden = (t) => t.toLowerCase().replace(/[^a-zà-ÿ0-9 ]/g, " ").split(/\s+/).filter(Boolean);
const STOP = "stop|stoppen|hou op|houd op|genoeg|laat maar|klaar|dat was (?:het|alles)|bedankt|dank je(?: wel)?|tot (?:straks|later|zo|morgen)|doei|welterusten|niet meer luisteren|(?:wees|ben) stil|stil maar";
const VUL = new Set("oke oké ok eco echo maar nu even alsjeblieft alstublieft hoor dan ja nee prima goed top super nou he hè hé hey hoi mee met luisteren het is ik ben we zijn wel eh uh".split(" "));
function isStop(t) {
  const z = woorden(t).join(" ");
  if (!z || /\?/.test(t) || !new RegExp(`\\b(?:${STOP})\\b`).test(z)) return false;
  return woorden(z.replace(new RegExp(`\\b(?:${STOP})\\b`, "g"), " ")).every((x) => VUL.has(x)); // niets anders gezegd dan stoppen
}
// Hoort de microfoon ECO zelf terug (speaker zonder oortjes), dan niet daarop antwoorden: anders praat hij tegen zichzelf.
function isEcho(t) {
  const w = woorden(t), eco = new Set(woorden(lastEco));
  return w.length >= 4 && eco.size > 0 && w.filter((x) => eco.has(x)).length / w.length >= 0.7;
}
function stopLuisteren(msg = "Oké, ik stop met luisteren. Tik op de microfoon als je me weer nodig hebt.") {
  luisterPauze = true; convo.paused = false;
  turn++; // een lopende vraag vervalt
  wakeStop(); bargeStop(); stopSpeaking();
  if (rec || recording) stopListening();
  if (live?.on) liveStop();
  setState("idle"); sfx.send();
  setCaption(msg, "user");
}
const hervat = () => { luisterPauze = false; };

// ---------- Gespreksmodus: na elk antwoord vanzelf weer luisteren (handsfree) ----------
const convo = { get on() { return $("convo")?.checked; }, paused: false };
try { if ($("convo")) $("convo").checked = localStorage.getItem("eco-convo") === "1"; } catch { /* geen opslag */ }
try { if ($("werkmodus")) $("werkmodus").checked = localStorage.getItem("eco-werk") !== "0"; } catch { /* geen opslag */ }
$("werkmodus")?.addEventListener("change", (e) => {
  try { localStorage.setItem("eco-werk", e.target.checked ? "1" : "0"); } catch { /* geen opslag */ }
  if (!e.target.checked) werk.sluit();
});
$("werkSluit")?.addEventListener("click", () => werk.sluit());
$("convo")?.addEventListener("change", (e) => {
  try { localStorage.setItem("eco-convo", e.target.checked ? "1" : "0"); } catch { /* geen opslag */ }
  convo.paused = false;
  if (e.target.checked && document.body.dataset.state === "idle") { unlockAudio(); listen(); }
});
function convoNext(answered) {
  if (!convo.on || luisterPauze || !whisper && !Rec) return;
  if (convo.paused || !answered) { convo.paused = false; setCaption("Gespreksmodus wacht. Tik op de microfoon om verder te gaan.", "user"); return; }
  setTimeout(() => { if (convo.on && document.body.dataset.state === "idle" && !rec && !recording) listen(); }, 350);
}

// ---------- 2× klappen: ECO luistert (in plaats van "Hé Eco") ----------
// Zolang ECO open staat en niets doet, staat de microfoon open voor klappen. Dat wordt in de browser zelf herkend: het
// geluid gaat nergens heen. Een klap is een korte, scherpe tik; er moeten er precies twee komen, 0,15 tot 0,8 s na elkaar,
// in de stilte. Eén klap, applaus, praten of muziek tellen niet. Zelfde regels als nova/nova_klap.py (laptop-app).
class KlapDetector {
  constructor(rate) {
    this.n = Math.round(rate * 0.01); this.buf = new Float32Array(this.n); this.i = 0; this.t = 0;
    this.vloer = 0.003; this.vorige = 0; this.laatstHard = -10; this.staart = -10; this.kandidaat = null; this.klappen = [];
  }
  voed(x) { // geeft true op het moment dat er twee keer geklapt is
    let raak = false;
    for (let k = 0; k < x.length; k++) {
      this.buf[this.i++] = x[k];
      if (this.i === this.n) { this.i = 0; if (this.vak(this.buf)) raak = true; }
    }
    return raak;
  }
  vak(v) { // per 10 ms
    this.t += 0.01;
    let som = 0, wissel = 0;
    for (let k = 0; k < v.length; k++) { som += v[k] * v[k]; if (k && (v[k] < 0) !== (v[k - 1] < 0)) wissel++; }
    const rms = Math.sqrt(som / v.length) + 1e-9, zcr = wissel / (v.length - 1), drempel = Math.max(0.02, this.vloer * 6);
    if (this.kandidaat) { // een korte tik (klap) of iets dat blijft (stem, muziek)?
      this.kandidaat.piek = Math.max(this.kandidaat.piek, rms);
      if (rms < this.kandidaat.piek * 0.25) { const begin = this.kandidaat.begin; this.kandidaat = null; this.staart = this.t + 0.15; return this.klap(begin); }
      if (this.t - this.kandidaat.begin > 0.15) { this.kandidaat = null; this.klappen = []; this.laatstHard = this.t; }
    } else if (rms > drempel && rms > this.vorige * 3 && zcr > 0.12) this.kandidaat = { begin: this.t, piek: rms };
    else if (rms > drempel && (this.t > this.staart || rms > this.vorige * 1.2)) this.laatstHard = this.t; // hard maar geen klap (galm telt niet)
    if (this.klappen.length && this.laatstHard > this.klappen[0]) this.klappen = []; // iets anders tussendoor: niet in de stilte
    if (!this.kandidaat && rms < drempel) this.vloer += (Math.min(rms, 0.05) - this.vloer) * 0.02; // achtergrondgeluid volgen
    this.vorige = rms;
    if (this.klappen.length === 2 && !this.kandidaat && this.t - this.klappen[1] >= 0.35) { this.klappen = []; return true; } // geen derde klap
    if (this.klappen.length === 1 && this.t - this.klappen[0] > 0.8) this.klappen = [];
    return false;
  }
  klap(t) {
    if (!this.klappen.length) { if (t - this.laatstHard >= 0.3) this.klappen = [t]; return false; }
    const tussen = t - this.klappen[this.klappen.length - 1];
    if (this.klappen.length === 1 && tussen >= 0.15 && tussen <= 0.8) this.klappen.push(t);
    else { this.klappen = []; this.laatstHard = t; } // te snel, te laat of een derde klap: opnieuw
    return false;
  }
}
var wakeRec = null; // de open microfoon voor de klappen
const klap = { nodes: [], timer: 0, starting: false, gebaar: false };
const KAN_KLAPPEN = !!(navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext));
const wakeOn = () => !!(KAN_KLAPPEN && $("klap")?.checked && !$("app").hidden && document.visibilityState === "visible" && !live?.on && !luisterPauze);
function wakeOnState(s) {
  clearTimeout(klap.timer);
  if (s === "idle") klap.timer = setTimeout(wakeStart, 700); else wakeStop();
}
async function micToegestaan() {
  try { return (await navigator.permissions.query({ name: "microphone" })).state === "granted"; } catch { return false; }
}
async function wakeStart() {
  document.body.dataset.wake = wakeOn() ? "on" : "off";
  if (!wakeOn() || wakeRec || klap.starting || rec || recording || document.body.dataset.state !== "idle") return;
  klap.starting = true;
  let s;
  try {
    if (!klap.gebaar && !(await micToegestaan())) return; // nog geen toestemming: pas vragen na je eerste tik
    // Zonder ruisonderdrukking en automatische versterking: die vlakken juist de scherpe tik van een klap af.
    s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...micVoorkeur() } });
  } catch (e) {
    if (e?.name === "NotAllowedError") { $("klap").checked = false; document.body.dataset.wake = "off"; setCaption("2× klappen heeft toegang tot de microfoon nodig.", "err"); }
    return;
  } finally { klap.starting = false; }
  if (!wakeOn() || wakeRec || rec || recording || document.body.dataset.state !== "idle") { s.getTracks().forEach((t) => t.stop()); return; }
  wakeRec = s;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    actx.resume().catch(() => {});
    const det = new KlapDetector(actx.sampleRate), src = actx.createMediaStreamSource(s), stil = actx.createGain();
    stil.gain.value = 0;
    const frames = (d) => { if (wakeRec === s && det.voed(d)) wakeHit(); };
    let node;
    try {
      liveWorkletUrl ||= URL.createObjectURL(new Blob([LIVE_WORKLET], { type: "application/javascript" }));
      if (!liveWorkletCtx.has(actx)) { await actx.audioWorklet.addModule(liveWorkletUrl); liveWorkletCtx.add(actx); }
      node = new AudioWorkletNode(actx, "eco-mic");
      node.port.onmessage = (e) => frames(e.data);
    } catch { // oudere browsers
      node = actx.createScriptProcessor(2048, 1, 1);
      node.onaudioprocess = (e) => frames(e.inputBuffer.getChannelData(0));
    }
    if (wakeRec !== s) return void node.disconnect();
    src.connect(node); node.connect(stil); stil.connect(actx.destination);
    klap.nodes = [src, node, stil];
  } catch { wakeStop(); }
}
function wakeStop() {
  clearTimeout(klap.timer);
  for (const n of klap.nodes) { try { n.disconnect(); } catch { /* al los */ } }
  klap.nodes = [];
  const s = wakeRec; wakeRec = null;
  s?.getTracks().forEach((t) => t.stop());
}
function wakeHit() {
  wakeStop();
  sfx.listen();
  if (liveWanted()) return liveStart("");
  listen();
}
if (!KAN_KLAPPEN && $("klapSwitch")) $("klapSwitch").hidden = true;
try { // standaard aan op de computer; op de telefoon pas als je hem aanzet (een open microfoon onderbreekt daar andere muziek)
  const k = localStorage.getItem("eco-klap") ?? (localStorage.getItem("eco-wake") === "1" || !matchMedia("(pointer: coarse)").matches ? "1" : "0");
  if ($("klap")) $("klap").checked = k === "1";
} catch { if ($("klap")) $("klap").checked = !matchMedia("(pointer: coarse)").matches; }
$("klap")?.addEventListener("change", (e) => {
  try { localStorage.setItem("eco-klap", e.target.checked ? "1" : "0"); } catch { /* geen opslag */ }
  if (e.target.checked) { klap.gebaar = true; hervat(); unlockAudio(); wakeStart(); setCaption("Klap 2× als je iets wilt vragen.", "user"); }
  else { wakeStop(); document.body.dataset.wake = "off"; }
});
// Na je eerste tik mag de browser de microfoon vragen en geluid verwerken.
addEventListener("pointerdown", () => { klap.gebaar = true; actx?.resume?.().catch(() => {}); setTimeout(wakeStart, 1500); }, { once: true, capture: true });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") wakeStart(); else wakeStop(); });

// ---------- Onderbreken: praat ertussen terwijl ECO praat ----------
// Tijdens het praten luistert ECO mee (met echo-onderdrukking). Klinkt er duidelijk een stem bovenop zijn eigen
// echo, dan stopt hij meteen met praten en neemt hij je vraag op, met dezelfde microfoon (geen nieuwe toestemming).
const bargeOn = () => !!$("barge")?.checked && CAN_RECORD_EARLY && !live?.on;
const barge = { stream: null, src: null, raf: 0, starting: false };
try { if ($("barge")) $("barge").checked = localStorage.getItem("eco-barge") !== "0"; } catch { if ($("barge")) $("barge").checked = true; }
$("barge")?.addEventListener("change", (e) => {
  try { localStorage.setItem("eco-barge", e.target.checked ? "1" : "0"); } catch { /* geen opslag */ }
  if (!e.target.checked) bargeStop();
});
function bargeOnState(s) {
  if (s === "speaking") bargeStart();
  else if (s !== "listening") bargeStop();
}
async function bargeStart() {
  if (!bargeOn() || barge.stream || barge.starting || recording || rec) return;
  barge.starting = true;
  let s;
  try { s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, ...micVoorkeur() } }); }
  catch { barge.starting = false; return; }
  barge.starting = false;
  if (document.body.dataset.state !== "speaking" || !bargeOn()) { s.getTracks().forEach((t) => t.stop()); return; }
  barge.stream = s;
  let an;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    an = actx.createAnalyser(); an.fftSize = 512;
    barge.src = actx.createMediaStreamSource(s); barge.src.connect(an);
  } catch { bargeStop(); return; }
  const buf = new Float32Array(512), t0 = performance.now();
  let echo = 0, over = 0, last = t0;
  const loop = () => {
    if (!barge.stream) return;
    const now = performance.now(), dt = now - last; last = now;
    an.getFloatTimeDomainData(buf);
    const rms = Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length);
    if (now - t0 < 600) echo = Math.max(echo, rms); // eerst leren hoe hard zijn eigen echo binnenkomt
    else {
      const drempel = Math.min(0.15, Math.max(0.022, echo * 2.6));
      if (rms > drempel) { over += dt; if (over > 230) return bargeHit(); }
      else { over = Math.max(0, over - dt * 0.6); echo = Math.max(rms, echo * 0.997); }
    }
    barge.raf = requestAnimationFrame(loop);
  };
  barge.raf = requestAnimationFrame(loop);
}
function bargeStop(keepStream = false) {
  cancelAnimationFrame(barge.raf);
  try { barge.src?.disconnect(); } catch { /* al los */ }
  const s = barge.stream;
  barge.stream = null; barge.src = null;
  if (s && !keepStream) s.getTracks().forEach((t) => t.stop());
  return s;
}
function bargeHit() {
  const s = bargeStop(true);
  if (!s) return;
  listen(s);
}

// ---------- Live-gesprek (Gemini Live): realtime praten, zoals Tony Stark met JARVIS ----------
// De server geeft een tijdelijke toegangscode plus ECO's karakter, geheugen, agenda en tools; daarna praat de browser
// rechtstreeks met Gemini via een WebSocket: microfoon erin (16 kHz), stem eruit (24 kHz), onderbreken kan altijd.
// Tools voert de server uit; elke beurt komt in het archief. Lukt Live niet, dan werkt ECO op de gewone manier.
var live = { on: false, ready: false };
let liveBrokenUntil = 0, liveWorkletUrl = "";
const liveWorkletCtx = new WeakSet();
const LIVE_WORKLET = 'class P extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor("eco-mic",P)';
const liveWanted = () => !!$("live")?.checked && Date.now() > liveBrokenUntil && !!(navigator.mediaDevices?.getUserMedia && window.WebSocket);
try { if ($("live")) $("live").checked = localStorage.getItem("eco-live") !== "0"; } catch { /* geen opslag */ }
$("live")?.addEventListener("change", (e) => {
  try { localStorage.setItem("eco-live", e.target.checked ? "1" : "0"); } catch { /* geen opslag */ }
  liveBrokenUntil = 0;
  if (!e.target.checked && live.on) liveStop("Live staat uit; ik werk weer op de gewone manier.");
});
const b64Bytes = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const liveSend = (msg) => { if (live.ready && live.ws?.readyState === 1) live.ws.send(JSON.stringify(msg)); };

async function liveStart(firstText = "", vanzelf = false) {
  if (live.on) { if (firstText) liveText(firstText); return; }
  const micBezet = !!(wakeRec || barge.stream || rec || recording);
  wakeStop(); bargeStop(); stopSpeaking(); if (rec || recording) stopListening();
  turn++; // een lopende gewone vraag vervalt
  live = { on: true, ready: false, firstText, handle: "", userText: "", ecoText: "", userEl: null, ecoEl: null, lastActivity: Date.now(), tries: 0, cancelled: new Set() };
  $("tapTalk").hidden = true;
  $("mic").classList.add("on", "live");
  setState("thinking"); setCaption("Live verbinden…", "user");
  try {
    // Eerst de audiosessie en dan de microfoon (de sessie wisselen tijdens het opnemen kan de microfoon op stil zetten).
    // Zolang de microfoon opneemt, mag de iPhone ook geluid afspelen.
    try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch { /* oudere Safari */ }
    if (micBezet) await new Promise((r) => setTimeout(r, 350)); // 2× klappen of onderbreken moet de microfoon eerst loslaten
    live.stream = await liveGetMic(liveMicPref());
    audioOut();
    await Promise.race([actx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 800))]);
    if (actx.state !== "running") throw Object.assign(new Error("tik eerst op het scherm"), { tik: true });
    live.cfg = await callFn({ live: "start", loc: myLoc });
    if (!live.on) return;
    await liveConnect();
    await liveMic(live.stream, actx);
    live.idle = setInterval(liveIdle, 5000);
    live.meter = setInterval(liveMeter, 100);
    $("micMeter").hidden = false;
    $("zieBtn").hidden = false;
    setTimeout(liveMicWatch, 2500); // hoort ECO echt iets? Zo niet: andere microfoon
    setState("listening"); sfx.listen();
    $("stVoice").textContent = "LIVE"; $("stVoice").className = "ok";
    $("stModel").textContent = "LIVE";
    setCaption("● LIVE — praat maar, ik luister.", "user");
    if (live.firstText) liveText(live.firstText);
  } catch (e) {
    if (e.tik) { liveStop(); $("tapTalk").textContent = "🎙️ TIK OM LIVE TE PRATEN"; $("tapTalk").hidden = false; return; }
    if (!live.on) return;
    // Geen microfoon (geen toestemming of geen apparaat): dan helpt de gewone manier ook niet.
    if (/NotAllowed|NotFound|NotReadable|Permission|device/i.test(`${e.name} ${e.message}`)) {
      return liveStop(vanzelf ? "Tik op de microfoon om live te praten, of typ je vraag." : "Live heeft de microfoon nodig: geef ECO toestemming in de instellingen, of typ je vraag.", !vanzelf);
    }
    liveBrokenUntil = Date.now() + 10 * 60000; // tien minuten de gewone manier
    liveStop(`Live lukt nu niet (${e.message}); ik luister op de gewone manier.`, true);
    setTimeout(() => listen(), 600);
  }
}

// WebSocket openen (v1beta volgens de documentatie, v1alpha als terugval) en wachten op setupComplete.
function liveConnect() {
  return new Promise((resolve, reject) => {
    const { token, api, setup } = live.cfg;
    const versies = api === "v1alpha" ? ["v1alpha"] : ["v1beta", "v1alpha"];
    const probeer = (i) => {
      const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${versies[i]}.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`);
      ws.binaryType = "arraybuffer";
      let klaar = false;
      const timer = setTimeout(() => { if (!klaar) { try { ws.close(); } catch { /* al dicht */ } } }, 12000);
      ws.onopen = () => ws.send(JSON.stringify({ setup: { ...setup, sessionResumption: live.handle ? { handle: live.handle } : {} } }));
      ws.onmessage = (m) => {
        let msg;
        try { msg = JSON.parse(typeof m.data === "string" ? m.data : new TextDecoder().decode(m.data)); } catch { return; }
        if (msg.setupComplete && !klaar) {
          klaar = true; clearTimeout(timer);
          const oud = live.ws; live.ws = ws; live.ready = true;
          if (oud && oud !== ws) try { oud.close(1000); } catch { /* al dicht */ }
          resolve();
        }
        if (live.ws === ws) liveMessage(msg);
      };
      ws.onclose = (ev) => {
        clearTimeout(timer);
        if (!klaar) return i + 1 < versies.length && ev.code !== 1000 ? probeer(i + 1) : reject(new Error(ev.reason || `verbinding geweigerd (${ev.code})`));
        if (live.ws === ws) liveClosed();
      };
    };
    probeer(0);
  });
}

// Microfoon → 16 kHz PCM in stukjes van 80 ms.
// Microfoon kiezen: eerst je voorkeur of de standaard. Geeft die alleen stilte (bv. Bluetooth in de auto, waar de
// automicrofoon vaak alleen tijdens een echt telefoongesprek open gaat), dan schakelt liveMicWatch naar de iPhone-microfoon.
const MIC_OPTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
const liveMicPref = () => { try { return localStorage.getItem("eco-mic") || ""; } catch { return ""; } };
// Ook de gewone opname (Whisper, onderbreken) gebruikt de microfoon die het laatst werkte, als die er is.
const micVoorkeur = () => { const id = liveMicPref(); return id ? { deviceId: { ideal: id } } : {}; };
async function liveGetMic(deviceId = "") {
  if (deviceId) try { return await navigator.mediaDevices.getUserMedia({ audio: { ...MIC_OPTS, deviceId: { exact: deviceId } } }); } catch { /* weg: de standaard */ }
  return navigator.mediaDevices.getUserMedia({ audio: MIC_OPTS });
}
const micNaam = () => live.stream?.getAudioTracks()[0]?.label || "standaardmicrofoon";
async function ingebouwdeMic() {
  const huidig = live.stream?.getAudioTracks()[0]?.getSettings?.().deviceId || "";
  const ins = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== huidig && d.deviceId !== "default");
  return (ins.find((d) => /iphone|ipad|ingebouwd|built-?in|internal|interne|macbook/i.test(d.label))
    || ins.find((d) => d.label && !/bluetooth|hands-?free|handsfree|carplay|\bauto\b|\bcar\b|airpods|headset|beats/i.test(d.label)))?.deviceId || "";
}
async function liveMic(stream, ctx) {
  const src = ctx.createMediaStreamSource(stream), stap = ctx.sampleRate / 16000, stil = ctx.createGain();
  stil.gain.value = 0; stil.connect(ctx.destination);
  live.mic = { frames: 0, piek: 0, rms: 0, ctx, poort: "", bytes: 0, sentAt: 0, hoortAt: live.mic?.hoortAt || 0, pk: -90, rate: 0, lastBytes: 0, lastAt: Date.now() };
  let carry = new Float32Array(0), t = 0, pending = new Int16Array(1280), n = 0;
  let echo = 0, burst = 0, luid = 0, openTot = 0;
  const frames = (f) => {
    if (!live.ready) return;
    let ruw = 0, som = 0;
    for (let i = 0; i < f.length; i++) { const a = Math.abs(f[i]); som += a * a; if (a > ruw) ruw = a; }
    const rms = Math.sqrt(som / f.length), m = live.mic;
    m.frames += f.length; m.piek = Math.max(m.piek, ruw); m.rms = Math.max(rms, m.rms * 0.92); // snel omhoog, rustig omlaag
    // Praat ECO zelf? Leer eerst hoe hard zijn eigen echo binnenkomt en stuur alleen stem die daar duidelijk bovenuit komt;
    // de rest gaat als stilte, zodat hij zichzelf niet onderbreekt of tegen zichzelf gaat praten.
    if (pcmSources.size) {
      const nu = performance.now(), dt = f.length / ctx.sampleRate * 1000;
      const rms = Math.sqrt(f.reduce((a, v) => a + v * v, 0) / f.length);
      if (!burst) { burst = nu; echo = 0; luid = 0; }
      if (nu - burst < 500) echo = Math.max(echo, rms);
      else if (rms > Math.min(0.15, Math.max(0.02, echo * 2.6))) { luid += dt; if (luid > 150) openTot = nu + 800; }
      else { luid = Math.max(0, luid - dt * 0.6); echo = Math.max(rms, echo * 0.997); }
      live.mic.poort = nu >= openTot ? "dicht" : "open";
      if (nu >= openTot) f = new Float32Array(f.length);
    } else { burst = 0; live.mic.poort = ""; }
    const data = new Float32Array(carry.length + f.length); data.set(carry); data.set(f, carry.length);
    let piek = 0;
    for (; t + 1 < data.length; t += stap) {
      const i = t | 0, v = Math.max(-1, Math.min(1, data[i] + (data[i + 1] - data[i]) * (t - i)));
      piek = Math.max(piek, Math.abs(v));
      pending[n++] = v * 32767;
      if (n === pending.length) {
        liveSend({ realtimeInput: { audio: { data: b64Bytes(new Uint8Array(pending.buffer)), mimeType: "audio/pcm;rate=16000" } } });
        if (live.ws?.readyState === 1) { live.mic.bytes += pending.byteLength; live.mic.sentAt = Date.now(); }
        n = 0;
      }
    }
    const keep = Math.floor(t); carry = data.slice(keep); t -= keep;
    if (document.body.dataset.state === "listening") bump(Math.min(0.5, piek * 0.8));
  };
  let node;
  try {
    liveWorkletUrl ||= URL.createObjectURL(new Blob([LIVE_WORKLET], { type: "application/javascript" }));
    if (!liveWorkletCtx.has(ctx)) { await ctx.audioWorklet.addModule(liveWorkletUrl); liveWorkletCtx.add(ctx); } // per audiocontext één keer
    node = new AudioWorkletNode(ctx, "eco-mic");
    node.port.onmessage = (e) => frames(e.data);
  } catch { // oudere browsers
    node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => frames(e.inputBuffer.getChannelData(0));
  }
  src.connect(node); node.connect(stil);
  live.nodes = [src, node, stil];
}
function liveMicLos() {
  for (const n of live.nodes || []) { try { n.disconnect(); } catch { /* al los */ } }
  live.nodes = [];
  live.stream?.getTracks().forEach((t) => t.stop());
  if (live.micCtx) { live.micCtx.close().catch(() => {}); live.micCtx = null; }
}
// Komt er na een paar seconden echt geluid binnen? Een echte microfoon ruist altijd een beetje; alleen nullen = kapot of dicht.
// Stap 1: andere microfoon (iPhone i.p.v. de auto). Stap 2: zelfde microfoon met een nieuwe audiocontext (bekende iPhone-fout).
// Stap 3: eerlijk zeggen wat er mis is en terugvallen op de gewone manier.
async function liveMicWatch() {
  if (!live.on || !live.mic) return;
  const tr = live.stream?.getAudioTracks()[0];
  const fout = !tr || tr.readyState !== "live" ? "microfoon is uitgegaan" : tr.muted ? "microfoon staat op stil" : !live.mic.frames ? `geen audio (audio ${live.mic.ctx.state})` : live.mic.piek < 2e-4 ? "alleen stilte" : "";
  if (!fout) { live.micStap = 0; return; }
  live.micStap = (live.micStap || 0) + 1;
  const naam = micNaam();
  try {
    if (live.micStap === 1) {
      const ander = await ingebouwdeMic();
      if (ander) {
        liveMicLos();
        live.stream = await liveGetMic(ander);
        await liveMic(live.stream, actx);
        try { localStorage.setItem("eco-mic", ander); } catch { /* geen opslag */ }
        live.micReden = `${naam} gaf ${fout}`;
        setCaption(`${naam} geeft geen geluid (${fout}); ik gebruik nu ${micNaam()}. Praat maar.`, "user");
        return void setTimeout(liveMicWatch, 2500);
      }
      live.micStap = 2;
    }
    if (live.micStap === 2) {
      liveMicLos();
      live.stream = await liveGetMic(liveMicPref());
      live.micCtx = new (window.AudioContext || window.webkitAudioContext)();
      await live.micCtx.resume().catch(() => {});
      await liveMic(live.stream, live.micCtx);
      return void setTimeout(liveMicWatch, 2500);
    }
  } catch (e) { console.warn("microfoon wisselen", e); }
  try { localStorage.removeItem("eco-mic"); } catch { /* geen opslag */ }
  liveBrokenUntil = Date.now() + 10 * 60000;
  liveStop(`Ik krijg geen geluid van je microfoon (${naam}: ${fout}). Ben je met Bluetooth verbonden, bv. in de auto? Die microfoon werkt vaak alleen bij bellen; zet Bluetooth even uit of gebruik oortjes. Ik probeer het nu op de gewone manier.`, true);
  setTimeout(() => listen(), 800);
}
// Microfoonmeter onder de ondertitel (ook op de telefoon zichtbaar) en bij SYSTEEMSTATUS → SPRAAK:
// welke microfoon, hoe hard in dB (streepje = grens voor stem), wat ECO hoort en of het geluid echt naar Gemini gaat.
const dbTekst = (db) => (db <= -89 ? "−∞" : String(Math.round(db)).replace("-", "−")) + " dB";
function liveMeter() {
  if (!live.on || !live.mic) return;
  const m = live.mic, nu = Date.now();
  const db = m.rms > 3e-5 ? Math.max(-90, 20 * Math.log10(m.rms)) : -90;
  m.pk = Math.max(db, m.pk - 0.8); // piek blijft even staan
  const pct = (d) => `${Math.max(0, Math.min(100, ((d + 60) / 60) * 100))}%`;
  const dt = Math.max(0.05, (nu - m.lastAt) / 1000);
  m.rate = m.rate * 0.7 + ((m.bytes - m.lastBytes) / 1024 / dt) * 0.3; m.lastBytes = m.bytes; m.lastAt = nu;
  const [tekst, kl] = !m.frames ? ["GEEN AUDIO", "bad"]
    : m.poort === "dicht" ? ["ECO PRAAT · praat harder om te onderbreken", "warn"]
    : m.poort === "open" ? ["JE ONDERBREEKT ECO", "ok"]
    : nu - m.hoortAt < 2500 ? ["ECO VERSTAAT JE", "ok"]
    : db > -40 ? ["STEM", "ok"]
    : db > -55 ? ["ACHTERGRONDGELUID", "dim"]
    : m.piek < 2e-4 ? ["ALLEEN STILTE · microfoon dicht?", "bad"]
    : ["STIL · praat maar", "dim"];
  $("mmName").textContent = `🎙 ${micNaam()}${live.micReden ? ` (${live.micReden})` : ""}`;
  $("mmState").textContent = tekst; $("mmState").className = kl;
  $("mmFill").style.width = pct(db); $("mmFill").className = kl;
  $("mmPeak").style.left = pct(m.pk);
  $("mmDb").textContent = `NIVEAU ${dbTekst(db)} · PIEK ${dbTekst(m.pk)}`;
  $("mmSend").textContent = !live.ready ? "verbinden…" : nu - m.sentAt < 1000 ? `→ GEMINI ${m.rate.toFixed(0)} kB/s` : "→ GEMINI wacht op geluid";
  $("mmSend").className = live.ready && nu - m.sentAt < 1000 ? "ok" : "warn";
  $("stVoice").textContent = `LIVE ${dbTekst(db)}`; $("stVoice").className = kl === "bad" ? "bad" : "ok";
  $("stVoice").title = `Microfoon: ${micNaam()}`;
}

function liveMessage(msg) {
  const upd = msg.sessionResumptionUpdate;
  if (upd?.resumable && upd.newHandle) live.handle = upd.newHandle;
  if (msg.goAway) liveReconnect();
  if (msg.toolCall) liveTools(msg.toolCall.functionCalls || []);
  for (const id of msg.toolCallCancellation?.ids || []) live.cancelled.add(id);
  const sc = msg.serverContent;
  if (!sc) return;
  live.lastActivity = Date.now();
  if (sc.interrupted) liveFlush();
  if (sc.inputTranscription?.text) liveUser(sc.inputTranscription.text);
  for (const p of sc.modelTurn?.parts || []) if (p.inlineData?.data) livePlay(p.inlineData.data);
  if (sc.outputTranscription?.text) liveEco(sc.outputTranscription.text);
  if (sc.turnComplete) liveTurnDone();
}
function liveUser(t) {
  live.userText += t;
  if (live.mic) live.mic.hoortAt = Date.now();
  if (isStop(live.userText)) { const u = live.userText; live.userText = ""; entry("user", u.trim()); return stopLuisteren("Oké, ik stop. Tik op de microfoon als je me weer nodig hebt."); }
  live.userEl ||= entry("user", "");
  live.userEl.textContent = live.userText.trim();
  if (!live.ecoText) setCaption("› " + live.userText.trim(), "user");
}
function liveEco(t) {
  live.ecoText += t;
  live.ecoEl ||= entry("assistant", "");
  live.ecoEl.innerHTML = md(visible(live.ecoText, true));
  $("messages").scrollTop = $("messages").scrollHeight;
  setCaption(visible(live.ecoText, true).trim());
}
// 24 kHz PCM van Gemini naadloos achter elkaar afspelen (zelfde uitgang en visualisatie als de gewone stem).
function livePlay(b64) {
  if (!$("speak").checked) return;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), n = bytes.length >> 1;
  if (!n) return;
  const dv = new DataView(bytes.buffer), buf = actx.createBuffer(1, n, 24000), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = dv.getInt16(i * 2, true) / 32768;
  const src = actx.createBufferSource();
  src.buffer = buf; src.connect(audioOut());
  const at = Math.max(actx.currentTime + (pcmEnd > actx.currentTime ? 0 : 0.06), pcmEnd);
  src.start(at); pcmEnd = at + buf.duration;
  pcmSources.add(src);
  src.onended = () => { pcmSources.delete(src); if (live.on && !pcmSources.size && document.body.dataset.state === "speaking") setState("listening"); };
  speakingNow();
}
// Onderbroken: meteen stil zijn.
function liveFlush() {
  for (const s of pcmSources) { try { s.stop(); } catch { /* al gestopt */ } }
  pcmSources.clear(); pcmEnd = 0;
  if (live.on) setState("listening");
}
function liveTurnDone() {
  werk.vers = true; werk.rust(); // Live: elke beurt een schone lijst
  const user = live.userText.trim(), eco = live.ecoText.trim();
  live.userText = ""; live.ecoText = ""; live.userEl = null; live.ecoEl = null;
  if (user || eco) callFn({ live: { actie: "opslaan", convId: currentConv, user, assistant: eco } }).then((r) => {
    if (r.convId && r.convId !== currentConv) { currentConv = r.convId; $("convId").textContent = currentConv.slice(0, 8).toUpperCase(); }
    loadConversations();
  }).catch(() => {});
  lastEco = eco || lastEco;
  if (user && isStop(user)) {
    const rest = actx ? Math.max(0, pcmEnd - actx.currentTime) * 1000 : 0;
    setTimeout(() => live.on && liveStop("Live gesprek gestopt. Tik op de microfoon om verder te praten."), rest + 400);
  }
}
// Een minuut niets gezegd en niets te horen: ophangen (spaart batterij en het gratis quotum).
function liveIdle() {
  if (!live.on || pcmSources.size) return;
  if (Date.now() - live.lastActivity > (live.zie ? 180000 : 60000)) liveStop("Live gesprek gepauzeerd na een tijd stilte. Tik op de microfoon om verder te praten.");
}

// Tools: de server voert ze uit; ECO praat ondertussen door (NON_BLOCKING) en vertelt het resultaat zodra het er is.
function liveTools(calls) {
  for (const fc of calls) {
    live.lastActivity = Date.now();
    if (!live.ecoText) setCaption((TOOL_LABEL[fc.name] || "Bezig") + "…", "tool");
    werk.start({ name: fc.name, id: fc.id, info: Object.values(fc.args || {}).filter((v) => v !== "" && typeof v !== "object").join(" · ").slice(0, 200) });
    callFn({ live: { actie: "tool", name: fc.name, args: fc.args || {}, convId: currentConv, ui: uiState() } })
      .then((r) => { liveEffects(r); werk.klaar({ id: fc.id, ...(r.werk || { ok: !r.result?.fout }) }); return r.result; },
        (e) => { werk.klaar({ id: fc.id, ok: false, uit: e.message }); return { fout: e.message }; })
      .then((result) => {
        live.lastActivity = Date.now();
        if (live.cancelled.has(fc.id)) return;
        liveSend({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { result, scheduling: "WHEN_IDLE" } }] } });
      });
  }
}
function liveEffects(r) {
  const after = [];
  for (const ev of r.events || []) applyUi(ev, after);
  after.forEach((f) => setTimeout(f, 300));
  if (r.memoryChanged) loadMemory();
  if (r.convDeleted) { currentConv = null; $("convId").textContent = "—"; }
  if (r.open) { // Google Maps, WhatsApp of Spotify: eerst laten uitpraten, dan de app openen
    const a = document.createElement("a"), mobiel = matchMedia("(pointer: coarse)").matches;
    a.href = r.open; a.className = "action"; a.textContent = r.openLabel || "▶ OPENEN";
    if (!mobiel) { a.target = "_blank"; a.rel = "noopener"; }
    (live.ecoEl || entry("assistant", "")).append(a);
    setTimeout(() => { if (mobiel) location.href = r.openApp || r.open; else window.open(r.open, "_blank", "noopener"); }, 2500);
  }
}
// Getypte tekst in een live gesprek: ECO antwoordt hardop in hetzelfde gesprek.
function liveText(text) {
  if (!live.ready) { live.firstText = text; return; }
  live.userText = `${live.userText.trim()} ${text} `.trimStart();
  live.userEl ||= entry("user", "");
  live.userEl.textContent = live.userText.trim();
  liveSend({ realtimeInput: { text } });
}

// Gemini sluit de verbinding na ongeveer tien minuten: met de hervattingscode ongemerkt verder.
async function liveReconnect() {
  if (!live.on || live.reconnecting) return;
  live.reconnecting = true;
  try { await liveConnect(); }
  catch {
    try { live.cfg = await callFn({ live: "start", loc: myLoc }); await liveConnect(); } // code verlopen: nieuwe code, zelfde gesprek
    catch (e) { liveStop(`Live-verbinding viel weg (${e.message}). Tik op de microfoon om opnieuw te beginnen.`, true); }
  }
  live.reconnecting = false;
}
function liveClosed() {
  if (!live.on) return;
  live.ready = false;
  if (live.tries++ < 2) liveReconnect();
  else liveStop("Live-verbinding viel weg. Tik op de microfoon om opnieuw te beginnen.", true);
}
function liveStop(msg = "", fout = false) {
  if (!live.on && !msg) return;
  const { userText, ecoText } = live;
  live.on = false; live.ready = false;
  clearInterval(live.idle); clearInterval(live.meter);
  $("micMeter").hidden = true;
  zieStop(); $("zieBtn").hidden = true;
  try { live.ws?.close(1000); } catch { /* al dicht */ }
  liveMicLos();
  for (const s of pcmSources) { try { s.stop(); } catch { /* al gestopt */ } }
  pcmSources.clear(); pcmEnd = 0;
  try { if (navigator.audioSession) navigator.audioSession.type = "auto"; } catch { /* oudere Safari */ }
  if (userText?.trim() || ecoText?.trim()) callFn({ live: { actie: "opslaan", convId: currentConv, user: userText, assistant: ecoText } }).then(() => loadConversations()).catch(() => {});
  $("mic").classList.remove("on", "live");
  initStatus();
  setState("idle");
  if (msg) setCaption(msg, fout ? "err" : "user");
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && live.on) liveStop(); });

// ---------- Meekijken in Live: je scherm (computer) of camera (telefoon), ongeveer één beeld per seconde naar Gemini ----------
// Starten kan alleen met een tik (de browser vraagt toestemming); "stop delen" in de browser of nog een tik stopt het.
async function zieStart() {
  if (!live.ready) return;
  if (live.zie) return zieStop("ECO kijkt niet meer mee.");
  const scherm = !!navigator.mediaDevices?.getDisplayMedia && !matchMedia("(pointer: coarse)").matches;
  try {
    const stream = scherm
      ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false })
      : await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
    if (!live.ready) { stream.getTracks().forEach((t) => t.stop()); return; }
    const video = $("ziePreview"), canvas = document.createElement("canvas"), c2 = canvas.getContext("2d");
    video.srcObject = stream; video.hidden = false;
    await video.play().catch(() => {});
    live.zie = { stream, soort: scherm ? "scherm" : "camera", beelden: 0, timer: setInterval(() => {
      if (!live.ready || !video.videoWidth) return;
      const k = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight)); // klein genoeg voor snelheid, groot genoeg om tekst te lezen
      canvas.width = Math.round(video.videoWidth * k); canvas.height = Math.round(video.videoHeight * k);
      c2.drawImage(video, 0, 0, canvas.width, canvas.height);
      liveSend({ realtimeInput: { video: { data: canvas.toDataURL("image/jpeg", 0.6).split(",")[1], mimeType: "image/jpeg" } } });
      live.zie.beelden++;
    }, 1000) };
    stream.getVideoTracks()[0].addEventListener("ended", () => zieStop("ECO kijkt niet meer mee."));
    $("zieBtn").classList.add("aan");
    live.lastActivity = Date.now();
    setCaption(scherm ? "👁 ECO kijkt mee op je scherm. Vraag maar: wat zie je?" : "👁 ECO kijkt mee met je camera. Vraag maar: wat zie je?", "user");
  } catch (e) { setCaption(`Meekijken lukte niet (${e.name === "NotAllowedError" ? "geen toestemming" : e.message}).`, "err"); }
}
function zieStop(msg = "") {
  const z = live.zie;
  if (!z) return;
  live.zie = null;
  clearInterval(z.timer);
  z.stream.getTracks().forEach((t) => t.stop());
  $("ziePreview").srcObject = null; $("ziePreview").hidden = true;
  $("zieBtn").classList.remove("aan");
  if (msg && live.on) setCaption(msg, "user");
}
$("zieBtn").onclick = zieStart;

// ---------- Microfoon kiezen en testen (BEDIENING) ----------
// De keuze geldt voor Live, Whisper en onderbreken. TEST laat acht seconden zien of ECO je echt hoort.
async function vulMics() {
  const sel = $("micSel");
  if (!sel || !navigator.mediaDevices?.enumerateDevices) return;
  const ins = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter((d) => d.kind === "audioinput" && d.deviceId && !["default", "communications"].includes(d.deviceId));
  const pref = liveMicPref();
  sel.innerHTML = "";
  sel.append(new Option("MICROFOON: AUTOMATISCH", ""));
  ins.forEach((d, i) => sel.append(new Option(`MICROFOON: ${(d.label || `microfoon ${i + 1}`).toUpperCase()}`, d.deviceId)));
  sel.value = ins.some((d) => d.deviceId === pref) ? pref : "";
}
$("micSel")?.addEventListener("change", (e) => {
  try { if (e.target.value) localStorage.setItem("eco-mic", e.target.value); else localStorage.removeItem("eco-mic"); } catch { /* geen opslag */ }
  if (live.on) { liveStop(); setTimeout(() => liveStart(), 300); } // meteen met de nieuwe microfoon verder
});
$("micSel")?.addEventListener("focus", vulMics); // namen zijn pas zichtbaar na toestemming
navigator.mediaDevices?.addEventListener?.("devicechange", vulMics);
vulMics();

let micTest = null;
async function micTestStart() {
  if (micTest) return micTestStop("Test gestopt.");
  if (live.on) liveStop();
  wakeStop(); bargeStop();
  $("micTestBox").hidden = false; $("mtTip").textContent = "Microfoon openen…"; $("mtTip").className = "";
  try {
    try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch { /* oudere Safari */ }
    const stream = await liveGetMic($("micSel").value || liveMicPref());
    audioOut(); await actx.resume().catch(() => {});
    const src = actx.createMediaStreamSource(stream), an = actx.createAnalyser();
    an.fftSize = 1024; src.connect(an);
    const buf = new Float32Array(an.fftSize), t0 = performance.now();
    micTest = { stream, src, raf: 0, stem: 0, piek: 0, pk: -90, rms: 0, vorige: t0 };
    $("micTestBtn").textContent = "STOP";
    $("mtName").textContent = `🎙 ${stream.getAudioTracks()[0]?.label || "standaardmicrofoon"}`;
    vulMics();
    const pct = (d) => `${Math.max(0, Math.min(100, ((d + 60) / 60) * 100))}%`;
    const loop = () => {
      const m = micTest;
      if (!m) return;
      const nu = performance.now(), dt = nu - m.vorige, sec = (nu - t0) / 1000;
      m.vorige = nu;
      an.getFloatTimeDomainData(buf);
      let som = 0, mx = 0;
      for (const v of buf) { som += v * v; if (Math.abs(v) > mx) mx = Math.abs(v); }
      m.rms = Math.max(Math.sqrt(som / buf.length), m.rms * 0.9); m.piek = Math.max(m.piek, mx);
      const db = m.rms > 3e-5 ? Math.max(-90, 20 * Math.log10(m.rms)) : -90;
      m.pk = Math.max(db, m.pk - 0.5);
      if (db > -40) m.stem += dt;
      const [tekst, kl] = m.piek < 2e-4 && sec > 1.5 ? ["ALLEEN STILTE", "bad"] : m.stem > 600 ? ["✓ ECO HOORT JE", "ok"]
        : db > -40 ? ["STEM", "ok"] : db > -55 ? ["ACHTERGROND", "dim"] : ["PRAAT NU…", "dim"];
      $("mtState").textContent = tekst; $("mtState").className = kl;
      $("mtFill").style.width = pct(db); $("mtFill").className = kl;
      $("mtPeak").style.left = pct(m.pk);
      $("mtDb").textContent = `NIVEAU ${dbTekst(db)} · PIEK ${dbTekst(m.pk)}`;
      $("mtTip").textContent = `Zeg iets, bv. "hallo ECO" (${Math.max(0, Math.ceil(8 - sec))} s)`;
      if (sec > 8) {
        return micTestStop(m.stem > 600 ? "✓ Deze microfoon werkt: ECO hoort je."
          : m.piek < 2e-4 ? "✗ Deze microfoon geeft alleen stilte (bv. Bluetooth in de auto). Kies hierboven een andere en test opnieuw."
          : "Ik hoorde geluid maar weinig stem. Praat iets harder of dichter bij de telefoon en test opnieuw.", m.stem > 600 ? "ok" : "bad");
      }
      m.raf = requestAnimationFrame(loop);
    };
    loop();
  } catch (e) { micTestStop(`Microfoon openen lukte niet: ${e.message}`, "bad"); }
}
function micTestStop(msg = "", kl = "") {
  const m = micTest;
  micTest = null;
  if (m) { cancelAnimationFrame(m.raf); try { m.src.disconnect(); } catch { /* al los */ } m.stream.getTracks().forEach((t) => t.stop()); }
  try { if (navigator.audioSession && !live.on) navigator.audioSession.type = "auto"; } catch { /* oudere Safari */ }
  $("micTestBtn").textContent = "TEST";
  if (msg) { $("mtTip").textContent = msg; $("mtTip").className = kl; }
}
$("micTestBtn").onclick = micTestStart;

// ---------- Spraak in ----------
// Voorkeur: opnemen en laten uitschrijven door Whisper (Groq) via de Edge Function — verstaat Nederlands
// veel beter. Stopt vanzelf na een korte stilte. Terugval: de spraakherkenning van de browser.
const CAN_RECORD = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
let whisper = CAN_RECORD, rec = null, recording = null;
if (!CAN_RECORD && !Rec) $("mic").hidden = true;

function listen(stream = null) {
  if (rec || recording) { stream?.getTracks().forEach((t) => t.stop()); return; }
  wakeStop(); $("tapTalk").hidden = true;
  stream ||= bargeStop(true); // luisterde ECO al mee (onderbreken)? Dan dezelfde microfoon gebruiken
  stopSpeaking(); turn++;
  warm();
  if (whisper) recordWhisper(stream); else { stream?.getTracks().forEach((t) => t.stop()); listenBrowser(); }
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

async function recordWhisper(existing = null) {
  let stream = existing;
  if (!stream || !stream.getAudioTracks().some((t) => t.readyState === "live")) {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, ...micVoorkeur() } }); }
    catch (e) { typeCaption("Geen toegang tot de microfoon: " + e.message, "err"); return; }
  }
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
$("mic").onclick = () => { if (live.on) return liveStop("Live gesprek gestopt."); if (rec || recording) return stopListening(); hervat(); if (liveWanted()) liveStart(); else listen(); };
// Spatie ingedrukt houden buiten het tekstvak = praten.
addEventListener("keydown", (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target?.isContentEditable;
  if (e.code === "Space" && !typing && !$("app").hidden && $("voiceLab").hidden && !e.repeat) { e.preventDefault(); if (live.on) return; if (liveWanted()) liveStart(); else listen(); }
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
  for (const w of wins) l[w.dataset.win] = { x: w.offsetLeft, y: w.offsetTop, w: w.offsetWidth, h: w.offsetHeight, z: +w.style.zIndex || 2, docked: w.classList.contains("docked") ? w.dataset.side : "", dockY: +w.dataset.dockY || 0 };
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
    if (s?.docked) { if (s.dockY) w.dataset.dockY = s.dockY; dock(w, s.docked, false); }
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
  tab.type = "button"; tab.textContent = titleOf(w); tab.title = "Tik: uitklappen · slepen: verplaatsen langs de rand";
  // Plek langs de rand (procent van de hoogte); nieuw lipje op de eerste vrije plek.
  if (!+w.dataset.dockY) w.dataset.dockY = String(Math.min(90, 30 + $(side === "l" ? "dockL" : "dockR").children.length * 14));
  tab.style.setProperty("--y", `${w.dataset.dockY}%`);
  let gesleept = false;
  tab.addEventListener("pointerdown", (e) => {
    const sx = e.clientX, sy = e.clientY;
    gesleept = false;
    const beweeg = (ev) => {
      if (!gesleept && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      gesleept = true;
      const y = Math.min(95, Math.max(5, (ev.clientY / innerHeight) * 100)), kant = ev.clientX < innerWidth / 2 ? "l" : "r";
      w.dataset.dockY = y.toFixed(1); tab.style.setProperty("--y", `${y}%`);
      if (kant !== w.dataset.side) { w.dataset.side = kant; $(kant === "l" ? "dockL" : "dockR").append(tab); } // naar de andere rand
    };
    const los = () => { removeEventListener("pointermove", beweeg); removeEventListener("pointerup", los); if (gesleept) saveLayout(); };
    addEventListener("pointermove", beweeg); addEventListener("pointerup", los);
  });
  tab.onclick = () => {
    if (gesleept) { gesleept = false; return; } // slepen is geen tik
    tab.remove(); w.classList.remove("docked"); w.style.zIndex = ++zTop; clamp(w); saveLayout(); sfx.tick();
  };
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
async function callFn(payload, opnieuw = true) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(payload),
  });
  // Bij het opstarten kan de bewaarde inlogcode net verlopen zijn (de browser vernieuwt hem pas iets later): één keer vernieuwen en opnieuw.
  if (res.status === 401 && opnieuw && (await sb.auth.refreshSession().catch(() => ({}))).data?.session) return callFn(payload, false);
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
readouts();
sizeViz(); requestAnimationFrame(drawViz);
boot();

// ---------- Instellingen: alles wat BEDIENING druk maakte, in één venster met tabbladen ----------
const instOpen = (tab) => {
  closeDrawer();
  if (tab) instTab(tab);
  $("instellingen").hidden = false;
};
const instDicht = () => { $("instellingen").hidden = true; };
function instTab(naam) {
  for (const b of document.querySelectorAll(".inst-tabs [data-tab]")) { b.classList.toggle("on", b.dataset.tab === naam); b.setAttribute("aria-selected", b.dataset.tab === naam); }
  for (const s of document.querySelectorAll("#instellingen [data-blad]")) s.hidden = s.dataset.blad !== naam;
  try { localStorage.setItem("eco-inst-tab", naam); } catch { /* geen opslag */ }
}
$("instOpen").onclick = () => { let t = "spraak"; try { t = localStorage.getItem("eco-inst-tab") || t; } catch { /* geen opslag */ } instOpen(t); };
$("instSluit").onclick = instDicht;
$("instellingen").addEventListener("click", (e) => { if (e.target === $("instellingen")) instDicht(); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("instellingen").hidden) instDicht(); });
for (const b of document.querySelectorAll(".inst-tabs [data-tab]")) b.onclick = () => instTab(b.dataset.tab);
// Stemlab opent boven op de instellingen: die eerst dicht.
$("labOpen").addEventListener("click", instDicht);

// ---------- Rustig scherm: gaat ECO aan het werk (reactor in de hoek), dan schuiven de andere panelen soepel opzij ----------
try { $("rustig").checked = localStorage.getItem("eco-rustig") !== "0"; } catch { /* geen opslag */ }
$("rustig").addEventListener("change", (e) => {
  try { localStorage.setItem("eco-rustig", e.target.checked ? "1" : "0"); } catch { /* geen opslag */ }
  if (!e.target.checked) rustig(false);
});
function rustig(aan) {
  const app = $("app");
  if (aan && (!$("rustig")?.checked || !matchMedia("(min-width: 901px)").matches)) return;
  if (aan) {
    const breed = app.clientWidth;
    for (const w of app.querySelectorAll("[data-win]")) {
      if (w.dataset.win === "kern" || w.dataset.win === "cmd") continue;
      const r = w.getBoundingClientRect(), links = r.left + r.width / 2 < breed / 2;
      w.style.setProperty("--weg", `${links ? -(r.right + 40) : breed - r.left + 40}px`);
    }
  }
  document.body.dataset.rustig = aan ? "on" : "off";
  $("panelenTerug").hidden = !aan;
}
// Knop aan de rand: panelen even terughalen (ECO blijft gewoon doorwerken).
{
  const k = document.createElement("button");
  k.type = "button"; k.id = "panelenTerug"; k.className = "panelen-terug"; k.hidden = true;
  k.textContent = "PANELEN"; k.title = "Panelen terughalen";
  k.onclick = () => rustig(false);
  $("app").append(k);
}
