import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  TERRITORIES, isTerritory, territoryName, SUGGESTED_NAME, CONFIRM_THE_NAME,
  WHY_THE_WINDOW_IS_YOURS, isSetUp, certWatch, stillOwed, outstanding, certificateLine,
  isFinished, FINISHED_STAGES, type CertificateSetup, type CertifiableJob,
} from '../src/lib/certificates';

const at = (iso: string) => new Date(`${iso}T09:00:00.000Z`);
const setup = (over: Partial<CertificateSetup> = {}): CertificateSetup =>
  ({ territory: 'NSW', name: 'Certificate of Compliance Electrical Work', withinDays: 7, ...over });
const job = (over: Partial<CertifiableJob> = {}): CertifiableJob =>
  ({ id: 'j1', ref: 'J-1001', stage: 'paid', doneAt: '2026-06-01T00:00:00.000Z', ...over });

/*
  ── SPEC does not know your scheme, and says so ─────────────────────────────────────────────────

  Every state and territory runs its own, under its own name, lodged with its own body, inside its
  own window — and they change. A number SPEC invented and showed as the deadline is worse than no
  deadline, because a business lodging to a made-up window has been actively misled by the thing it
  trusted to keep it right.
*/
describe('not a single day count is hard-coded', () => {
  it('has no number of days anywhere in the file', () => {
    const src = readFileSync('src/lib/certificates.ts', 'utf8');
    /* Strip the prose, then look for anything that reads as a deadline. */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\b\d+\s*\*?\s*(days?|DAYS?)\b/);
    expect(code).not.toMatch(/WITHIN_DAYS\s*=\s*\d/);
    expect(code).not.toMatch(/DEFAULT_(WINDOW|DAYS)/);
  });

  it('the window belongs to the business, and null is a real state', () => {
    expect(WHY_THE_WINDOW_IS_YOURS).toMatch(/differs by state/i);
    expect(WHY_THE_WINDOW_IS_YOURS).toMatch(/will not guess/i);
    const w = certWatch(job(), setup({ withinDays: null }), at('2027-01-01'));
    /* Months overdue by any real scheme, and SPEC still refuses to call it late. */
    expect(w.state).toBe('due');
    expect(w.says).toMatch(/does not know your lodgement window/i);
  });

  it('the suggested name is offered, never applied', () => {
    expect(Object.keys(SUGGESTED_NAME).sort()).toEqual(TERRITORIES.map(t => t.code).sort());
    expect(CONFIRM_THE_NAME).toMatch(/starting point/i);
    expect(CONFIRM_THE_NAME).toMatch(/your own regulator/i);
    /* A business that has set nothing is not quietly given one. */
    expect(isSetUp({ territory: 'NSW', name: null, withinDays: null })).toBe(false);
  });

  it('knows the eight, and nothing else', () => {
    expect(TERRITORIES).toHaveLength(8);
    expect(isTerritory('NSW')).toBe(true);
    expect(isTerritory('nsw')).toBe(false);
    expect(isTerritory('QLDX')).toBe(false);
    expect(territoryName('VIC')).toBe('Victoria');
  });
});

describe('one job’s certificate', () => {
  it('owes nothing until the work is finished', () => {
    expect(isFinished('onsite')).toBe(false);
    expect([...FINISHED_STAGES]).toEqual(['invoiced', 'paid']);
    expect(certWatch(job({ stage: 'onsite' }), setup(), at('2026-06-10')).state).toBe('not_yet');
  });

  it('is due the moment the work is finished', () => {
    expect(certWatch(job(), setup(), at('2026-06-02')).state).toBe('due');
  });

  it('written is not lodged, and says so', () => {
    const w = certWatch(job({ certificateIssuedAt: '2026-06-02T00:00:00.000Z' }), setup(), at('2026-06-03'));
    expect(w.state).toBe('issued');
    expect(w.says).toMatch(/still has to be lodged/i);
    /* The gap businesses fall into, named rather than implied. */
    expect(w.says).toMatch(/customer having their copy is not the same/i);
  });

  it('is late once past the business’s OWN window', () => {
    expect(certWatch(job(), setup({ withinDays: 7 }), at('2026-06-07')).state).toBe('due');
    expect(certWatch(job(), setup({ withinDays: 7 }), at('2026-06-10')).state).toBe('late');
  });

  it('written but never lodged goes late too', () => {
    const w = certWatch(
      job({ certificateIssuedAt: '2026-06-02T00:00:00.000Z' }), setup({ withinDays: 7 }), at('2026-06-20'),
    );
    expect(w.state).toBe('late');
    expect(w.says).toMatch(/written but never lodged/i);
  });

  it('lodged is finished, whatever the dates', () => {
    const w = certWatch(job({ certificateLodgedAt: '2026-06-03T00:00:00.000Z' }), setup(), at('2027-01-01'));
    expect(w.state).toBe('lodged');
    expect(stillOwed(w.state)).toBe(false);
  });

  it('a job excused says why, and a blank reason excuses nothing', () => {
    /*
      A reason rather than a tick. A business that can silently skip jobs has a register that means
      nothing; one that has to say why has a register somebody can audit.
    */
    const w = certWatch(job({ noCertificateBecause: 'Supply only, no installation' }), setup(), at('2026-07-01'));
    expect(w.state).toBe('excused');
    expect(w.says).toContain('Supply only');
    /* Blank excuses nothing: it falls through to the ordinary path and is still owed. */
    const blank = certWatch(job({ noCertificateBecause: '   ' }), setup(), at('2026-07-01'));
    expect(blank.state).not.toBe('excused');
    expect(stillOwed(blank.state)).toBe(true);
  });
});

