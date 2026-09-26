/*
  The archive a business takes with it when it leaves.

  Kris's own question, number 6: *"If I leave, do I get my data back?"* — answered, in the product,
  with "the owner can export everything, any time, in one click". On 26 September that was a
  paragraph of text with no button, no route and no code behind it.

  So this is proved by UNZIPPING WITH THE OPERATING SYSTEM'S OWN `unzip`, not by reading it back
  through the same file that wrote it. A round trip only proves the implementation agrees with
  itself, which a wrong one does too. The person opening this archive will use real software.
*/
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zip, csv, csvRow, crc32 } from '../src/lib/zip';

const unzipInto = (bytes: Uint8Array) => {
  const dir = mkdtempSync(join(tmpdir(), 'spec-zip-'));
  const file = join(dir, 'export.zip');
  writeFileSync(file, bytes);
  execFileSync('unzip', ['-q', 'export.zip'], { cwd: dir });
  return dir;
};

describe('the archive opens in real software', () => {
  it('UNZIPS WITH THE SYSTEM UNZIP, not just with itself', () => {
    const bytes = zip([
      { name: 'jobs.csv', bytes: new TextEncoder().encode('a,b\n1,2\n') },
      { name: 'people.csv', bytes: new TextEncoder().encode('name\nKris\n') },
    ], new Date('2026-09-26T10:00:00Z'));

    const dir = unzipInto(bytes);
    expect(readdirSync(dir).sort()).toEqual(['export.zip', 'jobs.csv', 'people.csv']);
    expect(readFileSync(join(dir, 'jobs.csv'), 'utf8')).toBe('a,b\n1,2\n');
    expect(readFileSync(join(dir, 'people.csv'), 'utf8')).toBe('name\nKris\n');
  });

  it('survives the characters a real business actually has in it', () => {
    /* An apostrophe in a name, an accent, an em dash. UTF-8 is flagged in both headers so the
       filename and the contents both come back as written. */
    const content = "O'Brien — Café Nº1, \"the corner one\"\n";
    const bytes = zip([{ name: 'customers.csv', bytes: new TextEncoder().encode(content) }]);
    const dir = unzipInto(bytes);
    expect(readFileSync(join(dir, 'customers.csv'), 'utf8')).toBe(content);
  });

  it('writes a well-formed archive even with nothing in it', () => {
    /*
      Checked by structure rather than by shelling out, because real `unzip` EXITS NON-ZERO on an
      archive with no entries — "zipfile is empty" — which is correct of it and tells us something
      useful: an empty archive is a bad thing to hand somebody. So the export never makes one; it
      always carries a README saying what is inside. See `everything()` in lib/export-everything.

      What has to hold here is only that the end-of-central-directory record is right, which is what
      makes the file openable at all.
    */
    const bytes = zip([]);
    expect(bytes.length).toBe(22);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x06054b50);
    expect(view.getUint16(10, true)).toBe(0);
  });

  it('is deterministic, so two exports of the same data match', () => {
    const at = new Date('2026-09-26T10:00:00Z');
    const one = zip([{ name: 'a.csv', bytes: new TextEncoder().encode('x\n') }], at);
    const two = zip([{ name: 'a.csv', bytes: new TextEncoder().encode('x\n') }], at);
    expect(Buffer.from(one).equals(Buffer.from(two))).toBe(true);
  });

  it('checksums against a known value', () => {
    /* CRC-32 of "123456789" is 0xCBF43926 — the standard check value. A checksum that is merely
       self-consistent would pass every round trip and fail in Excel. */
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('the spreadsheets open in Excel', () => {
  it('ESCAPES THE THINGS THAT BREAK A CSV', () => {
    /* A job title with a comma, an address with a line break, a note with a quote. All three are
       ordinary, and all three break a CSV made by joining with commas. */
    expect(csvRow(['Smith, John', 'a\nb', 'he said "no"'])).toBe('"Smith, John","a\nb","he said ""no"""');
  });

  it('leaves ordinary values alone', () => {
    expect(csvRow(['Kris', 42, null, undefined])).toBe('Kris,42,,');
  });

  it('starts with a BOM so Excel reads it as UTF-8', () => {
    /* Without it, an accented name opens as mojibake and the owner's first impression of their own
       data is that it arrived corrupted. */
    expect(csv(['name'], [['Café']])).toMatch(/^﻿/);
  });

  it('uses CRLF, which is what a spreadsheet expects', () => {
    expect(csv(['a', 'b'], [[1, 2]])).toBe('﻿a,b\r\n1,2\r\n');
  });
});
