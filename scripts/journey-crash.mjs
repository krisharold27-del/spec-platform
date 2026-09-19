import { tidyUp } from './test-cleanup.mjs';

/**
 * A journey that crashes still has to say something a person can read.
 *
 * ── What this cost, on 19 September ──────────────────────────────────────────────────────────────
 *
 * CI lifts every `FAIL ...` line a journey prints into an annotation, so a red run explains itself
 * wherever it is read from — that machinery exists because the logs are served from a host that is
 * not always reachable. A CRASH prints no such line. So the run could say only *"org-journey.mjs
 * failed after 51s (exit 1)"*, the logs needed credentials I did not have, and half an hour went on
 * reproducing a fault the run already knew about and could not tell me.
 *
 * It is this suite's own rule, turned on itself: **a failure nobody can locate is barely better
 * than no failure at all.** An unexpected error now reports itself in the same shape as every other
 * failure, tidies up the business it created, and leaves with the same exit code.
 *
 * Both events are registered because they are genuinely different: a thrown error inside a callback
 * arrives as `uncaughtException`, while a rejected top-level `await` — which is how every one of
 * these scripts is written — arrives as `unhandledRejection`. Catching one and not the other would
 * have left exactly the case that bit.
 *
 * @param browser  a getter, not the browser: it is created after this is installed.
 * @param business the name to clear up, when the journey made one.
 * @param since    the timestamp the run started, for the visitor sweep.
 */
export function reportCrashes({ browser = () => null, business = null, since = null } = {}) {
  const crashed = async error => {
    const text = String(error?.stack ?? error);
    const first = text.split('\n')[0];
    /*
      Playwright's first line names the CALL and not the thing it was waiting for: "page.fill:
      Timeout 30000ms exceeded" is true and useless, because a journey fills half a dozen boxes. The
      selector is further down, in the call log. CI's first report of a crash said exactly that
      first line and left me guessing which box — so the locator comes along with it.
    */
    const waiting = text.split('\n').find(l => /waiting for (locator|element)/i.test(l));
    const said = waiting ? `${first} — ${waiting.trim()}` : first;
    console.log(` FAIL  the journey crashed before it could finish — ${said.slice(0, 300)}`);
    // Both of these are best effort. Failing to tidy up must never hide the thing that went wrong.
    try { await browser()?.close(); } catch { /* it may already be gone */ }
    if (business) {
      try { await tidyUp(business, { lookSince: since }); } catch { /* best effort */ }
    }
    process.exit(1);
  };
  process.on('uncaughtException', crashed);
  process.on('unhandledRejection', crashed);
}
