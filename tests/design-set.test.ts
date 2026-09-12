import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The design-set check, checked.
 *
 * This script's whole job is to answer "is the design set complete?" honestly, and a check that
 * quietly stops detecting things is worse than none — that is the mistake it exists to prevent, so
 * it should not be the mistake it repeats. Run against folders built here rather than against the
 * real designs/, so the test says the same thing next month when the real set has changed.
 */

const SCRIPT = new URL('../scripts/design-check.mjs', import.meta.url).pathname;

/** A screen carrying a given logo and links, close enough in shape to the real exports. */
function screen({ logo, links = [] }: { logo: string; links?: string[] }) {
  const anchors = links.map(l => `<a href="${l}">go</a>`).join('');
  return `<!DOCTYPE html><html><body>
    <nav class="nav"><a href="SPEC Home.dc.html" class="nav-brand">${logo}SPEC</a>${anchors}</nav>
    <h1>A screen</h1>
  </body></html>`;
}

const OLD_LOGO = '<img src="logo.svg" width="26" height="26" />';
const NEW_LOGO = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/></svg>';

function run(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'spec-designs-'));
  try {
    for (const [name, html] of Object.entries(files)) writeFileSync(join(dir, name), html);
    return execFileSync('node', [SCRIPT], { env: { ...process.env, SPEC_DESIGNS: dir }, encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('the design set check', () => {
  it('says COMPLETE when every screen is present and all from one export', () => {
    const out = run({
      'SPEC Home.dc.html': screen({ logo: OLD_LOGO, links: ['SPEC Today.dc.html'] }),
      'SPEC Today.dc.html': screen({ logo: OLD_LOGO, links: ['SPEC Home.dc.html'] }),
    });
    expect(out).toContain('COMPLETE');
    expect(out).not.toContain('INCOMPLETE');
  });

  // The failure that started all of this: a screen linked from the navigation that was never sent.
  it('names a screen that is linked to but was never received', () => {
    const out = run({
      'SPEC Home.dc.html': screen({ logo: OLD_LOGO, links: ['SPEC My Page.dc.html'] }),
    });
    expect(out).toContain('SPEC My Page.dc.html');
    expect(out).toContain('INCOMPLETE');
  });

  // The other half: files that arrived on different days, sitting in one folder looking equally current.
  it('spots two exports mixed together', () => {
    const out = run({
      'SPEC Home.dc.html': screen({ logo: OLD_LOGO }),
      'SPEC Today.dc.html': screen({ logo: OLD_LOGO }),
      'SPEC Admin.dc.html': screen({ logo: NEW_LOGO }),
    });
    expect(out).toContain('2 exports mixed together');
    expect(out).toContain('SPEC Admin');
  });

  /**
   * A nav bar differing between marketing and product screens is normal, not staleness. The first
   * version of this script compared nav links and reported eleven exports among twenty-one screens,
   * which is precisely the crying-wolf failure that gets a check ignored.
   */
  it('does not mistake a different navigation for a different export', () => {
    const out = run({
      'SPEC Landing.dc.html': screen({ logo: OLD_LOGO, links: ['SPEC Pricing.dc.html'] }),
      'SPEC Pricing.dc.html': screen({ logo: OLD_LOGO, links: ['SPEC Landing.dc.html'] }),
      'SPEC Today.dc.html': screen({
        logo: OLD_LOGO,
        links: ['SPEC Org Chart.dc.html', 'SPEC Role.dc.html', 'SPEC Landing.dc.html'],
      }),
      'SPEC Org Chart.dc.html': screen({ logo: OLD_LOGO, links: ['SPEC Today.dc.html'] }),
      'SPEC Role.dc.html': screen({ logo: OLD_LOGO, links: ['SPEC Today.dc.html'] }),
    });
    expect(out).toContain('COMPLETE');
  });

  // Reference pages — the colour system, the mascot — carry no header. That is not a fault.
  it('sets aside screens with no logo instead of counting them as a second export', () => {
    const out = run({
      'SPEC Home.dc.html': screen({ logo: OLD_LOGO }),
      'SPEC Mascot.dc.html': '<!DOCTYPE html><html><body><h1>The mascot</h1></body></html>',
    });
    expect(out).toContain('SPEC Mascot');
    expect(out).toContain('COMPLETE');
  });
});
