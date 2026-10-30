// ECO op de laptop (NOVA.exe): dezelfde HUD als ECO (reactor, visualisatie, panelen). De Python-kant (nova.py) doet het werk:
// online verbonden met ECO, offline met N.O.V.A. (het offline brein op de laptop), stem, pc-acties. Python → pagina: window.nova.ev({...}); pagina → Python: window.pywebview.api.
const $ = (id) => document.getElementById(id);
const T0 = Date.now();
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Reactor (zelfde tekening als ECO) ----------
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

// ---------- Visualisatie rond de reactor en activiteitsmeter ----------
const viz = $("viz"), vctx = viz.getContext("2d"), BARS = 128, levels = new Float32Array(BARS);
let energy = 0;
function sizeViz() { const r = viz.getBoundingClientRect(), d = devicePixelRatio || 1; viz.width = r.width * d; viz.height = r.height * d; }
new ResizeObserver(sizeViz).observe(viz);
function drawViz(t) {
  const st = document.body.dataset.state;
  const doel = { idle: 0.06, listening: 0.45, thinking: 0.25, speaking: 0.35, error: 0.1 }[st] ?? 0.05;
  const dt = Math.min(1000, t - (drawViz.last ?? t)); drawViz.last = t;
  energy += (doel - energy) * (1 - Math.exp(-dt / 400));
  const w = viz.width, h = viz.height, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.41;
  vctx.clearRect(0, 0, w, h);
  const kleur = st === "listening" ? "255,177,42" : st === "error" ? "255,77,77" : "0,225,255";
  for (let i = 0; i < BARS; i++) {
    const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
    const target = st === "thinking" ? 0.5 + 0.5 * Math.sin(a * 3 - t / 180) : Math.random() * (0.4 + 0.6 * Math.abs(Math.sin(a * 2 + t / 900)));
    levels[i] += (target * energy - levels[i]) * 0.25;
    const len = 3 + levels[i] * Math.min(w, h) * 0.085;
    vctx.strokeStyle = `rgba(${kleur},${Math.min(1, 0.3 + levels[i] * 1.6)})`;
    vctx.lineWidth = Math.max(1.5, w / 300);
    vctx.beginPath(); vctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); vctx.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len)); vctx.stroke();
  }
  const pct = Math.round(Math.max(0, Math.min(1, (energy - 0.06) / 0.39)) * 100);
  if (pct !== drawViz.pct) { drawViz.pct = pct; $("meterFill").style.width = `${Math.max(3, pct)}%`; $("meterPct").textContent = `${pct}%`; }
  if (!REDUCED) requestAnimationFrame(drawViz);
}
sizeViz(); requestAnimationFrame(drawViz);

// ---------- Klok ----------
function klok() {
  const d = new Date(), [h, m, s] = d.toLocaleTimeString("nl-NL", { hour12: false }).split(":");
  $("clock").innerHTML = `${h}:${m}<small>:${s}</small>`;
  $("date").textContent = d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const up = Math.floor((Date.now() - T0) / 1000);
  $("uptime").textContent = [up / 3600, (up / 60) % 60, up % 60].map((v) => String(Math.floor(v)).padStart(2, "0")).join(":");
}
klok(); setInterval(klok, 1000);

