#!/usr/bin/env node
/* Valideert de vragenbank (QUIZZES) in lessons.js.
   Draait in CI en lokaal: `node scripts/validate-lessons.js`
   Faalt (exit 1) bij een fout, zodat een typefout in een les meteen opvalt. */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'lessons.js');
const s = fs.readFileSync(file, 'utf8');

// QUIZZES-object-literal uit lessons.js knippen (haakjes-balans).
const start = s.indexOf('const QUIZZES = {');
if (start < 0) { console.error('QUIZZES niet gevonden in lessons.js'); process.exit(1); }
const from = s.indexOf('{', start);
let depth = 0, end = -1;
for (let i = from; i < s.length; i++) {
  const ch = s[i];
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
}
let QUIZZES;
try { QUIZZES = eval('(' + s.slice(from, end + 1) + ')'); }
catch (e) { console.error('Kon QUIZZES niet parsen:', e.message); process.exit(1); }

const stripTags = t => (t || '').replace(/<[^>]+>/g, '').trim();
let errors = 0, total = 0, lessons = 0;
const fail = (loc, msg) => { console.error(`✗ ${loc}: ${msg}`); errors++; };

for (const [id, data] of Object.entries(QUIZZES)) {
  lessons++;
  if (!data.q || !Array.isArray(data.q) || !data.q.length) { fail(`Les ${id}`, 'geen vragen-array'); continue; }
  data.q.forEach((q, i) => {
    total++;
    const loc = `Les ${id} vraag ${i + 1}`;
    if (typeof q.t !== 'string' || !q.t.trim()) fail(loc, 'lege vraagtekst');
    if (!Array.isArray(q.o) || q.o.length < 2) fail(loc, 'minder dan 2 antwoordopties');
    if (typeof q.c !== 'number' || q.c < 0 || (Array.isArray(q.o) && q.c >= q.o.length)) fail(loc, `ongeldige antwoord-index c=${q.c}`);
    if (Array.isArray(q.o)) {
      const uniq = new Set(q.o.map(x => String(x).trim().toLowerCase()));
      if (uniq.size !== q.o.length) fail(loc, `dubbele antwoordopties: ${JSON.stringify(q.o)}`);
    }
    if (!q.tag) fail(loc, 'geen tag');
    if (!q.e || !q.e.trim()) fail(loc, 'geen uitleg');
  });
}

/* ---- ZINS-leerlijnen (Zinsopbouw 1 = ZINS, Zinsopbouw 2 = ZINS2) valideren ---- */
const ROLES = new Set(['WIE', 'DOET', 'WAT', 'WAAR', 'WANNEER', 'EIND']);
let zLessons = 0, zItems = 0;
const zIds = new Set();   // id's moeten over beide leerlijnen heen uniek zijn

// Knip een array-literal `const <name> = [ … ]` uit met haakjes-balans.
function extractArray(name) {
  const marker = `const ${name} = [`;
  const at = s.indexOf(marker);
  if (at < 0) return null;
  const from = s.indexOf('[', at);
  let d = 0, end = -1;
  for (let i = from; i < s.length; i++) {
    const ch = s[i];
    if (ch === '[') d++;
    else if (ch === ']') { d--; if (d === 0) { end = i; break; } }
  }
  try { return eval('(' + s.slice(from, end + 1) + ')'); }
  catch (e) { console.error(`Kon ${name} niet parsen:`, e.message); process.exit(1); }
}

function validateZinsLine(label, arr) {
  (arr || []).forEach(les => {
    zLessons++;
    const L = `${label} ${les.n || '?'}`;
    if (!les.n) fail(L, 'geen id (n)');
    else if (zIds.has(les.n)) fail(L, `dubbel id ${les.n}`); else zIds.add(les.n);
    if (!les.t || !les.t.trim()) fail(L, 'geen titel (t)');
    if (!Array.isArray(les.items) || !les.items.length) { fail(L, 'geen items-array'); return; }
    les.items.forEach((it, i) => {
      zItems++;
      const loc = `${L} opdracht ${i + 1}`;
      if (!it.e || !String(it.e).trim()) fail(loc, 'geen uitleg (e)');
      if (it.kind === 'sleep') {
        if (!Array.isArray(it.parts) || it.parts.length < 2) fail(loc, 'sleep heeft minder dan 2 delen');
        else it.parts.forEach(p => { if (!Array.isArray(p) || p.length !== 2 || !ROLES.has(p[0]) || !String(p[1]).trim()) fail(loc, `ongeldig deel ${JSON.stringify(p)}`); });
      } else if (it.kind === 'bouw') {
        if (!it.tr || !String(it.tr).trim()) fail(loc, 'bouw zonder tr (bronzin)');
        if (!it.model || !String(it.model).trim()) fail(loc, 'bouw zonder model (voorbeeldzin)');
        if (it.answers && !Array.isArray(it.answers)) fail(loc, 'answers moet een array zijn');
      } else { // herken (standaard)
        if (it.ask) {
          if (!it.sentence || !String(it.sentence).trim()) fail(loc, 'herken zonder zin (sentence)');
          if (!ROLES.has(it.ask)) fail(loc, `onbekende rol ask=${it.ask}`);
          if (!Array.isArray(it.parts) || !it.parts.some(p => p[0] === it.ask)) fail(loc, `rol '${it.ask}' komt niet voor in parts`);
        } else {
          if (!it.q || !String(it.q).trim()) fail(loc, 'herken zonder vraag (q of ask)');
          if (!Array.isArray(it.o) || it.o.length < 2) fail(loc, 'minder dan 2 antwoordopties');
          if (typeof it.c !== 'number' || it.c < 0 || (Array.isArray(it.o) && it.c >= it.o.length)) fail(loc, `ongeldige antwoord-index c=${it.c}`);
        }
      }
    });
  });
}

validateZinsLine('Zinsopbouw 1', extractArray('ZINS'));
validateZinsLine('Zinsopbouw 2', extractArray('ZINS2'));

console.log(`Woordjes: ${lessons} lessen / ${total} vragen | Zinsopbouw: ${zLessons} lessen / ${zItems} opdrachten | Fouten: ${errors}`);
if (errors) { console.error('\nVALIDATIE MISLUKT — herstel bovenstaande fouten.'); process.exit(1); }
console.log('Alle opdrachten OK.');
