import { describe, it, expect } from 'vitest';
import {
  docxXmlToText, linesFromPdf, tidyLines, readableChart, kindOf, UNREADABLE,
} from '../src/lib/chart-text';
import { parseRoles, resolveImport } from '../src/lib/orgchart';

/**
 * Reading an org chart out of the file a business actually keeps it in.
 *
 * Kris, 18 September: *"when i am trying to import my org chart - it doesn't give the option of pdf
 * or word doc. that how they will do it"*.
 *
 * The rule the old code was written to still stands and is what most of this file checks: **a picker
 * that accepts a file and then silently produces nothing is worse than one that never offered.** So
 * the cases held here are the quiet ones — a Word run split mid-word, a PDF that is a photograph, a
 * .doc somebody thinks is a .docx — because those are the ones that would otherwise look like
 * SPEC being broken.
 */

describe('a Word document', () => {
  const para = (...runs: string[]) => `<w:p>${runs.map(r => `<w:r><w:t>${r}</w:t></w:r>`).join('')}</w:p>`;

  it('READS ONE PARAGRAPH PER LINE', () => {
    const xml = `<w:body>${para('General Manager')}${para('Operations Manager')}</w:body>`;
    expect(docxXmlToText(xml)).toBe('General Manager\nOperations Manager');
  });

  it('JOINS A SENTENCE WORD BROKE INTO PIECES', () => {
    /*
      The one that matters most, and the one nobody would think to test. Word splits a run wherever
      anything changes — a spellcheck mark, a font, a tracked edit — so a single typed title arrives
      as three separate `<w:t>` elements. Joining them with a space produces "Operat ions Manag er".
    */
    expect(docxXmlToText(para('Operat', 'ions Manag', 'er'))).toBe('Operations Manager');
  });

  it('TURNS TABS AND TABLE CELLS INTO COMMAS, because that is what the importer reads', () => {
    const row = '<w:tr><w:tc><w:p><w:r><w:t>Ops Manager</w:t></w:r></w:p></w:tc>'
      + '<w:tc><w:p><w:r><w:t>J. Barnes</w:t></w:r></w:p></w:tc>'
      + '<w:tc><w:p><w:r><w:t>General Manager</w:t></w:r></w:p></w:tc></w:tr>';
    expect(docxXmlToText(row)).toBe('Ops Manager, J. Barnes, General Manager');
  });

  it('and a tabbed list reads the same as a table', () => {
    const xml = para('Ops Manager') .replace('</w:p>', '<w:r><w:tab/><w:t>J. Barnes</w:t></w:r></w:p>');
    expect(docxXmlToText(xml)).toBe('Ops Manager, J. Barnes');
  });

  it('brings the five XML entities back as characters', () => {
    expect(docxXmlToText(para('Safety &amp; Compliance Lead'))).toBe('Safety & Compliance Lead');
  });

  it('drops the empty paragraphs Word leaves everywhere', () => {
    const xml = `${para('General Manager')}<w:p/><w:p><w:r><w:t>   </w:t></w:r></w:p>${para('Yard Lead')}`;
    expect(docxXmlToText(xml)).toBe('General Manager\nYard Lead');
  });

  it('AND WHAT COMES OUT GOES STRAIGHT THROUGH THE IMPORT THAT ALREADY EXISTS', () => {
    /*
      The point of all of it. There is one path to the org chart, already tested, and this only has
      to hand it the same text a paste would have. A second import that behaved differently would be
      worse than no import.
    */
    const rows = ['General Manager\tA. Morgan\t', 'Operations Manager\tJ. Barnes\tGeneral Manager']
      .map(r => `<w:p><w:r><w:t>${r.split('\t').join('</w:t></w:r><w:r><w:tab/><w:t>')}</w:t></w:r></w:p>`)
      .join('');
    const parsed = parseRoles(docxXmlToText(rows));
    expect(parsed.map(r => r.title)).toEqual(['General Manager', 'Operations Manager']);
    expect(resolveImport(parsed).unmatched).toEqual([]);
  });
});

