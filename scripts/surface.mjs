/*
  Everything the product exports, listed — so nothing can quietly stop existing.

  ── Kris, 26 September ─────────────────────────────────────────────────────────────────────────

  *"time to start being careful - you're removing things and you need to stop - do not remove
  functions - unless i tell you to - make this a hard rule."*

  A hard rule that lives in a sentence is a rule until the next time somebody is mid-refactor and
  certain that nothing uses this. Every rule in this codebase that actually holds is a check, so
  this is the check.

  ── What it does, and the asymmetry that is the whole point ───────────────────────────────────

  It writes down every exported name in `src/lib` and `src/components`. `tests/surface.test.ts`
  compares that list against the code, and the two directions cost different amounts on purpose:

    ADDING something is free and silent — run `npm run surface -- --write` and carry on.
    REMOVING something fails the build, by name, and the only way past is Kris saying so and a
    dated line in `docs/REMOVED.md`.

  That is the asymmetry Kris asked for: building costs nothing, taking away costs a conversation.

  ── What it deliberately does not do ──────────────────────────────────────────────────────────

  It does not look at whether anything CALLS the export. "Nothing uses it" is exactly the reasoning
  that removes something a customer was relying on through a route nobody grepped for, and it is the
  reasoning this file exists to interrupt.
*/
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/lib', 'src/components'];
export const LEDGER = 'docs/public-surface.txt';

const files = [];
const walk = d => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p) && !/\.d\.ts$/.test(p)) files.push(p);
  }
};

/** Every exported name, as `path :: name`, sorted so a diff is readable. */
export function surface() {
  files.length = 0;
  for (const r of ROOTS) walk(r);
  const out = [];
  for (const f of files.sort()) {
    const src = readFileSync(f, 'utf8')
      /* Comments first — this codebase writes a lot of prose about exports it does not have. */
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const names = new Set();
    for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)) {
      names.add(m[1]);
    }
    /* `export { a, b }` and `export type { C }` — re-exports count as surface too. */
    for (const m of src.matchAll(/^export\s+(?:type\s+)?\{([^}]+)\}/gm)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
    }
    for (const n of [...names].sort()) out.push(`${f} :: ${n}`);
  }
  return out;
}

export const REMOVALS = 'docs/REMOVED.md';

/** The names the ledger currently holds — `[]` if there is no ledger yet. */
export function recorded() {
  try {
    return readFileSync(LEDGER, 'utf8').split('\n')
      .map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

/** A removal only counts as agreed once its exact `path :: name` is written down. */
export function agreedGone() {
  try {
    return readFileSync(REMOVALS, 'utf8');
  } catch {
    return '';
  }
}

/**
 * In the ledger, not in the code, and not written down as agreed.
 *
 * The match is the whole `path :: name`, never the bare name, so prose in the removals log that
 * happens to mention `clearToWork` does not quietly license deleting it.
 */
export function vanished(list = surface(), said = agreedGone()) {
  const now = new Set(list);
  return recorded().filter(n => !now.has(n) && !said.includes(n));
}

if (process.argv[1] && process.argv[1].endsWith('surface.mjs')) {
  const list = surface();
  if (process.argv.includes('--write')) {
    /*
      The lock. Without this, the first thing anybody does when the check fails is re-run
      `--write` until it goes quiet, and the hard rule lasts exactly as long as it is convenient.
      Writing the ledger cannot be the way to lose something from it.
    */
    const gone = vanished(list);
    if (gone.length) {
      console.error(`Refusing to write ${LEDGER}: that would drop ${gone.length} export${gone.length === 1 ? '' : 's'} nobody agreed to remove.\n`);
      for (const n of gone) console.error(`  ${n}`);
      console.error(`\nPut them back, or — if Kris has said to remove them — add a dated line for each to ${REMOVALS} and run this again.`);
      process.exit(1);
    }
    writeFileSync(LEDGER, `${[
      '# Everything the product exports.',
      '#',
      '# Written by scripts/surface.mjs; checked by tests/surface.test.ts.',
      '# Adding is free: run `npm run surface -- --write`.',
      '# REMOVING fails the build — see docs/REMOVED.md.',
      '',
      ...list,
    ].join('\n')}\n`);
    console.log(`Wrote ${list.length} exports to ${LEDGER}.`);
  } else {
    console.log(list.join('\n'));
    console.log(`\n${list.length} exports.`);
  }
}
