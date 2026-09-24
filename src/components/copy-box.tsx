'use client';
import { useState } from 'react';

/**
 * A piece of text with a button that puts it on the clipboard.
 *
 * ── Why this is a button and not a paragraph ─────────────────────────────────────────────────────
 *
 * Built for one job: an HR admin working down thirty-eight people, sending each of them their setup
 * link. Selecting a URL by dragging across it is where that goes wrong — a link short by one
 * character is a link that 404s, and the person on the other end of it simply never finishes. So
 * the whole message is copied at once, or not at all.
 *
 * The textarea stays visible and selectable underneath. The clipboard API needs a secure context
 * and the viewer's permission, and either can be refused; when it is, somebody can still select the
 * text the ordinary way. A copy button that silently does nothing is worse than no copy button.
 */
export function CopyBox({ value, label, rows = 2 }: { value: string; label: string; rows?: number }) {
  const [said, setSaid] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setSaid('copied');
    } catch {
      /* Refused, or no secure context. Say so rather than looking like it worked. */
      setSaid('failed');
    }
    setTimeout(() => setSaid('idle'), 2500);
  };

  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.1em] text-ink-light">{label}</span>
        <button type="button" onClick={copy} className="shrink-0 text-[12px] text-rust-700 hover:underline">
          {said === 'copied' ? 'Copied' : said === 'failed' ? 'Select it and copy' : 'Copy'}
        </button>
      </div>
      <textarea
        readOnly
        rows={rows}
        value={value}
        onFocus={e => e.currentTarget.select()}
        className="w-full resize-none rounded-[12px] border border-ink/15 bg-cream px-3 py-2 font-mono text-[11.5px] leading-[17px] text-ink"
      />
    </div>
  );
}
