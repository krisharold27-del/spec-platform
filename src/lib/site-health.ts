/**
 * Is the live site working? — pure, no I/O.
 *
 * `/api/health` already answers this, in JSON, for a machine. This turns the same facts into
 * sentences, because the person who most needs the answer is the one who cannot read JSON and has
 * been finding out that something was wrong from a customer.
 *
 * Two rules shape every line below:
 *
 *   **Say what a person would experience, not what a setting is called.** "Nobody can sign in" is
 *   the fact; `DATABASE_URL` is trivia. The setting name appears only in the fix, where it is
 *   needed to type it in.
 *
 *   **A missing optional thing is never a fault.** SPEC with no AI key is a complete product — the
 *   Basic tier is exactly that, deliberately. Reporting it as a problem would teach somebody to
 *   ignore a page whose whole value is that it only speaks up when something is actually wrong.
 */

export type Severity = 'working' | 'limited' | 'broken';

export interface HealthLine {
  /** What a person would notice, in their words. */
  what: string;
  severity: Severity;
  /** One sentence on what is true right now. */
  says: string;
  /** Exactly what to do, or null when there is nothing to do. */
  fix: string | null;
  /**
   * The badge word, when the severity alone would get it wrong.
   *
   * `limited` means two different things — never switched on, and switched on but failing — and the
   * badge is the part somebody scans before reading anything. "Not switched on" beside "the key is
   * there but Anthropic refuses it" sends them hunting for a setting that is already set.
   */
  word?: string;
}

export interface HealthFacts {
  required: Record<string, boolean>;
  optional: Record<string, boolean>;
  database: { status: string; reason?: string };
  schema: { status: string; says?: string };
  /**
   * What Resend actually said when asked, rather than whether a setting exists.
   *
   * Optional, so this stays reasonable about a caller that has not asked — but when it is absent
   * the email line says it could not be established, never that email works. A page that reports
   * the presence of a setting instead of the working of a thing is confidently wrong at exactly
   * the moment somebody is relying on it. See lib/email.checkEmailSending.
   */
  email?: { state: string; detail?: string };
  /**
   * What Anthropic actually said when asked, rather than whether a setting exists.
   *
   * Same reasoning as `email` above, and the stakes are higher here because every caller degrades
   * so gracefully. A dead key raises no error anywhere in the product: the simple reading is served,
   * honestly labelled, and everything looks perfectly healthy. Nobody would find out by using it.
   * See lib/claude.checkClaudeReading.
   */
  claude?: { state: string; detail?: string };
}

const VERCEL = 'In Vercel: your project → Settings → Environment Variables → Add New. Then Deployments → the top one → ⋮ → Redeploy.';

/*
  Nothing key-shaped reaches the page, whoever put it in the sentence.

  The `detail` fields are written by SPEC and carry a model name or a status code — nothing secret.
  But they are the only free text on a page anybody on the internet can open, they come from code
  that talks to services which put keys in their own error messages, and this page's single
  promise is that it never shows the value of a setting. One future caller passing an error body
  straight through is all it would take, and that is not a promise to leave resting on everyone who
  edits this file afterwards remembering.

  Cheap, blunt, and it cannot be forgotten.
*/
const SECRET_SHAPED = /\b(sk-[A-Za-z0-9_-]+|re_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]{10,})|postgres(ql)?:\/\/\S+/gi;
const safe = (s: string | undefined): string => (s ?? '').replace(SECRET_SHAPED, '[removed]');

