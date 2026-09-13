import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
  ── Nobody should ever be locked out because an email did not arrive ─────────────────────────────

  Inviting somebody created a single-use link and only ever emailed it. The person doing the
  inviting never saw it. So on a deployment with no email service configured, the send was skipped,
  the screen reported success, the person was marked invited — and there was no way on earth to get
  them in.

  That made an email provider a hard dependency for the one thing a business must be able to do: put
  its people in. A leader who can see the link can send it the way they already talk to their crew,
  and email goes back to being a convenience.

  These read the page rather than render it, because what is being protected is the DECISION — that
  the link is shown at all — and a decision is exactly the kind of thing that gets quietly removed
  in a tidy-up.
*/

const page = readFileSync('src/app/setup/business/page.tsx', 'utf8');
const component = readFileSync('src/components/seat-link.tsx', 'utf8');

describe('getting people in without an email service', () => {
  it('shows the invitation link to whoever did the inviting', () => {
    expect(page, 'the setup page must render the seat link').toContain('SeatLink');
    expect(page, 'and it needs the real link to show').toContain('seatUrl(appUrl');
  });

  it('shows it for everybody invited who has not come in yet, not just the last one', () => {
    expect(page).toContain('isNotNull(schema.users.seatToken)');
    expect(page).toContain('isNull(schema.users.acceptedAt)');
  });

  /*
    The wording has to match what this deployment can actually do. Promising an email that is never
    sent is worse than sending nothing: it tells somebody to go and wait for a thing that is not
    coming, and to blame their own junk folder for it.
  */
  it('never promises an email it cannot send', () => {
    expect(page, 'the page must know whether email is configured').toContain('emailOn');
    expect(page, 'the old unconditional promise must not come back')
      .not.toContain('An invite emails a login link');
  });

  it('offers a way to copy the link, and survives a browser that refuses', () => {
    expect(component).toContain('navigator.clipboard');
    // A refused clipboard must not leave the button claiming it copied.
    expect(component).toMatch(/catch\s*\{[\s\S]*setCopied\(false\)/);
    // The link is on screen and selectable whether or not copying works at all.
    expect(component).toContain('readOnly');
  });
});
