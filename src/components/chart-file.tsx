'use client';

import { useRef, useState } from 'react';
import { docxXmlToText, linesFromPdf, kindOf, readableChart, UNREADABLE, type PdfPiece } from '@/lib/chart-text';
import { readFromZip } from '@/lib/unzip';

/**
 * Choose a file instead of pasting.
 *
 * The structure of a business almost never lives in somebody's clipboard. It lives in a file a
 * payroll system exported, or — far more often — in the Word document somebody made for the
 * induction pack. Asking a leader to open it, select all, and paste is three steps where the design
 * offered one; small enough to ignore, and exactly the kind of small enough that stops a chart being
 * built at all.
 *
 * The file is read IN THE BROWSER and dropped into the box, which is deliberate and is the whole
 * promise: nothing is uploaded, nothing is stored, and what gets submitted is the same text a paste
 * would have produced — so it goes through the identical import that is already tested, and there is
 * no second path to the org chart that could behave differently. A payroll export is a list of
 * everybody who works somewhere, and it never needs to leave their machine.
 *
 * ── Word and PDF, which this used to refuse ──────────────────────────────────────────────────────
 *
 * The note that stood here said Word and PDF are compressed formats needing a parser, and that a
 * picker which accepts a .docx and then silently produces nothing is worse than one that never
 * offered. Kris, 18 September: *"it doesn't give the option of pdf or word doc. that how they will
 * do it"*.
 *
 * The second half of that note is still the rule and is why this is careful rather than merely
 * accepting. The first half was a reason to do the work. A .docx is a zip holding XML, read here
 * with `DecompressionStream` and no library at all; a PDF is read with pdfjs, loaded only when
 * somebody actually picks one so it costs nothing to everybody else.
 *
 * **And when nothing comes out, it says so.** A scanned chart is a picture of a page: it opens, it
 * has pages, it reads perfectly, and it contains no text. That is the exact failure the old note
 * refused to risk — answered here by naming it rather than by declining the file.
 */
export function ChartFile({ targetId }: { targetId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function textOf(file: File): Promise<string> {
    switch (kindOf(file.name)) {
      case 'text':
        return file.text();

      case 'docx': {
        const doc = await readFromZip(await file.arrayBuffer(), 'word/document.xml');
        if (!doc) throw new Error('That .docx has no document inside it — it may be damaged.');
        return docxXmlToText(new TextDecoder().decode(doc));
      }

      case 'pdf': {
        /*
          Loaded on demand. pdfjs is about a megabyte, and charging that to everybody who opens the
          org chart so that the few who bring a PDF are half a second faster is the wrong trade.
        */
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
        const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        const pieces: PdfPiece[] = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const content = await page.getTextContent();
          for (const item of content.items) {
            if (!('str' in item)) continue;
            /*
              The transform's last two numbers are where this piece sits. Page number is folded into
              y so that page two is read below page one instead of interleaved with it — an org chart
              that runs over a page break is ordinary, and reading the two pages shuffled together is
              not something anybody could untangle afterwards.
            */
            pieces.push({ text: item.str, x: item.transform[4], y: item.transform[5] - n * 100_000 });
          }
        }
        return linesFromPdf(pieces);
      }

      default: {
        const ext = file.name.toLowerCase().split('.').pop() ?? '';
        throw new Error(UNREADABLE[ext] ?? 'SPEC reads CSV, plain text, Word (.docx) and PDF. Save it as one of those and try again.');
      }
    }
  }

  async function take(file: File | undefined) {
    if (!file) return;
    if (file.size > 20_000_000) {
      setNote('That file is bigger than any org chart — check it is the right one.');
      return;
    }

    setBusy(true);
    setNote(`Reading ${file.name}…`);
    try {
      const text = await textOf(file);

      // Nothing usable is a real answer, and it is the person's file that is the reason.
      const verdict = readableChart(text);
      if (!verdict.ok) {
        setNote(`${file.name} — ${verdict.reason}`);
        return;
      }

      const box = document.getElementById(targetId) as HTMLTextAreaElement | null;
      if (!box) return;
      box.value = text;
      // React is not managing this textarea's value, but anything listening for a change should see
      // one — and the box is scrolled to the top so the person can check what arrived before drawing.
      box.dispatchEvent(new Event('input', { bubbles: true }));
      box.scrollTop = 0;

      const lines = text.split('\n').filter(l => l.trim()).length;
      const drawn = kindOf(file.name) === 'pdf'
        // Said every time, not only when it goes wrong. A PDF gives up its names and loses its shape.
        ? ' A PDF keeps the names but not the reporting lines — check the list, then drag the boxes into place.'
        : '';
      setNote(`${file.name} — ${lines} line${lines === 1 ? '' : 's'}. Check it, then draw the chart.${drawn}`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'SPEC could not read that file.');
    } finally {
      setBusy(false);
      // Cleared so choosing the same file twice still counts as a change.
      if (input.current) input.current.value = '';
    }
  }

  return (
    /* No top margin: this is its own card in the design's three-up row now, not a tail on the
       paste box. */
    <div>
      <input
        ref={input}
        type="file"
        accept=".csv,.txt,.tsv,.md,.docx,.pdf,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        onChange={e => take(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        /* The design draws this as the terracotta pill — it is the primary thing to do in its
           card, and it was a quiet secondary button hiding under a textarea. */
        className="btn-primary justify-self-start text-sm disabled:opacity-60"
      >
        {busy ? 'Reading…' : 'Choose a file'}
      </button>
      <p className="mt-2 text-xs text-ink-light">
        {note ?? 'Read here in your browser and put in the box beside this one — nothing is uploaded — so you can check it before anything is drawn.'}
      </p>
    </div>
  );
}
