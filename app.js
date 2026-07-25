/* ============================================================
   App-logica voor Çalış Artık Da. Afgesplitst van index.html.
   Wordt geladen NA de Supabase-bibliotheek en lessons.js, dus
   window.supabase, COURSES, SOON en QUIZZES zijn hier beschikbaar.
   De lesinhoud staat in lessons.js; het uiterlijk in styles.css.
   ============================================================ */
/* ============================================================
   SUPABASE CONFIG
   Leeg laten = lokale modus (voortgang alleen op dit apparaat).
   Vul beide waarden in na de setup (zie DOCENT-SETUP.md) om de centrale
   database + docenten-dashboard te activeren. De anon-sleutel mag publiek
   zijn; de beveiliging zit in de database-regels (RLS).
   ============================================================ */
const SUPABASE_URL = "https://wlpfgbrvnzjclnjocewj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_uzfw5GWuAc7ys44q4DNHsw_r9mDstF9";
const CLOUD_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);   // sleutels ingevuld = cloud bedoeld
const CLOUD = !!(CLOUD_CONFIGURED && window.supabase);            // écht actief: sleutels + script geladen
const sb = CLOUD ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

/* ============================================================
   PUSHMELDINGEN — publieke VAPID-sleutel
   Deze sleutel mág publiek zijn (staat in elke bezoeker z'n browser). De
   bijbehorende privésleutel staat NIET hier, maar als Supabase-secret
   (VAPID_PRIVATE_KEY) — zie DOCENT-SETUP.md. Leeg laten schakelt meldingen uit.
   ============================================================ */
const VAPID_PUBLIC_KEY = "BKa9HO01mThZQuFVtYZUxgZNBu7vBNk-COc4drqK8Rjgazl4DN3fvW28rZHMT2ks1YYrc1E3tf6ehDoYZGjGg2A";

/* ---------------- lesdata ----------------
   COURSES, SOON en QUIZZES staan in lessons.js (hierboven geladen).
   Zo blijft dit bestand de app-logica en lessons.js de inhoud. */
/* ---------------- theme ---------------- */
const root=document.documentElement;
function setTheme(t){root.setAttribute('data-theme',t);
  document.querySelectorAll('#themeToggle,#themeToggle2').forEach(b=>b.textContent=t==='dark'?'☀️':'🌙');
  try{localStorage.setItem('lil-theme',t)}catch(e){}}
(function(){let t;try{t=localStorage.getItem('lil-theme')}catch(e){}
  if(!t)t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'; setTheme(t);})();
document.addEventListener('click',e=>{const b=e.target.closest('#themeToggle,#themeToggle2');
  if(b)setTheme(root.getAttribute('data-theme')==='dark'?'light':'dark');});

/* ---------------- geluidseffecten aan/uit ----------------
   Dempt alleen de feedback-/succesgeluiden. De uitspraak-knoppen (🔊 bij een
   woord) blijven werken, want dat is een bewuste leeractie. */
let soundMuted=false; try{ soundMuted=localStorage.getItem('lil-muted')==='1'; }catch(e){}
function updateSoundBtn(){
  document.querySelectorAll('#soundToggle').forEach(b=>{
    b.textContent=soundMuted?'🔇':'🔊';
    b.setAttribute('aria-pressed',soundMuted?'true':'false');
    b.title=soundMuted?'Geluidseffecten aan zetten':'Geluidseffecten uit zetten';
  });
}
function setMuted(m){ soundMuted=!!m; try{localStorage.setItem('lil-muted',soundMuted?'1':'0');}catch(e){} updateSoundBtn(); }
updateSoundBtn();
document.addEventListener('click',e=>{const b=e.target.closest('#soundToggle'); if(b)setMuted(!soundMuted);});

/* ---------------- login canvas (letters) ---------------- */
(function(){const c=document.getElementById('bgCanvas');if(!c)return;const ctx=c.getContext('2d');
  let w,h,syms=[];const glyphs=['a','b','c','de','het','ij','ei','au','oe','ng','A','B','Aa','?','!','€','ui'];
  function size(){w=c.width=c.offsetWidth*devicePixelRatio;h=c.height=c.offsetHeight*devicePixelRatio;}
  function init(){size();syms=[];const n=Math.max(16,Math.floor(w*h/90000));
    for(let i=0;i<n;i++)syms.push({x:Math.random()*w,y:Math.random()*h,s:(14+Math.random()*30)*devicePixelRatio,
      v:(.1+Math.random()*.35)*devicePixelRatio,g:glyphs[i%glyphs.length],a:.06+Math.random()*.18});}
  function draw(){ctx.clearRect(0,0,w,h);ctx.fillStyle='#ffffff';ctx.textBaseline='middle';
    for(const s of syms){ctx.globalAlpha=s.a;ctx.font='700 '+s.s+'px '+getComputedStyle(document.body).fontFamily;
      ctx.fillText(s.g,s.x,s.y);s.y-=s.v;if(s.y<-40){s.y=h+30;s.x=Math.random()*w;}}
    ctx.globalAlpha=1;requestAnimationFrame(draw);}
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){size();ctx.globalAlpha=.12;}
  init();addEventListener('resize',init);
  if(!matchMedia('(prefers-reduced-motion:reduce)').matches)draw();})();

/* ---------------- auth ----------------
   Toegestane accounts. Wachtwoorden staan versleuteld (SHA-256), niet leesbaar.
   Nieuw account toevoegen? Bereken de hash van het wachtwoord en zet een regel
   hieronder. Dit is een inlog-drempel voor een statische site — voor volledig
   waterdichte beveiliging is een dienst als Cloudflare Access nodig. */
const ACCOUNTS = [
  // Beheerder-docent (joker): ziet álle klassen en mag ook als leerling oefenen.
  {email:"s@e.nl", name:"Serkan",   hash:"53d2dd2504402eec1bc49ad74daf2e90c352f399842f3d5a3606892213c110fc", role:"teacher", joker:true},
  // Tweede docent: pure docent, ziet alléén klas-2 (geen joker, geen leerlingscherm).
  {email:"t@k.nl", name:"Docent 2", hash:"7496f3d3859c36d1bfd22156a42d0d533aab4425b80e381d0ab1835ae6b190e3", role:"teacher", class:"klas-2"},
  // De 5 leerlingen van klas-2 (Docent 2).
  {email:"o@k.nl",  name:"Ozcan",     hash:"b755c94833cb0a82838da57f0fd61c2240ba42827a50e8aa53ee27cc54cf68b4", class:"klas-2"},
  {email:"s1@k.nl", name:"Student 1", hash:"509e87a6c45ee0a3c657bf946dd6dc43d7e5502143be195280f279002e70f7d9", class:"klas-2"},
  {email:"s2@k.nl", name:"Student 2", hash:"eb4b3111401df980f14f28ad6804ae096df1e1c6963c51eab4140be226f8c94c", class:"klas-2"},
  {email:"s3@k.nl", name:"Student 3", hash:"373b29d2837e83b9ca5cec712a5985843df271cc7c06e64629472f4d03c6f83c", class:"klas-2"},
  {email:"s4@k.nl", name:"Student 4", hash:"ba94ccdc15adac7f65efce821dfa9605dfc42cf98da7ce002073604647d40ed2", class:"klas-2"},
];

const $=id=>document.getElementById(id);

/* ---------------- meldingen (toast) ----------------
   Korte, niet-blokkerende melding onderaan het scherm. Voor situaties waarin
   een 'alert' te opdringerig is (bv. voortgang die niet kon worden opgeslagen).
   type: '' (neutraal), 'warn' (oranje) of 'bad' (rood). */
function notify(msg,type){
  const host=$('toastHost'); if(!host)return;
  const t=document.createElement('div');
  t.className='toast'+(type?(' '+type):'');
  t.setAttribute('role','status');
  const txt=document.createElement('span'); txt.textContent=msg; t.appendChild(txt);
  const x=document.createElement('button');
  x.type='button'; x.className='toast-x'; x.setAttribute('aria-label','Melding sluiten'); x.textContent='×';
  const close=()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),200); };
  x.addEventListener('click',close); t.appendChild(x);
  host.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(close,6000);
}

/* ---------------- afgeleide aantallen (inhoud) ---------------- */
const ZINS_LESSONS = (typeof ZINS!=='undefined') ? ZINS.length : 0;                 // Zinsopbouw-lessen
const ZINS_EXERCISES = (typeof ZINS!=='undefined')
  ? ZINS.reduce((s,z)=>s+((z.items&&z.items.length)||0),0) : 0;
const TOTAL_LESSONS = COURSES.length + ZINS_LESSONS + SOON.length;  // alle lessen (beide leerlijnen)
const PLAYABLE = COURSES.filter(c=>QUIZZES[c.n]).length;            // Woordjes met vragen
const TOTAL_EXERCISES = Object.values(QUIZZES).reduce((s,q)=>s+q.q.length,0) + ZINS_EXERCISES;
function fillAsideStats(){
  const set=(id,v)=>{const el=$(id); if(el) el.textContent=v;};
  set('asideLessen',TOTAL_LESSONS);
  set('asideSpeelbaar',PLAYABLE+ZINS_LESSONS);
  set('asideOefeningen',TOTAL_EXERCISES);
}
fillAsideStats();

/* ---------------- voortgang per account ---------------- */
let currentUser=null;
let progCache={lessons:{},days:[]};   // voortgang van de ingelogde gebruiker
const PASS=80; // vanaf dit percentage geldt een les als 'afgerond'
function progKey(){return 'lil-prog-'+(currentUser?currentUser.email:'anon');}
function loadProg(){try{return JSON.parse(localStorage.getItem(progKey()))||{lessons:{},days:[]}}catch(e){return {lessons:{},days:[]}}}
function saveProg(p){try{localStorage.setItem(progKey(),JSON.stringify(p))}catch(e){}}
function recordResult(id,pct){                        // lokale modus: beste score per les bewaren
  const p=loadProg();
  p.lessons[id]=Math.max(p.lessons[id]||0,pct);
  const today=new Date().toISOString().slice(0,10);
  if(!p.days.includes(today))p.days.push(today);
  saveProg(p);
}
/* melding tonen als opslaan naar de cloud hapert — maar hooguit één keer per
   sessie, zodat een leerling niet bij elke vraag een melding krijgt. */
let cloudWarnShown=false;
function warnCloudSaveFailed(){
  if(cloudWarnShown)return; cloudWarnShown=true;
  notify('Verbinding met de server hapert — je voortgang wordt mogelijk niet bewaard. Controleer je internet.','warn');
}
/* cloud: sla het antwoord op één vraag op (nieuwste telt) */
async function cloudRecordAnswer(lesson,qIndex,correct){
  if(!CLOUD||!currentUser||!currentUser.id)return;
  try{ const {error}=await sb.from('answers').upsert(
    {user_id:currentUser.id, email:currentUser.email, lesson:String(lesson), q_index:qIndex, correct:!!correct, updated_at:new Date().toISOString()},
    {onConflict:'user_id,lesson,q_index'});
    if(error)warnCloudSaveFailed();
  }catch(e){ warnCloudSaveFailed(); }
}
/* cloud: bewaar één volledige poging (met per-vraag detail) als geschiedenis */
async function cloudRecordAttempt(lesson,mode,score,total,details){
  if(!CLOUD||!currentUser||!currentUser.id)return;
  try{ const {error}=await sb.from('attempts').insert(
    {user_id:currentUser.id, email:currentUser.email, lesson:String(lesson), mode:mode||'',
     score:score, total:total, pct:total?Math.round(score/total*100):0,
     details:details||[], created_at:new Date().toISOString()});
    if(error)warnCloudSaveFailed();
  }catch(e){ warnCloudSaveFailed(); }
}
/* zet per-vraag rijen om naar {lessons:{les:pct}, days:[]} */
function aggregate(rows){
  const byLesson={}, dayset=new Set();
  (rows||[]).forEach(r=>{(byLesson[r.lesson]=byLesson[r.lesson]||[]).push(r); if(r.updated_at)dayset.add(String(r.updated_at).slice(0,10));});
  const lessons={};
  for(const les in byLesson){
    const total=QUIZZES[les]?QUIZZES[les].q.length:byLesson[les].length;
    const correct=byLesson[les].filter(r=>r.correct).length;
    lessons[les]=Math.round(correct/total*100);
  }
  return {lessons,days:[...dayset]};
}
/* laad voortgang van de ingelogde gebruiker in progCache */
async function refreshProgress(){
  if(CLOUD&&currentUser&&currentUser.id){
    try{
      const [{data:ans},{data:att}]=await Promise.all([
        sb.from('answers').select('lesson,q_index,correct,updated_at').eq('user_id',currentUser.id),
        sb.from('attempts').select('created_at').eq('user_id',currentUser.id)
      ]);
      progCache=aggregate(ans);
      (att||[]).forEach(a=>{const d=a.created_at&&String(a.created_at).slice(0,10); if(d&&!progCache.days.includes(d))progCache.days.push(d);});
    }catch(e){ progCache={lessons:{},days:[]}; }
  } else { progCache=loadProg(); }
}
/* ---------------- lessen vrijgeven (per les aan/uit) ----------------
   Bepaalt welke lessen een leerling te zien krijgt. Een les zonder eigen
   instelling geldt als 'vrij' (zo blijven bestaande lessen zichtbaar).
   De docent zet lessen die nog in de maak zijn op 'niet vrij'; leerlingen
   zien die dan niet, de docent zelf wél (om te ontwerpen en te testen). */
let releaseCache=null;   // {lesId: boolean}  — undefined/ontbrekend = vrij
async function loadReleases(){
  if(CLOUD){
    try{ const {data}=await sb.from('lesson_settings').select('lesson,released');
      const m={}; (data||[]).forEach(r=>m[String(r.lesson)]=!!r.released); releaseCache=m;
    }catch(e){ releaseCache={}; }
  } else {
    try{ releaseCache=JSON.parse(localStorage.getItem('lil-releases'))||{}; }catch(e){ releaseCache={}; }
  }
}
function isReleased(id){
  if(!releaseCache)return true;                 // nog niet geladen = niet blokkeren
  return releaseCache[String(id)]!==false;      // standaard vrij, alleen expliciet 'false' verbergt
}
function isTeacherViewer(){ return !!(currentUser&&(currentUser.role==='teacher'||currentUser.joker)); }
async function setReleased(id,val){
  if(!releaseCache)releaseCache={};
  releaseCache[String(id)]=!!val;
  if(CLOUD){
    try{ const {error}=await sb.from('lesson_settings').upsert(
      {lesson:String(id), released:!!val, updated_at:new Date().toISOString()},{onConflict:'lesson'});
      if(error)throw error; return true;
    }catch(e){ return false; }
  } else {
    try{ localStorage.setItem('lil-releases',JSON.stringify(releaseCache)); return true; }catch(e){ return false; }
  }
}

function computeStreak(days){
  if(!days||!days.length)return 0;
  const set=new Set(days); let streak=0; const d=new Date();
  for(;;){const key=d.toISOString().slice(0,10); if(set.has(key)){streak++; d.setDate(d.getDate()-1);} else break;}
  return streak;
}

