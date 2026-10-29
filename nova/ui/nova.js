// NOVA-interface: dezelfde HUD als ECO (reactor, visualisatie, panelen). De Python-kant (nova.py) doet het werk:
// ECO-brein of eigen brein, stem, pc-acties. Python → pagina: window.nova.ev({...}); pagina → Python: window.pywebview.api.
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
function entry(rol, tekst) {
  const div = document.createElement("div");
  div.className = "entry " + rol;
  const wie = rol === "user" ? "SERKAN" : rol === "assistant" ? "N.O.V.A." : rol === "fout" ? "STORING" : "SYSTEEM";
  div.innerHTML = `<div class="meta">${wie} · ${tijd()}</div><div class="body"></div>`;
  const body = div.lastChild;
  body.textContent = tekst;
  $("messages").append(div);
  $("messages").scrollTop = $("messages").scrollHeight;
  return body;
}
let huidig = null, pcAantal = 0;
function pcActie(e) {
  const lijst = $("pcList");
  lijst.querySelector(".empty")?.remove();
  const li = document.createElement("li");
  li.className = e.status || "";
  li.innerHTML = `<b></b><small></small>`;
  li.firstChild.textContent = `${tijd().slice(0, 5)} · ${e.tekst}`;
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
  $("stBrein").textContent = s.modus === "online" ? "ECO (GROQ/GEMINI)" : s.modus === "offline" ? "EIGEN BREIN" : "GEEN";
  $("stBrein").className = s.modus === "online" ? "ok" : s.modus === "offline" ? "warn" : "bad";
  $("stEco").textContent = s.eco; $("stEco").className = s.modus === "online" ? "ok" : "warn";
  $("stModel").textContent = s.model;
  $("stOllama").textContent = s.lokaal; $("stOllama").className = s.lokaal_ok ? "ok" : "warn";
  $("stSpraak").textContent = s.spraak || "—";
  $("stStem").textContent = (s.stem || "—") + (s.stem_reden ? " ⚠" : "");
  $("stStem").className = s.stem_soort || "";
  $("stStem").title = s.stem_reden || "";
  $("stNaam").textContent = s.naam || "—";
  $("brein").textContent = s.modus === "online" ? "ECO-BREIN" : s.modus === "offline" ? s.model.toUpperCase() : "—";
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
    else if (e.t === "melding") { $("setMsg").textContent = e.tekst; $("setMsg").className = "login-msg push-msg " + (e.soort || ""); }
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
addEventListener("keydown", (e) => { if (e.ctrlKey && e.code === "Space") { e.preventDefault(); $("mic").click(); } });
$("opslaan").onclick = () => api() && api().opslaan({ eco_sleutel: $("sleutel").value, naam: $("naam").value, model: $("model").value, stem: $("stem").checked });
$("download").onclick = () => api() && api().download($("model").value);
$("stem").onchange = () => $("opslaan").click();
window.addEventListener("pywebviewready", async () => {
  const i = await api().info();
  $("model").innerHTML = i.modellen.map((m) => `<option>${m}</option>`).join("");
  $("model").value = i.model; $("naam").value = i.naam; $("stem").checked = i.stem;
  $("sleutel").placeholder = i.heeft_sleutel ? "•••••••• (ingesteld; leeg laten = zo houden)" : "vul je JARVIS_KEY in";
  if (!i.heeft_sleutel) $("sleutel").focus();
  api().klaar();
});
