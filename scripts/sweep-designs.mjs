/**
 * Render every design beside the page that is supposed to be it.
 *
 * Kris, 18 September: *"why are you not following design properly?"*. The answer was that design
 * fidelity was being checked with a TEXT SEARCH — `design-coverage.mjs` greps the source for phrases
 * pulled out of the prototypes. That can say whether the words appear. It cannot see a card shape, a
 * colour, a line weight, a layout or a column, so four grey dots where the design draws four
 * coloured letters was invisible to it and it reported 100%, complete, for weeks.
 *
 * This produces the pairs. The comparison itself is a person looking at two pictures, which is the
 * only thing that works — the output of this script is not a verdict, it is the evidence somebody
 * else forms one from. `docs/DESIGN-GAP.md` is the list that came out of it.
 *
 *   node scripts/fake-auth.mjs 54321 &
 *   npm start &
 *   (cd designs && python3 -m http.server 3200) &
 *   node scripts/sweep-designs.mjs
 *
 * The prototypes load React from unpkg. Where the network denies that — this environment's proxy
 * does — the two UMD builds are served from disk instead; without them every design renders blank,
 * which is silent and looks exactly like a page with nothing on it.
 */
import { chromium } from 'playwright';
const OUT='/tmp/claude-0/-home-claude-repo/7fcbd828-c8f9-54e2-b54f-78d2e286654f/scratchpad/sweep';
const UMD='/tmp/claude-0/-home-claude-repo/7fcbd828-c8f9-54e2-b54f-78d2e286654f/scratchpad/umd/package/umd';
const APP='http://localhost:3100', DES='http://localhost:3200';

/** design file -> the route that is supposed to be it */
const PAIRS = [
  ['SPEC My Page.dc.html', '/my-page', 'my-page'],
  ['SPEC Monthly Scoring.dc.html', '/scoring', 'scoring'],
  ['SPEC My Scorecard.dc.html', '/me', 'my-scorecard'],
  ['SPEC People.dc.html', '/people', 'people'],
  ['SPEC Training.dc.html', '/training', 'training'],
  ['SPEC Weekly Meeting.dc.html', '/meeting', 'meeting'],
  ['SPEC Inbox.dc.html', '/inbox', 'inbox'],
  ['SPEC Connections.dc.html', '/connections', 'connections'],
  ['SPEC Boards.dc.html', '/boards', 'boards'],
  ['SPEC Setup.dc.html', '/setup', 'setup'],
  ['SPEC Board Pack.dc.html', '/board', 'board-pack'],
  ['SPEC Landing.dc.html', '/', 'landing'],
  ['SPEC Pricing.dc.html', '/pricing', 'pricing'],
  ['SPEC Admin.dc.html', '/settings', 'admin'],
  ['SPEC Group.dc.html', '/group', 'group'],
  ['SPEC Sectors.dc.html', '/sectors', 'sectors'],
];

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
// The prototypes pull React from unpkg, which this environment's proxy denies. Served locally.
await ctx.route('**unpkg.com/react@**', r => r.fulfill({ path: `${UMD}/react.production.min.js`, contentType: 'application/javascript' }));
await ctx.route('**unpkg.com/react-dom@**', r => r.fulfill({ path: `${UMD}/react-dom.production.min.js`, contentType: 'application/javascript' }));
const p = await ctx.newPage();

// a business with real numbers in it, so neither side is showing an empty state
await p.goto(`${APP}/look`, { waitUntil: 'networkidle' });

for (const [file, route, name] of PAIRS) {
  await p.goto(`${DES}/${encodeURIComponent(file)}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);
  await p.screenshot({ path: `${OUT}/${name}--design.png`, fullPage: true });

  await p.goto(`${APP}${route}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${OUT}/${name}--built.png`, fullPage: true });
  console.log('shot', name);
}
await b.close();