async function sha256(txt){
  // Snelle weg via de browser (alleen op https/localhost beschikbaar)…
  try{
    if(typeof crypto!=='undefined' && crypto.subtle){
      const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(txt));
      return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
    }
  }catch(e){}
  // …anders een pure-JS berekening, zodat inloggen ook zonder https werkt.
  return sha256js(txt);
}
function sha256js(ascii){
  function rightRotate(value, amount){ return (value>>>amount) | (value<<(32-amount)); }
  var mathPow=Math.pow, maxWord=mathPow(2,32), result='', words=[];
  var asciiBitLength=ascii.length*8;
  var hash=sha256js.h=sha256js.h||[]; var k=sha256js.k=sha256js.k||[];
  var primeCounter=k.length; var isComposite={};
  for(var candidate=2; primeCounter<64; candidate++){
    if(!isComposite[candidate]){
      for(var i=0;i<313;i+=candidate){ isComposite[i]=candidate; }
      hash[primeCounter]=(mathPow(candidate,.5)*maxWord)|0;
      k[primeCounter++]=(mathPow(candidate,1/3)*maxWord)|0;
    }
  }
  ascii+='\x80'; while(ascii.length%64-56) ascii+='\x00';
  for(var i=0;i<ascii.length;i++){ var j=ascii.charCodeAt(i); if(j>>8) return; words[i>>2]|=j<<((3-i)%4)*8; }
  words[words.length]=((asciiBitLength/maxWord)|0); words[words.length]=(asciiBitLength);
  for(var j=0;j<words.length;){
    var w=words.slice(j,j+=16); var oldHash=hash; hash=hash.slice(0,8);
    for(var i=0;i<64;i++){
      var w15=w[i-15], w2=w[i-2]; var a=hash[0], e=hash[4];
      var temp1=hash[7]+(rightRotate(e,6)^rightRotate(e,11)^rightRotate(e,25))
        +((e&hash[5])^((~e)&hash[6]))+k[i]
        +(w[i]=i<16?w[i]:(w[i-16]+(rightRotate(w15,7)^rightRotate(w15,18)^(w15>>>3))
          +w[i-7]+(rightRotate(w2,17)^rightRotate(w2,19)^(w2>>>10)))|0);
      var temp2=(rightRotate(a,2)^rightRotate(a,13)^rightRotate(a,22))
        +((a&hash[1])^(a&hash[2])^(hash[1]&hash[2]));
      hash=[(temp1+temp2)|0].concat(hash); hash[4]=(hash[4]+temp1)|0;
    }
    for(var i=0;i<8;i++){ hash[i]=(hash[i]+oldHash[i])|0; }
  }
  for(var i=0;i<8;i++){ for(var j=3;j+1;j--){ var b=(hash[i]>>(j*8))&255; result+=((b<16)?0:'')+b.toString(16); } }
  return result;
}

function emailName(email){const p=(email||'').split('@')[0].replace(/[._]/g,' ');
  return p.replace(/\b\w/g,m=>m.toUpperCase())||'Cursist';}

/* lees rol/naam/joker/klas uit de profiles-tabel. In twee stappen zodat een
   bestaande database (nog zonder de kolommen 'joker'/'class') blijft werken:
   de rol/naam laden altijd; joker/klas alleen als die kolommen bestaan. */
async function readProfile(id,email){
  let role='student', name=emailName(email), joker=false, klas=null;
  try{ const {data:prof}=await sb.from('profiles').select('full_name,role').eq('id',id).maybeSingle();
    if(prof){ role=prof.role||role; name=prof.full_name||name; } }catch(e){}
  try{ const {data:extra}=await sb.from('profiles').select('joker,class').eq('id',id).maybeSingle();
    if(extra){ joker=!!extra.joker; klas=extra.class||null; } }catch(e){}
  return {name, role, joker, class:klas};
}
/* cloud-login via Supabase Auth; haalt rol/naam uit de profiles-tabel */
async function cloudSignIn(email,pw){
  try{
    const {data,error}=await sb.auth.signInWithPassword({email,password:pw});
    if(error||!data||!data.user)return null;
    const p=await readProfile(data.user.id, email);
    return {id:data.user.id, email:data.user.email, name:p.name, role:p.role, joker:p.joker, class:p.class};
  }catch(e){ return null; }
}

$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  $('loginError').classList.remove('show');
  $('submitBtn').disabled=true;
  const email=$('email').value.trim().toLowerCase();
  const pw=$('pw').value;
  let user=null;
  if(CLOUD_CONFIGURED && !CLOUD){
    // Cloud is bedoeld, maar de Supabase-bibliotheek kon niet laden (CDN geblokkeerd/storing).
    $('submitBtn').disabled=false;
    $('loginError').textContent='Kan geen verbinding maken met de server. Controleer je internet en probeer het opnieuw.';
    $('loginError').classList.add('show');
    return;
  }
  if(CLOUD){ user=await cloudSignIn(email,pw); }
  else{
    const acc=ACCOUNTS.find(a=>a.email.toLowerCase()===email);
    if(acc){ try{ if((await sha256(pw))===acc.hash)
      user={email:acc.email, name:acc.name,
        role:acc.role||'student',
        joker:!!acc.joker, class:acc.class||null}; }catch(err){} }
  }
  $('submitBtn').disabled=false;
  if(user){
    const remember=$('remember')?$('remember').checked:true;
    try{ localStorage.setItem('lil-remember',remember?'1':'0'); localStorage.setItem('lil-last-email',remember?email:''); }catch(err){}
    await login(user);   // bij 'onthoud mij' uit wordt de sessie bij de volgende herlaad weer afgemeld (zie tryRestoreSession)
  }
  else{ $('loginError').textContent='E-mailadres of wachtwoord klopt niet.'; $('loginError').classList.add('show'); $('pw').value=''; $('pw').focus(); }
});
/* vul het laatst gebruikte e-mailadres alvast in (handig op een gedeeld apparaat: alleen als 'onthoud mij' aan stond) */
(function prefillEmail(){
  try{
    const em=localStorage.getItem('lil-last-email');
    if(em && $('email') && !$('email').value){ $('email').value=em; }
    const rem=localStorage.getItem('lil-remember');
    if(rem!==null && $('remember')) $('remember').checked = rem!=='0';
  }catch(e){}
})();
/* blijf ingelogd na herladen: herstel een bestaande Supabase-sessie (cloud-modus) */
async function tryRestoreSession(){
  if(!CLOUD)return false;
  let remember=true; try{ remember=localStorage.getItem('lil-remember')!=='0'; }catch(e){}
  if(!remember){ try{ await sb.auth.signOut(); }catch(e){} return false; }
  try{
    const {data}=await sb.auth.getSession();
    const s=data&&data.session;
    if(s&&s.user){
      const p=await readProfile(s.user.id, s.user.email);
      await login({id:s.user.id, email:s.user.email, name:p.name, role:p.role, joker:p.joker, class:p.class});
      return true;
    }
  }catch(e){}
  return false;
}
tryRestoreSession();
$('forgot').addEventListener('click',async e=>{e.preventDefault();
  if(CLOUD){
    const email=($('email').value.trim()||prompt('Wat is je e-mailadres? Dan sturen we je een herstel-link.')||'').trim().toLowerCase();
    if(!email)return;
    try{ await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
      alert('Als er een account bestaat voor '+email+', is er een herstel-link gemaild.'); }
    catch(err){ alert('Er ging iets mis. Probeer het later opnieuw of mail info@sekibar.nl.'); }
    return;
  }
  alert('Wachtwoord vergeten? Neem contact op via info@sekibar.nl, dan zetten we het voor je klaar.');});

let activeMode='student';   // 'student' of 'teacher' — voor de joker omschakelbaar
function updateSwitchBtn(){
  const b=$('switchBtn');
  if(currentUser&&currentUser.joker){          // alleen de joker wisselt tussen docent- en leerlingscherm; pure docenten niet
    b.style.display='';
    b.textContent = activeMode==='teacher' ? '↔ Naar leerlingscherm' : '↔ Naar docentscherm';
  } else { b.style.display='none'; }
}
async function goHome(){ if(activeMode==='teacher') await showTeacher(); else await showDash(); }

async function login(u){
  currentUser=u;
  activeMode = (u.role==='teacher') ? 'teacher' : 'student';
  const first=(u.name||'Cursist').split(' ')[0];
  $('username').textContent=first;
  $('avatar').textContent=((u.name&&u.name[0])||'C').toUpperCase();
  const h=new Date().getHours();
  $('greeting').textContent=(h<12?'Goedemorgen':h<18?'Goedemiddag':'Goedenavond')+', '+first+' 👋';
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  updateSwitchBtn();
  await goHome();
  window.scrollTo(0,0);
  syncPwaForUser();   // installeren-/meldingen-knoppen bijwerken voor deze gebruiker
}
$('switchBtn').addEventListener('click',async ()=>{
  activeMode = activeMode==='teacher' ? 'student' : 'teacher';
  updateSwitchBtn();
  await goHome();
});
$('logoutBtn').addEventListener('click',async ()=>{
  if(CLOUD){ try{ await sb.auth.signOut(); }catch(e){} }
  stopTeacherAutoRefresh();
  currentUser=null; progCache={lessons:{},days:[]};
  $('switchBtn').style.display='none';
  $('appView').classList.add('hidden'); $('teacherView').classList.add('hidden'); $('loginView').classList.remove('hidden');
  $('dashView').classList.remove('hidden'); $('quizView').classList.add('hidden');
  $('pw').value='';$('email').value='';$('loginError').classList.remove('show');});
$('homeLink').addEventListener('click',()=>{ goHome(); });

/* ---------------- dashboard render ---------------- */
function pill(status){const map={done:['done','✓ Afgerond'],busy:['busy','● Mee bezig'],new:['new','Nieuw'],soon:['soon','Binnenkort']};
  const[cls,txt]=map[status]||map.soon;return `<span class="pill ${cls}">${txt}</span>`;}
function renderDash(){
  const prog=progCache;
  const grid=$('courseGrid');
  let done=0, busy=0;
  let html='';
  const teacherView=isTeacherViewer();
  let shown=0, nextLesson=null;                   // eerstvolgende onafgeronde les (voor 'ga verder')
  COURSES.forEach(c=>{
    const live=!!QUIZZES[c.n];                    // speelbaar als er vragen zijn
    const released=isReleased(c.n);               // door de docent vrijgegeven?
    // Niet vrijgegeven les: leerling ziet hem niet; de docent wél (om te ontwerpen/testen).
    if(live && !released && !teacherView) return;
    shown++;
    const pct=prog.lessons[c.n];                  // beste score, of undefined
    let status='soon';
    if(live){
      if(!released) status='soon';                // docent-preview: markeer als 'in voorbereiding'
      else if(pct===undefined){ status='new'; if(!nextLesson)nextLesson=c; }
      else if(pct>=PASS){ status='done'; done++; }
      else { status='busy'; busy++; if(!nextLesson)nextLesson=c; }
    }
    const barPct=pct||0;
    const cls='card '+(live?'live':'soon')+(c.feat&&live&&released?' featured':'');
    html+=`<button class="${cls}" ${live?`data-course="${c.n}"`:'disabled'}>
      ${c.bookmark&&released?'<span class="bookmark"></span>':''}
      ${!released&&live?'<div class="kick" style="color:var(--accent-deep)">🔒 Nog niet vrijgegeven</div>':(c.feat&&live?'<div class="kick">🎲 Herhaling</div>':'')}
      <div class="num">Les ${c.n}</div>
      <h3>${c.t}</h3>
      ${live?`<div class="progress"><i style="width:${barPct}%"></i></div>`:''}
      <div class="meta">${!released&&live?'alleen voor jou zichtbaar':(live?`${barPct}% voltooid`:'lesstof volgt')}${pill(!released&&live?'soon':status)}</div>
    </button>`;
  });
  if(!shown) html='<p style="color:var(--ink-faint);grid-column:1/-1">Er zijn nog geen lessen vrijgegeven. Kom snel terug!</p>';
  grid.innerHTML=html;
  const zStats=renderZins(prog);          // tweede leerlijn (Zinsopbouw) + resterende 'binnenkort'
  done+=zStats.done; busy+=zStats.busy;
  if(!nextLesson) nextLesson=zStats.next||null;   // Woordjes op? wijs de leerling naar de eerstvolgende Zinsopbouw-les
  $('courseCount').textContent=PLAYABLE+' speelbaar · '+COURSES.length+' lessen';   // telt alleen Woordjes (Zinsopbouw heeft z'n eigen teller)
  // dashboard-stats automatisch
  const streak=computeStreak(prog.days);
  $('statDone').textContent=done;
  $('statBusy').textContent=busy;
  $('statStreak').textContent=streak;
  grid.querySelectorAll('[data-course]').forEach(b=>b.addEventListener('click',()=>startLesson(b.dataset.course)));
  const searchWrap=$('lessonSearchWrap'); if(searchWrap)searchWrap.classList.toggle('hidden',shown<6);
  filterCourses();   // pas een eventueel actieve zoekterm opnieuw toe na het hertekenen
  renderContinueBar(nextLesson,prog,shown||zStats.released);
  renderBadges({done,streak,perfect:Object.values(prog.lessons||{}).some(v=>v>=100),playable:PLAYABLE+zStats.released});
}
/* tweede leerlijn: Zinsopbouw-lessen (speelbaar) + de 'binnenkort'-onderwerpen.
   Rendert in #soonGrid en geeft de eigen voortgang terug voor de dashboard-tellers. */
