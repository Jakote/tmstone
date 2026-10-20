#!/usr/bin/env node
/* ============================================================================
   WHATSAPP PREFILL — fails if the calculator's WhatsApp button stops carrying
   the customer's paver, area and quoted total to TM Stone's number.

       node tests/whatsapp-prefill.test.js

   No dependencies, no install, no browser. Plain node, like price-parity.

   WHY THIS EXISTS. The proposal promised the enquiry goes "straight to your
   WhatsApp with the area and paver type already filled in". Until 20 Oct 2026
   every wa.me link on the page sent the same fixed line, so Thulo got
   "Lumela! I'd like a quote for paving." and had to ask for everything again.

   HOW IT PROVES IT. It runs the page's own calculator script (lifted out of
   index.html, not re-implemented here) against a stub DOM, sets a sample job,
   and reads back the href the page put on the button. Then it checks:

     1. the link goes to his business number, the one in the footer;
     2. the decoded message names the paver, the area and the total;
     3. the total in the message is the total on the screen, character for
        character, so the two cannot come from different arithmetic;
     4. the message carries no cost figure or cost vocabulary;
     5. the plain HTML href still works if the script never runs.
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
  if (got !== want) throw new Error(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const has = (text, needle, what) => {
  if (!text.includes(needle)) throw new Error(`${what}: ${JSON.stringify(needle)} not in ${JSON.stringify(text)}`);
};

/* His business number, as the footer and the call bar print it. Written out
   here on purpose: the test must not read its expectation from the page. */
const NUMBER = '26650659716';
const PREFIX = `https://wa.me/${NUMBER}?text=`;

const HTML = read('index.html');

/* ------------------------------------------------------- a stub of the page */

/* The paver <option>s exactly as the page writes them, so the label in the
   message is the label the customer picked from. */
const OPTIONS = [...HTML.matchAll(/<option value="([A-Z0-9]+)"[^>]*>([^<]+)<\/option>/g)]
  .map(m => ({ value: m[1], textContent: m[2] }));

/* The page's calculator script: the inline <script> that reads the shared
   price list. Lifted verbatim so a change to the page is a change under test. */
const CALC_SRC = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => m[1])
  .find(s => s.includes('window.TMS_PRICE_LIST'));

function el(id, extra) {
  const e = {
    id, value: '', textContent: '', href: '', handlers: {},
    attrs: {},
    addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'href') this.href = String(v); },
    getAttribute(k) { return k === 'href' ? this.href : this.attrs[k]; },
    fire(type) { (this.handlers[type] || []).forEach(fn => fn({ type, target: this })); },
  };
  /* defineProperties, not assign: assign would freeze a getter's value. */
  return Object.defineProperties(e, Object.getOwnPropertyDescriptors(extra || {}));
}

/* Builds a fresh page: every element the calculator touches, plus each wa.me
   anchor the page marks with data-wa-quote, carrying its own static href. */
function loadPage() {
  const ids = {};
  for (const id of ['area', 'units', 'matp', 'sellp', 'persqm', 'alert']) ids[id] = el(id);
  ids.total = el('total', { firstChild: { textContent: '' } });
  ids.ptype = el('ptype', {
    options: OPTIONS,
    get selectedOptions() { return [OPTIONS.find(o => o.value === this.value)]; },
  });
  ids.area.value = '120';
  ids.ptype.value = OPTIONS[0].value;

  const marked = [...HTML.matchAll(/<a\b[^>]*\bdata-wa-quote\b[^>]*>/g)].map(m => {
    const tag = m[0];
    const id = (tag.match(/\bid="([^"]+)"/) || [])[1] || '';
    const href = (tag.match(/\bhref="([^"]+)"/) || [])[1] || '';
    const a = el(id, { tag });
    a.href = href.replace(/&amp;/g, '&');
    a.staticHref = a.href;
    if (id) ids[id] = a;
    return a;
  });

  const document = {
    getElementById: id => ids[id] || null,
    querySelectorAll: sel => (sel === '[data-wa-quote]' ? marked : []),
  };
  const window = {};
  const ctx = vm.createContext({ window, document, console });
  vm.runInContext(read('assets/price-list.js'), ctx, { filename: 'assets/price-list.js' });
  vm.runInContext(CALC_SRC, ctx, { filename: 'index.html (calculator script)' });
  return { ids, marked };
}

