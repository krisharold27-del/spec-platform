/**
 * Getting the words out of the file a business actually keeps its org chart in.
 *
 * Kris, 18 September: *"when i am trying to import my org chart - it doesn't give the option of pdf
 * or word doc. that how they will do it"*.
 *
 * He is right, and the note in `chart-file.tsx` explaining why they were left out has not aged well.
 * It said Word and PDF are compressed formats needing a parser, and that a picker which accepts a
 * .docx and then silently produces nothing is worse than one that never offered. The second half is
 * still true and is the rule this file is built to. The first half was a reason to do the work, not
 * a reason to skip it: nobody keeps their org chart as a CSV. They keep it as the document somebody
 * made for the induction pack.
 *
 * Everything here is pure — a string or an array in, a string out — so the awkward part, which is
 * *"what counts as a line"*, is a function with tests rather than a guess buried in a component.
 * The unzipping and the PDF reading are in the browser; see `chart-file.tsx`.
 */

/** XML entities, and only the five that exist. Anything else is left alone rather than mangled. */
const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/**
 * A Word document's `word/document.xml`, reduced to the text a person sees.
 *
 * Word keeps one paragraph per `<w:p>` and splits a single sentence across any number of `<w:r>`
 * runs — a spellcheck or a changed font is enough to break "Operations Manager" into three. So runs
 * are joined with nothing between them and paragraphs become newlines.
 *
 * Tabs become commas, which is the one piece of real interpretation here. An org chart written in
 * Word is almost always a table or a tabbed list — `Role → Person → Reports to` — and the importer
 * already reads commas. A table cell boundary (`</w:tc>`) is the same thing, so it is treated the
 * same way.
 */
export function docxXmlToText(xml: string): string {
  const withBreaks = xml
    // A tab is a column.
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    /*
      A table cell holds a paragraph, so the markup always reads `</w:p></w:tc>` — a row ending
      inside a column ending. Matched together and BEFORE the general paragraph rule below, because
      taken separately the paragraph wins and every cell becomes its own line: a three-column table
      of Role / Person / Reports to arrives as three roles reporting to nobody.

      Order is the whole fix. The first attempt collapsed newlines next to tabs afterwards instead,
      which also swallowed the row break after a row whose last cell was empty — and an empty
      "reports to" is exactly what the top of every org chart has.
    */
    .replace(/<\/w:p>\s*<\/w:tc>/g, '\t')
    .replace(/<\/w:tc>/g, '\t')
    // A line break, a row and a paragraph are all rows.
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:p>/g, '\n');

  return tidyLines(
    unescapeXml(withBreaks.replace(/<[^>]*>/g, ''))
      // Only now, once the tags are gone: a tab is a column separator the importer understands.
      .replace(/[ \t]*\t[ \t]*/g, ', '),
  );
}

/** One piece of text off a PDF page, with where it sits. `y` grows UP the page, as PDF measures it. */
export interface PdfPiece {
  text: string;
  x: number;
  y: number;
}

/**
 * Pieces of a PDF page, back into lines.
 *
 * A PDF has no lines. It has glyphs at coordinates, and an org chart is the worst case of it: every
 * box is drawn independently, so "Operations Manager" and "J. Barnes" arrive as unrelated pieces
 * that happen to sit near each other. Reading them in the order the file stores them produces
 * nonsense.
 *
 * So pieces are grouped by how far up the page they sit and then read left to right, which is how a
 * person reads the same page. `tolerance` is in PDF points — roughly the height of a line of 12pt
 * text — because two pieces on "the same line" are never on exactly the same y.
 *
 * What this deliberately does NOT try to do is infer the reporting lines from the boxes' positions.
 * A chart drawn as a diagram gives up its names and loses its shape, and the honest thing is to put
 * the names in the box and let a person draw the links — which is what the org chart is for. Saying
 * that out loud is the difference between an import that half-works and one that is understood.
 */
export function linesFromPdf(pieces: PdfPiece[], tolerance = 3): string {
  const rows: { y: number; items: PdfPiece[] }[] = [];
  for (const piece of pieces) {
    if (!piece.text.trim()) continue;
    const row = rows.find(r => Math.abs(r.y - piece.y) <= tolerance);
    if (row) row.items.push(piece);
    else rows.push({ y: piece.y, items: [piece] });
  }
  return tidyLines(
    rows
      .sort((a, b) => b.y - a.y)                     // down the page: PDF y grows upwards
      .map(r => r.items.sort((a, b) => a.x - b.x).map(i => i.text).join(' '))
      .join('\n'),
  );
}

/** Collapse runs of spaces, drop empty lines, trim each one. Shared by both readers. */
export function tidyLines(text: string): string {
  return text
    .split('\n')
    .map(l => l.replace(/[ \t]+/g, ' ').replace(/\s*,\s*/g, ', ').replace(/(,\s*)+$/, '').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Is there anything here worth putting in the box?
 *
 * The case this exists for is a scanned org chart: a photograph of a page, saved as a PDF. It opens,
 * it has pages, it reads perfectly — and it contains no text at all, because the text is a picture
 * of text. Everything works and nothing arrives.
 *
 * That is precisely the failure the old code refused to risk, and the answer is not to refuse the
 * file. It is to say what happened, so the person knows it is the file and not them.
 */
export function readableChart(text: string): { ok: boolean; reason: string | null } {
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) {
    return {
      ok: false,
      reason: 'There is no text in that file — it is most likely a scan or a picture of a chart. '
        + 'Type the roles into the box, or save it again as text.',
    };
  }
  if (!/[A-Za-z]{2}/.test(text)) {
    return { ok: false, reason: 'Nothing in that file reads as words. Check it is the right one.' };
  }
  return { ok: true, reason: null };
}

/** The extensions the picker takes, and what each one needs doing to it. */
export type ChartFileKind = 'text' | 'docx' | 'pdf' | 'unsupported';

export function kindOf(filename: string): ChartFileKind {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (['csv', 'txt', 'tsv', 'md'].includes(ext)) return 'text';
  if (ext === 'docx') return 'docx';
  if (ext === 'pdf') return 'pdf';
  return 'unsupported';
}

/**
 * The older Word format, and why it is refused by name.
 *
 * `.doc` is not a zip and not XML — it is a 1990s compound-document format, and nothing short of a
 * real parser reads it. Left in `kindOf` as `unsupported` it would produce "SPEC cannot read that",
 * which tells somebody with a perfectly ordinary Word file that our software is broken. Named here,
 * it produces the one sentence that actually gets them moving.
 */
export const UNREADABLE: Record<string, string> = {
  doc: 'That is the older Word format. Open it in Word and use Save As → .docx, then try again.',
  xls: 'That is the older Excel format. Open it and use Save As → CSV, then try again.',
  xlsx: 'Excel keeps a spreadsheet, not a document. Use File → Save As → CSV and choose that file.',
  pages: 'Pages can export a Word file: File → Export To → Word. Choose that one.',
  numbers: 'Numbers can export a CSV: File → Export To → CSV. Choose that one.',
};