function renderZins(prog){
  const grid=$('soonGrid'); if(!grid)return {done:0,busy:0,released:0,next:null};
  const teacherView=isTeacherViewer();
  let done=0,busy=0,released=0,html='',next=null;    // next = eerstvolgende onafgeronde, vrijgegeven Zinsopbouw-les
  (typeof ZINS!=='undefined'?ZINS:[]).forEach(z=>{
    const rel=isReleased(z.n);
    if(!rel && !teacherView) return;                 // niet vrijgegeven: leerling ziet hem niet, docent wél
    if(rel)released++;
    const pct=prog.lessons[z.n];
    let status='new';
    if(!rel) status='soon';
    else if(pct===undefined){ status='new'; if(!next)next=z; }
    else if(pct>=PASS){ status='done'; done++; }
    else { status='busy'; busy++; if(!next)next=z; }
    const barPct=pct||0;
    html+=`<button class="card live" data-zins="${esc(z.n)}">
      ${!rel?'<div class="kick" style="color:var(--accent-deep)">🔒 Nog niet vrijgegeven</div>':'<div class="kick">Zinsopbouw</div>'}
      <div class="num">${esc(z.num||'Zin')}</div>
      <h3>${esc(z.t)}</h3>
      <div class="progress"><i style="width:${barPct}%"></i></div>
      <div class="meta">${!rel?'alleen voor jou zichtbaar':`${barPct}% voltooid`}${pill(!rel?'soon':status)}</div>
    </button>`;
  });
  html+=SOON.map(c=>`<button class="card soon" disabled>
      <div class="num">Les ${c.n}</div><h3>${esc(c.t)}</h3>
      <div class="meta">Lesstof volgt ${pill('soon')}</div></button>`).join('');
  grid.innerHTML=html;
  grid.querySelectorAll('[data-zins]').forEach(b=>b.addEventListener('click',()=>startZins(b.dataset.zins)));
  const zc=$('zinsCount'); if(zc)zc.textContent=released?(released+' speelbaar'):'binnenkort';
  return {done,busy,released,next};
}
/* 'Ga verder waar je gebleven was': knop naar de eerstvolgende onafgeronde les */
function renderContinueBar(next,prog,shown){
  const cb=$('continueBar'); if(!cb)return;
  if(next){
    const started=prog.lessons[next.n]!==undefined;
    cb.className='continue-bar';
    cb.innerHTML=`<div class="cb-text">
        <span class="cb-kick">${started?'Ga verder':'Begin hier'}</span>
        <b>${esc(lessonNumLabel(next.n))} · ${esc(lessonTitle(next.n))}</b>
      </div>
      <button class="cb-btn" type="button">▶ ${started?'Verder oefenen':'Start les'}</button>`;
    cb.querySelector('.cb-btn').addEventListener('click',()=>startLesson(next.n));
  } else if(shown){
    cb.className='continue-bar cb-done';
    cb.innerHTML=`<div class="cb-text">
        <span class="cb-kick">Knap gedaan! 🎉</span>
        <b>Je hebt alle beschikbare lessen afgerond. Herhaal er gerust een.</b>
      </div>`;
  } else {
    cb.className='continue-bar hidden'; cb.innerHTML='';
  }
}
/* badges/beloningen — motiveren de leerling; berekend uit de eigen voortgang */
const BADGES=[
  {icon:'🌱', title:'Eerste stap',  desc:'Rond je eerste les af',      has:s=>s.done>=1},
  {icon:'💯', title:'Foutloos',     desc:'Haal 100% in een les',        has:s=>s.perfect},
  {icon:'🔥', title:'3 dagen',      desc:'Oefen 3 dagen op rij',        has:s=>s.streak>=3},
  {icon:'⭐', title:'Vijf lessen',  desc:'Rond 5 lessen af',            has:s=>s.done>=5},
  {icon:'🏆', title:'Alles af',     desc:'Rond alle speelbare lessen af', has:s=>{const p=s.playable||PLAYABLE; return p>0&&s.done>=p;}},
];
function renderBadges(stats){
  const row=$('badgeRow'); if(!row)return;
  let earned=0;
  row.innerHTML=BADGES.map(b=>{
    const has=b.has(stats); if(has)earned++;
    return `<div class="badge${has?' earned':''}">
      <span class="badge-ic">${has?b.icon:'🔒'}</span>
      <span class="badge-t">${esc(b.title)}</span>
      <span class="badge-d">${esc(b.desc)}</span>
    </div>`;
  }).join('');
  const bc=$('badgeCount'); if(bc)bc.textContent=earned+' van '+BADGES.length+' behaald';
}
/* lessen filteren op nummer/onderwerp (verschijnt pas bij genoeg lessen) */
function filterCourses(){
  const inp=$('lessonSearch'), grid=$('courseGrid'); if(!inp||!grid)return;
  const q=inp.value.trim().toLowerCase();
  let any=false;
  grid.querySelectorAll('.card').forEach(card=>{
    const match=!q || card.textContent.toLowerCase().includes(q);
    card.classList.toggle('hidden',!match);
    if(match)any=true;
  });
  let empty=$('lessonSearchEmpty');
  if(!any){
    if(!empty){ empty=document.createElement('p'); empty.id='lessonSearchEmpty';
      empty.style.cssText='color:var(--ink-faint);grid-column:1/-1'; grid.appendChild(empty); }
    empty.textContent='Geen les gevonden voor "'+inp.value.trim()+'".';
    empty.classList.remove('hidden');
  } else if(empty){ empty.classList.add('hidden'); }
}
if($('lessonSearch'))$('lessonSearch').addEventListener('input',filterCourses);
async function showDash(){if(currentUser){await Promise.all([refreshProgress(),loadReleases()]);renderDash();}
  $('teacherView').classList.add('hidden');$('quizView').classList.add('hidden');$('dashView').classList.remove('hidden');window.scrollTo(0,0);}

/* ---------------- docenten-dashboard ---------------- */
async function showTeacher(){
  $('dashView').classList.add('hidden'); $('quizView').classList.add('hidden');
  $('teacherView').classList.remove('hidden');
  $('teacherView').innerHTML='<p style="padding:24px 4px">Laden…</p>';
  const [students]=await Promise.all([gatherTeacherData(),loadReleases()]);
  renderTeacher(students);
  startTeacherAutoRefresh();
  window.scrollTo(0,0);
}
/* haal leerlingen + antwoorden + pogingen op (cloud), of lees lokale voortgang (fallback) */
async function gatherTeacherData(){
  if(CLOUD){
    const [{data:profs}={},{data:ans}={},{data:att}={}]=await Promise.all([
      sb.from('profiles').select('id,email,full_name,role'),
      sb.from('answers').select('user_id,email,lesson,q_index,correct,updated_at'),
      sb.from('attempts').select('user_id,lesson,mode,score,total,pct,details,created_at').order('created_at',{ascending:false})
    ]);
    return (profs||[]).filter(p=>p.role!=='teacher').map(p=>({
      id:p.id, name:p.full_name||emailName(p.email), email:p.email, perQ:true,
      rows:(ans||[]).filter(a=>a.user_id===p.id),
      attempts:(att||[]).filter(a=>a.user_id===p.id)
    }));
  }
  // Lokale modus: een docent met een klas ziet alleen díe klas; een docent zonder klas (beheerder) ziet iedereen.
  const myClass=currentUser&&currentUser.class;
  return ACCOUNTS.filter(a=>a.role!=='teacher' && (!myClass || a.class===myClass)).map(a=>{
    let p={lessons:{},days:[]}; try{p=JSON.parse(localStorage.getItem('lil-prog-'+a.email))||p;}catch(e){}
    return {name:a.name, email:a.email, perQ:false, lessonsPct:p.lessons||{}, attempts:[]};
  });
}
/* pogingen van één leerling voor één les, nieuwste eerst */
function attemptsFor(stu,lesId){
  return (stu.attempts||[]).filter(a=>String(a.lesson)===String(lesId))
    .sort((x,y)=>String(y.created_at).localeCompare(String(x.created_at)));
}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
function fmtDate(iso){
  if(!iso)return '';
  try{ const d=new Date(iso);
    return d.toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'})+' · '+
           d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
  }catch(e){ return String(iso).slice(0,16).replace('T',' '); }
}
/* aantal opdrachten in een les — werkt voor Woordjes (QUIZZES) én Zinsopbouw (ZINS) */
function lessonItemCount(lesId){
  if(QUIZZES[lesId])return QUIZZES[lesId].q.length;
  const z=zinsById(lesId); return z&&z.items?z.items.length:0;
}
/* korte tekst van één opdracht (voor de tabelkoppen en detailregels) */
function lessonQText(lesId,i){
  if(QUIZZES[lesId]&&QUIZZES[lesId].q[i])return stripTags(QUIZZES[lesId].q[i].t);
  const z=zinsById(lesId); if(z&&z.items&&z.items[i])return zItemText(z.items[i]);
  return 'Opdracht '+(i+1);
}
/* "Les 3" of "Les 1" (Zinsopbouw) — nummerlabel voor koppen */
function lessonNumLabel(lesId){
  if(QUIZZES[lesId])return 'Les '+lesId;
  const z=zinsById(lesId); return z?z.num:('Les '+lesId);
}
/* voortgang van één leerling voor één les */
function lessonStat(stu,lesId){
  const total=lessonItemCount(lesId);
  if(stu.perQ){
    const perQ=[]; let correct=0, answered=0;
    for(let i=0;i<total;i++){
      const r=stu.rows.find(x=>String(x.lesson)===String(lesId)&&x.q_index===i);
      if(!r)perQ.push(null); else {perQ.push(!!r.correct); answered++; if(r.correct)correct++;}
    }
    return {total,correct,answered,pct:Math.round(correct/total*100),perQ};
  }
  const pct=stu.lessonsPct[lesId]||0;
  return {total,correct:Math.round(pct/100*total),answered:pct>0?total:0,pct,perQ:null};
}
/* NIVEAU 1 — overzicht van alle lessen (klik een les om erin te gaan) */
function renderTeacher(students){
  const playable=COURSES.filter(c=>QUIZZES[c.n]);
  const banner = CLOUD ? '' :
    `<div class="tv-banner">⚠️ Centrale database nog niet gekoppeld — je ziet alleen leerlingen die op <b>dit apparaat</b> hebben geoefend, zonder detail per vraag. Vul je Supabase-sleutels in (zie <b>DOCENT-SETUP.md</b>) voor volledig inzicht vanaf alle apparaten.</div>`;
  const zPlayable=(typeof ZINS!=='undefined'?ZINS:[]);
  const lessonCard=(id,numLabel,title)=>{
    let done=0,sumPct=0,seen=0;
    students.forEach(stu=>{const s=lessonStat(stu,id); if(s.answered){seen++;sumPct+=s.pct; if(s.pct>=PASS)done++;}});
    const avg=seen?Math.round(sumPct/seen):0;
    return `<button class="tv-card" data-les="${esc(id)}">
      <div class="num">${esc(numLabel)}</div>
      <h3>${esc(title)}</h3>
      <div class="tv-card-meta">
        <span class="tv-chip">${seen}/${students.length} gemaakt</span>
        <span class="tnum tv-card-avg">${seen?avg+'% gem.':'—'}</span>
      </div>
    </button>`;
  };
  const cards=playable.map(c=>lessonCard(c.n,'Les '+c.n,c.t)).join('');
  const zcards=zPlayable.map(z=>lessonCard(z.n,z.num||'Zin',z.t)).join('');
  const welcome=`
    <div class="welcome">
      <div><h1>Docenten-dashboard 👩‍🏫</h1><p>Kies een les om de resultaten per leerling en per vraag te bekijken${CLOUD?' — live uit de database':''}.</p></div>
      <div class="stat-strip">
        <div class="stat"><div class="n tnum">${students.length}</div><div class="l">leerlingen</div></div>
        <div class="stat"><div class="n tnum">${playable.length+zPlayable.length}</div><div class="l">lessen</div></div>
      </div>
    </div>`;
  const recentControls=`
      <div class="rc-controls" id="tvRecentControls">
        <span class="rc-controls-label">Toon lijst:</span>
        ${RECENT_LIMITS.map(n=>`<button class="rc-limit${n===recentLimit?' on':''}" data-n="${n}">${n}</button>`).join('')}
        <button class="rc-all-btn" id="rcAll" type="button">Alle bekijken →</button>
      </div>
      <div class="rc-list" id="tvRecent">${recentCompletedHtml(students)}</div>`;
  const cardsInner=(cards||zcards)
    ? (zcards
        ? `<div class="tv-cards-sub">Woordjes</div>${cards}<div class="tv-cards-sub">Zinsopbouw</div>${zcards}`
        : cards)
    : '<p style="color:var(--ink-faint)">Nog geen lessen met vragen.</p>';
  const serkan=isSerkan();
  if(serkan){
    // Serkan mag blokken in-/uitklappen én van volgorde wisselen (3 sec. op de titel houden).
    const blocks={
      recent:`<details class="tv-recent tv-block" data-key="recent" ${recentOpenState()?'open':''}>
          <summary class="tv-recent-head tv-block-title"><h2>Laatste afgeronde lessen</h2><span class="tv-recent-live">live</span></summary>
          ${recentControls}
        </details>`,
      release:`<div class="tv-block" data-key="release">${releasePanelHtml()}</div>`,
      cards:`<section class="tv-block" data-key="cards"><h2 class="tv-block-title tv-cards-title">Lessen</h2><div class="tv-cards">${cardsInner}</div></section>`
    };
    const order=loadTvOrder().filter(k=>blocks[k]);
    ['recent','release','cards'].forEach(k=>{ if(!order.includes(k))order.push(k); });
    $('teacherView').innerHTML=welcome+banner+
      `<div class="tv-reorder-tip">✋ Houd een <b>titel 3 seconden</b> vast om een blok te verslepen · klik een titel om in/uit te klappen</div>
       <div id="tvBlocks" class="tv-serkan">${order.map(k=>blocks[k]).join('')}</div>`;
  } else {
    $('teacherView').innerHTML=welcome+banner+
      `<details class="tv-recent" ${recentOpenState()?'open':''}>
        <summary class="tv-recent-head tv-block-title"><h2>Laatste afgeronde lessen</h2><span class="tv-recent-live" title="Werkt automatisch bij — nieuwste bovenaan">live</span></summary>
        ${recentControls}
      </details>
      ${releasePanelHtml()}
      <div class="tv-cards">${cardsInner}</div>`;
  }
  $('teacherView').querySelectorAll('.tv-card').forEach(b=>
    b.addEventListener('click',()=>renderTeacherLesson(b.dataset.les,students)));
  wireRecentControls();
  wireReleasePanel(students);
  wireRecentCollapse();
  const rcAll=$('rcAll'); if(rcAll)rcAll.addEventListener('click',()=>renderRecentAll(students));
  if(serkan){ wireBlockDragging(); }
}
/* apart scherm: alléén de laatste afgeronde lessen (alle pogingen, nieuwste bovenaan) */
function renderRecentAll(students){
  $('teacherView').innerHTML=`
    <button class="back" id="tvBack">← Terug naar dashboard</button>
    <div class="welcome"><div><h1>Laatste afgeronde lessen</h1>
      <p>Alle pogingen, nieuwste bovenaan${CLOUD?' — live uit de database':''}.</p></div></div>
    <section class="tv-recent"><div class="rc-list" id="tvRecentAll">${recentCompletedHtml(students,100000)}</div></section>`;
  $('tvBack').addEventListener('click',()=>renderTeacher(students));
  window.scrollTo(0,0);
}
/* Alleen Serkan (de beheerder/joker) mag het dashboard aanpassen. */
function isSerkan(){ return !!(currentUser && (currentUser.joker || String(currentUser.email||'').toLowerCase()==='s@e.nl')); }
const TV_ORDER_KEY='lil-tv-order', TV_RECENT_OPEN_KEY='lil-tv-recent-open';
function loadTvOrder(){ try{const a=JSON.parse(localStorage.getItem(TV_ORDER_KEY)); if(Array.isArray(a))return a;}catch(e){} return ['recent','release','cards']; }
function saveTvOrder(a){ try{localStorage.setItem(TV_ORDER_KEY,JSON.stringify(a));}catch(e){} }
function recentOpenState(){ try{return localStorage.getItem(TV_RECENT_OPEN_KEY)!=='0';}catch(e){return true;} }
/* onthoud of 'Laatste afgeronde lessen' open of dicht staat */
function wireRecentCollapse(){
  const d=$('teacherView').querySelector('details.tv-recent'); if(!d)return;
  d.addEventListener('toggle',()=>{ try{localStorage.setItem(TV_RECENT_OPEN_KEY, d.open?'1':'0');}catch(e){} });
}
/* sleep-om-te-herordenen: houd een bloktitel 3 sec. vast, sleep dan naar de nieuwe plek */
function wireBlockDragging(){
  const container=$('tvBlocks'); if(!container)return;
  container.querySelectorAll(':scope > .tv-block').forEach(block=>{
    const handle=block.querySelector('summary, .tv-block-title'); if(!handle)return;
    let timer=null, armed=false, startY=0, moved=false, pid=null;
    function cleanup(){ document.removeEventListener('pointermove',onMove,true); document.removeEventListener('pointerup',onUp,true); document.removeEventListener('pointercancel',onUp,true); }
    function onDown(e){
      if(e.pointerType==='mouse' && e.button!==0)return;
      pid=e.pointerId; startY=e.clientY; moved=false; armed=false;
      document.addEventListener('pointermove',onMove,true);
      document.addEventListener('pointerup',onUp,true);
      document.addEventListener('pointercancel',onUp,true);
      timer=setTimeout(()=>{ armed=true; block.classList.add('tv-armed'); container.classList.add('tv-reordering'); }, 3000);
    }
    function onMove(e){
      if(e.pointerId!==pid)return;
      if(!armed){ if(Math.abs(e.clientY-startY)>10){ clearTimeout(timer); } return; }  // bewegen vóór 3 sec. = annuleren (scrollen)
      e.preventDefault(); moved=true;
      const y=e.clientY, sibs=[...container.querySelectorAll(':scope > .tv-block')].filter(b=>b!==block);
      let ref=null; for(const s of sibs){ const r=s.getBoundingClientRect(); if(y<r.top+r.height/2){ ref=s; break; } }
      if(ref)container.insertBefore(block,ref); else container.appendChild(block);
    }
    function onUp(e){
      if(e.pointerId!==pid)return;
      clearTimeout(timer); cleanup();
      if(armed){
        armed=false; block.classList.remove('tv-armed'); container.classList.remove('tv-reordering');
        saveTvOrder([...container.querySelectorAll(':scope > .tv-block')].map(b=>b.dataset.key));
        if(moved){ const kill=ev=>{ev.preventDefault();ev.stopPropagation();handle.removeEventListener('click',kill,true);}; handle.addEventListener('click',kill,true); }
      }
      pid=null;
    }
    handle.addEventListener('pointerdown',onDown);
  });
}
/* hoeveel afgeronde lessen tonen — knopjes; standaard 3, uitklapbaar tot 200 */
const RECENT_LIMITS=[3,50,100,200];
let recentLimit=3, lastTeacherStudents=[];
/* spelvorm-chip in 'laatste afgeronde lessen' — laat in één blik zien in welke
   vorm de leerling de les maakte (Slepen / Quiz / Mix / …), net als de leerlijn-chip */
