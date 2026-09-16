import { describe, it, expect } from 'vitest';
import { lines, verdict, type HealthFacts } from '../src/lib/site-health';

const healthy: HealthFacts = {
  required: { DATABASE_URL: true, NEXT_PUBLIC_SUPABASE_URL: true, NEXT_PUBLIC_SUPABASE_ANON_KEY: true, APP_URL: true },
  // Everything on means EVERYTHING — the three billing settings included, or "says working when
  // everything is on" would be quietly testing a page with billing half set up.
  optional: {
    RESEND_API_KEY: true, ANTHROPIC_API_KEY: true,
    STRIPE_SECRET_KEY: true, STRIPE_PRICE_SEAT_MONTHLY: true, STRIPE_WEBHOOK_SECRET: true,
  },
  database: { status: 'ok' },
  schema: { status: 'ok' },
  // Asked and answered. Leaving either out is itself a state — "not tested" — covered further down.
  email: { state: 'ok' },
  claude: { state: 'ok' },
};

/*
  Turning the AI key off means two things, not one: the setting is gone AND the live check says so.

  They are separate on purpose. The setting says what somebody typed into Vercel; the state says
  what Anthropic actually answered. A fixture that set only the first would be describing a
  situation that cannot happen, and testing against it would prove nothing about the real page.
*/
const noReading: HealthFacts = {
  ...healthy,
  optional: { ...healthy.optional, ANTHROPIC_API_KEY: false },
  claude: { state: 'no_key' },
};

const find = (f: HealthFacts, what: string) => lines(f).find(l => l.what === what)!;

