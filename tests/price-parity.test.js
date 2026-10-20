#!/usr/bin/env node
/* ============================================================================
   PRICE PARITY — fails if the home page and /quote/ can ever disagree on a
   paver price.

       node tests/price-parity.test.js

   No dependencies, no install, no browser. Plain node, so it runs on a laptop
   with no signal and in CI.

   WHY THIS EXISTS. Until 14 Oct 2026 each page carried its own price list.
   They drifted: the home page quoted M159.93/m² for the SQ200 and /quote/
   quoted M147.97/m² for the same paver. A customer could read both in one
   sitting. The fix was one shared list; this test is what keeps it one.

   HOW IT PROVES IT. Not by comparing two lists — there is only one list now.
   It proves there is nowhere else a price could come from:

     1. assets/price-list.js holds TM Stone's published prices, to the cent.
     2. Neither page contains a price or face-area literal for any product.
     3. Each page loads the shared file, at the right relative path.
     4. Each page binds its price and face lookups to that file's objects.

   (2) is the one that bites. Paste a number back into either page and this
   test goes red, whether or not the number happens to match.
   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
const fails = [];
function check(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    fails.push(`${name}: ${e.message}`);
    console.log(`  FAIL ${name}\n         ${e.message}`);
  }
}
const eq = (got, want, what) => {
  if (got !== want) throw new Error(`${what}: got ${got}, want ${want}`);
};

/* ---------------------------------------------------------------- the list */

const SHARED = 'assets/price-list.js';
const sandbox = { window: {} };
vm.runInNewContext(read(SHARED), sandbox, { filename: SHARED });
const LIST = sandbox.window.TMS_PRICE_LIST;
const FACE = sandbox.window.TMS_FACE_M2;
const REF_MARKUP = sandbox.window.TMS_PRICE_REF_MARKUP;

/* TM Stone's published selling prices, per paver, supply only, from his
   paver_cost_analysis (Aug 2026). Written out again here on purpose: a test
   that reads its expectations from the file under test proves nothing. Change
   a price and you change it in two places, deliberately, or this goes red. */
const PUBLISHED = {
  SQ200:  { paver: 6.3972, perM2: 159.93, face: 0.04   },
  SQ100:  { paver: 2.8111, perM2: 281.11, face: 0.01   },
  BR220:  { paver: 4.5085, perM2: 186.30, face: 0.0242 },
  HEX200: { paver: 4.7236, perM2: 181.68, face: 0.026  },
};
const CODES = Object.keys(PUBLISHED);

console.log(`\n1. ${SHARED} carries his published list\n`);

check('the shared file defines a list, a face map and a reference mark-up', () => {
  if (!LIST || typeof LIST !== 'object') throw new Error('TMS_PRICE_LIST is missing');
  if (!FACE || typeof FACE !== 'object') throw new Error('TMS_FACE_M2 is missing');
  eq(REF_MARKUP, 40, 'TMS_PRICE_REF_MARKUP');
});

check('the list is frozen — nothing can edit a published price at runtime', () => {
  if (!Object.isFrozen(LIST)) throw new Error('TMS_PRICE_LIST is not frozen');
  if (!Object.isFrozen(FACE)) throw new Error('TMS_FACE_M2 is not frozen');
});

check('the list holds exactly the four products, and no others', () => {
  eq(Object.keys(LIST).sort().join(','), CODES.slice().sort().join(','), 'price codes');
  eq(Object.keys(FACE).sort().join(','), CODES.slice().sort().join(','), 'face codes');
});

for (const code of CODES) {
  check(`${code} is M${PUBLISHED[code].paver.toFixed(4)} a paver`, () => {
    eq(LIST[code], PUBLISHED[code].paver, `${code} price per paver`);
  });
  check(`${code} face area is ${PUBLISHED[code].face} m²`, () => {
    eq(FACE[code], PUBLISHED[code].face, `${code} face area`);
  });
  check(`${code} comes out at M${PUBLISHED[code].perM2.toFixed(2)}/m², to the cent`, () => {
    const perM2 = +(LIST[code] / FACE[code]).toFixed(2);
    eq(perM2, PUBLISHED[code].perM2, `${code} price per m²`);
  });
}

