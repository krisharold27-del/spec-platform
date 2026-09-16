/**
 * The inside of a training module, rendered from plain text.
 *
 * Deliberately not a markdown library. The material is written by SPEC, it uses four shapes, and
 * pulling in a parser to handle a syntax nobody is allowed to use would be a dependency, a bundle
 * and an escaping problem in exchange for nothing.
 *
 *   blank line   a new paragraph
 *   "- "         a point
 *   **bold**     emphasis inside a line
 *   a line on its own ending in nothing else is just a paragraph
 *
 * Text only, and never dangerouslySetInnerHTML: this content arrives from the database, and one day
 * somebody will want a business to write its own.
 */
function inline(text: string, key: number) {
  // Split on **bold** and render the odd segments strong. No HTML is ever constructed.
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <span key={key}>
      {parts.map((part, i) => (i % 2 === 1 ? <b key={i} className="text-ink">{part}</b> : part))}
    </span>
  );
}

export function Material({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);

  return (
    <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-light">
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every(l => l.startsWith('- '))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.slice(2), j)}</li>)}
            </ul>
          );
        }
        return <p key={i}>{lines.map((l, j) => inline(l, j))}</p>;
      })}
    </div>
  );
}
