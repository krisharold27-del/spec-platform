/** Renders the board output's markdown (either the deterministic template or Claude's rewrite of
 * it — both are generated server-side from our own prompt, never from arbitrary user input) to HTML. */
import { marked } from 'marked';

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/**
 * The same, for text a PERSON may have written or changed.
 *
 * ── Why the one above is not enough ──────────────────────────────────────────────────────────────
 *
 * `renderMarkdown` says so in its own first line: it is for the board output, which this codebase
 * generates server-side from its own prompt and nobody edits. `marked` passes raw HTML straight
 * through — that is markdown working as designed — so putting anything a person can type through it
 * and into `dangerouslySetInnerHTML` is a script tag away from reading somebody else's business.
 *
 * A mirror body is exactly that text. Kris, 26 September: *"mirrors must be as powerful as
 * artifacts."* Powerful means a rate card, a one-pager, a procedure with headings and a table —
 * and it means several people editing it and the whole business reading it. The moment a crew can
 * change a document that a supervisor opens, the document is untrusted input.
 *
 * ── Escape first, then parse ─────────────────────────────────────────────────────────────────────
 *
 * The angle brackets are turned into text BEFORE `marked` sees them, so raw HTML cannot survive as
 * HTML — `<script>` renders as the visible characters `<script>`, which is what somebody typing it
 * into a procedure almost certainly meant anyway. Everything markdown is for still works: headings,
 * tables, lists, bold, links, code.
 *
 * Escaping rather than stripping, deliberately. A sanitiser that deletes what it does not like
 * quietly changes a document somebody is relying on — and on a procedure, silently losing a line is
 * the failure that matters. This one loses nothing; it only ever shows you the characters.
 */
export function renderSafeMarkdown(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return marked.parse(escaped, { async: false }) as string;
}
