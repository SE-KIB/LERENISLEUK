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
let currentConv = null, lastLatency = null, justLoggedIn = false;

// Oude service worker van de vorige site opruimen.
navigator.serviceWorker?.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));

// ---------- Toestand ----------
const STATE_LABEL = { idle: "STAND-BY", listening: "LUISTEREN", thinking: "VERWERKEN", speaking: "SPREKEN", error: "STORING" };
function setState(s) {
  document.body.dataset.state = s;
  $("stateLabel").textContent = STATE_LABEL[s];
}

// ---------- Geluid (UI-tonen via Web Audio, geen bestanden) ----------
let actx = null;
function tone(freq, dur = 0.07, type = "sine", vol = 0.035, delay = 0) {
  if (!$("sfx").checked) return;
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
  energy += (energyTarget - energy) * 0.04;
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
  const pct = Math.round(Math.min(1, energy / 0.45) * 100);
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
  sizeViz();
  requestAnimationFrame(initLayout);
  loadConversations();
  if (!$("messages").children.length) {
    const text = `${greeting()}, Serkan. Alle systemen zijn operationeel. Waarmee kan ik helpen?`;
    typeCaption(text);
    if (justLoggedIn) { sfx.open(); say(text); }
  }
  justLoggedIn = false;
  if (matchMedia("(min-width: 901px)").matches) $("input").focus();
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
$("archiveBtn").onclick = () => $("leftCol").classList.toggle("open");
const closeDrawer = () => $("leftCol").classList.remove("open");

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

// ---------- Transcript en ondertiteling ----------
function entry(role, text, time = hhmmss()) {
  const div = document.createElement("div");
  div.className = "entry " + role;
  div.innerHTML = `<div class="meta">${role === "user" ? "SERKAN" : "E.C.O."} · ${time}</div><div class="body"></div>`;
  const body = div.lastChild;
  if (role === "assistant") body.innerHTML = md(text); else body.textContent = text;
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

// ---------- Versturen ----------
$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("chatForm").requestSubmit(); }
});
$("input").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; });

