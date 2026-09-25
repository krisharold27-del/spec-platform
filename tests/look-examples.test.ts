import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The look-around is public — anybody can open it without an account — so the worked examples it
 * carries are public material. The site check on 25 September found them naming people from a
 * real customer's chart and two accounting products by brand. Neither is allowed on a public page.
 */
const examples = readFileSync('src/lib/boards-examples.ts', 'utf8');
const route = readFileSync('src/app/look/route.ts', 'utf8');
const code = examples.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the look-around examples', () => {
  it('only name the invented team the look-around puts on its own chart', () => {
    const team = new Set([...route.matchAll(/^\s+\w+: '([^']+)',$/gm)].map(m => m[1]));
    expect(team.size).toBeGreaterThan(2);
    const named = [...code.matchAll(/(?:owner|createdBy|authorName): '([^']+)'/g)].map(m => m[1]);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter(n => !team.has(n))).toEqual([]);
  });

  it('name systems by category, never by vendor', () => {
    for (const vendor of ['Xero', 'MYOB', 'QuickBooks', 'Simpro', 'ServiceM8', 'AroFlo']) {
      expect(code.toLowerCase(), vendor).not.toContain(vendor.toLowerCase());
    }
  });
});