describe('the list, and what it says', () => {
  it('shows only what is still owed, oldest first', () => {
    const jobs = [
      job({ id: 'a', ref: 'J-A', doneAt: '2026-06-01T00:00:00.000Z' }),
      job({ id: 'b', ref: 'J-B', certificateLodgedAt: '2026-06-02T00:00:00.000Z' }),
      job({ id: 'c', ref: 'J-C', doneAt: '2026-05-01T00:00:00.000Z' }),
      job({ id: 'd', ref: 'J-D', stage: 'onsite' }),
    ];
    expect(outstanding(jobs, setup(), at('2026-06-20')).map(w => w.job.ref)).toEqual(['J-C', 'J-A']);
  });

  it('says nothing useful until the business has told SPEC what theirs is called', () => {
    const line = certificateLine([], { territory: null, name: null, withinDays: null });
    expect(line).toMatch(/Nobody has told SPEC/i);
  });

  it('counts the written-but-not-sent separately, because that is a different problem', () => {
    const jobs = [
      job({ id: 'a', ref: 'J-A' }),
      job({ id: 'b', ref: 'J-B', certificateIssuedAt: '2026-06-02T00:00:00.000Z' }),
    ];
    const line = certificateLine(outstanding(jobs, setup(), at('2026-06-05')), setup());
    expect(line).toMatch(/2 finished jobs have no certificate lodged/);
    expect(line).toMatch(/1 written but not sent/);
  });

  it('counts a written certificate even when it has also gone late', () => {
    /*
      The group in the worst trouble — written, sitting in a drawer, and the clock run out — used to
      be the one group the summary never mentioned, because it counted the state label rather than
      the fact underneath it.
    */
    const jobs = [job({ id: 'a', ref: 'J-A', certificateIssuedAt: '2026-06-02T00:00:00.000Z' })];
    const owed = outstanding(jobs, setup({ withinDays: 7 }), at('2026-07-20'));
    expect(owed[0].state).toBe('late');
    const line = certificateLine(owed, setup({ withinDays: 7 }));
    expect(line).toMatch(/1 written but not sent/);
    expect(line).toMatch(/1 past your own window/);
  });

  it('says so plainly when everything is lodged', () => {
    expect(certificateLine([], setup())).toMatch(/Every finished job has its certificate lodged/);
  });
});

describe('the screen enforces the same rules', () => {
  const PAGE = readFileSync('src/app/jobs/page.tsx', 'utf8');
  const ACTIONS = readFileSync('src/app/jobs/actions.ts', 'utf8');

  it('written and lodged are two presses, not one', () => {
    expect(ACTIONS).toContain('export async function issueCertificate');
    expect(ACTIONS).toContain('export async function lodgeCertificate');
    const lodge = ACTIONS.slice(ACTIONS.indexOf('export async function lodgeCertificate'));
    /* And you cannot lodge what was never written. */
    expect(lodge).toMatch(/if \(!job\.certificateIssuedAt\)/);
  });

  it('a blank window is stored as nothing, never as zero', () => {
    const fn = ACTIONS.slice(ACTIONS.indexOf('export async function setCertificateSetup'));
    expect(fn).toMatch(/days === '' \? null/);
  });

  it('excusing a job requires a reason', () => {
    const fn = ACTIONS.slice(ACTIONS.indexOf('export async function excuseCertificate'));
    expect(fn).toMatch(/if \(!why\)/);
  });

  it('the tab exists and sits under getting paid', () => {
    expect(PAGE).toMatch(/\{ key: 'certificates', label: 'Certificates' \}/);
    expect(PAGE).toMatch(/'billing', 'certificates'/);
  });
});
