// ECO — frontend. Praat alleen met Supabase; de AI-sleutel staat nooit in de browser.
const SUPABASE_URL = "https://wlpfgbrvnzjclnjocewj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_uzfw5GWuAc7ys44q4DNHsw_r9mDstF9";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const md = (t) => DOMPurify.sanitize(marked.parse(t));
let currentConv = null;

// Oude service worker van de vorige site opruimen.
navigator.serviceWorker?.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));

async function show() {
  const { data: { session } } = await sb.auth.getSession();
  $("login").hidden = !!session;
  $("app").hidden = !session;
  if (session) { await loadConversations(); $("input").focus(); }
}
sb.auth.onAuthStateChange(() => show());

$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $("email").value, password: $("password").value });
  $("loginMsg").textContent = error ? "Inloggen mislukt: " + error.message : "";
};
$("logout").onclick = () => sb.auth.signOut();
$("newChat").onclick = () => { currentConv = null; $("messages").innerHTML = ""; markActive(); $("input").focus(); };

async function loadConversations() {
  const { data } = await sb.from("ai_conversations").select("id,title").order("updated_at", { ascending: false }).limit(100);
  $("convList").innerHTML = "";
  for (const c of data ?? []) {
    const li = document.createElement("li");
    li.textContent = c.title; li.dataset.id = c.id;
    li.onclick = () => openConversation(c.id);
    $("convList").append(li);
  }
  markActive();
}
function markActive() {
  for (const li of $("convList").children) li.classList.toggle("active", li.dataset.id === currentConv);
}
async function openConversation(id) {
  currentConv = id; markActive();
  const { data } = await sb.from("ai_messages").select("role,content").eq("conversation_id", id).order("id");
  $("messages").innerHTML = "";
  for (const m of data ?? []) bubble(m.role, m.content);
}
function bubble(role, text) {
  const div = document.createElement("div");
  div.className = "bubble " + role;
  if (role === "assistant") div.innerHTML = md(text); else div.textContent = text;
  $("messages").append(div);
  $("messages").scrollTop = $("messages").scrollHeight;
  return div;
}

$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("chatForm").requestSubmit(); }
});
$("input").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; });

$("chatForm").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("input").value.trim();
  if (!text) return;
  $("input").value = ""; $("input").style.height = "auto"; $("send").disabled = true;
  bubble("user", text);
  const out = bubble("assistant", "…");
  $("orb").classList.add("thinking");
  try {
    const { data: { session } } = await sb.auth.getSession();
    const isNew = !currentConv;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ conversationId: currentConv, message: text }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fout ${res.status}`);
    const data = await res.json();
    currentConv = data.conversationId;
    out.innerHTML = md(data.reply);
    say(data.reply);
    if (data.open) {
      const a = document.createElement("a");
      a.href = data.open; a.className = "action"; a.textContent = "🗺️ Open in Google Maps";
      out.append(a);
      setTimeout(() => { location.href = data.open; }, 1200); // even laten voorlezen, dan Maps openen
    }
    if (isNew) loadConversations();
  } catch (err) {
    out.textContent = "⚠️ " + err.message;
  } finally {
    $("send").disabled = false; $("orb").classList.remove("thinking"); $("input").focus();
  }
};

// ---------- Spraak ----------
function say(text) {
  if (!$("speak").checked || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_#`>]/g, ""));
  u.lang = "nl-NL";
  const v = speechSynthesis.getVoices().find((v) => v.lang.startsWith("nl") && /male|man|xander|frank/i.test(v.name))
         || speechSynthesis.getVoices().find((v) => v.lang.startsWith("nl"));
  if (v) u.voice = v;
  u.onstart = () => $("orb").classList.add("speaking");
  u.onend = () => $("orb").classList.remove("speaking");
  speechSynthesis.speak(u);
}

const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
if (!Rec) $("mic").hidden = true;
function listen() {
  if (!Rec || rec) return;
  speechSynthesis?.cancel();
  rec = new Rec();
  rec.lang = "nl-NL"; rec.interimResults = true;
  rec.onresult = (e) => { $("input").value = [...e.results].map((r) => r[0].transcript).join(""); };
  rec.onend = () => {
    rec = null; $("mic").classList.remove("on"); $("orb").classList.remove("listening");
    if ($("input").value.trim()) $("chatForm").requestSubmit();
  };
  $("mic").classList.add("on"); $("orb").classList.add("listening");
  rec.start();
}
$("mic").onclick = () => (rec ? rec.stop() : listen());
// Spatie ingedrukt houden buiten het tekstvak = praten.
addEventListener("keydown", (e) => {
  if (e.code === "Space" && document.activeElement !== $("input") && !$("app").hidden && !e.repeat) { e.preventDefault(); listen(); }
});
addEventListener("keyup", (e) => { if (e.code === "Space" && rec) rec.stop(); });

show();