function setJob(page, area, code) {
  page.ids.area.value = String(area);
  page.ids.area.fire('input');
  page.ids.ptype.value = code;
  page.ids.ptype.fire('change');
}

const msgOf = href => {
  if (!href.startsWith(PREFIX)) throw new Error(`href does not start with ${PREFIX}: ${href}`);
  return decodeURIComponent(href.slice(PREFIX.length));
};

/* ---------------------------------------------------------------- the tests */

console.log('\n1. the page has a calculator WhatsApp button\n');

check('the calculator script was found in index.html', () => {
  if (!CALC_SRC) throw new Error('no inline <script> reads window.TMS_PRICE_LIST');
});

check('the four pavers are read off the page', () => {
  eq(OPTIONS.map(o => o.value).join(','), 'SQ200,SQ100,BR220,HEX200', 'paver codes');
});

check('a #waquote button sits in the calculator, marked data-wa-quote', () => {
  const calc = HTML.slice(HTML.indexOf('id="calc"'), HTML.indexOf('</section>', HTML.indexOf('id="calc"')));
  if (!/<a\b[^>]*\bid="waquote"[^>]*\bdata-wa-quote\b|<a\b[^>]*\bdata-wa-quote\b[^>]*\bid="waquote"/.test(calc))
    throw new Error('no <a id="waquote" data-wa-quote> inside the #calc section');
});

check('every wa.me link on the page goes to his business number', () => {
  const links = [...HTML.matchAll(/https:\/\/wa\.me\/(\d+)/g)].map(m => m[1]);
  if (!links.length) throw new Error('no wa.me links at all');
  const wrong = links.filter(n => n !== NUMBER);
  if (wrong.length) throw new Error(`wa.me links to other numbers: ${wrong.join(' ')}`);
});