export function lines(f: HealthFacts): HealthLine[] {
  const out: HealthLine[] = [];
  const has = (k: string) => Boolean(f.required[k] ?? f.optional[k]);

  /*
    Sign-in first, always. It is the only failure that costs a customer: somebody who cannot get in
    does not file a bug, they decide the product does not work and they are right.
  */
  const authReady = has('NEXT_PUBLIC_SUPABASE_URL') && has('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const dbReady = f.database.status === 'ok';
  out.push(
    !authReady
      ? {
        what: 'People signing in',
        severity: 'broken',
        says: 'Nobody can sign in or sign up. The sign-in service is not connected.',
        fix: `Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. ${VERCEL}`,
      }
      : !dbReady
        ? {
          what: 'People signing in',
          severity: 'broken',
          says: `Signing in will fail. ${f.database.reason ?? 'The database is not answering.'}`,
          fix: `Check DATABASE_URL, and that the database is awake. ${VERCEL}`,
        }
        : { what: 'People signing in', severity: 'working', says: 'Working. People can sign up and sign in.', fix: null },
  );

  out.push(
    f.database.status === 'not_configured'
      ? {
        what: 'Where everything is kept',
        severity: 'broken',
        says: 'No database is connected, so nothing can be saved or read.',
        fix: `Add DATABASE_URL. ${VERCEL}`,
      }
      : f.database.status !== 'ok'
        ? {
          what: 'Where everything is kept',
          severity: 'broken',
          says: f.database.reason ?? 'The database is not answering.',
          fix: `Check DATABASE_URL, and that the database is awake. ${VERCEL}`,
        }
        : { what: 'Where everything is kept', severity: 'working', says: 'Working. The database is answering.', fix: null },
  );

  /*
    A deploy can succeed, the app can start, the database can answer, and the product can still be
    broken — because the build shipped expecting a column the database has not been given. That is
    a 500 on some screens and silence on the others, and it is the hardest failure to recognise
    from the outside, which is why it gets a line of its own.
  */
  out.push(
    f.schema.status === 'ok'
      ? { what: 'The site and the database agreeing', severity: 'working', says: 'Working. The database has everything this version needs.', fix: null }
      : f.schema.status === 'not_checked'
        ? { what: 'The site and the database agreeing', severity: 'broken', says: 'Could not be checked, because the database was not reachable.', fix: 'Fix the database first — the line above says how.' }
        : {
          what: 'The site and the database agreeing',
          severity: 'broken',
          says: f.schema.says ?? 'The database is missing something this version of SPEC expects. Some screens will fail.',
          fix: 'Redeploy. The deploy brings the database up to the build automatically. If it says the same thing after a redeploy, tell me.',
        },
  );

  /*
    Asked, not assumed.

    This said "Working. Invitations can be sent." about a key that had been deleted an hour
    earlier, because it only ever checked that the SETTING existed. Three different things break
    sending and they need three different answers — a refused key, a sender domain that was never
    verified, and Resend simply being unreachable, which is not a fault of ours and must never be
    reported as one.
  */
  const email = f.email?.state ?? (has('RESEND_API_KEY') ? 'unknown' : 'no_key');
  out.push(
    email === 'ok'
      ? { what: 'Inviting people by email', severity: 'working', says: 'Working. The key was accepted and the sending domain is verified.', fix: null }
      : email === 'refused'
        ? {
          what: 'Inviting people by email',
          severity: 'limited',
          says: 'The key is there but the email service refuses it — it has been deleted or replaced. Invitations would fail. Nothing else is affected.',
          word: 'Needs attention',
          fix: `Make a new key at resend.com → API Keys → Create API Key, then replace RESEND_API_KEY. ${VERCEL}`,
        }
        : email === 'no_verified_domain'
          ? {
            what: 'Inviting people by email',
            severity: 'limited',
            says: `${safe(f.email?.detail) || 'The sending domain is not verified.'} The key works; every invitation would still bounce.`,
            word: 'Needs attention',
            fix: 'In resend.com → Domains, add the sending domain and follow its DNS steps. Verification usually takes a few minutes once the records are in.',
          }
          : email === 'unreachable'
            ? {
              what: 'Inviting people by email',
              severity: 'limited',
              says: `Could not reach the email service to check.${f.email?.detail ? ` ${safe(f.email.detail)}` : ''} This does not mean it is broken — it means nobody can say right now.`,
              word: 'Needs attention',
              fix: 'Refresh in a minute. If it keeps saying this, the email service is having trouble rather than SPEC.',
            }
            : email === 'unknown'
              ? {
                what: 'Inviting people by email',
                severity: 'limited',
                says: 'A key is set, but it has not been tested, so nobody can say whether an invitation would arrive.',
                word: 'Needs attention',
                fix: 'Refresh the page — this one is checked live.',
              }
              : {
                what: 'Inviting people by email',
                severity: 'limited',
                says: 'No invitations can be sent yet. Everything else works — people can still be added, they just will not get an email.',
                fix: `Add RESEND_API_KEY when you are ready to invite somebody. ${VERCEL}`,
              },
  );

  /*
    Asked, not assumed — and here it matters more than anywhere else on this page.

    This line used to read the setting and say "Working. A problem typed in plain words gets read
    properly." It would have said that about a key that was deleted, mistyped, or attached to a
    Console with nothing left on it.

    Every other failure on this page announces itself: a database that will not answer takes the
    site down, a build that outruns its schema throws 500s. This one is silent by design. All five
    callers fall back to the simple reading and say so, which is exactly right for a customer and
    exactly wrong for the person who needs to know the key stopped working three weeks ago.

    SIMPLE IS NOT BROKEN. `limited` is used throughout, never `broken` — SPEC with no reading is the
    Basic tier, a complete product, and a status page that cries about it teaches somebody to stop
    reading the page.
  */
  const claude = f.claude?.state ?? (has('ANTHROPIC_API_KEY') ? 'unknown' : 'no_key');
  const READING = 'SPEC reading a problem';
  const SIMPLE = 'Problems are still logged, ranked and assigned — they just get the simple reading rather than the full one.';
  out.push(
    claude === 'ok'
      ? { what: READING, severity: 'working', says: 'Working. A real reading was asked for just now and came back.', fix: null }
      : claude === 'no_key'
        ? {
          what: READING,
          severity: 'limited',
          says: `${SIMPLE} This is exactly what the Basic tier is.`,
          fix: `Add ANTHROPIC_API_KEY for the full reading. ${VERCEL}`,
        }
        : claude === 'refused'
          ? {
            what: READING,
            severity: 'limited',
            says: `The key is there but Anthropic refuses it — it has been deleted or replaced. ${SIMPLE} Nothing else is affected.`,
            word: 'Needs attention',
            fix: `Make a new key at console.anthropic.com → Settings → API keys, then replace ANTHROPIC_API_KEY. ${VERCEL}`,
          }
          : claude === 'no_credit'
            ? {
              what: READING,
              severity: 'limited',
              says: `The key works, but the Anthropic account has run out of credit, so every reading is refused. ${SIMPLE}`,
              word: 'Needs attention',
              fix: 'Top up at console.anthropic.com → Billing. It starts working again by itself — no redeploy.',
            }
            : claude === 'no_model'
              ? {
                what: READING,
                severity: 'limited',
                says: `The key works, but the model it is asked for does not exist.${f.claude?.detail ? ` ${safe(f.claude.detail)}` : ''} ${SIMPLE}`,
                word: 'Needs attention',
                fix: `Clear ANTHROPIC_MODEL to go back to the built-in default, or set it to a current model. ${VERCEL}`,
              }
              : claude === 'busy'
                ? {
                  what: READING,
                  severity: 'working',
                  says: 'Working. Anthropic asked us to slow down for a moment, which means the key is good and the service is busy.',
                  fix: null,
                }
                : claude === 'unreachable'
                  ? {
                    what: READING,
                    severity: 'limited',
                    says: `Could not reach Anthropic to check.${f.claude?.detail ? ` ${safe(f.claude.detail)}` : ''} This does not mean it is broken — it means nobody can say right now.`,
                    word: 'Needs attention',
                    fix: 'Refresh in a minute. If it keeps saying this, Anthropic is having trouble rather than SPEC.',
                  }
                  : {
                    what: READING,
                    severity: 'limited',
                    says: 'A key is set, but it has not been tested, so nobody can say whether a problem would be read properly.',
                    word: 'Needs attention',
                    fix: 'Refresh the page — this one is checked live.',
                  },
  );

  /*
    ── Can SPEC take money? ───────────────────────────────────────────────────────────────────────

    Added 16 September, the day Stripe was switched on — and found missing by the instructions that
    told Kris to "check the Stripe line on /status". There wasn't one. A page whose whole job is
    answering "is SPEC working" said nothing at all about whether it could be paid.

    THREE STATES, AND THE MIDDLE ONE IS THE POINT.

    Off is fine and normal: a business on a trial is not being charged and nothing is wrong. Fully
    on is fine. What this line exists for is the state in between — SOME of the three settings
    present — because every one of those combinations fails silently and expensively:

      key, no price       checkout cannot start. Looks configured. Nobody finds out until somebody
                          tries to pay and lands on an error page.
      key and price, no webhook secret
                          Stripe takes the money and SPEC rejects the notification. The customer is
                          charged AND still locked out. Both dashboards look healthy. The only
                          person who finds out is the one who paid.

    Neither of those can be detected by looking at Stripe, and neither throws an error anywhere.
    This line is the only place they become visible.
  */
  const stripe = {
    key: has('STRIPE_SECRET_KEY'),
    price: has('STRIPE_PRICE_SEAT_MONTHLY'),
    webhook: has('STRIPE_WEBHOOK_SECRET'),
  };
  const onCount = Number(stripe.key) + Number(stripe.price) + Number(stripe.webhook);
  const TAKING_MONEY = 'Taking a payment';

  out.push(
    onCount === 0
      ? {
        what: TAKING_MONEY,
        severity: 'limited',
        says: 'Nobody is being charged. Everything else works — businesses can use SPEC in full, '
          + 'they are just not being billed for it.',
        fix: `Set STRIPE_SECRET_KEY, STRIPE_PRICE_SEAT_MONTHLY and STRIPE_WEBHOOK_SECRET. ${VERCEL}`,
      }
      : onCount === 3
        ? {
          what: TAKING_MONEY,
          severity: 'working',
          says: 'Working. Checkout can start, and SPEC will hear back from Stripe when somebody pays.',
          fix: null,
        }
        : !stripe.price
          ? {
            what: TAKING_MONEY,
            severity: 'broken',
            says: 'HALF SET UP. The key is there but the price is not, so checkout cannot start at all — '
              + 'anybody clicking upgrade lands on an error.',
            word: 'Needs attention',
            fix: `Add STRIPE_PRICE_SEAT_MONTHLY — the AUD seat price ID from Stripe. ${VERCEL}`,
          }
          : !stripe.webhook
            ? {
              what: TAKING_MONEY,
              severity: 'broken',
              says: 'HALF SET UP, AND THE DANGEROUS HALF. Stripe will take the money and SPEC will '
                + 'refuse the notification, so the customer is charged and still locked out. Nothing '
                + 'looks wrong from either dashboard.',
              word: 'Fix before anybody pays',
              fix: `Add STRIPE_WEBHOOK_SECRET — the signing secret from the webhook endpoint. ${VERCEL}`,
            }
            : {
              what: TAKING_MONEY,
              severity: 'broken',
              says: 'HALF SET UP. A price and a webhook are configured but the secret key is missing, '
                + 'so nothing can talk to Stripe at all.',
              word: 'Needs attention',
              fix: `Add STRIPE_SECRET_KEY. ${VERCEL}`,
            },
  );

  return out;
}

/**
 * The one word at the top.
 *
 * `limited` never outranks `working` into an alarm: a site with no AI key is working, and saying
 * otherwise on the page somebody checks at seven in the morning is how a status page stops being
 * read. Only a broken line makes this say broken.
 */
export function verdict(ls: HealthLine[]): Severity {
  if (ls.some(l => l.severity === 'broken')) return 'broken';
  return ls.some(l => l.severity === 'limited') ? 'limited' : 'working';
}

export const VERDICT_LINE: Record<Severity, string> = {
  working: 'SPEC is working.',
  limited: 'SPEC is working.',
  broken: 'Something is wrong.',
};

export const VERDICT_NOTE: Record<Severity, string> = {
  working: 'Everything a customer touches is working right now.',
  limited: 'Everything a customer touches is working. Some optional extras are not switched on — they are listed below and none of them stop anybody using SPEC.',
  broken: 'The lines marked below say exactly what, and what to do about it. Nothing else is affected.',
};