describe('is the live site working', () => {
  it('says working when everything is on', () => {
    expect(verdict(lines(healthy))).toBe('working');
    expect(lines(healthy).every(l => l.fix === null)).toBe(true);
  });

  /*
    The rule the whole page turns on. SPEC with no AI key is a complete product — the Basic tier is
    exactly that, deliberately. Calling it broken teaches somebody to ignore a page whose only value
    is that it speaks up when something is actually wrong.
  */
  it('never calls a missing optional extra broken', () => {
    const f: HealthFacts = {
      ...noReading,
      optional: { RESEND_API_KEY: false, ANTHROPIC_API_KEY: false },
      email: { state: 'no_key' },
    };
    expect(verdict(lines(f))).toBe('limited');
    expect(lines(f).some(l => l.severity === 'broken')).toBe(false);
  });

  it('says problems are still logged without the AI key', () => {
    expect(find(noReading, 'SPEC reading a problem').says).toMatch(/still logged, ranked and assigned/);
  });

  it('puts signing in first, because it is the failure that costs a customer', () => {
    expect(lines(healthy)[0].what).toBe('People signing in');
  });

  it('calls a sign-in failure broken, whichever half is missing', () => {
    const noAuth = { ...healthy, required: { ...healthy.required, NEXT_PUBLIC_SUPABASE_ANON_KEY: false } };
    expect(find(noAuth, 'People signing in').severity).toBe('broken');
    expect(find(noAuth, 'People signing in').says).toMatch(/Nobody can sign in/);

    const noDb = { ...healthy, database: { status: 'failed', reason: 'The database refused the password in DATABASE_URL.' } };
    expect(find(noDb, 'People signing in').severity).toBe('broken');
    expect(find(noDb, 'People signing in').says).toMatch(/refused the password/);
  });

  it('names the drift when the build expects something the database has not got', () => {
    const f = { ...healthy, schema: { status: 'behind', says: 'users is missing notify_level.' } };
    expect(verdict(lines(f))).toBe('broken');
    const line = find(f, 'The site and the database agreeing');
    expect(line.says).toBe('users is missing notify_level.');
    expect(line.fix).toMatch(/Redeploy/);
  });

  it('does not pretend to have checked the shape when the database was unreachable', () => {
    const f = { ...healthy, database: { status: 'not_configured' }, schema: { status: 'not_checked' } };
    expect(find(f, 'The site and the database agreeing').says).toMatch(/not reachable/);
  });

  it('every fix says where to type it, not just what is missing', () => {
    const f: HealthFacts = {
      required: { DATABASE_URL: false, NEXT_PUBLIC_SUPABASE_URL: false, NEXT_PUBLIC_SUPABASE_ANON_KEY: false, APP_URL: false },
      optional: { RESEND_API_KEY: false, ANTHROPIC_API_KEY: false },
      database: { status: 'not_configured' },
      schema: { status: 'not_checked' },
    };
    for (const l of lines(f)) {
      expect(l.fix, l.what).toBeTruthy();
    }
    // The ones that need a setting typed in say where to type it.
    const withSettings = lines(f).filter(l => /Add [A-Z_]+/.test(l.fix ?? ''));
    expect(withSettings.length).toBeGreaterThan(0);
    for (const l of withSettings) expect(l.fix).toMatch(/Vercel/);
  });

  it('never leaks a value — only whether a setting is there', () => {
    const said = lines(healthy).map(l => `${l.says} ${l.fix ?? ''}`).join(' ');
    expect(said).not.toMatch(/re_[A-Za-z0-9]/);
    expect(said).not.toMatch(/postgres(ql)?:\/\//);
  });
});

/*
  The failure that prompted this: /status said "Working. Invitations can be sent." about a key that
  had been deleted an hour earlier, because it only checked that the SETTING existed.
*/
describe('whether email actually works, rather than whether a key exists', () => {
  const withEmail = (state: string, detail?: string): HealthFacts => ({ ...healthy, email: { state, detail } });
  const emailLine = (f: HealthFacts) => lines(f).find(l => l.what === 'Inviting people by email')!;

  it('never calls a refused key working, and says how to replace it', () => {
    const l = emailLine(withEmail('refused'));
    expect(l.severity).not.toBe('working');
    expect(l.says).toMatch(/refuses it/);
    expect(l.fix).toMatch(/resend\.com/);
  });

  it('catches the one nobody predicts — a good key with no verified sender domain', () => {
    const l = emailLine(withEmail('no_verified_domain', 'specbizhq.com has not been added to Resend at all.'));
    expect(l.severity).not.toBe('working');
    expect(l.says).toMatch(/has not been added to Resend/);
    expect(l.says).toMatch(/would still bounce/);
  });

  it('does not blame SPEC when the email service cannot be reached', () => {
    const l = emailLine(withEmail('unreachable'));
    expect(l.says).toMatch(/does not mean it is broken/);
  });

  it('says it has not been tested rather than claiming it works', () => {
    const notAsked: HealthFacts = { ...healthy };
    delete notAsked.email;
    expect(emailLine(notAsked).says).toMatch(/has not been tested/);
    expect(emailLine(notAsked).severity).not.toBe('working');
  });

  it('only says working when the key was accepted AND the domain is verified', () => {
    const l = emailLine(withEmail('ok'));
    expect(l.severity).toBe('working');
    expect(l.fix).toBeNull();
  });

  /*
    None of these stop anybody using SPEC. A business that never sends an invitation loses nothing,
    so a broken key must not put "Something is wrong" at the top of the page.
  */
  it('never makes an email problem the headline', () => {
    for (const state of ['refused', 'no_verified_domain', 'unreachable', 'no_key']) {
      expect(verdict(lines(withEmail(state))), state).toBe('limited');
    }
  });
});

/*
  ── The same failure, one line further down the page ─────────────────────────────────────────────

  The email line was fixed on 14 September after it said "Working. Invitations can be sent." about a
  key that had been deleted an hour earlier. The line below it went on checking a setting for two
  more days, and it is the worse of the two to get wrong.

  Email announces itself eventually: somebody does not get their invitation and says so. The reading
  never does. All five callers fall back to the simple reading and label it honestly, so a dead key
  produces no error, no complaint and no symptom — the product just quietly stops being the thing
  the front door promises, and keeps looking perfectly healthy while it does.
*/
describe('whether a problem actually gets read, rather than whether a key exists', () => {
  const withClaude = (state: string, detail?: string): HealthFacts => ({ ...healthy, claude: { state, detail } });
  const readingLine = (f: HealthFacts) => lines(f).find(l => l.what === 'SPEC reading a problem')!;

  it('only says working when a real reading came back', () => {
    const l = readingLine(withClaude('ok'));
    expect(l.severity).toBe('working');
    expect(l.fix).toBeNull();
  });

  it('says it has not been tested rather than claiming it works', () => {
    const notAsked: HealthFacts = { ...healthy };
    delete notAsked.claude;
    expect(readingLine(notAsked).says).toMatch(/has not been tested/);
    expect(readingLine(notAsked).severity).not.toBe('working');
  });

  it('says so when the key has been deleted or replaced', () => {
    const l = readingLine(withClaude('refused'));
    expect(l.severity).not.toBe('working');
    expect(l.says).toMatch(/refuses it/);
    expect(l.fix).toMatch(/console\.anthropic\.com/);
  });

  /*
    The one that will actually happen. A key never stops being valid on its own; credit runs out.
    And the fix is genuinely different — topping up needs no redeploy, so telling somebody to
    replace the key would send them round a loop that does not end.
  */
  it('tells the difference between a dead key and an empty account', () => {
    const l = readingLine(withClaude('no_credit'));
    expect(l.says).toMatch(/run out of credit/);
    expect(l.fix).toMatch(/Billing/);
    expect(l.fix, 'topping up needs no redeploy').toMatch(/no redeploy/);
    expect(l.fix, 'and must not send somebody to make a new key').not.toMatch(/API keys/);
  });

  it('says which model it asked for when the model is the problem', () => {
    const l = readingLine(withClaude('no_model', 'The model asked for was "claude-made-up".'));
    expect(l.says).toMatch(/claude-made-up/);
    expect(l.fix).toMatch(/ANTHROPIC_MODEL/);
  });

  it('does not blame SPEC when Anthropic cannot be reached', () => {
    expect(readingLine(withClaude('unreachable')).says).toMatch(/does not mean it is broken/);
  });

  /* Rate-limited means the key is good and the service is busy. That is working, not faulty. */
  it('does not treat being asked to slow down as a fault', () => {
    expect(readingLine(withClaude('busy')).severity).toBe('working');
  });

  /*
    SPEC with the simple reading is the Basic tier — a complete product somebody pays for. None of
    these may put "Something is wrong" at the top of a page that anybody on the internet can open.
  */
  it('never makes the reading the headline', () => {
    for (const state of ['refused', 'no_credit', 'no_model', 'unreachable', 'no_key']) {
      expect(verdict(lines(withClaude(state))), state).toBe('limited');
    }
  });

  it('never leaks the key, whatever Anthropic said', () => {
    for (const state of ['ok', 'refused', 'no_credit', 'no_model', 'unreachable', 'busy', 'no_key']) {
      const l = readingLine(withClaude(state, 'sk-ant-api03-SHOULD-NEVER-APPEAR'));
      expect(`${l.says} ${l.fix ?? ''}`, state).not.toMatch(/sk-ant-/);
    }
  });
});

/*
  ── The word somebody scans ──────────────────────────────────────────────────────────────────────

  Found by rendering the page, not by reading it. With a deliberately wrong API key the badge said
  "Not switched on" directly above the sentence "The key is there but Anthropic refuses it."

  The badge is derived from severity, and `limited` covers two opposite situations: never switched
  on, and switched on and failing. Somebody scanning the page reads the badge and not much else, so
  it was telling Kris to go and add a setting that was already there — while the key behind it was
  dead. Both halves of the page were individually correct and together they were misleading.
*/
describe('the badge never contradicts the sentence under it', () => {
  const failing: HealthFacts[] = [
    { ...healthy, claude: { state: 'refused' } },
    { ...healthy, claude: { state: 'no_credit' } },
    { ...healthy, claude: { state: 'no_model' } },
    { ...healthy, claude: { state: 'unreachable' } },
    { ...healthy, email: { state: 'refused' } },
    { ...healthy, email: { state: 'no_verified_domain' } },
    { ...healthy, email: { state: 'unreachable' } },
  ];

  it('does not say "not switched on" about something that is switched on and failing', () => {
    for (const f of failing) {
      for (const l of lines(f)) {
        if (l.severity === 'working') continue;
        expect(l.word, `${l.what}: ${l.says}`).toBeTruthy();
        expect(l.word, `${l.what}: ${l.says}`).not.toMatch(/switched on/i);
      }
    }
  });

  /* And the genuinely-never-set case must keep saying exactly that, which is the useful bit. */
  it('still says "not switched on" when nothing was ever set', () => {
    const never: HealthFacts = {
      ...healthy,
      optional: { RESEND_API_KEY: false, ANTHROPIC_API_KEY: false },
      email: { state: 'no_key' },
      claude: { state: 'no_key' },
    };
    for (const l of lines(never)) {
      if (l.severity === 'limited') expect(l.word, l.what).toBeUndefined();
    }
  });
});

/*
  ── Can SPEC take money? ─────────────────────────────────────────────────────────────────────────

  Added 16 September, the day Stripe was switched on — and found missing by the setup instructions,
  which told Kris to "check the Stripe line on /status". There wasn't one. A page whose entire job
  is answering "is SPEC working" said nothing about whether it could be paid.

  The states that matter are the PARTIAL ones. Off is normal and fine. Fully on is fine. In between,
  every combination fails silently and expensively, and none of them can be spotted by looking at
  Stripe's own dashboard.
*/
describe('whether SPEC can actually take a payment', () => {
  const stripe = (over: Record<string, boolean>): HealthFacts => ({
    ...healthy,
    optional: {
      ...healthy.optional,
      STRIPE_SECRET_KEY: false, STRIPE_PRICE_SEAT_MONTHLY: false, STRIPE_WEBHOOK_SECRET: false,
      ...over,
    },
  });
  const billing = (f: HealthFacts) => lines(f).find(l => l.what === 'Taking a payment')!;

  it('is on the page at all', () => {
    expect(billing(stripe({})), 'the line the setup document sends somebody to find').toBeTruthy();
  });

  /* Nobody being charged is not a fault. A business on a trial is working perfectly. */
  it('does not call "nobody is being charged" a problem', () => {
    const l = billing(stripe({}));
    expect(l.severity).toBe('limited');
    expect(l.says).toContain('Everything else works');
    expect(verdict(lines(stripe({})))).not.toBe('broken');
  });

  it('says working only when all three are set', () => {
    const l = billing(stripe({
      STRIPE_SECRET_KEY: true, STRIPE_PRICE_SEAT_MONTHLY: true, STRIPE_WEBHOOK_SECRET: true,
    }));
    expect(l.severity).toBe('working');
    expect(l.fix).toBeNull();
  });

  /*
    A key with no price: checkout cannot start. Looks configured from Stripe's side. The first
    person to find out is a customer landing on an error page after clicking upgrade.
  */
  it('catches a key with no price, which looks configured and is not', () => {
    const l = billing(stripe({ STRIPE_SECRET_KEY: true, STRIPE_WEBHOOK_SECRET: true }));
    expect(l.severity).toBe('broken');
    expect(l.says).toContain('checkout cannot start');
    expect(l.fix).toContain('STRIPE_PRICE_SEAT_MONTHLY');
  });

  /*
    THE EXPENSIVE ONE. Key and price but no webhook secret: Stripe takes the money, SPEC rejects the
    notification, and the customer is charged AND still locked out. Both dashboards look healthy.
    The only person who finds out is the one who paid.
  */
  it('SHOUTS about a missing webhook secret, which charges a customer and locks them out', () => {
    const l = billing(stripe({ STRIPE_SECRET_KEY: true, STRIPE_PRICE_SEAT_MONTHLY: true }));
    expect(l.severity).toBe('broken');
    expect(l.says).toContain('charged and still locked out');
    expect(l.says, 'and that nothing else will reveal it').toContain('Nothing looks wrong');
    expect(l.word).toContain('before anybody pays');
    expect(l.fix).toContain('STRIPE_WEBHOOK_SECRET');
  });

  it('catches a price and webhook with no key', () => {
    const l = billing(stripe({ STRIPE_PRICE_SEAT_MONTHLY: true, STRIPE_WEBHOOK_SECRET: true }));
    expect(l.severity).toBe('broken');
    expect(l.fix).toContain('STRIPE_SECRET_KEY');
  });

  /* Every partial state is broken. None of them may quietly read as fine. */
  it('treats every half-configured combination as broken', () => {
    const keys = ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_SEAT_MONTHLY', 'STRIPE_WEBHOOK_SECRET'];
    for (let mask = 1; mask < 7; mask++) {
      const over = Object.fromEntries(keys.map((k, i) => [k, Boolean(mask & (1 << i))]));
      expect(billing(stripe(over)).severity, JSON.stringify(over)).toBe('broken');
    }
  });

  it('never leaks a key, whatever is set', () => {
    const said = lines(stripe({ STRIPE_SECRET_KEY: true })).map(l => `${l.says} ${l.fix ?? ''}`).join(' ');
    expect(said).not.toMatch(/sk_(test|live)_/);
    expect(said).not.toMatch(/whsec_[A-Za-z0-9]/);
  });
});
