import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MAIL_PROVIDERS } from '../src/lib/systems';
import { CATEGORIES, PERSONAL_CATEGORIES, isPersonal, isSensitive } from '../src/lib/systems';

/**
 * A mailbox belongs to a person, not to the business.
 *
 * Which makes this the one connection nobody else can switch on, and the one that must never turn
 * up in a list the whole business reads. The risk is not a dramatic one — it is that somebody adds
 * a perfectly reasonable query months from now and a person's private mail quietly appears on the
 * board's connection list. So the rule is checked by reading the source, not by remembering.
 */

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('mail is a category like any other', () => {
  it('is in the category list, described by what it holds', () => {
    expect(CATEGORIES.find(c => c.id === 'communications')?.name).toBe('Mail');
  });

  it('offers the two mail systems people actually use, and a way out for everyone else', () => {
    expect(MAIL_PROVIDERS.map(p => p.id)).toEqual(['outlook', 'gmail', 'other']);
  });

  /**
   * Not board-sensitive, which looks surprising until you see why: the board approves connections
   * that put the BUSINESS's data somewhere. A person's own mailbox is not the board's to approve,
   * and asking them to would be stranger than not asking.
   */
  it('does not go to the board', () => {
    expect(isSensitive('communications')).toBe(false);
  });

  it('is the only thing a person connects for themselves', () => {
    expect(PERSONAL_CATEGORIES).toEqual(['communications']);
    expect(isPersonal('communications')).toBe(true);
    expect(isPersonal('financials')).toBe(false);
  });
});

describe('a personal mailbox never reaches a business list', () => {
  /**
   * Read as text, deliberately, and this is the test that matters.
   *
   * Four separate places read every connection a business has: the connections page, the board
   * data, the journey, and the feeds on My Page. Each one had to learn to exclude a personal
   * mailbox, and a fifth will be written one day by somebody who does not know that. The compiler
   * cannot catch it, because selecting every row is perfectly valid code.
   */
  it('excludes personalFor everywhere connections are read for the business', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      const path = file.replace(/\\/g, '/');
      // lib/mail is where the personal ones legitimately live, so it is the one exception.
      if (path === 'src/lib/mail.ts') continue;
      const text = readFileSync(file, 'utf8');
      if (!text.includes('schema.systemConnections')) continue;
      // Every query that reaches for connections has to say something about personalFor.
      if (!text.includes('personalFor')) offenders.push(path);
    }
    expect(offenders, 'these read every connection without excluding personal mailboxes').toEqual([]);
  });
});
