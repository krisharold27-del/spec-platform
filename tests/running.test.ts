import { describe, it, expect } from 'vitest';
import { running, runningLine } from '../src/lib/running';

const LIVE = {
  VERCEL_ENV: 'production',
  VERCEL_GIT_COMMIT_SHA: '9d4e282f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
  VERCEL_GIT_COMMIT_MESSAGE: 'Put the fixes live\n\nA long body nobody reads on a card.',
  VERCEL_GIT_COMMIT_AUTHOR_NAME: 'Kris Harold',
  VERCEL_GIT_REPO_OWNER: 'krisharold27-del',
  VERCEL_GIT_REPO_SLUG: 'spec-platform',
};

describe('what is actually running', () => {
  it('reads the version from what the platform already sets', () => {
    const r = running(LIVE);
    expect(r.what).toBe('Put the fixes live');
    expect(r.ref).toBe('9d4e282');
    expect(r.live).toBe(true);
    expect(r.by).toBe('Kris Harold');
    expect(r.href).toBe('https://github.com/krisharold27-del/spec-platform/commit/9d4e282f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d');
  });

  it('shows the first line of the message, never the whole body', () => {
    expect(running(LIVE).what).not.toMatch(/nobody reads/);
  });

  /*
    The distinction the panel exists for. A preview build looks identical to the live site and is
    not evidence about it — this project spent months with work that was built, green, and never
    actually running in production.
  */
  it('never lets a preview pass for the live site', () => {
    const preview = running({ ...LIVE, VERCEL_ENV: 'preview' });
    expect(preview.live).toBe(false);
    expect(runningLine(preview)).toMatch(/not the live site/);
  });

  it('says plainly when it cannot tell, rather than implying all is well', () => {
    const local = running({});
    expect(local.ref).toBeNull();
    expect(local.live).toBe(false);
    expect(runningLine(local)).toMatch(/cannot say which version/);
    expect(runningLine(local)).toMatch(/never true of the live site/);
  });

  it('confirms the live site when it really is one', () => {
    expect(runningLine(running(LIVE))).toMatch(/This is the live site/);
  });

  it('offers no link when it does not know the repository', () => {
    const r = running({ ...LIVE, VERCEL_GIT_REPO_OWNER: undefined });
    expect(r.href).toBeNull();
    expect(r.ref).toBe('9d4e282');   // still says which version, just cannot link to it
  });

  it('treats an empty message as no message rather than an empty line', () => {
    expect(running({ ...LIVE, VERCEL_GIT_COMMIT_MESSAGE: '   ' }).what).toBeNull();
  });
});
