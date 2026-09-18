/**
 * Importing an org chart from the file a business actually keeps it in.
 *
 * Kris, 18 September: *"when i am trying to import my org chart - it doesn't give the option of pdf
 * or word doc. that how they will do it"*.
 *
 * ── Why this cannot be a unit test ───────────────────────────────────────────────────────────────
 *
 * `tests/chart-text.test.ts` holds the reading: a Word run split mid-word, a PDF's glyphs put back
 * into lines, a scan named as a scan. All of it is pure and none of it touches a file.
 *
 * The two parts that actually break are the two it cannot reach — unzipping a real .docx with the
 * browser's own `DecompressionStream`, and pdfjs loading its worker inside a Next bundle. Both work
 * only in a browser, both fail silently when they fail, and a file picker that accepts a document
 * and then quietly produces nothing is the exact thing this feature was refusing to ship for
 * months. So a real .docx and a real PDF are built here, byte by byte, and chosen with the button.
 *
 *   node scripts/fake-auth.mjs 54321 &
 *   npm start &
 *   node scripts/chart-import-journey.mjs http://localhost:3100
 */

import { chromium } from 'playwright';
import { deflateRawSync } from 'node:zlib';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tidyUp } from './test-cleanup.mjs';

const RUN_STARTED = new Date().toISOString();
const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;

const stamp = Date.now();
const EMAIL = `chartfile-${stamp}@journey.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Chart File Test ${stamp}`;

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

const dir = mkdtempSync(join(tmpdir(), 'spec-chart-'));

/* ── A real .docx, which is a zip of XML ─────────────────────────────────────────────────────────
 *
 * Written by hand rather than with a library, for the same reason the reader is: the thing being
 * proven is that OUR zip reader copes with what Word writes, and a library on both ends would only
 * prove the library agrees with itself. Deflated, not stored, because Word deflates.
 */
function docx(path, documentXml) {
  const name = Buffer.from('word/document.xml');
  const raw = Buffer.from(documentXml, 'utf8');
  const body = deflateRawSync(raw);
  const crc = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);            // version needed
  local.writeUInt16LE(8, 8);             // deflate
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);          // where the local header is

  const centralAt = local.length + name.length + body.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);               // entries on this disk
  end.writeUInt16LE(1, 10);              // entries total
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralAt, 16);

  writeFileSync(path, Buffer.concat([local, name, body, central, name, end]));
}

/** The zip CRC. A wrong one is not rejected by our reader but would be by Word, so it is done right. */
function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

/* ── A real PDF, with a correct cross-reference table ────────────────────────────────────────────
 *
 * Offsets are counted as the file is built rather than written out by hand. pdfjs can often rebuild
 * a broken xref, and a fixture that quietly relies on that would be testing the recovery path
 * instead of the ordinary one.
 */