function recentModeChip(mode){
  const raw=String(mode||'').trim();
  const label=raw||'Oefening';
  const l=raw.toLowerCase();
  let cls='rc-mode-anders', icon='🎯';
  if(/mix/.test(l)){ cls='rc-mode-mix'; icon='🎲'; }
  else if(/sleep|slep/.test(l)){ cls='rc-mode-slepen'; icon='🔀'; }
  else if(/quiz/.test(l)){ cls='rc-mode-quiz'; icon='📝'; }
  else if(/invul/.test(l)){ cls='rc-mode-invullen'; icon='⌨️'; }
  else if(/flits/.test(l)){ cls='rc-mode-flits'; icon='🃏'; }
  else if(/herhaling/.test(l)){ cls='rc-mode-herhaling'; icon='🔁'; }
  else if(/herken/.test(l)){ cls='rc-mode-quiz'; icon='🔎'; }
  else if(/vertaal|vertalen/.test(l)){ cls='rc-mode-invullen'; icon='✍️'; }
  return `<span class="rc-mode ${cls}"><span class="rc-mode-icon" aria-hidden="true">${icon}</span>${esc(label)}</span>`;
}
/* bouw de lijst 'laatste afgeronde lessen': alle pogingen van alle leerlingen
   samengevoegd, nieuwste bovenaan (op afrondtijdstip). */
function recentCompletedHtml(students, limitOverride){
  lastTeacherStudents=students||[];
  const lim=limitOverride||recentLimit;
  const items=[];
  (students||[]).forEach(stu=>(stu.attempts||[]).forEach(a=>items.push({
    name:stu.name, lesson:a.lesson, created_at:a.created_at,
    score:a.score, total:a.total, pct:a.pct, mode:a.mode
  })));
  items.sort((x,y)=>String(y.created_at||'').localeCompare(String(x.created_at||'')));
  const top=items.slice(0,lim);
  if(!top.length){
    return `<div class="tv-recent-empty">Nog geen afgeronde lessen. Zodra een leerling een les afrondt, verschijnt die hier vanzelf — nieuwste bovenaan.</div>`;
  }
  const rows=top.map(it=>{
    const zins=!!zinsById(it.lesson);
    return `<div class="rc-item">
    <span class="rc-name">${esc(it.name)}</span>
    <span class="rc-lesson"><span class="rc-track ${zins?'rc-track-zins':'rc-track-woord'}">${zins?'Zinsopbouw':'Woordjes'}</span>${recentModeChip(it.mode)}${esc(lessonNumLabel(it.lesson))} · ${esc(lessonTitle(it.lesson))}</span>
    <span class="rc-score tnum">${it.score}/${it.total} (${it.pct}%)</span>
    <span class="rc-when tnum">${fmtDate(it.created_at)}</span>
  </div>`;}).join('');
  return rows+`<div class="rc-count">${top.length} van ${items.length} afgeronde lessen getoond</div>`;
}
/* knopjes 3/50/100/200: pas de weergave meteen aan zonder opnieuw te laden */
function wireRecentControls(){
  const box=$('tvRecentControls'); if(!box)return;
  box.querySelectorAll('.rc-limit').forEach(b=>b.addEventListener('click',()=>{
    recentLimit=parseInt(b.dataset.n,10)||3;
    box.querySelectorAll('.rc-limit').forEach(x=>x.classList.toggle('on',x===b));
    const list=$('tvRecent'); if(list)list.innerHTML=recentCompletedHtml(lastTeacherStudents);
  }));
}
/* ververs de lijst automatisch (polling + realtime) zolang de docent op het
   overzichtsscherm staat, zonder de rest van de pagina te hertekenen. */
let teacherRefreshTimer=null, teacherRealtime=null;
async function refreshRecentCompleted(){
  if(!$('tvRecent')||$('teacherView').classList.contains('hidden'))return;
  let students; try{ students=await gatherTeacherData(); }catch(e){ return; }
  const box=$('tvRecent');
  if(box&&!$('teacherView').classList.contains('hidden'))box.innerHTML=recentCompletedHtml(students);
}
function startTeacherAutoRefresh(){
  if(teacherRefreshTimer)clearInterval(teacherRefreshTimer);
  teacherRefreshTimer=setInterval(refreshRecentCompleted,15000);
  if(CLOUD&&sb&&!teacherRealtime){
    try{
      teacherRealtime=sb.channel('rc-attempts')
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'attempts'},refreshRecentCompleted)
        .subscribe();
    }catch(e){}
  }
}
/* stop het automatisch verversen (bij uitloggen) — geen onnodige achtergrond-taken */
function stopTeacherAutoRefresh(){
  if(teacherRefreshTimer){ clearInterval(teacherRefreshTimer); teacherRefreshTimer=null; }
  if(teacherRealtime){ try{ sb.removeChannel(teacherRealtime); }catch(e){} teacherRealtime=null; }
}
/* paneel: per les een schakelaar 'vrijgeven / verbergen voor leerlingen' */
function releaseRowHtml(id,numLabel,title){
  const on=isReleased(id);
  return `<label class="rel-row">
      <span class="rel-info"><span class="rel-num">${esc(numLabel)}</span><span class="rel-title">${esc(title)}</span></span>
      <span class="rel-toggle">
        <span class="rel-state ${on?'on':''}">${on?'Vrijgegeven':'Verborgen'}</span>
        <input type="checkbox" class="rel-check" data-les="${esc(id)}" ${on?'checked':''} aria-label="${esc(title)} vrijgeven voor leerlingen">
        <span class="rel-switch"></span>
      </span>
    </label>`;
}
function releasePanelHtml(){
  const wRows=COURSES.filter(c=>QUIZZES[c.n]).map(c=>releaseRowHtml(c.n,'Les '+c.n,c.t)).join('');
  const zRows=(typeof ZINS!=='undefined'?ZINS:[]).map(z=>releaseRowHtml(z.n,z.num||'Zin',z.t)).join('');
  return `<details class="rel-panel" open>
    <summary><b>Lessen vrijgeven</b> <span class="rel-hint">— vink aan welke lessen je leerlingen mogen zien</span></summary>
    <p class="tv-note" style="margin:2px 0 12px">Een les die niet is vrijgegeven, is voor leerlingen onzichtbaar. Zo kun je rustig een nieuwe les ontwerpen. Jij ziet verborgen lessen zelf wél (met 🔒) om te testen.</p>
    <div class="rel-group-title">Woordjes</div>
    <div class="rel-list">${wRows||'<span class="tv-note">Nog geen lessen met vragen.</span>'}</div>
    ${zRows?`<div class="rel-group-title">Zinsopbouw</div><div class="rel-list">${zRows}</div>`:''}
  </details>`;
}
function wireReleasePanel(students){
  $('teacherView').querySelectorAll('.rel-check').forEach(chk=>{
    chk.addEventListener('change',async ()=>{
      const id=chk.dataset.les, val=chk.checked;
      chk.disabled=true;
      const ok=await setReleased(id,val);
      chk.disabled=false;
      if(!ok){
        chk.checked=!val; releaseCache[String(id)]=!val;
        alert('Opslaan mislukt. Heb je de database-regel voor "lesson_settings" al toegevoegd?\n\nZie DOCENT-SETUP.md (blok "lessen vrijgeven").');
        return;
      }
      // werk het label bij zonder alles opnieuw te tekenen
      const row=chk.closest('.rel-row'), state=row&&row.querySelector('.rel-state');
      if(state){ state.textContent=val?'Vrijgegeven':'Verborgen'; state.classList.toggle('on',val); }
    });
  });
}
/* NIVEAU 2 — één les: tabel met leerlingen × vragen (laatste resultaat per vraag) */
function renderTeacherLesson(lesId,students){
  const total=lessonItemCount(lesId);
  const heads=Array.from({length:total},(_,i)=>`<th title="${esc(lessonQText(lesId,i))}">V${i+1}</th>`).join('');
  let rows='';
  students.forEach((stu,idx)=>{
    const s=lessonStat(stu,lesId);
    let cells='';
    for(let i=0;i<total;i++){
      let cls='q-na',mark='–';
      if(s.perQ){ if(s.perQ[i]===true){cls='q-ok';mark='✓';} else if(s.perQ[i]===false){cls='q-no';mark='✗';} }
      cells+=`<td class="tv-dot ${cls}">${mark}</td>`;
    }
    const nA=attemptsFor(stu,lesId).length;
    rows+=`<tr class="tv-row" data-i="${idx}">
      <td class="tv-name">${esc(stu.name)}<small>${esc(stu.email)}</small></td>
      ${cells}
      <td class="tnum tv-overall">${s.answered?s.pct+'%':'—'}</td>
      <td class="tnum">${nA||'—'}</td>
      <td class="tv-open">bekijk →</td></tr>`;
  });
  $('teacherView').innerHTML=`
    <button class="back" id="tvBack">← Terug naar lessen</button>
    <div class="welcome"><div><h1>${esc(lessonNumLabel(lesId))} · ${esc(lessonTitle(lesId))}</h1><p>Laatste resultaat per vraag. Klik een leerling voor alle pogingen.</p></div></div>
    <div class="tv-tablewrap">
      <table class="tv-table">
        <thead><tr><th>Leerling</th>${heads}<th>Totaal</th><th>Pogingen</th><th></th></tr></thead>
        <tbody>${rows||'<tr><td colspan="99" style="padding:18px;color:var(--ink-faint)">Nog geen gegevens.</td></tr>'}</tbody>
      </table>
    </div>`;
  $('tvBack').addEventListener('click',()=>renderTeacher(students));
  $('teacherView').querySelectorAll('.tv-row').forEach(tr=>
    tr.addEventListener('click',()=>renderTeacherStudentLesson(students[+tr.dataset.i],lesId,students)));
}
/* per-vraag detaillijst uit een poging (details jsonb) */
function attemptDetailHtml(att,lesId){
  const qz=QUIZZES[lesId], det=Array.isArray(att.details)?att.details:[];
  if(!det.length)return `<div class="tv-note">Geen vraagdetail bewaard voor deze poging (score ${att.score}/${att.total}).</div>`;
  return `<div class="q-list">`+det.map((d,i)=>{
    const cls=d.correct?'q-ok':'q-no';
    const q=(d.question!=null&&d.question!=='')?d.question:(qz&&qz.q[d.q_index]?stripTags(qz.q[d.q_index].t):('Vraag '+(i+1)));
    const gave=d.correct?`<b>${esc(d.given)}</b>`:`<span class="tv-given-no">${esc(d.given)}</span> → goed: <b>${esc(d.answer)}</b>`;
    return `<div class="q-item ${cls}">
      <span class="q-txt">${esc(q)}<small class="tv-gave">${gave}</small></span>
      <span class="q-res">${d.correct?'✓':'✗'}</span></div>`;
  }).join('')+`</div>`;
}
/* NIVEAU 3 — één leerling in één les: meest recente poging + lijst met alle pogingen */
function renderTeacherStudentLesson(stu,lesId,students){
  const atts=attemptsFor(stu,lesId);
  const recent=atts[0];
  let recentHtml, listHtml;
  if(recent){
    recentHtml=`<div class="tv-lesson">
      <div class="tv-lesson-head"><b>Meest recente poging</b>
        <span class="tnum">${fmtDate(recent.created_at)} · ${esc(recent.mode||'')} · ${recent.score}/${recent.total} (${recent.pct}%)</span></div>
      ${attemptDetailHtml(recent,lesId)}</div>`;
    listHtml=atts.map((a,i)=>`<button class="tv-attempt" data-i="${i}">
        <span class="tv-att-when">${fmtDate(a.created_at)}${i===0?' <span class="tv-badge">nieuwste</span>':''}</span>
        <span class="tv-att-mode">${esc(a.mode||'oefening')}</span>
        <span class="tnum tv-att-score">${a.score}/${a.total} · ${a.pct}%</span>
      </button>`).join('');
  } else {
    // Terugval: geen poging-geschiedenis (bv. oude gegevens) — toon laatste per-vraag status
    const s=lessonStat(stu,lesId); let dots='';
    for(let i=0;i<s.total;i++){
      let cls='q-na'; if(s.perQ){ if(s.perQ[i]===true)cls='q-ok'; else if(s.perQ[i]===false)cls='q-no'; }
      const qtxt=lessonQText(lesId,i);
      dots+=`<div class="q-item ${cls}"><span class="q-txt">${i+1}. ${esc(qtxt)}</span><span class="q-res">${cls==='q-ok'?'✓':cls==='q-no'?'✗':'–'}</span></div>`;
    }
    recentHtml=`<div class="tv-lesson">
      <div class="tv-lesson-head"><b>Laatste resultaat</b><span class="tnum">${s.answered?s.pct+'% ('+s.correct+'/'+s.total+')':'nog niet gemaakt'}</span></div>
      ${s.perQ?`<div class="q-list">${dots}</div>`:`<div class="tv-note">Detail per vraag verschijnt zodra de database gekoppeld is.</div>`}</div>`;
    listHtml=`<div class="tv-note">Nog geen losse pogingen bewaard. Zodra deze leerling de les (opnieuw) maakt, verschijnt elke poging hier apart — met wat er precies is ingevuld.</div>`;
  }
  const hasData=atts.length||lessonStat(stu,lesId).answered;
  $('teacherView').innerHTML=`
    <button class="back" id="tvBack">← Terug naar ${esc(lessonNumLabel(lesId).toLowerCase())}</button>
    <div class="welcome">
      <div><h1>${esc(stu.name)}</h1><p>${esc(lessonNumLabel(lesId))} · ${esc(lessonTitle(lesId))} — ${esc(stu.email)}</p></div>
      ${hasData?`<button class="tv-wipe" id="tvWipe" title="Wis de voortgang van deze leerling voor deze les">🗑 Voortgang wissen</button>`:''}
    </div>
    ${recentHtml}
    <div class="tv-lesson">
      <div class="tv-lesson-head"><b>Alle pogingen (${atts.length})</b><span class="tnum">nieuwste bovenaan</span></div>
      <div class="tv-attempts">${listHtml}</div>
    </div>`;
  $('tvBack').addEventListener('click',()=>renderTeacherLesson(lesId,students));
  const wipe=$('tvWipe'); if(wipe)wipe.addEventListener('click',()=>teacherWipeLesson(stu,lesId,students));
  $('teacherView').querySelectorAll('.tv-attempt').forEach(b=>
    b.addEventListener('click',()=>renderAttemptDetail(atts[+b.dataset.i],stu,lesId,students)));
}
/* wis de voortgang van één leerling voor één les — hij begint dan opnieuw */
async function teacherWipeLesson(stu,lesId,students){
  if(!confirm('Voortgang van '+stu.name+' voor '+lessonNumLabel(lesId).toLowerCase()+' wissen?\n\n'+
    'Alle antwoorden én pogingen van deze les worden verwijderd. '+
    'De leerling begint deze les daarna weer helemaal opnieuw.\n\n'+
    'Dit kan niet ongedaan worden gemaakt.'))return;
  if(CLOUD){
    if(!stu.id){ alert('Kan deze leerling niet vinden in de database.'); return; }
    try{
      const r1=await sb.from('attempts').delete().eq('user_id',stu.id).eq('lesson',String(lesId));
      const r2=await sb.from('answers').delete().eq('user_id',stu.id).eq('lesson',String(lesId));
      if((r1&&r1.error)||(r2&&r2.error))throw (r1.error||r2.error);
    }catch(e){
      alert('Wissen mislukt. Heb je de nieuwe database-regel voor wissen al toegevoegd?\n\n'+
            'Zie DOCENT-SETUP.md (blok "docent mag wissen").'); return;
    }
  } else {
    try{ const key='lil-prog-'+stu.email;
      const p=JSON.parse(localStorage.getItem(key))||{lessons:{},days:[]};
      delete p.lessons[lesId]; localStorage.setItem(key,JSON.stringify(p));
    }catch(e){}
  }
  $('teacherView').innerHTML='<p style="padding:24px 4px">Bijwerken…</p>';
  const fresh=await gatherTeacherData();
  const s=fresh.find(x=>x.email===stu.email)||stu;
  renderTeacherStudentLesson(s,lesId,fresh);
}
/* NIVEAU 4 — één poging in detail: wat de leerling toen invoerde en behaalde */
function renderAttemptDetail(att,stu,lesId,students){
  $('teacherView').innerHTML=`
    <button class="back" id="tvBack">← Terug naar pogingen</button>
    <div class="welcome"><div><h1>${esc(stu.name)} — poging</h1>
      <p>${esc(lessonNumLabel(lesId))} · ${esc(lessonTitle(lesId))} · ${esc(att.mode||'oefening')} · ${fmtDate(att.created_at)}</p></div>
      <div class="stat-strip"><div class="stat"><div class="n tnum">${att.pct}%</div><div class="l">${att.score}/${att.total} goed</div></div></div>
    </div>
    <div class="tv-lesson">
      <div class="tv-lesson-head"><b>Ingevoerde antwoorden</b><span class="tnum">${att.score}/${att.total} goed</span></div>
      ${attemptDetailHtml(att,lesId)}</div>`;
  $('tvBack').addEventListener('click',()=>renderTeacherStudentLesson(stu,lesId,students));
}

