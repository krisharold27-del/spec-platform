/*
  The owner questions page has to tell the truth WHERE IT RUNS, not where it is tested.

  Kris, 26 September: *"we need to ask all the questiosn again and again until the system can do
  them all."* Fair — and the page that answers that was, in production, saying the system could do
  almost none of them.

  `/questions` is `force-dynamic`, so it renders inside a serverless function on every request.
  It read its list of routes by walking `src/app` with `readdirSync`. Next deploys compiled output,
  not source, so `src/` is not there: the walk found nothing, and every question fell through to
  "no screen behind it yet".

      in the repo    79 routes → 93 of 96 answered
      in production   0 routes →  0 of 96 answered, 93 gaps

  Every test passed the whole time, because every test runs in the repo. A check that is true where
  it is checked and false where it runs is the hardest kind to see, and this file is the answer to
  this particular instance of it.
*/
import { describe, it, expect } from 'vitest';
import { QUESTIONS, read } from '../src/lib/questions';
import { routesInApp, routesInProduct } from '../src/lib/questions-data';
import { readFileSync } from 'node:fs';

describe('the questions page reads the same list in both places', () => {
  it('KNOWS EVERY ROUTE WITHOUT READING THE DISK', () => {
    /* The whole fix in one line: the compiled list must match the walk, so the page says the same
       thing in a serverless function as it does here. */
    expect([...routesInProduct()].sort()).toEqual([...routesInApp()].sort());
  });

  it('ANSWERS THE SAME NUMBER OF QUESTIONS WITH NO src/ TO READ', () => {
    /*
      Proved by putting the fault back: point the walk at a directory that does not exist, which is
      exactly what production looked like, and confirm the compiled list is unaffected.
    */
    const gone = routesInApp('/tmp/there-is-no-src-here/app');
    expect(gone.size, 'the walk should find nothing without src/ — that was the bug').toBe(0);
    expect(read(QUESTIONS, gone).answered).toBe(0);

    const compiled = read(QUESTIONS, routesInProduct());
    expect(compiled.answered).toBeGreaterThan(80);
    expect(compiled.answered).toBe(read(QUESTIONS, routesInApp()).answered);
  });

  it('DOES NOT WALK THE FILESYSTEM ON THE PAGE ITSELF', () => {
    /*
      The regression that would bring it straight back is somebody "simplifying" the page to call
      the walk again — it reads more directly and works perfectly in every test. So the page is
      held to the compiled list by name.
    */
    const page = readFileSync('src/app/questions/page.tsx', 'utf8');
    expect(page).toContain('routesInProduct');
    expect(page).not.toMatch(/routesInApp\(/);
  });

  it('still counts gaps honestly rather than reporting a clean sheet', () => {
    /* A fix that made everything read as answered would be worse than the bug. Three questions are
       answered "everywhere" rather than by a screen, and the page says it cannot check those. */
    const r = read(QUESTIONS, routesInProduct());
    expect(r.everywhere.length).toBeGreaterThan(0);
    expect(r.answered + r.gaps.length + r.everywhere.length).toBe(QUESTIONS.length);
  });
});
