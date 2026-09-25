import { randomUUID } from 'node:crypto';
import { db, schema } from '../db';
import type { Feed, Row, Step, Headline } from './boards-live';

/**
 * The two worked boards from the design, for a business somebody is looking around.
 *
 * ── Why examples exist at all, when nothing else in SPEC has any ─────────────────────────────────
 *
 * Every other screen explains itself with the business's own numbers. A board cannot: it is the one
 * thing in the product nobody has made yet, and an empty gallery with a "+ New board" button teaches
 * a visitor nothing about what a board is FOR. The design makes the same judgement — it ships two
 * worked examples and renders everything else generically.
 *
 * So these go into the LOOK-AROUND business only, which is the one that already contains invented
 * people and invented months and says so at the top of every page. They are never created for a real
 * business: somebody's first board has to be their own, or the register fills with furniture nobody
 * put there and everybody is afraid to delete.
 *
 * ── The Rate Board is the argument for the whole feature ─────────────────────────────────────────
 *
 * A sell rate of $115 that nobody can defend, taken apart into the four numbers it is actually made
 * of, each pointed at the system it came from, landing on $105. The disagreement is then with the
 * actuals rather than with whoever set the rate — which is the difference between a decision and a
 * row, and it is the whole reason a board is not a spreadsheet in somebody's downloads folder.
 *
 * ── Only the look-around's own invented people, and no vendors ──────────────────────────────────
 *
 * Anybody can open a look-around without an account, so this is public. It used to name real
 * people from a real customer's chart and two accounting products by brand; the site check on
 * 25 September found both. Every name here is one of the invented team `app/look/route.ts` puts on
 * the chart, systems are named by category, and `tests/look-examples.test.ts` holds it there.
 */

const rateFeeds: Feed[] = [
  { system: 'Job system', what: 'job cost feed' },
  { system: 'Accounting system', what: 'actuals feed' },
];

const rateRows: Row[] = [
  { label: 'Base hourly cost', source: 'Job system', value: '$61.20' },
  { label: 'On-costs / super', source: 'Accounting system', value: '$18.40' },
  { label: 'Overheads allocation', source: 'Job system', value: '$14.10' },
  { label: 'Margin target', source: 'Board pack', value: '11.3%' },
  { label: 'Effective sell rate', source: 'Validated', value: '$105.00' },
];

const rateHeadline: Headline = {
  wasLabel: 'Was', was: '$115/hr',
  nowLabel: 'Now', now: '$105/hr',
  note: 'Set where the market needs us — validated against actuals, not guesswork.',
};

const mountainSteps: Step[] = [
  { text: 'Standardise the mounting kit list across every install', owner: 'Jo Barnes', state: 'doing' },
  { text: 'Fix the permitting bottleneck — apply at contract signing, not install week', owner: 'Jo Barnes', state: 'blocked' },
  { text: 'Train installers on the new inverter model', owner: 'Chris Nguyen', state: 'blocked' },
  { text: 'Weekly stock check against the job schedule', owner: 'Sam Lee', state: 'todo' },
];

/** Only ever called for a look-around tenant. See the note above. */
export async function addExampleBoards(tenantId: string): Promise<void> {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 2 * 86_400_000).toISOString();

  const rateId = randomUUID();
  const mountainId = randomUUID();

  await db.insert(schema.boards).values([
    {
      id: rateId,
      tenantId,
      /*
        A name, and the explainer underneath it — the first of the artifact rules Kris asked for on
        19 September. Both of these worked examples were written the other way round, as a name with
        a dash and a second title after it, and a visitor's first idea of what a mirror is called
        comes from exactly here. `readTitle` splits one typed that way; these are simply written
        right, and `tests/mirror-rules.test.ts` holds this file to it.
      */
      title: 'Rate Board',
      summary: 'Labour sell rate, built from the job system and the accounts: $115 → $105.',
      kind: 'live',
      /*
        Stored false, and the page works it out anyway.

        `live` on the row is only ever a hint; boards-live-data asks the connections table whether
        those two feeds are actually working and badges the board from THAT. A look-around has no
        real connections, so this board shows the honest thing — the numbers somebody put here — and
        names the feeds that are not running. Which is exactly what a visitor should see, because it
        is what their own business would see before they connected anything.
      */
      live: false,
      feeds: JSON.stringify(rateFeeds),
      rows: JSON.stringify(rateRows),
      steps: '[]',
      headline: JSON.stringify(rateHeadline),
      createdBy: 'Sam Lee',
      createdAt: yesterday,
      updatedAt: now,
    },
    {
      id: mountainId,
      tenantId,
      title: 'King of the Mountain',
      summary: 'The solar install fix plan — what needs doing, and who owns each piece.',
      kind: 'plans',
      live: false,
      feeds: '[]',
      rows: '[]',
      steps: JSON.stringify(mountainSteps),
      headline: null,
      createdBy: 'Jo Barnes',
      createdAt: yesterday,
      updatedAt: yesterday,
    },
  ]);

  await db.insert(schema.boardComments).values([
    {
      id: randomUUID(), tenantId, boardId: rateId, authorName: 'Chris Nguyen',
      text: 'The accounts confirm we can hold $105 through Q3.', createdAt: yesterday,
    },
    {
      id: randomUUID(), tenantId, boardId: rateId, authorName: 'Sam Lee',
      text: 'This is the one — market-validated, not a guess.', createdAt: now,
    },
    {
      id: randomUUID(), tenantId, boardId: mountainId, authorName: 'Jo Barnes',
      text: 'Permitting step is the bottleneck — moved it up.', createdAt: yesterday,
    },
  ]);
}