function pdf(path, lines) {
  const content = lines
    .map(([text, x, y]) => `BT /F1 12 Tf ${x} ${y} Td (${text}) Tj ET`)
    .join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
      + '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];

  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefAt = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) out += `${String(at).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  writeFileSync(path, out, 'latin1');
}

const para = (...runs) => `<w:p>${runs.map(r => `<w:r><w:t>${r}</w:t></w:r>`).join('')}</w:p>`;
const cell = t => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
const row = (...cells) => `<w:tr>${cells.map(cell).join('')}</w:tr>`;

const DOCX = join(dir, 'JBI org chart.docx');
docx(DOCX,
  '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>'
  + row('General Manager', 'A. Morgan', '')
  + row('Operations Manager', 'J. Barnes', 'General Manager')
  // A title Word has broken into three runs, which is what a spellcheck mark does.
  + row('Safety &amp; Complian', 'ce Lead', '')
  .replace('<w:tc><w:p><w:r><w:t>Safety &amp; Complian</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>ce Lead</w:t></w:r></w:p></w:tc>',
    `<w:tc><w:p><w:r><w:t>Safety &amp; Complian</w:t></w:r><w:r><w:t>ce Lead</w:t></w:r></w:p></w:tc>${cell('R. Nakamura')}`)
  + para('')
  + '</w:body></w:document>');

const PDF = join(dir, 'induction pack.pdf');
pdf(PDF, [
  ['General Manager', 72, 700],
  ['Operations Manager', 72, 640],
  // Deliberately out of file order and slightly off the line, the way a drawn chart really is.
  ['Barnes', 260, 641],
  ['J.', 240, 640],
]);

const EMPTY_PDF = join(dir, 'scanned chart.pdf');
pdf(EMPTY_PDF, []);                 // a photograph of a page: opens fine, contains no text at all

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();
const faults = [];
page.on('pageerror', e => faults.push(String(e).slice(0, 200)));

const stop = async (code, why) => {
  console.log(`  --   ${why}`);
  await browser.close();
  await tidyUp(code === 0 ? null : BUSINESS, { lookSince: RUN_STARTED });
  process.exit(code);
};

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.check('input[name="consent"]').catch(() => {});
await page.click('button[type="submit"]');
await page.waitForURL(url => !url.pathname.startsWith('/signup'), { timeout: 20000 }).catch(() => {});
await page.waitForLoadState('networkidle').catch(() => {});
if (page.url().includes('error=busy')) await stop(0, 'sign-up is being throttled — not a fault.');
if (!/\/(my-page|welcome|setup)/.test(page.url())) await stop(1, `could not sign up (landed on ${page.url()})`);

await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });

const picker = page.locator('input[type="file"]');
const box = page.locator('#chart-paste');
const said = () => page.locator('input[type="file"]').locator('xpath=../p').innerText();

check('THE PICKER OFFERS WORD AND PDF', /\.docx/.test(await picker.getAttribute('accept') ?? '')
  && /\.pdf/.test(await picker.getAttribute('accept') ?? ''), await picker.getAttribute('accept') ?? '');

/** Choose a file and wait for the note under the button to stop saying "Reading…". */
async function choose(path) {
  await picker.setInputFiles(path);
  for (let i = 0; i < 60; i++) {
    const note = await said().catch(() => '');
    if (note && !/^Reading/.test(note)) return note;
    await page.waitForTimeout(250);
  }
  return said().catch(() => '');
}

// ── A Word document ──────────────────────────────────────────────────────────────────────────────
const wordNote = await choose(DOCX);
const wordText = await box.inputValue();
check('A WORD DOCUMENT IS READ', wordText.includes('General Manager'), wordNote);
check('  a table row becomes one line, not three', wordText.includes('Operations Manager, J. Barnes, General Manager'), wordText.split('\n')[1] ?? '');
check('  a title Word split mid-word is put back together', wordText.includes('Safety & Compliance Lead'), wordText);
check('  and nothing is uploaded — it is in the box to check first', wordText.length > 0 && /Check it/.test(wordNote), wordNote);

// ── A PDF ────────────────────────────────────────────────────────────────────────────────────────
await box.fill('');
const pdfNote = await choose(PDF);
const pdfText = await box.inputValue();
check('A PDF IS READ', pdfText.includes('General Manager'), pdfNote);
check('  glyphs scattered across the page come back as lines', /Operations Manager J\. Barnes/.test(pdfText), JSON.stringify(pdfText));
check(
  '  and it says a PDF loses the reporting lines, every time rather than only when it goes wrong',
  /reporting lines/i.test(pdfNote),
  pdfNote,
);

// ── A scan, which is the failure the old code refused to risk ────────────────────────────────────
await box.fill('');
const scanNote = await choose(EMPTY_PDF);
check('A SCANNED CHART IS NAMED AS A SCAN', /scan|picture/i.test(scanNote), scanNote);
check('  and the box is left alone rather than emptied of the last good import', (await box.inputValue()) === '', 'the box was written over');

// ── The older Word format, which nothing can read ────────────────────────────────────────────────
const OLD = join(dir, 'chart.doc');
writeFileSync(OLD, 'this is not a docx');
const oldNote = await choose(OLD);
check('A .doc IS GIVEN A WAY FORWARD, not "cannot read that"', /Save As/i.test(oldNote) && /docx/i.test(oldNote), oldNote);

// ── And the text really goes through the import that already existed ─────────────────────────────
await box.fill('');
await choose(DOCX);
// "Build the chart" is the import's own button. "Read the chart" is a different feature entirely,
// and pressing it proved only that I had not looked.
await page.getByRole('button', { name: 'Build the chart' }).click();
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(1200);
await page.reload({ waitUntil: 'networkidle' });
const chart = await page.locator('[data-org-canvas]').innerText();
check('THE ROLES FROM THE WORD FILE ARE ON THE CHART', /Operations Manager/.test(chart), chart.replace(/\n+/g, ' | ').slice(0, 200));

check('no page threw', faults.length === 0, faults.join(' | '));

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll checks passed.');
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });
process.exit(failures.length ? 1 : 0);
