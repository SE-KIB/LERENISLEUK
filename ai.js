// Sekibar AI — frontend. Praat alleen met Supabase; de AI-sleutel staat nooit in de browser.
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
$("signup").onclick = async () => {
  if (!$("loginForm").reportValidity()) return;
  const { error } = await sb.auth.signUp({ email: $("email").value, password: $("password").value });
  $("loginMsg").textContent = error ? error.message : "Check je mail om je account te bevestigen.";
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
  let answer = "";
  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ conversationId: currentConv, message: text }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fout ${res.status}`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "", isNew = !currentConv;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      const parts = buf.split("\n\n"); buf = parts.pop();
      for (const p of parts) {
        if (!p.startsWith("data: ")) continue;
        const ev = JSON.parse(p.slice(6));
        if (ev.type === "start") currentConv = ev.conversationId;
        if (ev.type === "delta") { answer += ev.text; out.innerHTML = md(answer); $("messages").scrollTop = $("messages").scrollHeight; }
      }
    }
    if (isNew) loadConversations();
  } catch (err) {
    out.textContent = "⚠️ " + err.message;
  } finally {
    $("send").disabled = false; $("input").focus();
  }
};

show();
