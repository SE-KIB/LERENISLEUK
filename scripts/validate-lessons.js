#!/usr/bin/env node
/* Valideert de vragenbank (QUIZZES) in index.html.
   Draait in CI en lokaal: `node scripts/validate-lessons.js`
   Faalt (exit 1) bij een fout, zodat een typefout in een les meteen opvalt. */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'index.html');
const s = fs.readFileSync(file, 'utf8');

// QUIZZES-object-literal uit index.html knippen (haakjes-balans).
const start = s.indexOf('const QUIZZES = {');
if (start < 0) { console.error('QUIZZES niet gevonden in index.html'); process.exit(1); }
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

console.log(`Lessen: ${lessons} | Vragen: ${total} | Fouten: ${errors}`);
if (errors) { console.error('\nVALIDATIE MISLUKT — herstel bovenstaande fouten.'); process.exit(1); }
console.log('Alle opdrachten OK.');
