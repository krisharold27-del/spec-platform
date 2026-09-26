/*
  A mirror body is written and changed by people, and read by everybody in the business.

  Kris, 26 September: *"mirrors must be as powerful as artifacts."* Powerful means a rate card, a
  one-pager, a procedure with a table in it — and it means several people editing one document that
  a supervisor then opens. The moment a crew can change what a supervisor reads, that document is
  untrusted input, whatever it started as.

  `renderMarkdown` says in its own first line that it is for text this codebase generates from its
  own prompt. These tests hold the line between the two.
*/
import { describe, it, expect } from 'vitest';
import { renderSafeMarkdown, renderMarkdown } from '../src/lib/markdown';

describe('a mirror body cannot carry a script', () => {
  it('NEVER EMITS A SCRIPT TAG', () => {
    const out = renderSafeMarkdown('Before\n\n<script>fetch("/api/steal")</script>\n\nAfter');
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain('&lt;script&gt;');
  });

  it('never emits an inline handler or a javascript: source AS A TAG', () => {
    /*
      The property is "no live element", not "the letters onerror never appear". Those letters
      showing as visible text is the whole point of escaping — a procedure that mentions onerror
      should read as written. My first version of this test asserted the letters were absent and
      failed on correct behaviour, which is the shape of a check that would later be "fixed" by
      weakening the thing it guards.
    */
    const out = renderSafeMarkdown('<img src=x onerror="alert(1)">\n\n<iframe src="javascript:alert(1)"></iframe>');
    expect(out).not.toMatch(/<img/i);
    expect(out).not.toMatch(/<iframe/i);
    /* Escaped, so the browser parses it as words. */
    expect(out).toContain('&lt;img');
    expect(out).toContain('&lt;iframe');
  });

  it('shows the characters rather than deleting the line', () => {
    /*
      Escaping, not stripping. A sanitiser that removes what it dislikes quietly changes a document
      somebody is relying on — and on a procedure, a silently missing line is the failure that
      matters most. Nothing is lost here; it is only ever shown.
    */
    const out = renderSafeMarkdown('Torque to spec <see manual> before closing');
    expect(out).toContain('see manual');
  });
});

describe('and everything a real document needs still works', () => {
  it('renders headings, lists, bold and links', () => {
    const out = renderSafeMarkdown('# Rate card\n\n- **Callout** after hours\n- [Award rates](https://example.com)');
    expect(out).toMatch(/<h1/);
    expect(out).toMatch(/<li/);
    expect(out).toMatch(/<strong/);
    expect(out).toMatch(/<a href="https:\/\/example\.com"/);
  });

  it('RENDERS A TABLE, which is half of why a one-pager is useful', () => {
    const out = renderSafeMarkdown('| Job | Rate |\n|---|---|\n| Callout | Standard |');
    expect(out).toMatch(/<table/);
    expect(out).toMatch(/<td/);
  });

  it('leaves the older renderer alone', () => {
    /* Two renderers on purpose, not by accident: one for text this codebase wrote, one for text a
       person may have changed. Collapsing them would quietly widen the trusted one. */
    expect(typeof renderMarkdown).toBe('function');
    expect(typeof renderSafeMarkdown).toBe('function');
    expect(renderMarkdown('<b>x</b>')).toContain('<b>');
    expect(renderSafeMarkdown('<b>x</b>')).not.toContain('<b>');
  });
});
