import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readTitle, signifier, atRest, tabName, NAME_WORDS, SIGNIFIER, AT_REST } from '../src/lib/mirror-rules';
import { BOARD_TYPES } from '../src/lib/boards-live';

/**
 * ── A mirror is made to the same rules as an artifact ────────────────────────────────────────────
 *
 * Kris, 19 September, after the mirror surface was rebuilt as one framed object and he still said
 * *"still doesn't look and feel like an artifact"*: **"exactly same as an artifact - bring the same
 * rules claude has for generating an artiifact"**.
 *
 * Those rules are not a matter of taste and they are not invented here. They are the ones Claude is
 * held to every time it makes an artifact:
 *
 *   1. the title is a NAME, two to four words, never a name with an explainer after a dash;
 *   2. the description is one line and it is SEPARATE from the name;
 *   3. the kind is one short generic word, never a product or a brand;
 *   4. everything is visible at rest — it never opens as an empty shell;
 *   5. real content, never placeholder.
 *
 * This file is those five rules, held against the code rather than described in a comment.
 */

describe('rule one: the title is a name', () => {
  /*
    The shape everybody types, including me. Both of SPEC's own worked examples were written this
    way, which is the whole reason this splits instead of refusing: the person has not made a
    mistake, they have put two good fields in one box, and SPEC can tell which is which.
  */
  it('TAKES THE EXPLAINER OUT OF THE TITLE AND PUTS IT UNDERNEATH', () => {
    const read = readTitle('King of the Mountain — Solar Fix Plan', '');
    expect(read.name).toBe('King of the Mountain');
    expect(read.description).toBe('Solar Fix Plan.');
    expect(read.moved).toBe(true);
    expect(read.fault).toBeNull();
  });

  it('and does it for the other ways people write the same sentence', () => {
    expect(readTitle('Rate Board: labour sell rate', '').name).toBe('Rate Board');
    expect(readTitle('Rate Board - labour sell rate', '').name).toBe('Rate Board');
    expect(readTitle('Rate Board | labour sell rate', '').name).toBe('Rate Board');
    // No spaces around an em dash is the same sentence, and people type it both ways.
    expect(readTitle('Rate Board—labour sell rate', '').name).toBe('Rate Board');
  });

  /*
    The other half of a separator rule, and the half that is easy to get wrong. A hyphen inside a
    word and a colon inside a time are not somebody starting to explain themselves — cutting a name
    at either would be SPEC inventing a fault and then acting on it.
  */
  it('BUT NEVER SPLITS A HYPHENATED WORD OR A TIME', () => {
    expect(readTitle('Follow-up plan', 'x').name).toBe('Follow-up plan');
    expect(readTitle('9:30 stand-up', 'x').name).toBe('9:30 stand-up');
  });

  it('keeps what somebody wrote in the description box, rather than the title’s tail', () => {
    const read = readTitle('Rate Board — labour sell rate', 'Why we moved from $115 to $105.');
    expect(read.name).toBe('Rate Board');
    expect(read.description).toBe('Why we moved from $115 to $105.');
    expect(read.moved).toBe(false);
  });

  it(`refuses a name longer than ${NAME_WORDS} words, and says so in words`, () => {
    const read = readTitle('Solar install rework rate by crew', 'The rework we keep paying for.');
    expect(read.fault?.field).toBe('name');
    expect(read.fault?.said).toContain('6 words');
    expect(read.fault?.said).toContain('split it with a dash');
  });

  /*
    The difference between a rule and a truncation. SPEC could cut this to four words and create the
    mirror — and the person would find a name they never wrote on a screen their team argues in
    front of. It hands it back instead.
  */
  it('AND DOES NOT QUIETLY CUT IT TO FIT', () => {
    const read = readTitle('Solar install rework rate by crew', 'x');
    expect(read.name).toBe('Solar install rework rate by crew');
  });

  it('and a mirror with no name at all is not created', () => {
    expect(readTitle('   ', 'a line').fault?.field).toBe('name');
  });
});

describe('rule two: the description is one line, separate, and not optional', () => {
  it('IS REQUIRED, BECAUSE NOTHING IN SPEC CAN EDIT IT AFTERWARDS', () => {
    const read = readTitle('Rate Board', '');
    expect(read.fault?.field).toBe('description');
    expect(read.fault?.said).toContain('what the card shows');
  });

  it('finishes the line somebody wrote, and leaves one that is already finished alone', () => {
    expect(readTitle('Rate Board — labour sell rate', '').description).toBe('Labour sell rate.');
    expect(readTitle('Rate Board — labour sell rate.', '').description).toBe('Labour sell rate.');
    expect(readTitle('Rate Board — is it $105?', '').description).toBe('Is it $105?');
    /*
      A capital only where one is missing. "iPhone rollout" corrected to "IPhone rollout" would be
      SPEC putting a word nobody wrote under somebody's name — the same fault as inventing the line,
      one letter smaller.
    */
    expect(readTitle('Fleet — iPhone rollout', '').description).toBe('iPhone rollout.');
  });

  /*
    Rule five, in the one place it would be tempting to break. SPEC has a sentence about what each
    KIND of mirror is for and it would read perfectly well under somebody's name — which is exactly
    what makes it wrong. A description nobody wrote, sitting where their words go, is furniture
    everyone is afraid to delete.
  */
  it('AND SPEC NEVER WRITES THE LINE ON SOMEBODY’S BEHALF', () => {
    const read = readTitle('Rate Board', '');
    expect(read.description).toBe('');
    for (const said of Object.values(AT_REST)) {
      expect(read.description).not.toBe(said);
    }
  });

  it('and the open mirror shows it, not only the card in the grid', () => {
    const page = readFileSync('src/app/mirrors/page.tsx', 'utf8');
    expect(page).toContain('data-mirror-description');
  });
});

