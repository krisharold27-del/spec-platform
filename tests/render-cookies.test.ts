import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A page may not change a cookie while it renders — Next throws, and the visitor gets the error
 * page. That is how "Not for me" on the look-around broke: /look/thanks dropped the look-around key
 * during render, so everybody who said no was shown a crash instead of a thank-you. Cookie writes
 * belong in a server action or a route handler, never in a page or a layout.
 */
const WRITERS = ['beginLook', 'claimLook', 'endLook'];

function renderFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return renderFiles(path);
    return /^(page|layout)\.tsx$/.test(name) ? [path] : [];
  });
}

describe('cookies are never written while a page renders', () => {
  const files = renderFiles('src/app');

  it('finds the pages', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no page or layout calls a cookie-writing helper or sets a cookie itself', () => {
    const offenders = files.filter(f => {
      const src = readFileSync(f, 'utf8');
      if (/cookies\(\)\)?\.(set|delete)\(/.test(src)) return true;
      return WRITERS.some(w => new RegExp(`\\b${w}\\(`).test(src));
    });
    expect(offenders).toEqual([]);
  });

  it('saying "Not for me" goes through a route that may drop the key', () => {
    expect(readFileSync('src/app/look/decide/page.tsx', 'utf8')).toContain('href="/look/leave"');
    expect(readFileSync('src/app/look/leave/route.ts', 'utf8')).toContain('endLook()');
  });
});