// ---------- Toestand, ondertitel en transcript ----------
const LABEL = { idle: "STAND-BY", listening: "LUISTEREN", thinking: "VERWERKEN", speaking: "SPREKEN", error: "STORING" };
function setState(s) { document.body.dataset.state = s; $("stateLabel").textContent = LABEL[s] || s.toUpperCase(); }
function caption(tekst, cls = "") { const el = $("caption"); el.className = "caption " + cls; el.textContent = tekst; }
const tijd = () => new Date().toLocaleTimeString("nl-NL", { hour12: false });
function entry(rol, tekst, wanneer) {
  const div = document.createElement("div");
  div.className = "entry " + rol;
  const wie = rol === "user" ? "SERKAN" : rol === "assistant" ? (antwoordDoor === "nova" ? "N.O.V.A." : "E.C.O.") : rol === "fout" ? "STORING" : "SYSTEEM";
  div.innerHTML = `<div class="meta">${wie} · ${wanneer || tijd()}</div><div class="body"></div>`;
  const body = div.lastChild;
  body.textContent = tekst;
  $("messages").append(div);
  $("messages").scrollTop = $("messages").scrollHeight;
  return body;
}
let huidig = null, pcAantal = 0, antwoordDoor = "eco"; // wie het laatst antwoordde: ECO (online) of N.O.V.A. (offline)
function pcActie(e) {
  const lijst = $("pcList");
  lijst.querySelector(".empty")?.remove();
  const li = document.createElement("li");
  li.className = e.status || "";
  li.innerHTML = `<b></b><small></small>`;
  li.firstChild.textContent = `${e.tijd || tijd().slice(0, 5)} · ${e.tekst}`;
  li.lastChild.textContent = e.detail || "";
  lijst.prepend(li);
  while (lijst.children.length > 30) lijst.lastChild.remove();
  $("pcCount").textContent = String(++pcAantal);
}
function zetStatus(s) {
  const dot = document.querySelector("#sysTop .dot");
  dot.className = `dot${s.modus === "online" ? "" : s.modus === "offline" ? " test" : " bad"}`;
  $("sysLine").textContent = s.titel;
  $("sysTop").title = s.sub || "";
  // Online verbonden met ECO, offline met N.O.V.A.; groen = jouw keuze, oranje = het andere nam het over.
  antwoordDoor = s.brein || antwoordDoor;
  $("stBrein").textContent = s.brein === "eco" ? "ECO" : s.brein === "nova" ? "N.O.V.A." : "GEEN";
  $("stBrein").className = s.modus === "online" ? "ok" : s.modus === "offline" ? "warn" : "bad";
  $("stBrein").title = s.reden || "";
  $("stEco").textContent = s.eco; $("stEco").className = s.eco === "BEREIKBAAR" ? "ok" : "warn";
  document.querySelectorAll("[data-brein]").forEach((b) => b.classList.toggle("on", b.dataset.brein === s.gekozen));
  if (s.brein_volgorde) inst.volgorde = { ...inst.volgorde, brein: s.brein_volgorde };
  $("stModel").textContent = s.model;
  $("stOllama").textContent = s.lokaal; $("stOllama").className = s.lokaal_ok ? "ok" : "warn";
  $("stSpraak").textContent = s.spraak || "—";
  $("stKlap").textContent = s.klappen || "—"; $("stKlap").title = s.klappen_reden || "";
  $("stKlap").className = s.klappen_reden ? "warn" : s.klappen === "UIT" ? "" : "ok";
  $("stStem").textContent = (s.stem || "—") + (s.stem_reden ? " ⚠" : "");
  $("stStem").className = s.stem_soort || "";
  $("stStem").title = s.stem_reden || "";
  $("stNaam").textContent = s.naam || "—";
  $("brein").textContent = s.brein === "eco" ? "ECO" : s.brein === "nova" ? `N.O.V.A. · ${s.model.toUpperCase()}` : "—";
  $("laptop").textContent = `${s.naam} · v${s.versie}`;
  $("brandVer").textContent = `v${s.versie}`;
}

// Python roept dit aan voor alles wat er gebeurt.
window.nova = {
  ev(e) {
    if (e.t === "jij") { entry("user", e.tekst); caption("› " + e.tekst, "user"); }
    else if (e.t === "nova_start") { huidig = entry("assistant", ""); }
    else if (e.t === "delta") { if (!huidig) huidig = entry("assistant", ""); huidig.textContent += e.tekst; caption(huidig.textContent); $("messages").scrollTop = $("messages").scrollHeight; }
    else if (e.t === "nova_eind") { if (huidig && e.tekst && !huidig.textContent) huidig.textContent = e.tekst; huidig = null; }
    else if (e.t === "sys") { entry("sys", e.tekst); }
    else if (e.t === "fout") { entry("fout", e.tekst); caption(e.tekst, "err"); setState("error"); setTimeout(() => document.body.dataset.state === "error" && setState("idle"), 2500); }
    else if (e.t === "tool") { caption(e.tekst + "…", "tool"); }
    else if (e.t === "pc") { pcActie(e); }
    else if (e.t === "status") { zetStatus(e); }
    else if (e.t === "staat") { setState(e.s); $("mic").classList.toggle("on", e.s === "listening"); }
    else if (e.t === "melding") { for (const id of ["setMsg", "instMsg"]) { $(id).textContent = e.tekst; $(id).className = "login-msg push-msg " + (e.soort || ""); } }
    else if (e.t === "herstel") { // wat er de vorige keer stond (ECO onthoudt het transcript en de PC-acties)
      for (const p of e.pc || []) pcActie(p);
      for (const r of e.transcript || []) entry(r.rol, r.tekst, r.tijd);
      if ((e.transcript || []).length) entry("sys", "— vorige sessie —");
    }
    else if (e.t === "inst") { inst = { ...inst, ...e.inst }; if (!$("instellingen").hidden) vulInstellingen(); }
    else if (e.t === "update") { // een nieuwe versie: vragen, en tijdens het bijwerken de voortgang tonen
      $("updateBalk").hidden = !e.tag;
      const bezig = e.voortgang !== null && e.voortgang !== undefined;
      $("updateTekst").textContent = bezig ? `Bijwerken naar ${e.tag}… ${Math.round(e.voortgang * 100)}%` : `Er is een nieuwe versie (${e.tag}). Nu bijwerken?`;
      $("updateJa").hidden = $("updateLater").hidden = bezig;
    }
  },
};