describe('rule three: the kind is one generic word', () => {
  it('HAS ONE FOR EVERY KIND OF MIRROR', () => {
    for (const type of BOARD_TYPES) {
      expect(SIGNIFIER[type.id], `no signifier for ${type.id}`).toBeTruthy();
    }
  });

  it('and every one of them is a single plain word', () => {
    for (const word of Object.values(SIGNIFIER)) {
      expect(word, `"${word}" is not one word`).toMatch(/^[A-Z][a-z]+$/);
    }
  });

  /*
    The reason an artifact's icon is a generic word: a mirror built on Xero data is a Scorecard, not
    a "Xero board". Naming the vendor in the label somebody reads first quietly makes the mirror
    about the system rather than about the number, and it goes stale the day the business moves.
  */
  it('AND NEVER A VENDOR', () => {
    for (const word of Object.values(SIGNIFIER)) {
      expect(word).not.toMatch(/xero|simpro|hubspot|microsoft|myob|spec/i);
    }
  });

  it('falls back rather than drawing a blank label for a kind it has not met', () => {
    expect(signifier('nonsense' as never)).toBe('Mirror');
  });
});

describe('rule four: everything visible at rest', () => {
  it('HAS SOMETHING TRUE TO SAY FOR EVERY KIND WITH NOTHING ON IT', () => {
    for (const type of BOARD_TYPES) {
      const said = atRest(type.id);
      expect(said.length, `${type.id} says almost nothing at rest`).toBeGreaterThan(80);
    }
  });

  /*
    The fault this rule was written for. The empty state said "Add one below" — and when the person
    had no measures of their own, there was nothing below. A screen that points at a control which
    is not there is worse than one that says nothing, because somebody goes hunting for it.
  */
  it('AND NEVER POINTS AT A CONTROL THAT MAY NOT BE THERE', () => {
    for (const said of Object.values(AT_REST)) {
      expect(said, `"${said}" points below`).not.toMatch(/\badd one below\b/i);
    }
    const page = readFileSync('src/app/mirrors/page.tsx', 'utf8');
    // And the case where there is genuinely nothing to add says where measures come from instead.
    expect(page).toContain('addable.length === 0');
    expect(page).toContain('/scorecard');
  });

  it('and a plan always draws its plan, even before the first step', () => {
    const page = readFileSync('src/app/mirrors/page.tsx', 'utf8');
    expect(page).toContain("board.kind === 'plans'");
  });
});

describe('the rules are applied where mirrors are actually made', () => {
  /*
    A rule enforced in one of the two places a mirror can come from is how the other place becomes
    the way round it. Mirrors are created by `newBoard` and by the worked examples a visitor sees —
    and the examples are where somebody's first idea of what a mirror is CALLED comes from. Both.
  */
  it('ON THE WRITE, NOT ONLY IN THE FORM', () => {
    const actions = readFileSync('src/app/mirrors/actions.ts', 'utf8');
    expect(actions).toContain('readTitle(');
    const body = actions.slice(actions.indexOf('export async function newBoard'));
    expect(body).toContain('title: read.name');
    expect(body).toContain('summary: read.description');
  });

  it('AND THE WORKED EXAMPLES OBEY THE RULE THEY TEACH', () => {
    const examples = readFileSync('src/lib/boards-examples.ts', 'utf8');
    const titles = [...examples.matchAll(/^\s*title: '(.+?)',$/gm)].map(m => m[1]);
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      const read = readTitle(title, 'a line');
      expect(read.fault, `example "${title}" breaks the name rule`).toBeNull();
      expect(read.moved, `example "${title}" has an explainer in its title`).toBe(false);
    }
  });

  it('and their descriptions are lines, not repeats of the name', () => {
    const examples = readFileSync('src/lib/boards-examples.ts', 'utf8');
    const summaries = [...examples.matchAll(/^\s*summary: '(.+?)',$/gm)].map(m => m[1]);
    expect(summaries.length).toBeGreaterThan(0);
    for (const summary of summaries) {
      expect(summary.length).toBeGreaterThan(20);
      expect(summary.trimEnd()).toMatch(/[.!?]$/);
    }
  });

  it('and their words come back with them when SPEC refuses', () => {
    const actions = readFileSync('src/app/mirrors/actions.ts', 'utf8');
    const body = actions.slice(actions.indexOf('export async function newBoard'));
    for (const kept of ['title:', 'summary:', 'kind:']) {
      expect(body.slice(0, 2000), `a refusal drops ${kept}`).toContain(kept);
    }
    const page = readFileSync('src/app/mirrors/page.tsx', 'utf8');
    expect(page).toContain('defaultValue={sp.title');
    expect(page).toContain('defaultValue={sp.summary');
  });
});

describe('the name is what the tab carries', () => {
  /*
    `?full=1` puts a mirror on the wall with SPEC's furniture gone, and in that state the tab is the
    only thing left holding its name — which is what the four-word limit is FOR. "King of the
    Mountain" fits in a tab strip; "King of the Mountain — Solar Fix Plan" is a truncated stub.
  */
  it('AND IS NEVER EMPTY', () => {
    expect(tabName('King of the Mountain')).toBe('King of the Mountain');
    expect(tabName('  Rate Board  ')).toBe('Rate Board');
    expect(tabName('')).toBe('Mirror');
  });

  it('and the page really sets it, tenant-scoped like every other read', () => {
    const page = readFileSync('src/app/mirrors/page.tsx', 'utf8');
    const meta = page.slice(page.indexOf('export async function generateMetadata'));
    expect(meta.slice(0, 900)).toContain('tabName(');
    expect(meta.slice(0, 900)).toContain('schema.boards.tenantId');
  });
});
