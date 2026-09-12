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
}

const VERCEL = 'In Vercel: your project → Settings → Environment Variables → Add New. Then Deployments → the top one → ⋮ → Redeploy.';

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
          fix: `Make a new key at resend.com → API Keys → Create API Key, then replace RESEND_API_KEY. ${VERCEL}`,
        }
        : email === 'no_verified_domain'
          ? {
            what: 'Inviting people by email',
            severity: 'limited',
            says: `${f.email?.detail ?? 'The sending domain is not verified.'} The key works; every invitation would still bounce.`,
            fix: 'In resend.com → Domains, add the sending domain and follow its DNS steps. Verification usually takes a few minutes once the records are in.',
          }
          : email === 'unreachable'
            ? {
              what: 'Inviting people by email',
              severity: 'limited',
              says: `Could not reach the email service to check.${f.email?.detail ? ` ${f.email.detail}` : ''} This does not mean it is broken — it means nobody can say right now.`,
              fix: 'Refresh in a minute. If it keeps saying this, the email service is having trouble rather than SPEC.',
            }
            : email === 'unknown'
              ? {
                what: 'Inviting people by email',
                severity: 'limited',
                says: 'A key is set, but it has not been tested, so nobody can say whether an invitation would arrive.',
                fix: 'Refresh the page — this one is checked live.',
              }
              : {
                what: 'Inviting people by email',
                severity: 'limited',
                says: 'No invitations can be sent yet. Everything else works — people can still be added, they just will not get an email.',
                fix: `Add RESEND_API_KEY when you are ready to invite somebody. ${VERCEL}`,
              },
  );

  out.push(
    has('ANTHROPIC_API_KEY')
      ? { what: 'SPEC reading a problem', severity: 'working', says: 'Working. A problem typed in plain words gets read properly.', fix: null }
      : {
        what: 'SPEC reading a problem',
        severity: 'limited',
        says: 'Problems are still logged, ranked and assigned — they just get the simple reading rather than the full one. This is exactly what the Basic tier is.',
        fix: `Add ANTHROPIC_API_KEY for the full reading. ${VERCEL}`,
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
