/**
 * A zip file, written by hand.
 *
 * ── Why not a library ────────────────────────────────────────────────────────────────────────────
 *
 * This is the only thing in SPEC that needs to make an archive, and it needs the simplest possible
 * one: a handful of CSV files, stored rather than compressed. The zip format for STORED entries is
 * about eighty lines and has not changed since 1989. A dependency here would be a supply chain and
 * a version to keep up with, sitting on the path of the one feature a business uses on the day it
 * has decided to leave — which is the worst possible day for an upgrade to have broken something.
 *
 * Stored rather than deflated on purpose. CSV compresses well and a spreadsheet of a year's jobs is
 * still small; what matters far more is that the file opens, in Excel, on a laptop, first time,
 * with no explaining. Compression is where a hand-written archive would go wrong.
 *
 * ── How it is proved ─────────────────────────────────────────────────────────────────────────────
 *
 * `tests/zip.test.ts` writes an archive and then unzips it with the operating system's own `unzip`.
 * Not a round trip through this same file — that would only prove it is self-consistent, which is
 * exactly what a wrong implementation also is.
 */

/** CRC-32, the checksum every zip entry carries. Table built once. */
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** The path inside the archive. Forward slashes, no leading slash. */
  name: string;
  bytes: Uint8Array;
}

const dosTime = (d: Date) =>
  ((d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2))) & 0xffff;

const dosDate = (d: Date) =>
  (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

/**
 * Build the archive.
 *
 * `at` is taken rather than read so the output is deterministic — an archive that differs only by
 * its timestamps cannot be compared in a test, and a test that cannot compare is a test that only
 * checks the code ran.
 */
export function zip(entries: readonly ZipEntry[], at = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const time = dosTime(at);
  const date = dosDate(at);

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const sum = crc32(e.bytes);
    const size = e.bytes.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);   // local file header
    local.setUint16(4, 20, true);            // version needed
    local.setUint16(6, 0x0800, true);        // UTF-8 names, so an apostrophe survives
    local.setUint16(8, 0, true);             // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, sum, true);
    local.setUint32(18, size, true);         // compressed === uncompressed, stored
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);            // no extra field
    locals.push(new Uint8Array(local.buffer), name, e.bytes);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);  // central directory header
    central.setUint16(4, 20, true);          // version made by
    central.setUint16(6, 20, true);          // version needed
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, sum, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);     // where its local header starts
    centrals.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + size;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);        // end of central directory
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at2 = 0;
  for (const p of parts) { out.set(p, at2); at2 += p.length; }
  return out;
}

/**
 * One row of a CSV, escaped.
 *
 * A job title with a comma in it, an address with a line break, a note with a quote in it — all
 * three are ordinary and all three break a CSV written by joining with commas. Excel is the target
 * and Excel is unforgiving.
 */
export function csvRow(values: readonly (string | number | null | undefined)[]): string {
  return values
    .map(v => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(',');
}

/** A whole sheet: a header row and the rows under it, ready to be a file in the archive. */
export function csv(header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  /*
    A BOM, so Excel on Windows reads it as UTF-8.

    Without it, a name with an accent in it — or the dollar sign in a currency column on some
    locales — opens as mojibake, and the person's first impression of their own exported data is
    that it is corrupted.
  */
  return `﻿${[csvRow(header), ...rows.map(csvRow)].join('\r\n')}\r\n`;
}