/* ---------------- uitspraak (tekst-naar-spraak, Nederlands) ----------------
   Gebruikt de ingebouwde stemmen van de browser (Web Speech API). Geen
   downloads nodig; werkt op de meeste telefoons en computers. Valt stil weg
   als de browser het niet ondersteunt. */
function canSpeak(){return typeof window!=='undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;}
function dutchVoice(){
  if(!canSpeak())return null;
  const vs=speechSynthesis.getVoices()||[];
  return vs.find(v=>/^nl[-_]?nl/i.test(v.lang))||vs.find(v=>/^nl/i.test(v.lang))||null;
}
if(canSpeak()){ try{ speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged=()=>{}; }catch(e){} }
function speak(text,btn){
  if(!canSpeak())return;
  const t=stripTags(String(text||'')).trim(); if(!t)return;
  try{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(t);
    u.lang='nl-NL'; const v=dutchVoice(); if(v)u.voice=v; u.rate=.9; u.pitch=1;
    if(btn){ u.onstart=()=>btn.classList.add('speaking'); u.onend=u.onerror=()=>btn.classList.remove('speaking'); }
    speechSynthesis.speak(u);
  }catch(e){}
}
/* knop-HTML om een Nederlands woord te laten uitspreken (leeg als niet ondersteund) */
function speakerHtml(text,extraClass){
  if(!canSpeak()||!text)return '';
  return `<button type="button" class="speakbtn ${extraClass||''}" data-say="${esc(text)}" title="Woord uitspreken" aria-label="Woord uitspreken">🔊</button>`;
}
/* het Nederlandse woord dat al zichtbaar is in de vraag (of null als het het antwoord zou verraden) */
function questionDutch(q){
  if(q.tag==='Betekenis → woord')return null;      // vraag toont Turks; Nederlands is het antwoord
  const m=mWord(q.t);
  return (m && !/_/.test(m)) ? stripTags(m) : null;
}
/* het juiste Nederlandse antwoord (eerste variant vóór een schuine streep) */
function answerDutch(q){ return stripTags((q.o[q.c]||'').split('/')[0]); }
/* beschrijvende alt-tekst voor een afbeelding bij een vraag: het Nederlandse
   woord dat de vraag illustreert (voor schermlezers en als de afbeelding niet laadt) */
function imgAlt(q){ const nl=questionDutch(q)||answerDutch(q); return nl?('Afbeelding: '+stripTags(nl)):'Illustratie bij de vraag'; }
/* vraagtekst waarin het Turkse woord (span.m) als lang="tr" wordt gemarkeerd,
   maar alleen bij 'Betekenis → woord' — daar is het woord in de vraag Turks.
   Bij de andere vraagtypes is het m-woord Nederlands, dus die laten we ongemoeid. */
function qText(q){ return q.tag==='Betekenis → woord'
  ? q.t.replace(/<span class=(['"])m\1>/, '<span class=$1m$1 lang=$1tr$1>')
  : q.t; }
/* één gedelegeerde klik-listener voor alle uitspraakknoppen */
document.addEventListener('click',e=>{const b=e.target.closest('.speakbtn'); if(b){e.preventDefault(); e.stopPropagation(); speak(b.dataset.say,b);}});

/* ---------------- spel-hulpjes ---------------- */
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function lessonTitle(id){
  const c=COURSES.find(x=>x.n===id); if(c)return c.t;
  const z=zinsById(id); if(z)return z.t;
  return QUIZZES[id]?QUIZZES[id].title:('Les '+id);
}
function stripTags(s){return (s||'').replace(/<[^>]+>/g,'').trim();}
function mWord(t){const m=/<span class=['"]m['"]>([\s\S]*?)<\/span>/.exec(t||'');return m?stripTags(m[1]):null;}
function norm(s){return (s||'').toLowerCase().replace(/[.,!?¿¡]/g,'').replace(/\s+/g,' ').trim().replace(/^(de|het|een)\s+/,'');}
/* NL ↔ TR woordparen uit de vraagbank van een les (alleen de woord-vragen) */
function wordPairs(id){
  const data=QUIZZES[id]; if(!data)return [];
  const out=[], seen=new Set();
  data.q.forEach((q,qi)=>{
    let nl=null,tr=null;
    if(q.tag==='Woord → betekenis'){ nl=mWord(q.t); tr=q.o[q.c]; }
    else if(q.tag==='Betekenis → woord'){ tr=mWord(q.t); nl=q.o[q.c]; }
    if(nl&&tr){ const key=norm(nl); if(!seen.has(key)){ seen.add(key); out.push({nl:stripTags(nl),tr:stripTags(tr),qi}); } }
  });
  return out;
}

/* ---------------- keuzescherm: spelvorm per les ---------------- */
function openLessonView(){ $('dashView').classList.add('hidden');$('teacherView').classList.add('hidden');$('quizView').classList.remove('hidden');window.scrollTo(0,0); }
function startLesson(id){
  if(zinsById(id))return startZins(id);          // Zinsopbouw-les: eigen engine
  const data=QUIZZES[id]; if(!data)return startQuiz(id);
  const pairs=wordPairs(id);
  openLessonView();
  $('quizView').innerHTML=`
    <button class="back" id="backBtn">← Terug naar lessen</button>
    <div class="quiz-head">
      <div class="num">Les ${id}</div>
      <h1>${lessonTitle(id)}</h1>
      <p>Kies hoe je deze woorden wilt oefenen.</p>
    </div>
    <div class="modes">
      <button class="mode-card" data-m="quiz"><span class="mi">📝</span><b>Quiz</b><small>Kies het goede antwoord uit vier opties.</small></button>
      <button class="mode-card" data-m="invullen"><span class="mi">⌨️</span><b>Invullen</b><small>Typ zelf het Nederlandse woord.</small></button>
      <button class="mode-card" data-m="slepen" ${pairs.length<3?'disabled':''}><span class="mi">🔀</span><b>Slepen</b><small>Sleep het woord naar de juiste vertaling.</small></button>
      <button class="mode-card" data-m="flits" ${pairs.length<1?'disabled':''}><span class="mi">🃏</span><b>Flitskaarten</b><small>Draai de kaart om en test jezelf.</small></button>
      <button class="mode-card feat" data-m="mix"><span class="mi">🎲</span><b>Mix van alles</b><small>Alle spelvormen door elkaar.</small></button>
    </div>`;
  $('backBtn').addEventListener('click',showDash);
  $('quizView').querySelectorAll('.mode-card').forEach(b=>b.addEventListener('click',()=>{
    const m=b.dataset.m;
    if(m==='quiz')startQuiz(id);
    else if(m==='invullen')startInvullen(id);
    else if(m==='slepen')startSlepen(id);
    else if(m==='flits')startFlashcards(id);
    else startMix(id);
  }));
}

/* ---------------- gedeelde vraag-engine (quiz + invullen + mix) ---------------- */
let game=null;
function buildQuizItems(id){ return QUIZZES[id].q.map((q,qi)=>({kind:'quiz',qi})); }
function buildFillItems(id){ return wordPairs(id).map(p=>({kind:'fill',qi:p.qi,pair:p})); }
function buildMixItems(id){
  const items=QUIZZES[id].q.map((q,qi)=>{
    const isPair=(q.tag==='Woord → betekenis'||q.tag==='Betekenis → woord');
    if(isPair&&Math.random()<0.5){ const nl=q.tag==='Woord → betekenis'?mWord(q.t):q.o[q.c];
      const tr=q.tag==='Woord → betekenis'?q.o[q.c]:mWord(q.t);
      return {kind:'fill',qi,pair:{nl:stripTags(nl),tr:stripTags(tr),qi}}; }
    return {kind:'quiz',qi};
  });
  return shuffle(items);
}
function startQuiz(id){ runSeq(id,'Quiz',shuffle(buildQuizItems(id)),()=>startQuiz(id)); }
function startInvullen(id){ runSeq(id,'Invullen',shuffle(buildFillItems(id)),()=>startInvullen(id)); }
function startMix(id){ runSeq(id,'Mix',buildMixItems(id),()=>startMix(id)); }
function runSeq(id,label,items,onRetry){
  game={id,label,items,i:0,score:0,answered:false,onRetry,details:[]};
  openLessonView(); renderItem();
}
function seqHead(){
  const g=game,total=g.items.length;
  return `<button class="back" id="backBtn">← Andere spelvorm</button>
    <div class="quiz-head">
      <div class="num">Les ${g.id} · ${g.label}</div>
      <h1>${lessonTitle(g.id)}</h1>
      <div class="qbar"><i style="width:${(g.i/total)*100}%"></i></div>
      <div class="qmeta"><span>Vraag ${g.i+1} van ${total}</span><span class="tnum">Score ${g.score}/${g.i}</span></div>
    </div>`;
}
function renderItem(){
  const g=game,total=g.items.length;
  if(g.i>=total){ cloudRecordAttempt(g.id,g.label,g.score,total,g.details); return showResult(g.id,g.label,g.score,total,g.onRetry,g.details); }
  const it=g.items[g.i]; g.answered=false;
  it.kind==='fill'?renderFill(it):renderQuizItem(it);
  $('backBtn').addEventListener('click',()=>startLesson(g.id));
  $('nextBtn').addEventListener('click',()=>{game.i++;renderItem();});
}
function renderQuizItem(it){
  const g=game,q=QUIZZES[g.id].q[it.qi],last=g.i===g.items.length-1;
  const order=it.order||(it.order=shuffle(q.o.map((_,k)=>k)));   // husselvolgorde, stabiel per vraag
  $('quizView').innerHTML=seqHead()+`
    <div class="qcard">
      <span class="qtag">${q.tag}</span>
      <div class="qtext-row"><div class="qtext">${qText(q)}</div>${speakerHtml(questionDutch(q))}</div>
      ${q.img?`<img class="q-img" src="${esc(q.img)}" alt="${esc(imgAlt(q))}" loading="lazy">`:''}
      <div class="opts" id="opts">
        ${order.map((k,pos)=>`<button class="opt" data-k="${k}"><span class="key">${String.fromCharCode(65+pos)}</span><span${q.tag==='Woord → betekenis'?' lang="tr"':''}>${q.o[k]}</span><span class="mark"></span></button>`).join('')}
      </div>
      <div class="tip-box" id="tipBox"></div>
      <div class="explain" id="explain"><b>Uitleg.</b> ${q.e}</div>
      <div class="qfoot">
        <button class="tip-btn" id="tipBtn" type="button">💡 Tip</button>
        <span class="score" id="fb" role="status" aria-live="polite">Kies een antwoord.</span>
        <button class="btn-next" id="nextBtn" disabled>${last?'Resultaat →':'Volgende →'}</button>
      </div>
    </div>`;
  document.querySelectorAll('#opts .opt').forEach(b=>b.addEventListener('click',()=>answerQuiz(b,it,q)));
  $('tipBtn').addEventListener('click',()=>{
    const box=$('tipBox');
    box.innerHTML='<b>💡 Tip.</b> '+tipFor(q)+(q.tipImg?`<img class="q-img" src="${esc(q.tipImg)}" alt="${esc(imgAlt(q))}" loading="lazy">`:'');
    box.classList.add('show');
    $('tipBtn').disabled=true;
  });
}
/* Geeft een hint terug: een eigen 'tip' bij de vraag, anders een automatische letter-hint. */
function tipFor(q){
  if(q.tip)return q.tip;
  const ans=stripTags(q.o[q.c]).trim();
  const first=ans.split('/')[0].trim();
  const letters=first.replace(/[^A-Za-zÀ-ÿ]/g,'').length;
  return `Het juiste antwoord begint met de letter <b>${first.charAt(0).toUpperCase()}</b> en heeft <b>${letters}</b> letters.`;
}
function answerQuiz(btn,it,q){
  if(game.answered)return; game.answered=true;
  const k=+btn.dataset.k,correct=k===q.c; if(correct)game.score++;
  cloudRecordAnswer(game.id,it.qi,correct);
  if(game.details)game.details.push({q_index:it.qi, question:stripTags(q.t), given:q.o[k], answer:q.o[q.c], correct:!!correct});
  document.querySelectorAll('#opts .opt').forEach(b=>{const bk=+b.dataset.k;b.disabled=true;
    const mark=b.querySelector('.mark');
    if(bk===q.c){b.classList.add('correct');mark.textContent='✓';}
    else if(bk===k){b.classList.add('wrong');mark.textContent='✗';}});
  $('explain').innerHTML=`<b>Uitleg.</b> ${q.e} ${speakerHtml(answerDutch(q))}`;
  $('explain').classList.add('show');
  $('fb').textContent=correct?'Goed gedaan! 🎉':'Helaas, bekijk de uitleg.';
  $('fb').style.color=correct?'var(--good)':'var(--bad)';
  $('nextBtn').disabled=false;
}
function renderFill(it){
  const g=game,p=it.pair,last=g.i===g.items.length-1;
  $('quizView').innerHTML=seqHead()+`
    <div class="qcard">
      <span class="qtag">Invullen</span>
      <div class="qtext">Welk Nederlands woord betekent <span class="m" lang="tr">${p.tr}</span>?</div>
      <form id="fillForm" class="fill-form" autocomplete="off">
        <input type="text" id="fillInput" class="fill-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Typ het woord…">
        <button type="submit" class="btn-next" id="checkBtn">Controleer</button>
      </form>
      <div class="explain" id="explain"></div>
      <div class="qfoot">
        <span class="score" id="fb" role="status" aria-live="polite">Typ je antwoord en druk op Enter.</span>
        <button class="btn-next" id="nextBtn" disabled>${last?'Resultaat →':'Volgende →'}</button>
      </div>
    </div>`;
  const inp=$('fillInput'); setTimeout(()=>inp.focus(),30);
  $('fillForm').addEventListener('submit',e=>{e.preventDefault();checkFill(it,p);});
}
function checkFill(it,p){
  if(game.answered)return; game.answered=true;
  const val=$('fillInput').value;
  const opts=p.nl.split('/').map(x=>norm(x));
  const correct=opts.includes(norm(val)); if(correct)game.score++;
  cloudRecordAnswer(game.id,it.qi,correct);
  if(game.details)game.details.push({q_index:it.qi, question:'Welk woord betekent “'+p.tr+'”?', given:val||'(leeg)', answer:p.nl, correct:!!correct});
  const inp=$('fillInput'); inp.disabled=true; inp.classList.add(correct?'ok':'no');
  $('checkBtn').disabled=true;
  const ex=QUIZZES[game.id].q[it.qi];
  $('explain').innerHTML=`<b>Antwoord:</b> ${p.nl}${ex&&ex.e?' — '+ex.e:''} ${speakerHtml(p.nl.split('/')[0].trim())}`;
  $('explain').classList.add('show');
  $('fb').textContent=correct?'Goed gedaan! 🎉':'Helaas — juiste antwoord: '+p.nl;
  $('fb').style.color=correct?'var(--good)':'var(--bad)';
  $('nextBtn').disabled=false; $('nextBtn').focus();
}

/* ---------------- slepen (koppelen NL ↔ TR) ---------------- */
let sl=null;
function startSlepen(id){
  const all=shuffle(wordPairs(id)); if(all.length<2)return startQuiz(id);
  sl={id,all,pos:0,size:5,correct:0,errored:new Set(),details:[]};
  openLessonView(); renderSlepen();
}
function renderSlepen(){
  const s=sl, batch=s.all.slice(s.pos,s.pos+s.size);
  if(!batch.length){
    const det=s.all.map(p=>({q_index:p.qi, question:p.nl+' ↔ '+p.tr, given:s.errored.has(p.qi)?'in één keer fout gekoppeld':p.nl, answer:p.tr, correct:!s.errored.has(p.qi)}));
    cloudRecordAttempt(s.id,'Slepen',s.correct,s.all.length,det);
    return showResult(s.id,'Slepen',s.correct,s.all.length,()=>startSlepen(s.id),det);
  }
  const totalRounds=Math.ceil(s.all.length/s.size), roundNo=Math.floor(s.pos/s.size)+1, last=s.pos+s.size>=s.all.length;
  const left=shuffle(batch.slice()), right=shuffle(batch.slice());
  $('quizView').innerHTML=`
    <button class="back" id="backBtn">← Andere spelvorm</button>
    <div class="quiz-head">
      <div class="num">Les ${s.id} · Slepen</div>
      <h1>${lessonTitle(s.id)}</h1>
      <p>Sleep het Nederlandse woord naar de juiste vertaling. Op de telefoon: tik een woord en tik daarna de vertaling.</p>
      <div class="qmeta"><span>Ronde ${roundNo} van ${totalRounds}</span><span class="tnum" id="slScore">Goed: ${s.correct}</span></div>
    </div>
    <div class="drag-wrap">
      <div class="drag-col" id="dragSrc">${left.map(p=>`<button class="chip" draggable="true" data-q="${p.qi}">${p.nl}</button>`).join('')}</div>
      <div class="drag-col" id="dragTgt">${right.map(p=>`<div class="slot" data-q="${p.qi}" tabindex="0" role="button" aria-label="Vertaling ${p.tr} — kies eerst een woord, druk dan Enter"><span class="slot-tr" lang="tr">${p.tr}</span><span class="slot-drop">sleep hier</span></div>`).join('')}</div>
    </div>
    <div class="qfoot"><span class="score" id="fb" role="status" aria-live="polite">Nog ${batch.length} te koppelen.</span>
      <button class="btn-next" id="nextBtn" disabled>${last?'Resultaat →':'Volgende ronde →'}</button></div>`;
  $('backBtn').addEventListener('click',()=>startLesson(s.id));
  $('nextBtn').addEventListener('click',()=>{sl.pos+=sl.size;renderSlepen();});
  let left2=batch.length, tap=null;
  const chips=$('quizView').querySelectorAll('.chip'), slots=$('quizView').querySelectorAll('.slot');
  function clearSel(){chips.forEach(c=>c.classList.remove('sel'));tap=null;}
  function match(qi,slot){
    if(slot.classList.contains('done'))return;
    const chip=$('quizView').querySelector('.chip[data-q="'+qi+'"]:not(.used)');
    if(+slot.dataset.q===qi && chip){
      slot.classList.add('done'); slot.querySelector('.slot-drop').textContent=chip.textContent;
      chip.classList.add('used'); chip.setAttribute('disabled',''); chip.draggable=false;
      if(!s.errored.has(qi))s.correct++;
      left2--; $('slScore').textContent='Goed: '+s.correct;
      $('fb').textContent=left2?('Nog '+left2+' te koppelen.'):'Klaar! Ga door.'; $('fb').style.color='var(--good)';
      if(left2===0)$('nextBtn').disabled=false;
    } else {
      s.errored.add(qi); slot.classList.add('bad'); setTimeout(()=>slot.classList.remove('bad'),450);
      $('fb').textContent='Bijna — probeer een andere.'; $('fb').style.color='var(--bad)';
    }
    clearSel();
  }
  chips.forEach(c=>{
    c.addEventListener('dragstart',e=>{if(c.classList.contains('used')){e.preventDefault();return;}e.dataTransfer.setData('text/plain',c.dataset.q);});
    c.addEventListener('click',()=>{if(c.classList.contains('used'))return;
      const on=c.classList.contains('sel');clearSel();if(!on){c.classList.add('sel');tap=+c.dataset.q;}});
  });
  slots.forEach(sl0=>{
    sl0.addEventListener('dragover',e=>e.preventDefault());
    sl0.addEventListener('drop',e=>{e.preventDefault();const qi=+e.dataTransfer.getData('text/plain');if(!isNaN(qi))match(qi,sl0);});
    sl0.addEventListener('click',()=>{if(tap!=null)match(tap,sl0);});
    sl0.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(tap!=null)match(tap,sl0);}});
  });
}

/* ---------------- flitskaarten ---------------- */
let fc=null;
function startFlashcards(id){
  const cards=shuffle(wordPairs(id)); if(!cards.length)return startQuiz(id);
  fc={id,cards,i:0,known:0,flipped:false,details:[]};
  openLessonView(); renderFlash();
}
function renderFlash(){
  const f=fc,total=f.cards.length;
  if(f.i>=total){ cloudRecordAttempt(f.id,'Flitskaarten',f.known,total,f.details); return showResult(f.id,'Flitskaarten',f.known,total,()=>startFlashcards(f.id),f.details); }
  const c=f.cards[f.i],ex=QUIZZES[f.id].q[c.qi];
  $('quizView').innerHTML=`
    <button class="back" id="backBtn">← Andere spelvorm</button>
    <div class="quiz-head">
      <div class="num">Les ${f.id} · Flitskaarten</div>
      <h1>${lessonTitle(f.id)}</h1>
      <div class="qbar"><i style="width:${(f.i/total)*100}%"></i></div>
      <div class="qmeta"><span>Kaart ${f.i+1} van ${total}</span><span class="tnum">Gewust: ${f.known}</span></div>
    </div>
    <div class="flash" id="flashCard" tabindex="0" role="button" aria-label="Flitskaart — druk op Enter om om te draaien">
      <div class="flash-inner">
        <div class="flash-face flash-front"><span class="flash-lbl">Nederlands 🇳🇱</span><div class="flash-word">${c.nl}</div>${speakerHtml(c.nl.split('/')[0].trim(),'flash-speak')}<span class="flash-hint">Tik om te draaien</span></div>
        <div class="flash-face flash-back"><span class="flash-lbl">Türkçe 🇹🇷</span><div class="flash-word" lang="tr">${c.tr}</div>${ex&&ex.e?`<p class="flash-ex">${ex.e}</p>`:''}</div>
      </div>
    </div>
    <div class="flash-acts hidden" id="flashActs">
      <button class="btn-ghost" id="fcAgain">Nog oefenen</button>
      <button class="btn-next" id="fcKnown">Ik wist het ✓</button>
    </div>`;
  $('backBtn').addEventListener('click',()=>startLesson(f.id));
  const card=$('flashCard');
  const flip=()=>{card.classList.toggle('flip');
    if(card.classList.contains('flip'))$('flashActs').classList.remove('hidden');};
  card.addEventListener('click',flip);
  // toetsenbord: Enter/spatie draait de kaart (maar niet als je op de 🔊-knop staat)
  card.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('.speakbtn')){e.preventDefault();flip();}});
  const nextCard=known=>{if(known)fc.known++;cloudRecordAnswer(f.id,c.qi,known);
    if(fc.details)fc.details.push({q_index:c.qi, question:c.nl+' ↔ '+c.tr, given:known?'wist het':'nog oefenen', answer:c.tr, correct:!!known});
    fc.i++;renderFlash();};
  $('fcAgain').addEventListener('click',()=>nextCard(false));
  $('fcKnown').addEventListener('click',()=>nextCard(true));
}