/* The figure both pages are judged on: 120 m² of SQ200, supply only, at the
   reference mark-up. Pavers are whole units, so the area is rounded up first —
   both pages do Math.ceil(area / face). */
check('120 m² of SQ200, supply only, comes to M19,191.60 on either page', () => {
  const units = Math.ceil(120 / FACE.SQ200);
  eq(units, 3000, 'pavers for 120 m²');
  eq(+(units * LIST.SQ200).toFixed(2), 19191.60, 'supply-only total');
});

/* ------------------------------------------------- no second copy, anywhere */

const PAGES = [
  { file: 'index.html',       label: 'home page',     src: 'assets/price-list.js',
    binds: [[/const\s+PRICE\s*=\s*window\.TMS_PRICE_LIST\b/, 'PRICE -> window.TMS_PRICE_LIST'],
            [/const\s+FACE\s*=\s*window\.TMS_FACE_M2\b/,     'FACE -> window.TMS_FACE_M2']] },
  { file: 'quote/index.html', label: 'quote builder', src: '../assets/price-list.js',
    binds: [[/const\s+PRICE_LIST\s*=\s*window\.TMS_PRICE_LIST\b/,       'PRICE_LIST -> window.TMS_PRICE_LIST'],
            [/const\s+PRICE_REF_MARKUP\s*=\s*window\.TMS_PRICE_REF_MARKUP\b/, 'PRICE_REF_MARKUP -> window.TMS_PRICE_REF_MARKUP'],
            [/face\s*:\s*window\.TMS_FACE_M2\.SQ200\b/,                 'PRODUCTS face -> window.TMS_FACE_M2']] },
];

console.log('\n2. neither page carries a price of its own\n');

for (const page of PAGES) {
  const body = read(page.file);

  check(`${page.label} loads ${page.src}`, () => {
    const want = `<script src="${page.src}"></script>`;
    if (!body.includes(want)) throw new Error(`${page.file} has no ${want}`);
  });

  for (const [re, what] of page.binds) {
    check(`${page.label} binds ${what}`, () => {
      if (!re.test(body)) throw new Error(`${page.file} no longer matches ${re}`);
    });
  }

  /* The copy check. A product price or face area written as a literal anywhere
     in a page — `SQ200: 6.3972`, `SQ200:0.04`, `'SQ200': 5.91` — is a second
     copy by definition, matching or not. The shared file is the only place a
     number may sit beside a product code. */
  for (const code of CODES) {
    check(`${page.label} has no ${code} number in it`, () => {
      const re = new RegExp(`['"]?${code}['"]?\\s*:\\s*-?\\d`, 'g');
      const hits = body.match(re);
      if (hits) throw new Error(`${hits.length} numeric literal(s) for ${code}: ${hits.join(' ')}`);
    });
  }

  /* And the two retired lists by value, in case one is reintroduced somewhere
     the code-adjacency check above would not see it. */
  check(`${page.label} carries none of the retired price constants`, () => {
    const retired = ['6.3971', '5.9189483111111105', '2.691542077777778',
                     '4.219181028222223', '4.412825402222222'];
    const found = retired.filter(n => body.includes(n));
    if (found.length) throw new Error(`retired constants present: ${found.join(' ')}`);
  });
}

/* ------------------------------------------------------------------ verdict */

console.log('');
if (fails.length) {
  console.log(`❌ PRICE PARITY BROKEN — ${fails.length} failed, ${pass} passed\n`);
  for (const f of fails) console.log(`   - ${f}`);
  console.log('');
  process.exit(1);
}
console.log(`✅ ONE PRICE LIST, HIS PUBLISHED ONE (${pass} passed)\n`);