$("chatForm").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("input").value.trim();
  if (!text) return;
  $("input").value = ""; $("input").style.height = "auto"; $("send").disabled = true;
  stopSpeaking();
  entry("user", text);
  typeCaption("› " + text, "user");
  setState("thinking"); sfx.send();
  const t = performance.now();
  try {
    const { data: { session } } = await sb.auth.getSession();
    const isNew = !currentConv;
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ conversationId: currentConv, message: text }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fout ${res.status}`);
    const data = await res.json();
    lastLatency = Math.round(performance.now() - t);
    const ai = /ai;dur=(\d+)/.exec(res.headers.get("server-timing") || "")?.[1];
    $("stLat").textContent = ai ? `${(lastLatency / 1000).toFixed(1)}S · AI ${(ai / 1000).toFixed(1)}S` : `${(lastLatency / 1000).toFixed(1)}S`;
    if (data.model) $("stModel").textContent = data.model.replace(/^gemini-|^claude-/, "").toUpperCase();
    currentConv = data.conversationId;
    $("convId").textContent = currentConv.slice(0, 8).toUpperCase();
    const body = entry("assistant", data.reply);
    sfx.reply();
    typeCaption(plain(data.reply));
    say(data.reply);
    if (data.open) {
      const a = document.createElement("a");
      a.href = data.open; a.className = "action"; a.textContent = "▶ OPEN IN GOOGLE MAPS";
      body.append(a);
      setTimeout(() => { location.href = data.open; }, 1800); // eerst laten voorlezen, dan Maps openen
    }
    if (isNew) loadConversations();
  } catch (err) {
    setState("error"); sfx.error();
    typeCaption("Storing: " + err.message, "err");
    entry("assistant", "⚠ " + err.message);
    setTimeout(() => document.body.dataset.state === "error" && setState("idle"), 2500);
  } finally {
    $("send").disabled = false;
    if (matchMedia("(min-width: 901px)").matches) $("input").focus();
  }
};

// ---------- Spraak uit ----------
// Eerst de natuurlijke stem (ElevenLabs via de Edge Function); lukt dat niet, dan de browserstem.
const player = new Audio();
player.preload = "auto";
let premiumVoice = true, analyser = null;
// 0,1 s stilte als WAV, om de speler te ontgrendelen.
const SILENCE = (() => {
  const n = 800, b = new DataView(new ArrayBuffer(44 + n * 2)), w = (o, t) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); b.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, 8000, true); b.setUint32(28, 16000, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, "data"); b.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
})();
// iOS staat afspelen pas toe na een tik: ontgrendel de speler bij de eerste interactie.
function unlockAudio() {
  if (player.dataset.unlocked) return;
  player.dataset.unlocked = "1";
  player.src = SILENCE; player.play().catch(() => {});
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    actx.resume();
    const src = actx.createMediaElementSource(player);
    analyser = actx.createAnalyser(); analyser.fftSize = 64;
    src.connect(analyser).connect(actx.destination);
  } catch { analyser = null; }
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
  if (!analyser || player.paused) return;
  analyser.getByteFrequencyData(freq);
  bump((freq.reduce((a, b) => a + b, 0) / freq.length / 255) * 0.35);
  requestAnimationFrame(voiceLevel);
}
player.onplay = () => { setState("speaking"); voiceLevel(); };
player.onerror = () => { if (document.body.dataset.state === "speaking") setState("idle"); };

// Snel beginnen met praten: eerste zin apart laten inspreken, de rest tegelijk ophalen en daarna afspelen.
function chunks(text) {
  const parts = text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [text];
  const first = [];
  while (parts.length && (first.join("").length < 40 || !first.length)) first.push(parts.shift());
  return [first.join("").trim(), parts.join("").trim()].filter(Boolean);
}
let voiceGen = 0, queue = [], wholeText = false; // wholeText: stemdienst liever één verzoek per antwoord (Gemini)
async function ttsBlob(text) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ tts: text }),
  });
  if (res.status === 501 || res.status === 400) { premiumVoice = false; throw new Error("geen stem ingesteld"); }
  if (!res.ok || !(res.headers.get("content-type") || "").includes("audio")) throw new Error("stem " + res.status);
  if ((res.headers.get("content-type") || "").includes("wav")) wholeText = true;
  return URL.createObjectURL(await res.blob());
}
async function playNext(gen) {
  if (gen !== voiceGen) return;
  const next = queue.shift();
  if (!next) { if (document.body.dataset.state === "speaking") setState("idle"); return; }
  try {
    const url = await next;
    if (gen !== voiceGen) return;
    player.src = url;
    player.onloadeddata = () => URL.revokeObjectURL(url);
    await player.play();
  } catch (e) { console.warn("Stemdeel overgeslagen:", e.message); playNext(gen); }
}
player.onended = () => playNext(voiceGen);
async function sayPremium(text) {
  const gen = ++voiceGen;
  queue = (wholeText ? [text] : chunks(text)).map(ttsBlob);
  queue.forEach((p) => p.catch(() => {})); // fouten worden bij het afspelen afgehandeld
  await queue[0]; // gooit een fout als de stem niet beschikbaar is → terugval op browserstem
  playNext(gen);
}
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("nl"));
  return vs.find((v) => /xander|frank|male|man|google/i.test(v.name)) || vs[0];
}
function sayBrowser(text) {
  if (!window.speechSynthesis) { setState("idle"); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "nl-NL"; u.rate = 1.04; u.pitch = 0.88;
  const v = pickVoice(); if (v) u.voice = v;
  u.onstart = () => setState("speaking");
  u.onboundary = () => bump(0.5);
  u.onend = u.onerror = () => setState("idle");
  speechSynthesis.speak(u);
  setTimeout(() => { if (!speechSynthesis.speaking && document.body.dataset.state === "thinking") setState("idle"); }, 1500);
}
async function say(text) {
  if (!$("speak").checked) { if (document.body.dataset.state !== "error") setState("idle"); return; }
  stopSpeaking();
  const t = plain(text);
  if (premiumVoice) {
    try { await sayPremium(t); $("stVoice").textContent = wholeText ? "GEMINI" : "ELEVENLABS"; return; }
    catch (e) { console.warn("Natuurlijke stem niet beschikbaar:", e.message); }
  }
  sayBrowser(t);
}
function stopSpeaking() { voiceGen++; queue = []; speechSynthesis?.cancel(); player.pause(); }
speechSynthesis?.getVoices();

// ---------- Spraak in ----------
// Voorkeur: opnemen en laten uitschrijven door Whisper (Groq) via de Edge Function — verstaat Nederlands
// veel beter. Stopt vanzelf na een korte stilte. Terugval: de spraakherkenning van de browser.
const CAN_RECORD = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
let whisper = CAN_RECORD, rec = null, recording = null;
if (!CAN_RECORD && !Rec) $("mic").hidden = true;

function listen() {
  if (rec || recording) return;
  stopSpeaking();
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
  const buf = new Float32Array(512);
  const watch = () => {
    if (mr.state !== "recording") return;
    if (an) {
      an.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length);
      bump(Math.min(0.6, rms * 6));
      const now = Date.now();
      if (rms > 0.02) { spoke = true; quietSince = 0; }
      else if (spoke) { quietSince ||= now; if (now - quietSince > 1300) return mr.stop(); }
      if (!spoke && now - started > 7000) return mr.stop();   // niets gezegd
    }
    if (Date.now() - started > 30000) return mr.stop();      // maximaal 30 s
    raf = requestAnimationFrame(watch);
  };

  mr.onstop = async () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    recording = null; micOn(false);
    if (an && !spoke) { typeCaption(""); return; }
    const blob = new Blob(parts, { type: mr.mimeType || type || "audio/webm" });
    const ext = /mp4|m4a/.test(blob.type) ? "m4a" : /ogg/.test(blob.type) ? "ogg" : "webm";
    setState("thinking"); typeCaption("Uitschrijven…", "user");
    try {
      const { data: { session } } = await sb.auth.getSession();
      const fd = new FormData(); fd.append("file", blob, `spraak.${ext}`);
      const res = await fetch(FUNCTION_URL, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY }, body: fd });
      if (res.status === 501) { whisper = false; setState("idle"); if (Rec) listenBrowser(); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Fout ${res.status}`);
      setState("idle");
      if (!data.text) { typeCaption("Ik heb niets verstaan.", "user"); return; }
      $("input").value = data.text;
      $("stVoice").textContent = "WHISPER";
      $("chatForm").requestSubmit();
    } catch (err) {
      setState("idle"); typeCaption("Spraak: " + err.message, "err");
    }
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
const AUTO_H = new Set(["cmd", "bediening"]); // hoogte volgt de inhoud
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
  const saved = loadLayout(), base = hud.getBoundingClientRect();
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
const labMsg = (t, cls = "") => { $("labMsg").className = "login-msg " + cls; $("labMsg").textContent = t; };
let labAudio = null;
const GEM_STYLE = "a calm, refined British AI butler: composed, highly intelligent, subtly dry-humoured, warm but precise, unhurried pace";
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
          premiumVoice = true; wholeText = false;
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
    premiumVoice = true; wholeText = false;
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
$("versionLogin").textContent = $("version").textContent; // PR-badge alleen zichtbaar op het inlogscherm
initStatus();
clock(); setInterval(clock, 1000);
readouts(); setInterval(readouts, 1400);
sizeViz(); requestAnimationFrame(drawViz);
boot();