describe('a PDF', () => {
  /*
    A PDF has no lines. It has glyphs at coordinates, and an org chart is the worst case: every box
    is drawn on its own, so reading in the file's own order gives nonsense.
  */
  it('GROUPS PIECES BY WHERE THEY SIT, not by the order the file stores them', () => {
    const out = linesFromPdf([
      { text: 'Barnes', x: 220, y: 500 },
      { text: 'General Manager', x: 100, y: 700 },
      { text: 'J.', x: 200, y: 500 },
      { text: 'Operations Manager', x: 100, y: 501 },
    ]);
    expect(out).toBe('General Manager\nOperations Manager J. Barnes');
  });

  it('reads DOWN the page, because PDF measures y upwards', () => {
    const out = linesFromPdf([{ text: 'bottom', x: 0, y: 10 }, { text: 'top', x: 0, y: 700 }]);
    expect(out).toBe('top\nbottom');
  });

  it('treats pieces a couple of points apart as one line', () => {
    // Nothing on a real page sits at exactly the same y. A zero tolerance splits every line in two.
    expect(linesFromPdf([{ text: 'A', x: 0, y: 500 }, { text: 'B', x: 50, y: 502 }])).toBe('A B');
  });

  it('and keeps two genuinely different lines apart', () => {
    expect(linesFromPdf([{ text: 'A', x: 0, y: 500 }, { text: 'B', x: 0, y: 530 }])).toBe('B\nA');
  });

  it('ignores pieces that are only whitespace', () => {
    expect(linesFromPdf([{ text: '  ', x: 0, y: 500 }, { text: 'Yard Lead', x: 10, y: 500 }])).toBe('Yard Lead');
  });
});

describe('when nothing usable comes out', () => {
  it('A SCANNED CHART IS NAMED AS A SCAN, not reported as our fault', () => {
    /*
      The failure the old code refused to risk: a photograph of a page saved as a PDF opens, has
      pages, reads perfectly, and contains no text at all. Everything works and nothing arrives.
    */
    const verdict = readableChart('');
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/scan|picture/i);
  });

  it('and a file of punctuation is not mistaken for a chart', () => {
    expect(readableChart('--- , , ,\n***').ok).toBe(false);
  });

  it('but an ordinary chart passes', () => {
    expect(readableChart('General Manager\nOperations Manager, J. Barnes')).toEqual({ ok: true, reason: null });
  });
});

describe('which files are offered, and what is said about the rest', () => {
  it('takes the four it can really read', () => {
    expect(kindOf('chart.csv')).toBe('text');
    expect(kindOf('Org Chart.DOCX')).toBe('docx');
    expect(kindOf('induction pack.pdf')).toBe('pdf');
    expect(kindOf('notes.txt')).toBe('text');
  });

  it('THE OLD WORD FORMAT GETS A WAY FORWARD, not "cannot read that"', () => {
    /*
      `.doc` is a 1990s compound-document format and nothing short of a real parser reads it. Left
      generic, it tells somebody with a perfectly ordinary Word file that our software is broken.
    */
    expect(kindOf('chart.doc')).toBe('unsupported');
    expect(UNREADABLE.doc).toMatch(/Save As/i);
    expect(UNREADABLE.doc).toMatch(/\.docx/);
  });

  it('and so do Excel, Pages and Numbers', () => {
    for (const ext of ['xls', 'xlsx', 'pages', 'numbers']) {
      expect(UNREADABLE[ext], ext).toBeTruthy();
      expect(UNREADABLE[ext].length, ext).toBeGreaterThan(30);
    }
  });
});

describe('tidyLines', () => {
  it('collapses runs of spaces and drops blank lines', () => {
    expect(tidyLines('  a   b  \n\n\n  c ')).toBe('a b\nc');
  });

  it('leaves a trailing empty column off, so an empty cell is not a missing manager', () => {
    // "General Manager, A. Morgan, " means the GM reports to nobody — not to a role called "".
    expect(tidyLines('General Manager, A. Morgan, ')).toBe('General Manager, A. Morgan');
  });
});