/* ============================================================
   ZINSOPBOUW — tweede leerlijn (zinsstructuur)
   Eigen, lichte engine bovenop dezelfde bouwstenen als de Woordjes-lessen
   (showResult, cloud-/lokale voortgang, uitspraak, husselen). De lesinhoud
   staat in ZINS (lessons.js). Drie opdrachttypes: 'herken' (meerkeuze),
   'sleep' (delen naar rolvakken) en 'bouw' (zelf een zin vertalen).
   ============================================================ */
const ZROLES={
  WIE:    {label:"WIE",     hint:"wie of wat doet iets", kls:"r-wie"},
  DOET:   {label:"DOET",    hint:"het werkwoord",         kls:"r-doet"},
  WAT:    {label:"WAT",     hint:"wat of wie",            kls:"r-wat"},
  WAAR:   {label:"WAAR",    hint:"de plek",               kls:"r-waar"},
  WANNEER:{label:"WANNEER", hint:"de tijd",               kls:"r-wanneer"},
  EIND:   {label:"EIND",    hint:"het tweede werkwoord",  kls:"r-eind"},
};
function zinsById(id){ return (typeof ZINS!=='undefined') ? (ZINS.find(z=>z.n===id)||null) : null; }
function zclean(s){ return (s||'').toLowerCase().replace(/[.,!?;:"'’]/g,'').replace(/\s+/g,' ').trim(); }
/* markeer één zinsdeel gekleurd binnen de zin (na het antwoord).
   Zoekt bij voorkeur op woordgrenzen, zodat een kort deel (bv. "is") niet
   per ongeluk binnen een langer woord wordt gemarkeerd. */
function zMark(sentence,chunk,kls){
  const isWord=c=>/[A-Za-zÀ-ÿ0-9]/.test(c||'');
  let i=-1, from=0, p;
  while((p=sentence.indexOf(chunk,from))>=0){
    if(!isWord(sentence[p-1])&&!isWord(sentence[p+chunk.length])){ i=p; break; }
    from=p+1;
  }
  if(i<0)i=sentence.indexOf(chunk);          // geen woordgrens-match: val terug op de eerste plek
  if(i<0)return esc(sentence);
  return esc(sentence.slice(0,i))+`<mark class="zhit ${kls}">`+esc(chunk)+`</mark>`+esc(sentence.slice(i+chunk.length));
}

let zg=null;   // actieve Zinsopbouw-oefening
/* start een Zinsopbouw-les. onlyIdx (optioneel) = alleen deze opdracht-indexen
   herhalen (dan slaan we het introscherm over). */
function startZins(id,onlyIdx){
  const les=zinsById(id); if(!les)return;
  const all=(les.items||[]).map((it,idx)=>Object.assign({},it,{idx}));
  if(onlyIdx&&onlyIdx.length){
    runZins(id,all.filter(it=>onlyIdx.indexOf(it.idx)>=0));
  } else {
    zinsIntro(id,()=>runZins(id,all));
  }
}
/* introscherm met de korte uitleg van de les */
function zinsIntro(id,onStart){
  const les=zinsById(id); if(!les)return onStart();
  openLessonView();
  $('quizView').innerHTML=`
    <button class="back" id="backBtn">← Terug naar lessen</button>
    <div class="quiz-head">
      <div class="num">Zinsopbouw · ${esc(les.num||'')}</div>
      <h1>${esc(les.t)}</h1>
      <p>${esc(les.desc||'')}</p>
    </div>
    <div class="qcard zin-intro">
      ${les.intro||''}
      <div class="qfoot">
        <span class="score">${(les.items||[]).length} opdracht${(les.items||[]).length===1?'':'en'}</span>
        <button class="btn-next" id="zStart">Start →</button>
      </div>
    </div>`;
  $('backBtn').addEventListener('click',showDash);
  $('zStart').addEventListener('click',onStart);
}
function runZins(id,items){
  game=null;                       // schakel de A–D sneltoetsen van de woord-engine uit
  const les=zinsById(id);
  zg={id,label:(les&&les.label)||'Zinsopbouw',items,i:0,score:0,answered:false,details:[]};
  openLessonView(); zRenderItem();
}
function zHead(){
  const g=zg,total=g.items.length,les=zinsById(g.id);
  return `<button class="back" id="backBtn">← Terug naar lessen</button>
    <div class="quiz-head">
      <div class="num">Zinsopbouw · ${esc(les?les.num:'')}</div>
      <h1>${esc(les?les.t:'Zinsopbouw')}</h1>
      <div class="qbar"><i style="width:${(g.i/total)*100}%"></i></div>
      <div class="qmeta"><span>Opdracht ${g.i+1} van ${total}</span><span class="tnum">Score ${g.score}/${g.i}</span></div>
    </div>`;
}
function zRenderItem(){
  const g=zg,total=g.items.length;
  if(g.i>=total){
    cloudRecordAttempt(g.id,g.label,g.score,total,g.details);
    return showResult(g.id,g.label,g.score,total,()=>startZins(g.id),g.details);
  }
  const it=g.items[g.i]; g.answered=false;
  if(it.kind==='sleep') zSleep(it);
  else if(it.kind==='bouw') zBouw(it);
  else zHerken(it);
  const bb=$('backBtn'); if(bb)bb.addEventListener('click',showDash);
}
/* leg één antwoord vast (voor cloud-detail + herhaal-de-foute) */
function zRecord(it,ok,given,answer){
  cloudRecordAnswer(zg.id,it.idx,ok);
  if(zg.details)zg.details.push({q_index:it.idx, question:zItemText(it), given:given, answer:answer, correct:!!ok});
}
function zItemText(it){
  if(it.kind==='bouw') return 'Vertaal: '+it.tr;
  if(it.kind==='sleep') return 'Sleep: '+(it.parts||[]).map(p=>p[1]).join(' / ');
  if(it.ask) return it.sentence+' — welk deel is de '+it.ask+'?';
  return stripTags(it.q||'');
}

/* ---- 1) HERKEN: kies het juiste zinsdeel (meerkeuze) ---- */
function zHerken(it){
  const g=zg,last=g.i===g.items.length-1;
  const part=!!it.ask;
  const role=part?ZROLES[it.ask]:null;
  const opts=part?shuffle((it.parts||[]).map(p=>p[1])):(it.o||[]).slice();
  const correct=part?((it.parts||[]).find(p=>p[0]===it.ask)||[])[1]:(it.o||[])[it.c];
  const qhtml=part
    ? `Lees de zin. Welk deel is de <span class="zrole ${role.kls}">${esc(role.label)}</span>
        <span class="zrole-hint">(${esc(role.hint)})</span>?
        <div class="zin-sentence-row"><div class="zin-sentence" id="zinSent">${esc(it.sentence)}</div>${speakerHtml(it.sentence,'zin-say')}</div>`
    : `<div class="zin-q">${it.q}</div>`;
  $('quizView').innerHTML=zHead()+`
    <div class="qcard">
      <span class="qtag">${part?'Herken het zinsdeel':'Woordvolgorde'}</span>
      <div class="qtext">${qhtml}</div>
      <div class="opts" id="opts">
        ${opts.map((t,i)=>`<button class="opt" data-t="${esc(t)}"><span class="key">${String.fromCharCode(65+i)}</span><span>${esc(t)}</span><span class="mark"></span></button>`).join('')}
      </div>
      <div class="explain" id="explain"><b>Uitleg.</b> ${it.e||''}</div>
      <div class="qfoot">
        <span class="score" id="fb" role="status" aria-live="polite">Kies een antwoord.</span>
        <button class="btn-next" id="nextBtn" disabled>${last?'Resultaat →':'Volgende →'}</button>
      </div>
    </div>`;
  $('nextBtn').addEventListener('click',()=>{zg.i++;zRenderItem();});
  document.querySelectorAll('#opts .opt').forEach(b=>b.addEventListener('click',()=>{
    if(zg.answered)return; zg.answered=true;
    const chosen=b.dataset.t, ok=chosen===correct; if(ok)zg.score++;
    zRecord(it,ok,chosen,correct);
    document.querySelectorAll('#opts .opt').forEach(x=>{x.disabled=true; const mk=x.querySelector('.mark');
      if(x.dataset.t===correct){x.classList.add('correct'); mk.textContent='✓';}
      else if(x===b){x.classList.add('wrong'); mk.textContent='✗';}});
    if(part){ const s=$('zinSent'); if(s)s.innerHTML=zMark(it.sentence,correct,role.kls); }
    $('explain').classList.add('show');
    $('fb').textContent=ok?'Goed gedaan! 🎉':'Helaas, bekijk de uitleg.';
    $('fb').style.color=ok?'var(--good)':'var(--bad)';
    $('nextBtn').disabled=false; $('nextBtn').focus();
  }));
}

/* ---- 2) SLEEP: elk deel naar het juiste rolvak ---- */
function zSleep(it){
  const g=zg,last=g.i===g.items.length-1;
  const parts=it.parts||[];                       // in de juiste (zins)volgorde
  const chips=shuffle(parts.slice());             // knoppen gehusseld
  $('quizView').innerHTML=zHead()+`
    <div class="qcard">
      <span class="qtag">Sleep de zinsdelen</span>
      <div class="qtext">Sleep elk deel naar het juiste vak. <span class="zrole-hint">Op de telefoon: tik een deel en tik daarna het vak.</span></div>
      <div class="zin-drag">
        <div class="zin-chips" id="zChips">${chips.map(p=>`<button class="chip" draggable="true" data-i="${parts.indexOf(p)}">${esc(p[1])}</button>`).join('')}</div>
        <div class="zin-slots" id="zSlots">${parts.map(p=>{const r=ZROLES[p[0]]||{label:p[0],kls:''};
          return `<div class="slot zin-slot ${r.kls}" data-role="${esc(p[0])}" tabindex="0" role="button" aria-label="Vak ${esc(r.label)}"><span class="slot-role">${esc(r.label)}</span><span class="slot-drop">sleep hier</span></div>`;}).join('')}</div>
      </div>
      <div class="explain" id="explain"><b>Uitleg.</b> ${it.e||''}</div>
      <div class="qfoot">
        <span class="score" id="fb" role="status" aria-live="polite">Nog ${parts.length} te plaatsen.</span>
        <button class="btn-next" id="nextBtn" disabled>${last?'Resultaat →':'Volgende →'}</button>
      </div>
    </div>`;
  $('nextBtn').addEventListener('click',()=>{zg.i++;zRenderItem();});
  let left=parts.length, errored=false, tap=null;
  const chipEls=$('quizView').querySelectorAll('.chip'), slotEls=$('quizView').querySelectorAll('.zin-slot');
  function clearSel(){ chipEls.forEach(c=>c.classList.remove('sel')); tap=null; }
  function finish(){
    zg.answered=true;
    const ok=!errored; if(ok)zg.score++;
    zRecord(it,ok, errored?'in één keer fout':'in de goede vakken', parts.map(p=>p[0]+'='+p[1]).join(', '));
    $('explain').classList.add('show');
    $('fb').textContent=ok?'Helemaal goed! 🎉':'Klaar — maar niet in één keer foutloos.';
    $('fb').style.color=ok?'var(--good)':'var(--accent-deep)';
    $('nextBtn').disabled=false; $('nextBtn').focus();
  }
  function match(i,slot){
    if(slot.classList.contains('done')||zg.answered)return;
    const chip=$('quizView').querySelector('.chip[data-i="'+i+'"]:not(.used)');
    const role=parts[i]&&parts[i][0];
    if(chip && role===slot.dataset.role){
      slot.classList.add('done'); slot.querySelector('.slot-drop').textContent=chip.textContent;
      chip.classList.add('used'); chip.setAttribute('disabled',''); chip.draggable=false;
      left--; $('fb').textContent=left?('Nog '+left+' te plaatsen.'):'Alles geplaatst!';
      $('fb').style.color='var(--good)';
      if(left===0)finish();
    } else {
      errored=true; slot.classList.add('bad'); setTimeout(()=>slot.classList.remove('bad'),450);
      $('fb').textContent='Bijna — dat deel hoort in een ander vak.'; $('fb').style.color='var(--bad)';
    }
    clearSel();
  }
  chipEls.forEach(c=>{
    c.addEventListener('dragstart',e=>{ if(c.classList.contains('used')){e.preventDefault();return;} e.dataTransfer.setData('text/plain',c.dataset.i); });
    c.addEventListener('click',()=>{ if(c.classList.contains('used'))return;
      const on=c.classList.contains('sel'); clearSel(); if(!on){c.classList.add('sel'); tap=+c.dataset.i;} });
  });
  slotEls.forEach(s=>{
    s.addEventListener('dragover',e=>e.preventDefault());
    s.addEventListener('drop',e=>{e.preventDefault(); const i=+e.dataTransfer.getData('text/plain'); if(!isNaN(i))match(i,s);});
    s.addEventListener('click',()=>{ if(tap!=null)match(tap,s); });
    s.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault(); if(tap!=null)match(tap,s);} });
  });
}

