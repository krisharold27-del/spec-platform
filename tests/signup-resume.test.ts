import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The login trap, held shut.
 *
 * The sign-in is created before the business, deliberately, so an address already in use is refused
 * before anything is built. That leaves a gap: if anything after it fails, somebody owns an account
 * attached to nothing. They can authenticate, every page finds no seat and sends them to /signin,
 * and /signin shows the form again — an unbreakable loop, with no message, at the exact moment a
 * new customer is deciding whether to trust this product.
 *
 * Read as source because the flow needs a live auth service to run end to end. These assert the
 * three things that make the trap impossible, each of which is a one-line regression away.
 */
const read = (p: string) => readFileSync(p, 'utf8').replace(/\s+/g, ' ');

describe('a half-finished sign-up can always be finished', () => {
  it('resumes instead of refusing when the account exists but no seat does', () => {
    const src = read('src/app/signup/actions.ts');
    expect(src).toContain("signIn.reason === 'exists'");
    // Resuming requires proving the password: an address is never claimable by filling in a form.
    expect(src).toMatch(/exists'\s*\)\s*\{\s*if \(\(await signInWithPassword\([^)]*\)\) !== 'ok'\)/);
    expect(src).toContain('currentAuthUserId');
  });

  it('links the seat to whichever account was used, new or resumed', () => {
    expect(read('src/app/signup/actions.ts')).toContain('linkNewSeat(authUserId');
  });
});

describe('sign-in never loops', () => {
  it('sends a stranded account somewhere that can finish the job', () => {
    const src = read('src/app/signin/page.tsx');
    expect(src).toContain('signedInWithoutSeat');
    expect(src).toContain("redirect('/signup?resume=1')");
  });

  // Showing a sign-in form to somebody already signed in reads as though the last one failed.
  it('sends an already-signed-in person into the product', () => {
    const src = read('src/app/signin/page.tsx');
    expect(src).toContain('if (await getCurrentUser()) redirect(DEFAULT_AFTER_SIGN_IN)');
  });

  it('explains what happened rather than showing a bare form', () => {
    expect(read('src/app/signup/page.tsx')).toContain('never finished being created');
  });
});

describe('the two states are distinguishable at all', () => {
  it('has a helper that separates "authenticated" from "has a business"', () => {
    const src = read('src/lib/auth.ts');
    expect(src).toContain('export async function signedInWithoutSeat');
    expect(src).toContain('export async function currentAuthUserId');
  });
});
