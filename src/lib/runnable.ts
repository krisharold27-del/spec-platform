/**
 * A mirror that RUNS — a calculator, a sizing tool, an interactive checklist.
 *
 * ── Kris, 26 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"mirrors must be as powerful as artifacts."* Asked three times, and this is the last real
 * difference. A mirror could be a document; an artifact can be a thing you use. A cable-size
 * calculator, a margin checker, a "how many hours will this take" estimator — the crew does not
 * want to read a table, it wants to type two numbers and be told.
 *
 * ── Why this is the dangerous one ────────────────────────────────────────────────────────────────
 *
 * Everything else about a mirror is text. This is code, written by a model or pasted by whoever is
 * editing, and then run in the browser of everybody else in the business — including the owner,
 * signed in, with a session cookie for a page that shows every wage in the company.
 *
 * Dropped straight into the page, that is not a feature, it is a way in. So it never touches the
 * page. Three walls, and each one alone is not enough:
 *
 *   **A sandboxed iframe with `allow-scripts` and NOTHING ELSE.** No `allow-same-origin`, which is
 *   the one that matters: without it the frame gets an opaque origin of its own. It cannot read a
 *   cookie, cannot reach `localStorage`, cannot see the parent document, cannot name SPEC as an
 *   origin at all. `allow-same-origin` beside `allow-scripts` would undo the whole sandbox, which
 *   is exactly why it is the mistake every such feature makes once.
 *
 *   **`srcdoc`, never a URL.** Nothing is served from SPEC's own origin, so there is no address a
 *   person could open the code at directly, outside the frame, with their session attached.
 *
 *   **A content security policy of `default-src 'none'`.** The opaque origin already stops it
 *   reading SPEC. This stops it TALKING — no fetch, no image beacon, no font, no script from
 *   anywhere. A calculator has no business making a network request, and the difference between
 *   "cannot read the business's data" and "cannot send anything anywhere" is the difference between
 *   a sandbox and a sandbox worth having.
 *
 * ── What it can still do ─────────────────────────────────────────────────────────────────────────
 *
 * Everything a tool actually needs: lay itself out, take numbers, do arithmetic, show a result,
 * change colour. All the things a crew wants and none of the things a crew would ever ask for.
 */

/** The most a runnable mirror may be. Generous for a tool, far too small to hide a library in. */
export const MOST_BYTES = 60_000;

export const RUNNABLE_LABEL = 'This one runs';

/** Said under the frame, so nobody wonders why it cannot load their company logo. */
export const SEALED_OFF =
  'Runs in a sealed frame: it can do sums and show you the answer, and it cannot reach your data, the internet, or anything else in SPEC.';

/**
 * The policy the frame is given.
 *
 * `default-src 'none'` closes everything; the two `unsafe-inline`s open exactly what an inline
 * tool needs and nothing that loads from elsewhere. `unsafe-inline` reads alarmingly and is the
 * correct choice here: the whole document IS the untrusted thing, so there is nothing to protect
 * it from itself — the walls are the opaque origin and the closed network, not a nonce.
 */
export const POLICY = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;";

/** Exactly the permissions the frame gets. Anything not here is denied by the browser. */
export const SANDBOX = 'allow-scripts';

export type RunnableProblem = 'empty' | 'too_big' | 'reaches_out';

/**
 * Why a runnable mirror was refused, in words for the person who wrote it.
 *
 * Refused rather than quietly stripped. Silently deleting half of somebody's tool and running the
 * rest is how a calculator ends up giving a wrong answer with no sign anything happened.
 */
export const WHY_REFUSED: Record<RunnableProblem, string> = {
  empty: 'There is nothing to run.',
  too_big: `A runnable mirror has to be under ${Math.round(MOST_BYTES / 1000)}KB. This one is bigger than a tool needs to be.`,
  reaches_out:
    'This tries to load something from the internet — a script, a stylesheet or an image from another site. A runnable mirror is sealed off and cannot, so it would silently do nothing. Write what it needs into the page itself.',
};

/**
 * Does it try to pull anything in from outside?
 *
 * The policy already blocks it, and this is checked anyway — because blocked-at-runtime means a
 * tool that half-works with no explanation, and somebody trusting a number that never arrived.
 * Told at the point of writing, it is a sentence; discovered later, it is a wrong quote.
 */
export function reachesOut(html: string): boolean {
  return /(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html)
    || /@import\s+(?:url\()?["']?\s*(?:https?:)?\/\//i.test(html);
}

export function checkRunnable(html: string): RunnableProblem | null {
  const trimmed = html.trim();
  if (!trimmed) return 'empty';
  if (new TextEncoder().encode(trimmed).length > MOST_BYTES) return 'too_big';
  if (reachesOut(trimmed)) return 'reaches_out';
  return null;
}

/**
 * Wrap what somebody wrote into the document the frame is handed.
 *
 * The policy goes in as the FIRST thing in `<head>`, before any of the author's markup: a meta CSP
 * only governs what comes after it, so a policy written below the author's first `<script>` would
 * be a policy that arrived too late to matter.
 */
export function framed(html: string): string {
  return [
    '<!doctype html>',
    '<html lang="en-AU"><head>',
    `<meta http-equiv="content-security-policy" content="${POLICY}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    /* The page's own family and colours, so a tool does not arrive looking like a 1997 form. */
    '<style>',
    ':root{color-scheme:light}',
    'body{margin:0;padding:16px;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#2b2724;background:#fdfbf7}',
    'input,select,button{font:inherit;padding:8px;border:1px solid rgba(43,39,36,.25);border-radius:8px;background:#fff}',
    'button{background:#c67139;color:#fff;border:0;cursor:pointer}',
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid rgba(43,39,36,.15);padding:8px;text-align:left}',
    '</style>',
    '</head><body>',
    html,
    '</body></html>',
  ].join('\n');
}
