/*
  A mirror that runs, and the walls around it.

  Kris, 26 September: *"mirrors must be as powerful as artifacts."* This is the last real
  difference — a mirror could be a document, an artifact can be a thing you use.

  It is also the one dangerous part of the whole feature. Everything else about a mirror is text.
  This is code, written by a model or pasted by whoever is editing, then run in the browser of
  everybody else in the business — including the owner, signed in, on a page that shows every wage
  in the company. These tests are the walls.
*/
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  framed, checkRunnable, reachesOut, POLICY, SANDBOX, MOST_BYTES, WHY_REFUSED,
} from '../src/lib/runnable';

describe('the sandbox is the whole feature', () => {
  it('NEVER GRANTS allow-same-origin', () => {
    /*
      The one that matters, and the mistake every feature like this makes once. `allow-scripts`
      beside `allow-same-origin` undoes the entire sandbox: the frame gets SPEC's own origin back
      and with it the session cookie, localStorage and the parent document.
    */
    expect(SANDBOX).toBe('allow-scripts');
    expect(SANDBOX).not.toContain('same-origin');
  });

  it('grants nothing else either', () => {
    /* No forms, no popups, no top-level navigation, no downloads. A calculator needs none of them,
       and each one is a way to take somebody somewhere they did not ask to go. */
    for (const never of ['allow-forms', 'allow-popups', 'allow-top-navigation', 'allow-downloads', 'allow-modals']) {
      expect(SANDBOX).not.toContain(never);
    }
  });

  it('CLOSES THE NETWORK COMPLETELY', () => {
    /*
      The opaque origin stops it READING the business's data. This stops it SENDING anything
      anywhere — no fetch, no image beacon, no font. A tool that can compute but not phone home is
      the difference between a sandbox and a sandbox worth having.
    */
    expect(POLICY).toContain("default-src 'none'");
    expect(POLICY).not.toMatch(/connect-src(?!\s+'none')/);
    expect(POLICY).not.toContain('https:');
    /* Images only as data: URIs — drawn in the page, never fetched. */
    expect(POLICY).toContain('img-src data:');
  });

  it('PUTS THE POLICY BEFORE ANYTHING THE AUTHOR WROTE', () => {
    /*
      A meta CSP only governs what comes after it. Written below the author's first script it would
      be a policy that arrived too late to matter — and would still look completely correct in a
      code review.
    */
    const out = framed('<script>alert(1)</script>');
    expect(out.indexOf('content-security-policy')).toBeLessThan(out.indexOf('alert(1)'));
  });

  it('is handed to the frame as srcdoc, never as a URL', () => {
    /* Nothing served from SPEC's origin means there is no address somebody could open the code at
       directly, outside the frame, with their session attached. */
    const page = readFileSync('src/app/mirrors/page.tsx', 'utf8');
    if (page.includes('data-mirror-runs')) {
      expect(page).toContain('srcDoc');
      expect(page).toMatch(/sandbox=\{SANDBOX\}|sandbox="allow-scripts"/);
    }
  });
});

describe('what it refuses, and why it says so', () => {
  it('REFUSES ANYTHING THAT REACHES OUT, rather than letting it fail silently', () => {
    /*
      The policy already blocks it. Refusing as well is the point: blocked at runtime means a tool
      that half-works with no explanation, and somebody trusting a number that never arrived. Said
      at the point of writing it is a sentence; found later it is a wrong quote.
    */
    expect(reachesOut('<script src="https://cdn.example.com/x.js"></script>')).toBe(true);
    expect(reachesOut('<script src="//cdn.example.com/x.js"></script>')).toBe(true);
    expect(reachesOut('<link href="http://x.com/a.css" rel=stylesheet>')).toBe(true);
    expect(reachesOut('<style>@import url("https://x.com/a.css")</style>')).toBe(true);
    expect(reachesOut('<img src="https://x.com/beacon.gif">')).toBe(true);
  });

  it('leaves an ordinary self-contained tool alone', () => {
    const tool = '<label>Metres <input id=m type=number></label><button onclick="go()">Work it out</button><p id=out></p><script>function go(){out.textContent=m.value*2.5}</script>';
    expect(reachesOut(tool)).toBe(false);
    expect(checkRunnable(tool)).toBeNull();
  });

  it('refuses rather than quietly stripping', () => {
    /* Silently deleting half of somebody's tool and running the rest is how a calculator ends up
       giving a wrong answer with nothing on screen to say anything happened. */
    expect(checkRunnable('<script src="https://x.com/a.js"></script>')).toBe('reaches_out');
    expect(checkRunnable('')).toBe('empty');
    expect(checkRunnable('x'.repeat(MOST_BYTES + 1))).toBe('too_big');
  });

  it('explains every refusal in words the person can act on', () => {
    for (const [why, said] of Object.entries(WHY_REFUSED)) {
      expect(said.length, why).toBeGreaterThan(20);
      expect(said, why).not.toMatch(/error|invalid|failed/i);
    }
  });
});

describe('a tool still works', () => {
  it('runs inline script and style, which is all a calculator needs', () => {
    expect(POLICY).toContain("script-src 'unsafe-inline'");
    expect(POLICY).toContain("style-src 'unsafe-inline'");
  });

  it('arrives looking like the rest of SPEC rather than a 1997 form', () => {
    const out = framed('<p>hi</p>');
    expect(out).toContain('system-ui');
    expect(out).toContain('<p>hi</p>');
  });
});