/* ---- 3) BOUW: vertaal zelf een zin ---- */
function zBouw(it){
  const g=zg,last=g.i===g.items.length-1;
  const help=(it.words&&it.words.length)
    ? `<div class="zin-help"><span class="zin-help-lbl">Woordenhulp</span><div class="zin-help-words">${
        it.words.map(w=>`<span class="help-word">${esc(w)}${speakerHtml(w.split('(')[0].trim())}</span>`).join('')}</div></div>`
    : '';
  $('quizView').innerHTML=zHead()+`
    <div class="qcard">
      <span class="qtag">Vertaal de zin</span>
      <div class="qtext">Vertaal naar het Nederlands:<div class="zin-sentence" lang="tr">${esc(it.tr)}</div></div>
      ${help}
      <form id="zForm" class="fill-form" autocomplete="off">
        <input type="text" id="zInput" class="fill-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Typ de Nederlandse zin…">
        <button type="submit" class="btn-next" id="zCheck">Controleer</button>
      </form>
      <div class="explain" id="explain"></div>
      <div class="zin-self hidden" id="zSelf">
        <span>Vertalen kan op meer manieren. Vergelijk met de voorbeeldzin — vind je je zin toch goed?</span>
        <button class="btn-ghost" id="zGood" type="button">Ja, toch goed ✓</button>
        <button class="btn-ghost" id="zBad" type="button">Nee, nog oefenen</button>
      </div>
      <div class="qfoot">
        <span class="score" id="fb" role="status" aria-live="polite">Typ je antwoord en druk op Enter.</span>
        <button class="btn-next" id="nextBtn" disabled>${last?'Resultaat →':'Volgende →'}</button>
      </div>
    </div>`;
  const inp=$('zInput'); setTimeout(()=>{try{inp.focus();}catch(e){}},30);
  $('zForm').addEventListener('submit',e=>{e.preventDefault(); zCheckBouw(it);});
  $('nextBtn').addEventListener('click',()=>{zg.i++;zRenderItem();});
}
function zCheckBouw(it){
  if(zg.answered)return;
  const val=$('zInput').value;
  // Accepteer altijd óók de voorbeeldzin (model), ook als 'answers' is opgegeven —
  // anders zou precies wat als "Zo hoort het" getoond wordt, toch fout gerekend worden.
  const accepted=[...(it.answers||[]), it.model].filter(Boolean).map(zclean);
  const exact=accepted.indexOf(zclean(val))>=0;
  const inp=$('zInput'); inp.disabled=true; $('zCheck').disabled=true;
  $('explain').innerHTML=`<b>Zo hoort het:</b> ${esc(it.model)} ${speakerHtml(it.model)}${it.e?'<br>'+it.e:''}`;
  $('explain').classList.add('show');
  if(exact){
    zg.answered=true; zg.score++; inp.classList.add('ok');
    zRecord(it,true,val||'(leeg)',it.model);
    $('fb').textContent='Goed gedaan! 🎉'; $('fb').style.color='var(--good)';
    $('nextBtn').disabled=false; $('nextBtn').focus();
  } else {
    inp.classList.add('no');
    $('fb').textContent='Vergelijk je zin met de voorbeeldzin hieronder.'; $('fb').style.color='var(--bad)';
    $('zSelf').classList.remove('hidden');
    $('zGood').addEventListener('click',()=>zSelfMark(it,true,val));
    $('zBad').addEventListener('click',()=>zSelfMark(it,false,val));
  }
}
function zSelfMark(it,ok,val){
  if(zg.answered)return; zg.answered=true;
  if(ok)zg.score++;
  zRecord(it,ok,val||'(leeg)',it.model);
  $('zSelf').classList.add('hidden');
  $('fb').textContent=ok?'Mooi, je had het goed! 🎉':'Oké — oefen deze zin nog een keer.';
  $('fb').style.color=ok?'var(--good)':'var(--bad)';
  $('nextBtn').disabled=false; $('nextBtn').focus();
}

/* ---------------- resultaat (gedeeld) ---------------- */
/* Geluid bij een hoge score. Er wordt willekeurig één bestand uit /sounds/
   gekozen — nu nog één; voeg extra bestandsnamen toe voor meer variatie. */
const SUCCESS_SOUNDS=[
  'sounds/geluid1.mp3',
  'sounds/geluid2.mp3',
  'sounds/geluid3.mp3',
  'sounds/geluid4.mp3'
];

