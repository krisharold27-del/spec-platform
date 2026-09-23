/**
 * CSV out — the staff list, the client list and the contacts, as a file a spreadsheet opens.
 *
 * Pure, no I/O. Export always works (CLAUDE.md: "a lapsed subscription goes read-only; export
 * always works"), so every list the business keeps in SPEC can leave it in one press.
 *
 * Two things a naive join gets wrong:
 *
 *   · A comma, a quote or a line break inside a value — "Smith, Jones & Co" — splits a row. Such a
 *     cell is quoted and its quotes doubled (RFC 4180).
 *   · A cell that starts with `=`, `+`, `-` or `@` is run as a formula by a spreadsheet. Somebody's
 *     client name is not code, so it is prefixed with an apostrophe — except a phone number, which
 *     starts with `+` legitimately and holds nothing a spreadsheet would run.
 */

export type Cell = string | number | null | undefined;

const PHONE = /^[+-]?[\d\s()\-.]+$/;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !PHONE.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A whole file. Lines end CRLF, and it opens with a byte-order mark so a spreadsheet reads the
 * names with accents in them as the names they are.
 */
export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const lines = [header, ...rows].map(r => r.map(csvCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** "staff-2026-09-23.csv" — what the download is called. */
export const csvName = (what: string, day: string): string =>
  `${what.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${day.slice(0, 10)}.csv`;