// ---------- Pagina → Python ----------
const api = () => window.pywebview && window.pywebview.api;
$("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const tekst = $("input").value.trim();
  if (!tekst || !api()) return;
  $("input").value = "";
  api().stuur(tekst);
});
$("input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("chatForm").requestSubmit(); } });
$("mic").onclick = () => api() && api().mic();
addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.code === "Space") { e.preventDefault(); $("mic").click(); }
  if (e.key === "Escape" && !$("instellingen").hidden) sluitInstellingen();
});
$("updateJa").onclick = () => { if (api()) { api().update(true); $("updateTekst").textContent = "Bijwerken…"; $("updateJa").hidden = $("updateLater").hidden = true; } };
$("updateLater").onclick = () => api() && api().update(false);
document.querySelectorAll("[data-brein]").forEach((b) => { b.onclick = () => api() && api().brein(b.dataset.brein); });

// ---------- Instellingen (geluid, beeld, AI-volgorde, verbinding) ----------
// inst = wat Python bewaart in config.json; elke wijziging gaat meteen terug via api().instellingen({...}).
let inst = { volume: 100, stem: true, beeld: { verberg: [] }, volgorde: {}, indeling: {}, magneet: true, klappen: true };
const bewaar = (patch) => { Object.assign(inst, patch); if (api()) api().instellingen(patch); };
const PANELEN = { tijd: "LOKALE TIJD", status: "SYSTEEMSTATUS", transcript: "TRANSCRIPT", pc: "PC-ACTIES", ondertitel: "ONDERTITEL", visualisatie: "VISUALISATIE" };
const RIJEN = { brein: "BREIN", eco: "ECO", model: "N.O.V.A.-MODEL", ollama: "OLLAMA", spraak: "SPRAAK", klappen: "2× KLAPPEN", stem: "STEM", laptop: "LAPTOP", activiteit: "ACTIVITEIT" };
const NAMEN = { eco: "ECO (online)", nova: "N.O.V.A. (offline, laptop)", groq: "Groq", gemini: "Gemini", claude: "Claude", piper: "Piper (nathalie)", windows: "Windows (Nederlands)", whisper: "Whisper (via ECO)", vosk: "Vosk (op de laptop)" };
const STEMNAMEN = { gemini: "Gemini (ECO's stem)" };
const verborgen = (id) => (inst.beeld?.verberg || []).includes(id);

