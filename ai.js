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

// ---------- Reactor (SVG, twee keer gebruikt: login en HUD) ----------
function reactorSVG(n) {
  const ticks = (r, n, len, w = 1, op = 1) => {
    let d = "";
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, l = i % 5 === 0 ? len * 1.8 : len;
      d += `M${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}L${(Math.cos(a) * (r - l)).toFixed(1)} ${(Math.sin(a) * (r - l)).toFixed(1)}`;
    }
    return `<path class="s" d="${d}" stroke-width="${w}" opacity="${op}"/>`;
  };
  const arc = (r, a0, a1, w, op = 1) => {
    const p = (a) => `${(Math.cos(a * Math.PI / 180) * r).toFixed(1)} ${(Math.sin(a * Math.PI / 180) * r).toFixed(1)}`;
    return `<path class="s" d="M${p(a0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}" stroke-width="${w}" opacity="${op}"/>`;
  };
  return `<svg viewBox="-250 -250 500 500" aria-hidden="true">
    <defs>
      <radialGradient id="cg${n}"><stop offset="0" stop-color="#bff6ff" stop-opacity=".55"/><stop offset=".45" stop-color="#7ff3ff" stop-opacity=".45"/><stop offset=".7" stop-color="#00e1ff" stop-opacity=".25"/><stop offset="1" stop-color="#00e1ff" stop-opacity="0"/></radialGradient>
      <radialGradient id="cga${n}"><stop offset="0" stop-color="#ffe9c2" stop-opacity=".55"/><stop offset=".45" stop-color="#ffc861" stop-opacity=".45"/><stop offset=".7" stop-color="#ffb12a" stop-opacity=".25"/><stop offset="1" stop-color="#ffb12a" stop-opacity="0"/></radialGradient>
    </defs>
    <g class="rg r1">${ticks(205, 120, 6, 1, .7)}<circle class="s" r="212" stroke-width=".6" opacity=".35"/></g>
    <g class="rg r2">${arc(188, 0, 70, 3)}${arc(188, 85, 110, 3, .6)}${arc(188, 150, 250, 3)}${arc(188, 265, 275, 3, .6)}${arc(188, 300, 345, 3)}</g>
    <g class="rg r3"><circle class="s" r="170" stroke-width="1" stroke-dasharray="2 5" opacity=".7"/>${arc(162, 20, 140, 1, .5)}${arc(162, 200, 320, 1, .5)}</g>
    <g class="rg r4">${arc(145, 0, 40, 12, .45)}${arc(145, 60, 100, 12, .45)}${arc(145, 120, 160, 12, .45)}${arc(145, 180, 220, 12, .45)}${arc(145, 240, 280, 12, .45)}${arc(145, 300, 340, 12, .45)}</g>
    <g class="rg r5">${ticks(124, 60, 5, 1.2, .8)}<circle class="s" r="126" stroke-width=".8" opacity=".6"/></g>
    <g class="rg r6">${arc(104, 0, 100, 2)}${arc(104, 180, 280, 2)}<circle class="s" r="96" stroke-width=".6" opacity=".5"/></g>
    <circle class="core-glow c" r="88" fill="url(#cg${n})"/><circle class="core-glow a" r="88" fill="url(#cga${n})"/>
    <circle class="s" r="70" stroke-width="1.5" opacity=".9"/>
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
addEventListener("resize", sizeViz);
function drawViz(t) {
  const st = document.body.dataset.state;
  energyTarget = { idle: 0.06, listening: 0.45, thinking: 0.25, speaking: 0.35, error: 0.1 }[st] ?? 0.05;
  energy += (energyTarget - energy) * 0.04;
  const w = viz.width, h = viz.height, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.375;
  vctx.clearRect(0, 0, w, h);
  const color = st === "listening" ? "255,177,42" : st === "error" ? "255,77,77" : "0,225,255";
  for (let i = 0; i < BARS; i++) {
    const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
    let target;
    if (st === "thinking") target = 0.5 + 0.5 * Math.sin(a * 3 - t / 180);
    else target = Math.random() * (0.4 + 0.6 * Math.abs(Math.sin(a * 2 + t / 900)));
    levels[i] += (target * energy - levels[i]) * 0.25;
    const len = 3 + levels[i] * Math.min(w, h) * 0.13;
    vctx.strokeStyle = `rgba(${color},${Math.min(1, 0.3 + levels[i] * 1.6)})`;
    vctx.lineWidth = Math.max(1.5, w / 300);
    vctx.beginPath();
    vctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    vctx.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len));
    vctx.stroke();
  }
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
  $("meterFill").style.width = `${15 + energy * 80 + Math.random() * 5}%`;
}
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
function initStatus() {
  $("stVoice").textContent = Rec ? "IN + UIT" : window.speechSynthesis ? "ALLEEN UIT" : "N.V.T.";
  $("stVoice").className = Rec ? "ok" : "warn";
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
$("logout").onclick = () => sb.auth.signOut();
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
    li.textContent = c.title; li.dataset.id = c.id;
    li.onclick = () => { openConversation(c.id); closeDrawer(); };
    list.append(li);
  }
  markActive();
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
  speechSynthesis?.cancel();
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
    $("stLat").textContent = `${lastLatency} MS`;
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
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("nl"));
  return vs.find((v) => /xander|frank|male|man|google/i.test(v.name)) || vs[0];
}
function say(text) {
  if (!$("speak").checked || !window.speechSynthesis) { if (document.body.dataset.state !== "error") setState("idle"); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(plain(text));
  u.lang = "nl-NL"; u.rate = 1.04; u.pitch = 0.88;
  const v = pickVoice(); if (v) u.voice = v;
  u.onstart = () => setState("speaking");
  u.onboundary = () => bump(0.5);
  u.onend = u.onerror = () => setState("idle");
  speechSynthesis.speak(u);
  // Sommige browsers starten niet zonder interactie: val dan terug op stand-by.
  setTimeout(() => { if (!speechSynthesis.speaking && document.body.dataset.state === "thinking") setState("idle"); }, 1500);
}
speechSynthesis?.getVoices();
speechSynthesis?.addEventListener?.("voiceschanged", () => {});

// ---------- Spraak in ----------
let rec = null;
if (!Rec) $("mic").hidden = true;
function listen() {
  if (!Rec || rec) return;
  speechSynthesis?.cancel();
  rec = new Rec();
  rec.lang = "nl-NL"; rec.interimResults = true;
  rec.onresult = (e) => {
    const said = [...e.results].map((r) => r[0].transcript).join("");
    $("input").value = said; typeCaption("› " + said, "user"); bump(0.6);
  };
  rec.onend = () => {
    rec = null; $("mic").classList.remove("on");
    if (document.body.dataset.state === "listening") setState("idle");
    if ($("input").value.trim()) $("chatForm").requestSubmit();
  };
  rec.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") typeCaption("Microfoon: " + e.error, "err"); };
  $("mic").classList.add("on"); setState("listening"); sfx.listen();
  typeCaption("Ik luister…", "user");
  rec.start();
}
$("mic").onclick = () => (rec ? rec.stop() : listen());
// Spatie ingedrukt houden buiten het tekstvak = praten.
addEventListener("keydown", (e) => {
  if (e.code === "Space" && document.activeElement !== $("input") && !$("app").hidden && !e.repeat && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); listen(); }
});
addEventListener("keyup", (e) => { if (e.code === "Space" && rec) rec.stop(); });

// ---------- Start ----------
$("versionLogin").textContent = $("version").textContent; // PR-badge alleen zichtbaar op het inlogscherm
initStatus();
clock(); setInterval(clock, 1000);
readouts(); setInterval(readouts, 1400);
sizeViz(); requestAnimationFrame(drawViz);
boot();
