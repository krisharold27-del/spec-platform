/*
  "If I leave, do I get my data back?"

  Question 6 on the owner questions page, answered in the product with *"Yes. The owner can export
  everything, any time, in one click."* On 26 September that was a paragraph on the Admin screen
  with no button, no route and no code behind it — found by working through Kris's own questions
  against what is actually built.

  The tests that matter here are not about CSV formatting. They are about a promise a business
  tests on the worst day it ever has with SPEC.
*/
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readme, filesFor, archiveName, type Sheet } from '../src/lib/export-everything';
import { EXPORT_INCLUDES, mayExportEverything } from '../src/lib/money-sight';

const sheets: Sheet[] = [
  { file: 'jobs.csv', about: 'Jobs', header: ['Ref'], rows: [['J1'], ['J2']] },
  { file: 'people.csv', about: 'People', header: ['Name'], rows: [['Kris']] },
];

describe('the promise on the Admin screen is kept by real code', () => {
  it('HAS A BUTTON, not a sentence about one', () => {
    /*
      The exact fault this feature exists to fix: the screen said "Yours to take, any time, in one
      click" and nothing happened, because nothing was there.
    */
    const panel = readFileSync('src/app/settings/access-panel.tsx', 'utf8');
    expect(panel).toContain('data-export-everything');
    expect(panel).toContain('/api/export');
  });

  it('and a route behind the button', () => {
    const route = readFileSync('src/app/api/export/route.ts', 'utf8');
    expect(route).toContain('export async function GET');
    expect(route).toContain('application/zip');
  });

  it('IS OWNER ONLY, CHECKED ON THE SERVER', () => {
    /* Hiding a button is not access control, and this request is every customer, every wage and
       every incident in one download — the most valuable one in the product to forge. */
    const route = readFileSync('src/app/api/export/route.ts', 'utf8');
    expect(route).toContain('mayExportEverything');
    expect(route).toContain('403');
    expect(mayExportEverything('owner')).toBe(true);
    expect(mayExportEverything('manager')).toBe(false);
  });

  it('STILL WORKS WHEN THE SUBSCRIPTION HAS LAPSED', () => {
    /*
      A business whose card has failed is exactly the business most likely to be leaving. An export
      that stopped working when the payment did would make the data-ownership promise worthless at
      the only moment it counts — so this route deliberately does not call assertWritable.
    */
    /* Read with the comments stripped. The file EXPLAINS that it does not call assertWritable, and
       a check that matched the prose would fail on the very note saying the rule is kept — the same
       trap the channels check fell into on 26 September. Behaviour, not commentary. */
    const code = readFileSync('src/app/api/export/route.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('assertWritable');
    expect(code).toContain('mayExportEverything');
  });
});

describe('what arrives is usable without SPEC', () => {
  it('always carries a README, even for a business with nothing in it', () => {
    /* Real `unzip` refuses an archive with no entries — "zipfile is empty". A brand new business
       must get a file that opens and explains itself, not a download that looks like a failure. */
    const files = filesFor('JBI Electrical', '2026-09-26 10:00', []);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('README.txt');
  });

  it('names every sheet in the README, with its row count', () => {
    const text = readme('JBI Electrical', '2026-09-26 10:00', sheets);
    expect(text).toContain('jobs.csv');
    expect(text).toContain('2 rows');
    expect(text).toContain('1 row');
  });

  it('IS HONEST THAT THE DOCUMENTS THEMSELVES ARE NOT IN IT', () => {
    /* A year of job photos is bigger than a browser download will carry. An archive that fails
       halfway is worse than one that says where things are. */
    const text = readme('JBI', 'now', sheets);
    expect(text).toContain('not inside this archive');
    expect(text).toContain('documents.csv');
  });

  it('tells somebody the ids are the useful part', () => {
    /* They look like noise and they are what lets a bookkeeper join timesheets to people and jobs.
       Dropping them would make a tidier file and a useless one. */
    expect(readme('JBI', 'now', sheets)).toContain('Keep them');
  });

  it('names the file after the business and the date', () => {
    /* It lands in a downloads folder beside forty other things, and "export.zip" is how somebody
       loses their own data twice. */
    expect(archiveName('JBI Electrical', '2026-09-26')).toBe('jbi-electrical-everything-2026-09-26.zip');
    expect(archiveName('O\'Brien & Sons', '2026-09-26')).toBe('obrien-sons-everything-2026-09-26.zip');
    expect(archiveName('', '2026-09-26')).toBe('business-everything-2026-09-26.zip');
  });
});

describe('it contains what the Admin screen says it contains', () => {
  it('COVERS EVERY AREA THE SCREEN PROMISES', async () => {
    /*
      The screen lists eight things. This checks the export actually has a sheet for each, because
      a promise and a list are the two halves that drift apart — and the drift is only discovered
      by the person who was counting on it.
    */
    const src = readFileSync('src/lib/export-data.ts', 'utf8');
    const wanted: Record<string, string> = {
      'Jobs': 'jobs.csv',
      'Customers': 'customers.csv',
      'People': 'people.csv',
      'Pay runs and timesheets': 'timesheets.csv',
      'Safety': 'safety.csv',
      'Compliance': 'compliance.csv',
      'Money': 'money.csv',
      'Every document uploaded': 'contracts.csv',
    };
    for (const promised of EXPORT_INCLUDES) {
      const key = Object.keys(wanted).find(k => promised.startsWith(k));
      expect(key, `the Admin screen promises "${promised}" and nothing in the export covers it`).toBeTruthy();
      expect(src, `no sheet for "${promised}"`).toContain(wanted[key!]);
    }
  });
});