function pasBeeldToe() {
  for (const [id] of Object.entries(PANELEN)) {
    const el = id === "ondertitel" ? $("caption") : id === "visualisatie" ? $("viz") : document.querySelector(`[data-win="${id}"]`);
    if (el) el.classList.toggle("verborgen", verborgen(id));
  }
  document.querySelectorAll("[data-rij]").forEach((r) => r.classList.toggle("verborgen", verborgen(r.dataset.rij)));
}
function vinkjes(doos, lijst) {
  doos.replaceChildren(...Object.entries(lijst).map(([id, naam]) => {
    const l = document.createElement("label");
    l.className = "switch";
    l.innerHTML = `<input type="checkbox"><i></i><span></span>`;
    l.querySelector("span").textContent = naam;
    const cb = l.querySelector("input");
    cb.checked = !verborgen(id);
    cb.onchange = () => {
      const v = new Set(inst.beeld?.verberg || []);
      if (cb.checked) v.delete(id); else v.add(id);
      bewaar({ beeld: { ...inst.beeld, verberg: [...v] } });
      pasBeeldToe();
      layoutOpnieuw();
    };
    return l;
  }));
}
function volgordeLijst(ol) {
  const soort = ol.dataset.volgorde, items = inst.volgorde?.[soort] || [];
  ol.replaceChildren(...items.map((id, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span></span><button type="button" class="chip" aria-label="Hoger">▲</button><button type="button" class="chip" aria-label="Lager">▼</button>`;
    li.firstChild.textContent = (soort === "stem" && STEMNAMEN[id]) || NAMEN[id] || id;
    const [op, neer] = li.querySelectorAll("button");
    op.disabled = i === 0; neer.disabled = i === items.length - 1;
    const wissel = (j) => {
      const n = [...items];
      [n[i], n[j]] = [n[j], n[i]];
      bewaar({ volgorde: { ...inst.volgorde, [soort]: n } });
      volgordeLijst(ol);
    };
    op.onclick = () => wissel(i - 1);
    neer.onclick = () => wissel(i + 1);
    return li;
  }));
}
function vulInstellingen() {
  $("stem").checked = inst.stem !== false;
  $("volume").value = inst.volume ?? 100; $("volWaarde").textContent = `${$("volume").value}%`;
  $("magneet").checked = inst.magneet !== false;
  $("klappen").checked = inst.klappen !== false;
  vinkjes($("kiesPanelen"), PANELEN);
  vinkjes($("kiesRijen"), RIJEN);
  document.querySelectorAll("[data-volgorde]").forEach(volgordeLijst);
}
function openInstellingen() { vulInstellingen(); $("instellingen").hidden = false; $("instMsg").textContent = ""; }
function sluitInstellingen() { $("instellingen").hidden = true; }
$("openInst").onclick = openInstellingen;
$("sluitInst").onclick = sluitInstellingen;
$("instellingen").addEventListener("pointerdown", (e) => { if (e.target === $("instellingen")) sluitInstellingen(); });
document.querySelectorAll("[data-tab]").forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === t));
    document.querySelectorAll("[data-blad]").forEach((b) => { b.hidden = b.dataset.blad !== t.dataset.tab; });
  };
});
$("stem").onchange = () => bewaar({ stem: $("stem").checked });
$("volume").oninput = () => { $("volWaarde").textContent = `${$("volume").value}%`; };
$("volume").onchange = () => bewaar({ volume: +$("volume").value });
$("testStem").onclick = () => api() && api().test_stem();
$("magneet").onchange = () => bewaar({ magneet: $("magneet").checked });
$("klappen").onchange = () => bewaar({ klappen: $("klappen").checked });
$("standaardIndeling").onclick = () => { bewaar({ indeling: {} }); resetLayout(); };
$("wisTranscript").onclick = () => {
  if (api()) api().wis_transcript();
  $("messages").replaceChildren();
  $("pcList").innerHTML = `<li class="empty">Nog niets. Vraag bv. "open Spotify" of "zet het volume op 30".</li>`;
  pcAantal = 0; $("pcCount").textContent = "0";
};
$("opslaan").onclick = () => api() && api().opslaan({ eco_sleutel: $("sleutel").value, naam: $("naam").value, model: $("model").value, stem: $("stem").checked });
$("download").onclick = () => api() && api().download($("model").value);

// ---------- Indeling: blokken verplaatsen en vergroten, magnetisch (zoals ECO's vrije indeling) ----------
// Posities worden bewaard als deel van het venster (0..1), zodat de indeling meeschaalt als het venster groter of kleiner wordt.
const DESKTOP = matchMedia("(min-width: 901px)");
const hud = $("app");
const wins = [...hud.querySelectorAll("[data-win]")];
const MIN = { kern: [240, 240], cmd: [320, 58], bediening: [200, 90] };
const AUTO_H = new Set(["cmd", "bediening", "tijd", "status"]); // hoogte volgt de inhoud (dan valt er nooit een regel weg)
const MARGE = 14, VANG = 10; // ruimte tussen blokken, en hoe dichtbij (px) iets vastklikt
let zTop = 10;
const titelVan = (w) => w.dataset.title || w.querySelector(".panel-h span")?.textContent || w.dataset.win.toUpperCase();
const zichtbaar = () => wins.filter((w) => !w.classList.contains("verborgen"));
const bovenrand = () => hud.querySelector(".topbar").offsetHeight + MARGE;

for (const w of wins) { // grepen één keer toevoegen
  let kop = w.querySelector(":scope > .panel-h");
  if (!kop) {
    kop = document.createElement("div");
    kop.className = "win-h";
    kop.innerHTML = w.dataset.win === "cmd" ? `<span class="grip" title="Slepen om te verplaatsen">⋮⋮</span>` : `<span>${titelVan(w)}</span>`;
    w.prepend(kop);
  }
  const rs = document.createElement("div");
  rs.className = "win-rs"; rs.title = "Slepen om te vergroten of te verkleinen";
  w.append(rs);
  slepen(kop, w, "verplaats");
  slepen(rs, w, "schaal");
  w.addEventListener("pointerdown", () => { if (hud.classList.contains("free")) w.style.zIndex = ++zTop; });
}
function plaats(w, r) {
  w.style.left = Math.round(r.x) + "px"; w.style.top = Math.round(r.y) + "px";
  w.style.width = Math.round(r.w) + "px";
  if (!AUTO_H.has(w.dataset.win)) w.style.height = Math.round(r.h) + "px";
  if (r.z) { w.style.zIndex = r.z; zTop = Math.max(zTop, r.z); }
}
function binnen(w) {
  const W = hud.clientWidth, H = hud.clientHeight, top = bovenrand();
  const breed = Math.min(w.offsetWidth, W - 2 * MARGE);
  if (breed !== w.offsetWidth) w.style.width = breed + "px";
  w.style.left = Math.min(Math.max(MARGE, w.offsetLeft), W - MARGE - w.offsetWidth) + "px";
  w.style.top = Math.min(Math.max(top, w.offsetTop), Math.max(top, H - MARGE - w.offsetHeight)) + "px";
}
function bewaarIndeling() {
  const W = hud.clientWidth, H = hud.clientHeight, l = {};
  for (const w of wins) l[w.dataset.win] = { x: w.offsetLeft / W, y: w.offsetTop / H, w: w.offsetWidth / W, h: w.offsetHeight / H, z: +w.style.zIndex || 2 };
  bewaar({ indeling: l });
}
function initLayout() {
  if (!DESKTOP.matches || hud.classList.contains("free")) return;
  const W = hud.clientWidth, H = hud.clientHeight, opgeslagen = inst.indeling || {};
  const compleet = wins.every((w) => opgeslagen[w.dataset.win]);
  const basis = hud.getBoundingClientRect();
  const gemeten = new Map(wins.map((w) => { const r = w.getBoundingClientRect(); return [w, { x: r.left - basis.left, y: r.top - basis.top, w: r.width, h: r.height }]; }));
  hud.classList.add("free");
  for (const w of wins) {
    const o = compleet ? opgeslagen[w.dataset.win] : null;
    plaats(w, o ? { x: o.x * W, y: o.y * H, w: o.w * W, h: o.h * H, z: o.z } : gemeten.get(w));
    binnen(w);
  }
}
function resetLayout() {
  hud.classList.remove("free");
  for (const w of wins) w.removeAttribute("style");
  requestAnimationFrame(initLayout);
}
function layoutOpnieuw() { if (!(inst.indeling && Object.keys(inst.indeling).length)) resetLayout(); }

// Magnetisch: randen die binnen VANG px van een andere rand (of de schermrand) komen, klikken daar vast; ook op MARGE ernaast.
function vangLijnen(w, as) {
  const W = hud.clientWidth, H = hud.clientHeight;
  const lijnen = as === "x" ? [MARGE, W - MARGE] : [bovenrand(), H - MARGE];
  for (const a of zichtbaar()) {
    if (a === w) continue;
    const begin = as === "x" ? a.offsetLeft : a.offsetTop, eind = begin + (as === "x" ? a.offsetWidth : a.offsetHeight);
    lijnen.push(begin, eind, begin - MARGE, eind + MARGE);
  }
  return lijnen;
}
function vang(waarden, lijnen) { // beste verschuiving zodat één van de randen op een lijn valt
  let best = null;
  for (const v of waarden) for (const l of lijnen) { const d = l - v; if (Math.abs(d) <= VANG && (best === null || Math.abs(d) < Math.abs(best.d))) best = { d, l }; }
  return best;
}
function toonLijn(id, best, as) {
  const el = $(id);
  el.hidden = !best;
  if (!best) return;
  const r = hud.getBoundingClientRect();
  if (as === "x") el.style.left = r.left + best.l + "px"; else el.style.top = r.top + best.l + "px";
}
function slepen(greep, w, soort) {
  greep.addEventListener("pointerdown", (e) => {
    if (!hud.classList.contains("free") || e.button !== 0) return;
    if (soort === "verplaats" && e.target.closest("button, a, input, label, select, textarea")) return;
    e.preventDefault();
    greep.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, ox = w.offsetLeft, oy = w.offsetTop, ow = w.offsetWidth, oh = w.offsetHeight;
    const [mw, mh] = MIN[w.dataset.win] || [180, 90];
    const lx = vangLijnen(w, "x"), ly = vangLijnen(w, "y");
    w.classList.add("dragging"); w.style.zIndex = ++zTop;
    const beweeg = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy, magneet = inst.magneet !== false && !ev.altKey; // Alt ingedrukt = vrij
      let bx = null, by = null;
      if (soort === "verplaats") {
        let x = ox + dx, y = oy + dy;
        if (magneet) {
          bx = vang([x, x + ow], lx); if (bx) x += bx.d;
          by = vang([y, y + oh], ly); if (by) y += by.d;
        }
        w.style.left = x + "px"; w.style.top = y + "px";
      } else {
        let b = Math.max(mw, ow + dx), h = Math.max(mh, oh + dy);
        if (magneet) {
          bx = vang([ox + b], lx); if (bx && ox + b + bx.d - ox >= mw) b += bx.d; else bx = null;
          if (!AUTO_H.has(w.dataset.win)) { by = vang([oy + h], ly); if (by && h + by.d >= mh) h += by.d; else by = null; }
        }
        w.style.width = b + "px";
        if (!AUTO_H.has(w.dataset.win)) w.style.height = h + "px";
      }
      toonLijn("snapX", bx, "x"); toonLijn("snapY", by, "y");
    };
    const los = () => {
      greep.removeEventListener("pointermove", beweeg);
      w.classList.remove("dragging");
      $("snapX").hidden = $("snapY").hidden = true;
      binnen(w); bewaarIndeling();
    };
    greep.addEventListener("pointermove", beweeg);
    greep.addEventListener("pointerup", los, { once: true });
    greep.addEventListener("pointercancel", los, { once: true });
  });
}
DESKTOP.addEventListener("change", () => {
  if (DESKTOP.matches) requestAnimationFrame(initLayout);
  else { hud.classList.remove("free"); for (const w of wins) w.removeAttribute("style"); }
});
addEventListener("resize", () => {
  if (!hud.classList.contains("free")) return;
  const W = hud.clientWidth, H = hud.clientHeight, o = inst.indeling || {};
  for (const w of wins) { if (o[w.dataset.win]) { const r = o[w.dataset.win]; plaats(w, { x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H }); } binnen(w); }
});

window.addEventListener("pywebviewready", async () => {
  const i = await api().info();
  inst = { ...inst, ...i.inst };
  $("model").innerHTML = i.modellen.map((m) => `<option>${m}</option>`).join("");
  $("model").value = i.model; $("naam").value = i.naam;
  document.querySelectorAll("[data-brein]").forEach((b) => b.classList.toggle("on", b.dataset.brein === i.brein));
  $("sleutel").placeholder = i.heeft_sleutel ? "•••••••• (ingesteld; leeg laten = zo houden)" : "vul je JARVIS_KEY in";
  $("instVersie").textContent = `ECO op de laptop · versie ${i.versie} (bestand NOVA.exe)`;
  pasBeeldToe();
  requestAnimationFrame(initLayout);
  if (!i.heeft_sleutel) { openInstellingen(); document.querySelector('[data-tab="algemeen"]').click(); $("sleutel").focus(); }
  api().klaar();
});
