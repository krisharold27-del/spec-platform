import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isAdministrator, administrators, mayChangeAdministrator, administratorNote, type Seat,
} from '../src/lib/administrators';

/*
  ── Handing over ─────────────────────────────────────────────────────────────────────────────────

  Kris, 24 September 2026:

    "original person to sign up begins as an admin but they can change that to someone else if they
     wish"

  The first half was already true. The second half had no path anywhere in SPEC: access was written
  once, when a person was first created by `assignPerson`, and nothing could change it afterwards —
  no screen, no action, no route. Two faults followed, and both are worse than a missing button:

    · a founder who hands the GM seat on KEEPS administrator, because access lives on the person and
      not on the seat, so the business ends up with two and no way back to one;
    · somebody promoted INTO the top seat does NOT become an administrator, because access is only
      set when creating a person who does not yet exist. A new GM gets the chair and not the keys,
      and the only person who could fix it is the one who left.
*/

const seat = (id: string, access: string, name = id): Seat =>
  ({ id, name, email: `${id}@example.test`, access });

describe('who may change who administers', () => {
  it('lets an administrator make somebody else one', () => {
    const seats = [seat('kris', 'administrator'), seat('dane', 'full')];
    expect(mayChangeAdministrator(seats, 'kris', 'dane', true)).toEqual({ ok: true, access: 'administrator' });
  });

  it('refuses anybody who is not an administrator', () => {
    const seats = [seat('kris', 'administrator'), seat('dane', 'full'), seat('sione', 'readonly')];
    for (const actor of ['dane', 'sione']) {
      const got = mayChangeAdministrator(seats, actor, 'sione', true);
      expect(got.ok, actor).toBe(false);
    }
  });

  it('refuses a person who is not on a seat here', () => {
    const seats = [seat('kris', 'administrator')];
    const got = mayChangeAdministrator(seats, 'kris', 'somebody-else', true);
    expect(got.ok).toBe(false);
    expect(got.ok === false && got.reason).toContain('not on a seat');
  });

  it('says so rather than silently doing nothing when there is nothing to do', () => {
    const seats = [seat('kris', 'administrator'), seat('dane', 'administrator')];
    expect(mayChangeAdministrator(seats, 'kris', 'dane', true).ok).toBe(false);
    expect(mayChangeAdministrator(seats, 'kris', seat('x', 'full').id, false).ok).toBe(false);
  });
});

describe('the handover Kris asked for', () => {
  /*
    The whole point, in two acts and in this order. Doing it the other way round is the thing the
    next block refuses.
  */
  it('MAKES THE NEXT PERSON AN ADMINISTRATOR, THEN LETS THE FOUNDER STEP DOWN', () => {
    let seats = [seat('kris', 'administrator', 'Kris'), seat('dane', 'full', 'Dane')];

    const promote = mayChangeAdministrator(seats, 'kris', 'dane', true);
    expect(promote).toEqual({ ok: true, access: 'administrator' });
    seats = [seat('kris', 'administrator', 'Kris'), seat('dane', 'administrator', 'Dane')];

    const stepDown = mayChangeAdministrator(seats, 'kris', 'kris', false);
    expect(stepDown).toEqual({ ok: true, access: 'full' });
  });

  /*
    Stepping down drops to `full`, not `readonly`. Somebody who has been administering the business
    is almost always still a manager in it, and taking their own scorecards away as a side effect of
    handing over the keys would be a second change nobody asked for.
  */
  it('leaves somebody who steps down as a manager, not locked out of their own numbers', () => {
    const seats = [seat('kris', 'administrator'), seat('dane', 'administrator')];
    const got = mayChangeAdministrator(seats, 'kris', 'kris', false);
    expect(got.ok && got.access).toBe('full');
  });

  /* Ordinary acts of running a business, neither of them guarded. */
  it('lets an administrator remove another one, while others remain', () => {
    const seats = [seat('kris', 'administrator'), seat('dane', 'administrator'), seat('tom', 'administrator')];
    expect(mayChangeAdministrator(seats, 'kris', 'dane', false).ok).toBe(true);
  });
});