check('every wa.me link on the page is marked data-wa-quote, footer included', () => {
  const bare = [...HTML.matchAll(/<a\b[^>]*href="https:\/\/wa\.me\/[^"]*"[^>]*>([^<]*)<\/a>/g)]
    .filter(m => !/\bdata-wa-quote\b/.test(m[0]));
  if (bare.length) throw new Error(`not marked, so never carries the quote: ${bare.map(m => m[0]).join(' ')}`);
});

check('the footer has its own WhatsApp link, marked data-wa-quote', () => {
  const foot = HTML.slice(HTML.indexOf('<footer'), HTML.indexOf('</footer>'));
  if (!/<a\b[^>]*href="https:\/\/wa\.me\/[^"]*"[^>]*\bdata-wa-quote\b|<a\b[^>]*\bdata-wa-quote\b[^>]*href="https:\/\/wa\.me\//.test(foot))
    throw new Error('no marked wa.me link inside <footer>');
});

console.log('\n2. a sample quote: 120 m², 200 × 200 Square (the page default)\n');

{
  const page = loadPage();
  setJob(page, 120, 'SQ200');
  const href = page.ids.waquote ? page.ids.waquote.href : '';
  let msg = '';
  check('the button href is a wa.me link to his number with a text= message', () => {
    msg = msgOf(href);
  });
  check('the link is fully URL-encoded (no raw space, newline, ×, ² or comma)', () => {
    const raw = href.slice(PREFIX.length);
    const bad = raw.match(/[\s×²,]/g);
    if (bad) throw new Error(`unencoded characters: ${JSON.stringify(bad.join(''))}`);
    eq(raw, encodeURIComponent(msg), 'href text is encodeURIComponent(message)');
  });
  check('the message names the paver as the customer picked it', () => {
    has(msg, '200 × 200 × 50 mm Square', 'paver label');
  });
  check('the message carries the area', () => has(msg, '120 m²', 'area'));
  check('the message carries the total, M19,191.60', () => has(msg, 'M19,191.60', 'total'));
  check('the total in the message is the total on the screen', () => {
    const shown = page.ids.total.firstChild.textContent;
    eq(shown, 'M19,191.60', 'total shown on screen');
    has(msg, shown, 'screen total in message');
  });
}

console.log('\n3. a second quote: 37.5 m², Hexagon\n');

{
  const page = loadPage();
  setJob(page, 37.5, 'HEX200');
  let msg = '';
  check('the button href is a wa.me link to his number', () => {
    msg = msgOf(page.ids.waquote ? page.ids.waquote.href : '');
  });
  const shown = page.ids.total.firstChild.textContent;
  /* 37.5 / 0.026 = 1,442.3 -> 1,443 pavers x M4.7236 = M6,816.15 */
  check('the screen shows M6,816.15 for 1,443 pavers', () => eq(shown, 'M6,816.15', 'total shown'));
  check('the message names the Hexagon', () => has(msg, 'Hexagon 200 × 50 mm', 'paver label'));
  check('the message carries 37.5 m²', () => has(msg, '37.5 m²', 'area'));
  check('the message carries the screen total', () => has(msg, shown, 'total'));
  check('the message follows a change of paver (no stale SQ200 label)', () => {
    if (msg.includes('200 × 200 × 50 mm Square')) throw new Error('old paver label still in message');
  });
}

console.log('\n3b. a big job: 1500 m², 200 × 200 Square\n');

/* HQ's Sales tab reads these messages with parseEnquiry(), whose area pattern
   takes a comma as a decimal point. "Area: 1,500 m²" came through as 1.5 m²,
   so every job of 1,000 m² or more landed 1,000 times too small. The area is
   written without a thousands separator; the price keeps its separator because
   parseEnquiry reads "M…" amounts correctly. */
{
  const page = loadPage();
  setJob(page, 1500, 'SQ200');
  let msg = '';
  check('the button href is a wa.me link to his number', () => {
    msg = msgOf(page.ids.waquote ? page.ids.waquote.href : '');
  });
  check('the area is written "Area: 1500 m²", with no thousands separator', () => {
    has(msg, 'Area: 1500 m²', 'area');
  });
  check('the total in the message is still the total on the screen', () => {
    has(msg, page.ids.total.firstChild.textContent, 'screen total in message');
  });
}

console.log('\n4. nothing private, nothing broken\n');

check('no cost figure or cost vocabulary in any message', () => {
  const page = loadPage();
  const bad = /cost|margin|mark-?up|overhead|profit|cement|depreciation|4\.5693|1\.0341|434\.26/i;
  for (const o of OPTIONS) {
    setJob(page, 120, o.value);
    for (const a of page.marked) {
      const href = a.href;
      if (!href.startsWith(PREFIX)) continue;
      const m = msgOf(href);
      if (bad.test(m)) throw new Error(`${o.value} message mentions ${m.match(bad)[0]}: ${m}`);
    }
  }
});

check('without the script, every marked button still opens his WhatsApp', () => {
  const page = loadPage();
  for (const a of page.marked) {
    if (!a.staticHref.startsWith(`https://wa.me/${NUMBER}`))
      throw new Error(`static href of ${a.id || a.tag} is ${a.staticHref}`);
  }
});

check('the other WhatsApp buttons keep the plain greeting until the customer prices a job', () => {
  const page = loadPage();
  const others = page.marked.filter(a => a.id !== 'waquote');
  if (!others.length) throw new Error('no other data-wa-quote buttons (the CTA and call bar should be marked)');
  for (const a of others) eq(a.href, a.staticHref, `${a.id || 'button'} before any input`);
  setJob(page, 64, 'BR220');
  for (const a of others) {
    const m = msgOf(a.href);
    has(m, '64 m²', `${a.id || 'button'} after input`);
    has(m, '220 × 110 × 50 mm Brick / Bevel', `${a.id || 'button'} after input`);
    has(m, page.ids.total.firstChild.textContent, `${a.id || 'button'} after input`);
  }
});

/* ------------------------------------------------------------------ verdict */

console.log('');
if (fails.length) {
  console.log(`❌ WHATSAPP PREFILL BROKEN — ${fails.length} failed, ${pass} passed\n`);
  for (const f of fails) console.log(`   - ${f}`);
  console.log('');
  process.exit(1);
}
console.log(`✅ WHATSAPP CARRIES PAVER, AREA AND TOTAL (${pass} passed)\n`);
