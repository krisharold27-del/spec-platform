/**
 * The SPEC mark, watched moving.
 *
 * Kris, 18 September: *"the top left logo is supposed to move - you haven't done half the thing in
 * this build - super disappointed"*. Every design file opens with the mark PLAYING — the ring runs
 * red → amber → green over four and a half seconds, the hand sweeps round with it and lands on
 * twelve, and a small crown arrives at the end. The product was drawing the last frame of that as a
 * still image.
 *
 * ── Why a browser check, and why this one ────────────────────────────────────────────────────────
 *
 * The animation is SMIL inside the SVG. Nothing in a unit test can see it: the markup can be
 * perfectly correct and the picture still wrong, which is exactly what happened on the first
 * attempt. `animateTransform` on `transform` REPLACES the element's own transform rather than
 * composing with it, so putting the rotation on the group that also carried `translate(50 50)` spun
 * the hand about the corner of the canvas and drew it off the edge — the mark rendered as a plain
 * green disc with nothing in it, and every phrase, attribute and test still said it was right.
 *
 * So this asks the BROWSER three questions a person would ask looking at it:
 *   is the hand inside the disc at all,
 *   is it somewhere different a second later than it was at the start,
 *   and has the ring finished green rather than staying red.
 *
 *   npm start &
 *   node scripts/mark-journey.mjs http://localhost:3100
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;

let failures = 0;
const check = (what, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();

// The public front door, because the mark has to move for somebody who has never signed in.
await page.goto(BASE, { waitUntil: 'domcontentloaded' });

const mark = page.locator('svg[aria-label="SPEC"]').first();
check('THE MARK IS ON THE PAGE', await mark.count() > 0);

if (await mark.count() > 0) {
  /*
    Where the hand is, in the mark's own coordinates.

    Read from the rendered geometry rather than from the attribute, because the attribute is exactly
    what was right while the picture was wrong.
  */
  const handAt = () => mark.evaluate(svg => {
    const hand = svg.querySelector('g > g[fill="#f5ead8"], g > g rect');
    const group = hand?.closest('g[fill="#f5ead8"]') ?? hand;
    if (!group) return null;
    const box = group.getBoundingClientRect();
    const svgBox = svg.getBoundingClientRect();
    return {
      cx: box.x + box.width / 2 - svgBox.x,
      cy: box.y + box.height / 2 - svgBox.y,
      w: svgBox.width,
      h: svgBox.height,
      visible: box.width > 0 && box.height > 0,
    };
  });

  const early = await handAt();
  check('  and the hand is drawn', Boolean(early?.visible));

  /*
    INSIDE the disc. This is the check that would have caught the transform fault: the hand was
    still being drawn, still the right shape and still animating — a hundred and forty pixels above
    the top of the picture.
  */
  if (early) {
    const inside = early.cx > -2 && early.cx < early.w + 2 && early.cy > -2 && early.cy < early.h + 2;
    check('  and it is inside the mark rather than off the canvas', inside,
      `centre ${Math.round(early.cx)},${Math.round(early.cy)} in ${Math.round(early.w)}×${Math.round(early.h)}`);
  }

  // Part-way through the four and a half seconds.
  await page.waitForTimeout(1400);
  const later = await handAt();
  const moved = early && later && (Math.abs(early.cx - later.cx) > 1 || Math.abs(early.cy - later.cy) > 1);
  check('THE MARK MOVES', Boolean(moved),
    early && later ? `${Math.round(early.cx)},${Math.round(early.cy)} → ${Math.round(later.cx)},${Math.round(later.cy)}` : 'no reading');

  // And after it has finished, the ring is green and stays green — the argument the animation makes.
  await page.waitForTimeout(3600);
  const stroke = await mark.evaluate(svg => {
    const ring = [...svg.querySelectorAll('circle')].find(c => c.querySelector('animate'));
    return ring ? getComputedStyle(ring).stroke : null;
  });
  check('  and it finishes green rather than staying red',
    /rgb\(\s*79,\s*122,\s*63\s*\)/.test(stroke ?? ''), stroke ?? 'no ring');
}

await browser.close();
console.log(failures === 0 ? '\nThe mark plays.' : `\n${failures} not true.`);
process.exit(failures === 0 ? 0 : 1);