describe('the state this file exists to make unreachable', () => {
  /*
    ── A business with nobody administering it ──────────────────────────────────────────────────

    No seats, no billing, no financial year, no recovery contact — and the only people who could
    put it right are the ones who no longer have the rights. There is no self-service way back.
    So it is REFUSED, not warned about.
  */
  it('REFUSES THE LAST ADMINISTRATOR STEPPING DOWN', () => {
    const seats = [seat('kris', 'administrator', 'Kris'), seat('dane', 'full', 'Dane')];
    const got = mayChangeAdministrator(seats, 'kris', 'kris', false);
    expect(got.ok).toBe(false);
    expect(got.ok === false && got.reason).toContain('only administrator');
    // And it says what to do instead, rather than only saying no.
    expect(got.ok === false && got.reason).toMatch(/make somebody else an administrator first/i);
  });

  it('and refuses the last one being removed by anybody else', () => {
    // Contrived, but it is the same hole: an administrator acting on the only other administrator.
    const seats = [seat('kris', 'administrator', 'Kris')];
    const got = mayChangeAdministrator(seats, 'kris', 'kris', false);
    expect(got.ok).toBe(false);
  });

  it('counts administrators from the seats as they actually are', () => {
    expect(administrators([seat('a', 'administrator'), seat('b', 'full')])).toHaveLength(1);
    expect(administrators([seat('a', 'full'), seat('b', 'readonly')])).toHaveLength(0);
    expect(isAdministrator(seat('a', 'administrator'))).toBe(true);
    expect(isAdministrator(seat('a', 'full'))).toBe(false);
  });

  /*
    ── And the action re-reads the seats rather than trusting the form ──────────────────────────

    Two administrators stepping down in the same minute is exactly how a business reaches nobody.
    The count has to come from the database at the moment of the write, not from whatever the page
    believed when it was rendered.
  */
  it('DECIDES FROM THE DATABASE AT THE MOMENT OF THE WRITE, not from the form', () => {
    const action = readFileSync('src/app/settings/actions.ts', 'utf8');
    const fn = action.slice(action.indexOf('export async function setAdministrator'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    // It selects the seats itself...
    expect(body).toMatch(/db\.select\([\s\S]*schema\.users/);
    // ...and the decision comes from the rule, not from anything the form said about access.
    expect(body).toContain('mayChangeAdministrator');
    expect(body, 'the form never says who is currently an administrator').not.toMatch(/form\.get\(['"]access/);
    // The write is scoped to this business as well as to the person.
    expect(body).toMatch(/eq\(schema\.users\.tenantId/);
  });

  it('is only reachable by an administrator in the first place', () => {
    const action = readFileSync('src/app/settings/actions.ts', 'utf8');
    const fn = action.slice(action.indexOf('export async function setAdministrator'));
    expect(fn.slice(0, 200)).toContain('await administrator()');
  });
});

describe('what the screen says before somebody runs into the rule', () => {
  it('warns while there is only one', () => {
    const note = administratorNote([seat('kris', 'administrator'), seat('dane', 'full')]);
    expect(note).toContain('One administrator');
    expect(note).toMatch(/hand over/i);
  });

  it('counts them once there are more', () => {
    expect(administratorNote([seat('a', 'administrator'), seat('b', 'administrator')]))
      .toContain('2 administrators');
  });

  /* Being an administrator is not a key to other people's numbers — said here as well as enforced
     in lib/scope, because this is the screen where somebody is handed the level. */
  it('says plainly that it never widens what somebody can see', () => {
    expect(administratorNote([seat('a', 'administrator'), seat('b', 'administrator')]))
      .toMatch(/never widens/i);
  });

  it('does not pretend nobody administering is normal', () => {
    expect(administratorNote([seat('a', 'full')])).toMatch(/should not be possible/i);
  });
});
