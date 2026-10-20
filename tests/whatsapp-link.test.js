#!/usr/bin/env node
/* ============================================================================
   WHATSAPP LINK — fails if the home page's "WhatsApp us" button stops carrying
   the customer's calculator figures.

       node tests/whatsapp-link.test.js

   No dependencies, no install, no browser. It runs the home page's real
   calculator script against a few stand-in elements, then reads the link.

   WHY THIS EXISTS. The Phase 1 proposal promised an enquiry that lands in
   TM Stone's WhatsApp "with the area and paver type already filled in". Until
   20 Oct 2026 the button sent the same fixed sentence whatever was on screen.

   THE SHAPE IS A CONTRACT. TM Stone's HQ Sales tab reads these messages back
   (parseEnquiry): the area as "120 m²", the paver by its size or name. So the
   area is written with no thousands separator — "1,500 m²" would be read back
   as 1.5 m² — and the estimate is the exact figure the page shows.
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
  if (got !== want) throw new Error(`${what}:\n           got  ${got}\n           want ${want}`);
};

/* ------------------------------------------------- the page, run for real */

const HTML = read('index.html');
const WA = 'https://wa.me/26650659716?text=';

// The calculator is the inline script straight after the shared price list.
const m = HTML.match(/<script src="assets\/price-list\.js"><\/script>\s*<script>([\s\S]*?)<\/script>/);
if (!m) { console.log('❌ could not find the calculator script in index.html'); process.exit(1); }
const CALC_SRC = m[1];

// The paver options, as the page lists them.
const OPTIONS = [...HTML.matchAll(/<option value="(\w+)"[^>]*>([^<]+)<\/option>/g)]
  .map(([, value, text]) => ({ value, textContent: text }));

function el(extra) {
  const e = { value: '', textContent: '', innerHTML: '', href: '', listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    getAttribute(k) { return this[k]; }, setAttribute(k, v) { this[k] = String(v); } };
  // defineProperties, not assign: assign would freeze a getter's value at creation.
  return Object.defineProperties(e, Object.getOwnPropertyDescriptors(extra || {}));
}

function page() {
  const els = {
    area: el({ value: '120' }),
    ptype: el({ value: 'SQ200', get selectedOptions() { return [OPTIONS.find(o => o.value === this.value)]; } }),
    units: el(), matp: el(), sellp: el(), persqm: el(), alert: el(),
    total: el({ firstChild: { textContent: '' } }),
  };
  // The button is found by its id in the page, not by a stand-in name.
  const id = (HTML.match(/<a[^>]*id="([\w-]+)"[^>]*href="https:\/\/wa\.me\/26650659716\?text=/) ||
              HTML.match(/<a[^>]*href="https:\/\/wa\.me\/26650659716\?text=[^"]*"[^>]*id="([\w-]+)"/) || [])[1];
  if (id) els[id] = el({ href: WA });
  const sandbox = { window: {}, document: { getElementById: k => els[k] || null }, console };
  vm.createContext(sandbox);
  vm.runInContext(read('assets/price-list.js'), sandbox, { filename: 'assets/price-list.js' });
  vm.runInContext(CALC_SRC, sandbox, { filename: 'index.html (calculator)' });
  const set = (k, v) => { els[k].value = v; (els[k].listeners.input || []).forEach(f => f()); };
  const text = () => {
    if (!id) throw new Error('the WhatsApp button with a ?text= link has no id the script can update');
    const href = els[id].href;
    if (!href.startsWith(WA)) throw new Error(`link does not start with ${WA}: ${href}`);
    const q = href.slice(WA.length);
    if (q !== encodeURIComponent(decodeURIComponent(q))) throw new Error(`text is not URL-encoded: ${q}`);
    return decodeURIComponent(q);
  };
  return { els, set, text };
}

/* ---------------------------------------------------------------- the tests */

console.log('\n1. the link carries what the calculator shows\n');

check('on load: 120 m² of SQ200 — paver, code, area and the M19,191.60 estimate', () => {
  const p = page();
  eq(p.text(), "Lumela TM Stone! I'd like a quote. Paver: 200 × 200 × 50 mm Square (SQ200). " +
               'Area: 120 m². Website estimate: M19,191.60 (supply only).', 'message');
});

check('the estimate in the link is the figure on screen, to the cent', () => {
  const p = page();
  p.set('area', '37');
  p.set('ptype', 'HEX200');
  const shown = p.els.total.firstChild.textContent;
  if (!/^M[\d,]+\.\d\d$/.test(shown)) throw new Error(`unexpected total on screen: ${shown}`);
  if (!p.text().includes(`Website estimate: ${shown} (supply only).`))
    throw new Error(`link does not carry ${shown}: ${p.text()}`);
});

console.log('\n2. it follows the customer, every time calc() runs\n');

check('change the area and the paver, and the link changes with them', () => {
  const p = page();
  p.set('area', '45');
  p.set('ptype', 'BR220');
  eq(p.text(), "Lumela TM Stone! I'd like a quote. Paver: 220 × 110 × 50 mm Brick / Bevel (BR220). " +
               `Area: 45 m². Website estimate: ${p.els.total.firstChild.textContent} (supply only).`, 'message');
});

check('a big job is written "1500 m²", never "1,500 m²" (HQ would read that as 1.5)', () => {
  const p = page();
  p.set('area', '1500');
  if (!p.text().includes('Area: 1500 m².')) throw new Error(p.text());
});

check('the area in the link is the area the price was worked on', () => {
  const p = page();
  p.set('area', '0');                     // calc() prices a minimum of 1 m²
  if (!p.text().includes('Area: 1 m².')) throw new Error(p.text());
});

console.log('\n3. it says nothing a customer should not see\n');

check('every paver: no cost, margin or mark-up words in the message', () => {
  for (const o of OPTIONS) {
    const p = page();
    p.set('ptype', o.value);
    const t = p.text();
    if (!t.includes(`(${o.value})`)) throw new Error(`${o.value} missing its code: ${t}`);
    const bad = t.match(/cost|margin|mark-?up|overhead|profit/i);
    if (bad) throw new Error(`"${bad[0]}" in: ${t}`);
  }
});

/* ------------------------------------------------------------------ verdict */

console.log('');
if (fails.length) {
  console.log(`❌ WHATSAPP LINK BROKEN — ${fails.length} failed, ${pass} passed\n`);
  for (const f of fails) console.log(`   - ${f}`);
  console.log('');
  process.exit(1);
}
console.log(`✅ THE WHATSAPP LINK CARRIES THE QUOTE (${pass} passed)\n`);
