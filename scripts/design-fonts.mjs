/**
 * Give a design prototype its real typeface.
 *
 * ── Why this exists, and why it matters more than it looks ───────────────────────────────────────
 *
 * Every `.dc.html` prototype declares `--font-heading: "Caprasimo"` and pulls it from Google Fonts
 * with an `@import`. This environment's proxy refuses that host, so the import fails silently and
 * the browser falls back to `system-ui` — a plain sans.
 *
 * So every screenshot of a design taken here, for weeks, was rendered in **the wrong typeface**, and
 * every comparison of "the design" against the product was partly a comparison of two different
 * fonts. It is exactly the fault this whole design pass has been about — checking against something
 * shaped differently from the thing that actually ships — and this time it was in the measuring
 * instrument rather than in the product. Found on 18 September while working out why the design's
 * card titles looked lighter than the product's: they were Arial.
 *
 * The product self-hosts both faces through `next/font`, so the real files are already being served
 * by the running app. This fulfils the blocked Google Fonts request with a stylesheet pointing at
 * them, which makes a prototype render in Caprasimo and Figtree exactly as the product does.
 *
 *   import { realFonts } from './design-fonts.mjs';
 *   await realFonts(context, 'http://localhost:3100');
 */

/** Pull the @font-face rules out of the running app's own stylesheet. */
async function faces(appUrl) {
  const home = await (await fetch(appUrl)).text();
  const href = home.match(/\/_next\/static\/[a-z0-9/._-]*\.css/i)?.[0];
  if (!href) throw new Error('Could not find the app stylesheet — is it running and built?');
  const css = await (await fetch(new URL(href, appUrl))).text();
  const rules = css.match(/@font-face\{[^}]*\}/g) ?? [];
  if (!rules.length) throw new Error('No @font-face rules in the app stylesheet.');
  /*
    The font FILES are inlined, not linked.

    Linking them at the app's address was the obvious thing and it silently did nothing: the
    prototype is served from another origin, and a cross-origin font needs CORS headers the static
    server does not send — so the browser fetched, refused, and fell back to Arial exactly as
    before, with the harness reporting success. Which is this whole problem again, one layer down.

    A data: URI has no origin to disagree about. Slower to build, impossible to get quietly wrong.
  */
  const base = new URL(href, appUrl);
  const out = [];
  for (const rule of rules) {
    const url = rule.match(/url\(([^)]+)\)/)?.[1]?.replace(/["']/g, '');
    if (!url) { out.push(rule); continue; }
    const bytes = Buffer.from(await (await fetch(new URL(url, base))).arrayBuffer());
    out.push(rule.replace(/url\([^)]+\)/, `url(data:font/woff2;base64,${bytes.toString('base64')})`));
  }
  return out.join('\n');
}

/**
 * Route a browser context so the prototypes get the real faces.
 *
 * Throws rather than carrying on if the fonts cannot be found. A silent fallback is what caused the
 * problem in the first place: a comparison that quietly measures the wrong thing is worse than one
 * that refuses to run.
 */
export async function realFonts(context, appUrl) {
  const css = await faces(appUrl);
  await context.route('**fonts.googleapis.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/css', body: css }));
  // The font files themselves are served from the app, which the browser can reach directly.
  return css;
}