let lastSoundIndex=-1;
function playSuccessSound(){
  if(soundMuted||!SUCCESS_SOUNDS.length)return;
  let idx=Math.floor(Math.random()*SUCCESS_SOUNDS.length);
  // Bij meerdere geluiden: nooit twee keer hetzelfde achter elkaar.
  if(SUCCESS_SOUNDS.length>1){
    while(idx===lastSoundIndex)idx=Math.floor(Math.random()*SUCCESS_SOUNDS.length);
  }
  lastSoundIndex=idx;
  const src=SUCCESS_SOUNDS[idx];
  try{
    const audio=new Audio(src);
    audio.volume=0.8;
    const p=audio.play();
    if(p&&p.catch)p.catch(()=>{/* geluid is niet essentieel; stil falen */});
  }catch(e){/* stil falen */}
}

/* start een korte herhaling met alléén de fout beantwoorde woorden van deze ronde */
function wrongQIndexes(details){
  const seen=new Set(), out=[];
  (details||[]).forEach(d=>{ if(d&&d.correct===false&&d.q_index!=null&&!seen.has(d.q_index)){ seen.add(d.q_index); out.push(d.q_index); } });
  return out;
}
function retryWrong(id,qis){
  if(zinsById(id))return startZins(id,qis);        // Zinsopbouw: herhaal alleen de foute opdrachten
  const items=(qis||[]).filter(qi=>QUIZZES[id]&&QUIZZES[id].q[qi]).map(qi=>({kind:'quiz',qi}));
  if(!items.length)return;
  runSeq(id,'Herhaling',shuffle(items),()=>startLesson(id));
}
function showResult(id,label,score,total,onRetry,details){
  const pct=total?Math.round(score/total*100):0;
  if(!CLOUD)recordResult(id,pct);
  if(pct>=90)playSuccessSound();          // les met succes afgerond → geluidje
  const isZins=!!zinsById(id);
  const wrong=wrongQIndexes(details);
  const wrongNoun=wrong.length===1?(isZins?'opdracht':'woord'):(isZins?'opdrachten':'woorden');
  const r=63,circ=2*Math.PI*r,off=circ*(1-pct/100);
  const col=pct>=80?'var(--good)':pct>=50?'var(--brand)':'var(--accent)';
  const msg=pct>=80?(isZins?'Uitstekend! De zinsbouw beheers je goed.':'Uitstekend! Deze woorden beheers je goed.')
    :pct>=50?(isZins?'Goed op weg — herhaal de gemiste zinnen.':'Goed op weg — herhaal de gemiste woorden.')
    :'Nog even oefenen. Probeer het opnieuw.';
  $('quizView').innerHTML=`
    <button class="back" id="backBtn">← Terug naar lessen</button>
    <div class="result" id="resultCard" tabindex="-1" role="status" aria-label="Resultaat: ${score} van de ${total} goed, ${pct} procent. ${msg}">
      <div class="ring">
        <svg width="130" height="130" viewBox="0 0 130 130">
          <circle cx="65" cy="65" r="${r}" fill="none" stroke="var(--line-soft)" stroke-width="11"></circle>
          <circle cx="65" cy="65" r="${r}" fill="none" stroke="${col}" stroke-width="11" stroke-linecap="round"
            stroke-dasharray="${circ}" stroke-dashoffset="${off}"></circle>
        </svg>
        <div class="pct tnum" style="color:${col}">${pct}%</div>
      </div>
      <h2>${lessonTitle(id)} · ${label}</h2>
      <p>Je had <b>${score} van de ${total}</b> goed. ${msg}</p>
      <div class="acts">
        ${wrong.length?`<button class="btn-next" id="retryWrong">🔁 Herhaal de ${wrong.length} foute ${wrongNoun}</button>`:''}
        <button class="btn-ghost" id="retry">Opnieuw proberen</button>
        ${isZins?'':'<button class="btn-ghost" id="otherMode">Andere spelvorm</button>'}
        <button class="btn-ghost" id="toDash">Naar lessen →</button>
      </div>
    </div>`;
  $('backBtn').addEventListener('click',showDash);
  $('retry').addEventListener('click',onRetry);
  const om=$('otherMode'); if(om)om.addEventListener('click',()=>startLesson(id));
  $('toDash').addEventListener('click',showDash);
  if(wrong.length){const rw=$('retryWrong'); if(rw)rw.addEventListener('click',()=>retryWrong(id,wrong));}
  // zet de focus op de uitslag zodat een schermlezer de score voorleest
  const rc=$('resultCard'); if(rc)try{rc.focus({preventScroll:true});}catch(e){}
}

/* contact form: friendly note until an endpoint is set up */
document.getElementById('contactForm').addEventListener('submit',e=>{
  const f=e.currentTarget;
  if(f.action.includes('your-form-id')){e.preventDefault();
    // Nog geen Formspree-koppeling: open een vooraf ingevulde e-mail zodat het bericht niet verloren gaat.
    const naam=(f.naam.value||'').trim(), email=(f.email.value||'').trim(), bericht=(f.bericht.value||'').trim();
    const subject=encodeURIComponent('Bericht via sekibar.nl'+(naam?' — '+naam:''));
    const body=encodeURIComponent('Naam: '+naam+'\nE-mail: '+email+'\n\n'+bericht);
    const fb=$('contactFeedback');
    if(fb)fb.textContent='We openen je e-mailprogramma om het bericht te versturen. Lukt dat niet? Mail dan direct naar info@sekibar.nl.';
    window.location.href='mailto:info@sekibar.nl?subject='+subject+'&body='+body;}
});

/* keyboard: A–D to answer, Enter for next */
document.addEventListener('keydown',e=>{
  if($('quizView').classList.contains('hidden'))return;
  const typing=e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA');
  if(e.key==='Enter'){ if(typing)return; const n=document.getElementById('nextBtn');if(n&&!n.disabled){e.preventDefault();n.click();}return;}
  if(typing)return;
  const it=game&&game.items&&game.items[game.i];
  // Zinsopbouw draait op een eigen state (zg); die 'herken'-opdrachten gebruiken dezelfde #opts-knoppen.
  const zit=zg&&zg.items&&zg.items[zg.i];
  const zHerkenActive=!game&&zg&&!zg.answered&&zit&&zit.kind!=='sleep'&&zit.kind!=='bouw';
  if((game&&!game.answered&&it&&it.kind==='quiz')||zHerkenActive){
    const pos=e.key.toUpperCase().charCodeAt(0)-65;
    const opts=document.querySelectorAll('#opts .opt');
    if(pos>=0&&pos<opts.length){opts[pos].click();}
  }
});

document.getElementById('year').textContent=new Date().getFullYear();

/* Footer-versie automatisch: haalt de laatst samengevoegde PR op via de GitHub API,
   zodat de tekst altijd meebeweegt met elke nieuwe PR. Lukt het ophalen niet
   (offline / API-limiet), dan blijft de reeds in de HTML aanwezige tekst staan. */
(function updateVersionFromLatestPR(){
  const els=[document.getElementById('version'),document.getElementById('versionFront')].filter(Boolean);
  if(!els.length)return;
  const PREFIX='Serkan Yapiyor Bu Isi';
  fetch('https://api.github.com/repos/SE-KIB/LERENISLEUK/pulls?state=closed&sort=updated&direction=desc&per_page=20')
    .then(r=>r.ok?r.json():Promise.reject(r.status))
    .then(list=>{
      const pr=list.find(p=>p.merged_at);
      if(!pr)return;
      const t=new Date(pr.merged_at)
        .toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
      const txt=`${PREFIX} - Version PR${pr.number} - ${t}`;
      els.forEach(el=>{el.textContent=txt;});
    })
    .catch(()=>{/* stille fallback: laat bestaande tekst staan */});
})();

/* Service worker registreren: sneller laden en (deels) offline werken.
   Alleen op een echte host (https of localhost) — niet op file://. */
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1')){
  addEventListener('load',()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{/* geen offline-modus, maar app werkt gewoon door */}); });
}

/* ============================================================
   INSTALLEREN ALS APP + PUSHMELDINGEN
   ------------------------------------------------------------
   - "📲 Installeer app": maakt van de website een echte app op je
     beginscherm (geen browserbalk meer). Op Android/Chrome via de
     ingebouwde install-prompt; op iPhone via een korte uitleg (Safari
     heeft geen prompt).
   - "🔔 Meldingen": vraagt toestemming en meldt je aan voor pushmeldingen.
     Op iPhone kan dit pas nadat de app op het beginscherm staat (iOS 16.4+).
   ============================================================ */

function isStandalone(){
  return matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
         // iPad met iPadOS meldt zich soms als 'Mac' mét touch:
         (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
}
function pushSupported(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/* --- installeren --- */
let deferredInstall = null;   // bewaart de Chrome-install-prompt tot de gebruiker klikt
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredInstall = e; updateInstallBtn(); });
window.addEventListener('appinstalled', ()=>{ deferredInstall=null; updateInstallBtn(); notify('App geïnstalleerd 🎉'); });

function updateInstallBtn(){
  const b=$('installBtn'); if(!b) return;
  // Al als app geopend? Dan is installeren niet nodig.
  if(isStandalone()){ b.style.display='none'; return; }
  // Toon de knop als Chrome een prompt heeft, óf op iPhone (daar tonen we uitleg).
  b.style.display = (deferredInstall || isIOS()) ? '' : 'none';
}

async function onInstallClick(){
  if(deferredInstall){
    deferredInstall.prompt();
    try{ await deferredInstall.userChoice; }catch(e){}
    deferredInstall=null; updateInstallBtn();
  } else if(isIOS()){
    showInstallHint();
  } else {
    notify('Gebruik het menu van je browser → "App installeren" / "Toevoegen aan beginscherm".');
  }
}

// Korte uitleg voor iPhone/iPad (Safari heeft geen install-knop).
function showInstallHint(forNotify){
  const el=$('installHint'); if(!el) return;
  el.querySelector('.install-hint-text').innerHTML = forNotify
    ? 'Meldingen kunnen op de iPhone pas <b>nadat de app op je beginscherm staat</b>.<br>Tik onderin op het deel-icoon <b>&#x2b06;</b> → <b>Zet op beginscherm</b>. Open daarna de app vanaf je beginscherm en zet de meldingen aan.'
    : 'Tik onderin op het deel-icoon <b>&#x2b06;</b> → kies <b>Zet op beginscherm</b>. Dan staat de app als echte app op je telefoon.';
  el.classList.remove('hidden');
}

/* --- pushmeldingen --- */
// base64url (VAPID-sleutel) → Uint8Array, nodig voor pushManager.subscribe.
function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4 - base64String.length % 4) % 4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  const arr=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) arr[i]=raw.charCodeAt(i);
  return arr;
}

async function currentPushSubscription(){
  if(!pushSupported()) return null;
  try{ const reg=await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); }
  catch(e){ return null; }
}

async function updateNotifyBtn(){
  const b=$('notifyBtn'); if(!b) return;
  if(!VAPID_PUBLIC_KEY){ b.style.display='none'; return; }
  // iPhone/iPad zonder geïnstalleerde app: bel tóch tonen, zodat een tik de
  // gebruiker uitlegt dat installeren nodig is (Safari heeft geen PushManager).
  const iosNeedsInstall = isIOS() && !isStandalone();
  if(!pushSupported() && !iosNeedsInstall){ b.style.display='none'; return; }
  b.style.display='';
  const sub = iosNeedsInstall ? null : await currentPushSubscription();
  const on=!!sub && (typeof Notification!=='undefined' && Notification.permission==='granted');
  b.textContent = on ? '🔔' : '🔕';
  b.title = on ? 'Meldingen staan aan — klik om uit te zetten' : 'Zet meldingen aan';
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
}

async function savePushSubscription(sub){
  if(!CLOUD || !currentUser || !currentUser.id) return;
  const json=sub.toJSON();
  if(!json.keys || !json.keys.p256dh || !json.keys.auth) return;
  const row={
    user_id: currentUser.id,
    role: currentUser.role || 'student',
    endpoint: sub.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: String(navigator.userAgent||'').slice(0,300),
  };
  try{ await sb.from('push_subscriptions').upsert(row,{onConflict:'endpoint'}); }catch(e){}
}

async function removePushSubscription(sub){
  if(!CLOUD || !sub) return;
  try{ await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); }catch(e){}
}

async function enablePush(){
  if(!pushSupported()){ notify('Meldingen worden op dit apparaat niet ondersteund.','warn'); return; }
  if(!VAPID_PUBLIC_KEY){ notify('Meldingen zijn nog niet ingesteld.','warn'); return; }
  // iPhone/iPad: alleen mogelijk als de app op het beginscherm staat.
  if(isIOS() && !isStandalone()){ showInstallHint(true); return; }
  if(!currentUser || !currentUser.id){ notify('Log eerst in om meldingen aan te zetten.','warn'); return; }
  let perm = (typeof Notification!=='undefined') ? Notification.permission : 'denied';
  if(perm!=='granted'){ try{ perm=await Notification.requestPermission(); }catch(e){ perm='denied'; } }
  if(perm!=='granted'){ notify('Meldingen zijn geblokkeerd. Zet ze aan in je browserinstellingen.','warn'); return; }
  try{
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub){
      sub=await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    }
    await savePushSubscription(sub);
    await updateNotifyBtn();
    notify('Meldingen staan aan 🔔');
  }catch(e){ notify('Aanmelden voor meldingen lukte niet.','bad'); }
}

async function disablePush(){
  const sub=await currentPushSubscription();
  if(sub){
    await removePushSubscription(sub);
    try{ await sub.unsubscribe(); }catch(e){}
  }
  await updateNotifyBtn();
  notify('Meldingen uitgezet.');
}

async function onNotifyClick(){
  const sub=await currentPushSubscription();
  if(sub && typeof Notification!=='undefined' && Notification.permission==='granted') await disablePush();
  else await enablePush();
}

// Na inloggen: knoppen bijwerken en een bestaande aanmelding aan dit account koppelen.
async function syncPwaForUser(){
  updateInstallBtn();
  await updateNotifyBtn();
  try{
    const sub=await currentPushSubscription();
    if(sub && typeof Notification!=='undefined' && Notification.permission==='granted'){
      await savePushSubscription(sub);   // koppel de bestaande push-aanmelding aan de ingelogde gebruiker
    }
  }catch(e){}
}

// Knoppen koppelen (staan in de topbalk van de app).
(function wirePwaButtons(){
  const wire=()=>{
    const ib=$('installBtn'); if(ib && !ib.__wired){ ib.__wired=1; ib.addEventListener('click', onInstallClick); }
    const nb=$('notifyBtn');  if(nb && !nb.__wired){ nb.__wired=1; nb.addEventListener('click', onNotifyClick); }
    const hx=$('installHintClose'); if(hx && !hx.__wired){ hx.__wired=1; hx.addEventListener('click',()=>$('installHint').classList.add('hidden')); }
    updateInstallBtn();
    updateNotifyBtn();
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
