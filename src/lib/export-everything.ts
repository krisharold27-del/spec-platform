/**
 * Everything the business has, as files it can open without SPEC.
 *
 * ── The promise this keeps ───────────────────────────────────────────────────────────────────────
 *
 * Kris's own question, number 6: *"If I leave, do I get my data back?"* — answered in the product
 * with *"Yes. The owner can export everything, any time, in one click."*
 *
 * On 26 September that was a paragraph. The Admin screen listed the eight things the export would
 * contain and said "Yours to take, any time, in one click", and there was no button, no route and
 * no code. A business that decided to leave would have found out on the worst possible day.
 *
 * ── What shape it takes, and why ─────────────────────────────────────────────────────────────────
 *
 * A zip of CSVs, one per area, plus a README. Not a database dump, not JSON, not an API to call:
 * the person opening this is an owner or their bookkeeper, on a laptop, and the test is whether it
 * opens in Excel first time with nobody to ask. Every sheet leads with the columns a human needs —
 * names and dates before ids — because a file that is technically complete and unreadable has not
 * given anybody their data back.
 *
 * ── Ids are kept anyway ──────────────────────────────────────────────────────────────────────────
 *
 * Last, and included. They are what lets somebody join the timesheets to the people and the jobs
 * afterwards, which is the whole difference between eight spreadsheets and one record of a
 * business. Dropping them would make a tidier file and a useless one.
 */
import { csv } from './zip';

/** One sheet in the archive. */
export interface Sheet {
  /** The filename inside the zip. */
  file: string;
  /** What it holds, for the README — in the words the Admin screen already uses. */
  about: string;
  header: readonly string[];
  rows: readonly (readonly (string | number | null | undefined)[])[];
}

/**
 * The README that opens with the archive.
 *
 * Written because an archive of eight CSVs with no covering note is a puzzle. It says what is
 * inside, what is NOT, and where the documents are — being plain about the limits is the whole
 * point of an export somebody asked for because they are leaving.
 */
export function readme(business: string, when: string, sheets: readonly Sheet[]): string {
  return [
    `${business} — everything SPEC holds`,
    `Exported ${when}`,
    '',
    'This is your data. It is yours whether or not you keep using SPEC, and nothing here needs',
    'SPEC to read it: every file is a CSV and opens in Excel, Numbers or Google Sheets.',
    '',
    'WHAT IS IN HERE',
    '',
    ...sheets.map(s => `  ${s.file.padEnd(26)} ${s.about} (${s.rows.length} row${s.rows.length === 1 ? '' : 's'})`),
    '',
    'ABOUT THE DOCUMENTS',
    '',
    '  documents.csv lists every file uploaded — photos, certificates, signed sign-offs — with a',
    '  link to each one. The files themselves are not inside this archive: a year of job photos is',
    '  larger than an email or a browser download will carry, and an archive that fails halfway is',
    '  worse than one that is honest about where things are. Ask and they will be sent on a drive.',
    '',
    'ABOUT THE IDS',
    '',
    '  The last columns of most sheets are ids. They look like noise and they are the useful part:',
    '  they are what lets a bookkeeper join the timesheets to the people and the jobs. Keep them.',
    '',
  ].join('\n');
}

/** The archive's files, from the sheets. */
export function filesFor(business: string, when: string, sheets: readonly Sheet[]): { name: string; bytes: Uint8Array }[] {
  const enc = new TextEncoder();
  return [
    /*
      The README first, and always present. An archive with no entries at all is one real `unzip`
      refuses to open — "zipfile is empty" — so a brand new business with nothing recorded still
      gets a file that opens and explains itself, rather than a download that looks like a failure.
    */
    { name: 'README.txt', bytes: enc.encode(readme(business, when, sheets)) },
    ...sheets.map(s => ({ name: s.file, bytes: enc.encode(csv(s.header, s.rows)) })),
  ];
}

/**
 * The filename somebody gets.
 *
 * The business's own name and the date, because this lands in a downloads folder beside forty other
 * things and "export.zip" is how a person loses their own data twice.
 */
export function archiveName(business: string, on: string): string {
  const safe = business.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'business';
  return `${safe}-everything-${on}.zip`;
}
