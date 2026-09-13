// Freeze the design-alignment answer into the build, so the cockpit can show it.
//
//   node scripts/design-status.mjs
//
// The two design checks read the `designs/` folder and the whole of `src/`. Neither of those is
// something a running page can do on Vercel — the source is not shipped and the design folder is
// not traced as a dependency — so the answer is worked out HERE, at build time, and written to a
// small JSON the cockpit imports.
//
// That makes it a snapshot rather than a live reading, which is the honest thing and is said on the
// page: it is the answer AS OF THIS BUILD. Since every deploy runs a build, "as of this build" and
// "now" are the same thing unless somebody changed a design without deploying — which is exactly
// the state worth being able to see.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = new URL('../src/generated/design-status.json', import.meta.url).pathname;

/** Run a check and hand back its output, or null when it could not run at all. */
function output(script) {
  try {
    return execFileSync('node', [new URL(`./${script}`, import.meta.url).pathname], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // Both scripts exit non-zero when they find gaps, which is a RESULT rather than a failure.
    return String(error.stdout ?? '') || null;
  }
}

const coverage = output('design-coverage.mjs');
const set = output('design-check.mjs');

/*
  Parsed from the scripts' own output rather than by importing their internals.

  Deliberate: these two are also run by hand and by CI, and what the cockpit shows has to be the
  same answer a person sees in a terminal. Reading the printed line is the only way to guarantee
  that — a second code path computing "the same" number is how two screens start disagreeing.
*/
const phrases = coverage?.match(/(\d+) of (\d+) design phrases appear in the product \((\d+)%\)/);
const missingScreens = set?.match(/INCOMPLETE — (\d+) screen\(s\) missing/);
const screenCount = set?.match(/Design set — (\d+) screens/);

// Which screens are short of something, so the page can name them rather than just counting.
const gaps = [...(coverage ?? '').matchAll(/^(SPEC [^\n]+?)\s{2,}\d+ phrases[^\n]*?(\d+) not found$/gm)]
  .map(m => ({ screen: m[1].trim(), missing: Number(m[2]) }));

const status = {
  /** When this was worked out — the build, not the page load. */
  at: new Date().toISOString(),
  /** Could the checks run at all? Null everywhere else means "not measured", never "fine". */
  ran: Boolean(coverage),
  phrases: phrases ? { found: Number(phrases[1]), total: Number(phrases[2]), pct: Number(phrases[3]) } : null,
  screens: screenCount ? Number(screenCount[1]) : null,
  missingScreens: missingScreens ? Number(missingScreens[1]) : 0,
  gaps,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(status, null, 2)}\n`);

console.log(
  status.ran
    ? `[design-status] ${status.phrases?.found}/${status.phrases?.total} phrases, ${status.screens} screens, ${status.missingScreens} missing`
    : '[design-status] the design checks could not run; the cockpit will say so rather than guess',
);
