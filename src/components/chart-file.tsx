'use client';

import { useRef, useState } from 'react';

/**
 * Choose a file instead of pasting.
 *
 * The structure of a business almost never lives in somebody's clipboard. It lives in a file a
 * payroll system exported, and asking a leader to open it, select all, and paste is three steps
 * where the design offered one — small enough to ignore, and exactly the kind of small enough that
 * stops a chart being built at all.
 *
 * The file is read IN THE BROWSER and dropped into the box, which is deliberate: nothing is
 * uploaded, nothing is stored, and what gets submitted is the same text a paste would have
 * produced — so it goes through the identical import that is already tested, and there is no second
 * path to the org chart that could behave differently.
 *
 * CSV and plain text only, and it says so. The design offered Word and Excel too; those are
 * compressed formats that need a parser, and a file picker that accepts a .docx and then silently
 * produces nothing is worse than one that never offered.
 */
export function ChartFile({ targetId }: { targetId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);

  async function take(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setNote('That file is bigger than any org chart — check it is the right one.');
      return;
    }
    const text = await file.text();
    const box = document.getElementById(targetId) as HTMLTextAreaElement | null;
    if (!box) return;
    box.value = text;
    // React is not managing this textarea's value, but anything listening for a change should see
    // one — and the box is scrolled to the top so the person can check what arrived before drawing.
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.scrollTop = 0;
    const lines = text.split('\n').filter(l => l.trim()).length;
    setNote(`${file.name} — ${lines} line${lines === 1 ? '' : 's'}. Check it, then draw the chart.`);
  }

  return (
    <div className="mt-3">
      <input
        ref={input}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="sr-only"
        onChange={e => take(e.target.files?.[0])}
      />
      <button type="button" onClick={() => input.current?.click()} className="btn-secondary text-sm">
        Choose a file
      </button>
      <p className="mt-2 text-xs text-ink-light">
        {note ?? 'CSV or plain text. It is read here in your browser and put in the box above, so you can check it before anything is drawn.'}
      </p>
    </div>
  );
}
