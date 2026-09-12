# Readiness — can SPEC take a paying customer?

**Short answer: not yet, and the reasons are specific.**

Kris, 11 September: *"i want a scorecard and i want to know issues are fixed and
the system is stable — i cannot have paying customers until after we are sure."*

So this is written to be argued with. Everything below is **proven**, **assumed**
or **unknown**, and proven means there is a command you can run that fails if it
stops being true. Anything I have only reasoned about is assumed, however
confident the reasoning.

Dated 12 September 2026. Re-run the commands rather than trusting the date.

---

## Proven

Each of these is enforced by something that runs on every change.

| What | Evidence |
|---|---|
| The engine's arithmetic | 571 tests across 38 files. Pillar, role and team maths, the 90% rule, incentive ceilings, the deduction and its cap, the seven statuses, the rule of 8 — all measured against `designs/the-rules.md` |
| A customer can get in and stay in | `scripts/journey.mjs` — look around, sign up, keep the business you were looking at, sign out, sign back in. Driven in a real browser |
| A stranger's problem reaches their page | `scripts/frontdoor-journey.mjs`, 17 checks. The landing page promises "your page is waiting, with this problem already sitting in the middle of it" and the last check verifies exactly that |
| The improvement register works end to end | `scripts/register-journey.mjs`, 25 checks. Logged, read, ranked, assigned, accepted, marked done, raised again as one entry |
| A missing setting degrades one thing, not everything | CI builds once with **no database at all**. This is the exact failure that took production down on 11 September |
| The database schema builds from nothing, twice | CI migrates an empty Postgres, then repeats it to prove the migration is idempotent |
| It serves, not just compiles | CI starts the built app and requests real pages. "It compiled" and "it serves" are different claims |
| Colour is readable | Contrast measured against both grounds; the build fails if any band drops below 4.5:1 |
| A visitor can never write | One chokepoint, `assertWritable`, and the look-around journey checks it |
| A personal mailbox stays private | `tests/mail.test.ts` reads the source and fails if any query forgets. It found five leaks the day it was written |
| No query reads every business | `tests/tenant-isolation.test.ts`. It found six the day it was written, one of them a real cross-tenant bug |

Run them: `npx vitest run`, `npm run designs:check`, `npm run designs:coverage`,
and the three journey scripts.

---

## Assumed

True as far as I can tell by reading the code. **Nothing here has been executed
against the real thing.**

### Payment has never been taken

`src/lib/stripe.ts` and three API routes exist and typecheck. `STRIPE_SECRET_KEY`
has never been set in any environment I have run. **No payment has ever been
attempted, succeeded, failed, or been refunded.** A checkout that 500s on the
first real customer would be discovered by that customer.

### No email has ever been sent

`RESEND_API_KEY` is unset, so every send is logged and skipped. The invitation a
new seat depends on — "take your seat" — has never left the building. If the
sender domain is unverified, invitations land in spam and the customer's team
never arrives.

### Sign-in has never run against real Supabase

The journeys run against `scripts/fake-auth.mjs`, which speaks enough of the
provider's HTTP API for the real client to talk to it unmodified. That is a
genuinely strong test of *our* code and proves nothing about Supabase's
behaviour, its rate limits, or its email delivery.

### Tenant isolation rests on application code alone

**Corrected, 12 September.** I first reported "5 of 23 tables have a policy". That
was wrong — I had missed a loop covering eight more. The real figure was 12 of
23, and it is now **22 of 22**, with `rulebook_rules` global by design.

Two things were genuinely wrong, and both are fixed:

- The file referenced `claude_registrations`, **a table that does not exist**. It
  therefore aborted partway through, and every policy below that line — including
  `role_assignments`, `criteria`, `assessments`, `gates` and `board_outputs` —
  was never created. It now skips a table the database does not have.
- The file needs Supabase's `auth.uid()`, so our own Postgres could never apply
  it, which is why **nobody had ever run it.** `npm run db:check-rls` stubs that
  one function, applies the real file unmodified, runs it twice to prove the
  idempotence it claimed, and then asks the database what it actually got. It is
  in CI.

What remains true: the app connects as the role that owns the tables, which
Postgres lets bypass RLS. So for the app's own path RLS is still not the control
— `tests/tenant-isolation.test.ts` is. The policies now genuinely protect every
other route into the same database, which is what they were always for.

### The diagnosis has never been read by Claude

`ANTHROPIC_API_KEY` is unset everywhere I have run, so every diagnosis has come
from the deterministic fallback. The prompt is the design's own and the
invariants are enforced in code — but **no real reading has ever been seen**, and
the front door's whole argument is that the reading is good.

---

## Unknown

Things I have no way to answer from here.

- **Is production actually up?** The agent proxy blocks `vercel.app`, so I have
  never loaded the live site. Every claim above is about this repository.
- **Backups.** Whatever Supabase does by default. Never configured, never tested,
  never restored.
- **Load.** Never tested. The heaviest page runs a query per role in a loop.
- **Security review.** None. No dependency audit, no penetration test.
- **Legal.** Terms and Privacy are pages with words on them, written by me and
  never read by a lawyer. You are about to take money from businesses and hold
  their staff records.
- **Accessibility beyond colour.** Contrast is measured. Keyboard navigation and
  screen readers are not.

---

## Before the first paying customer

In order. The first three are the ones that would be discovered *by the customer*.

1. **Send a real invitation.** Verify the sender domain, invite yourself from a
   second address, and confirm it does not land in spam. Without this a
   customer's team never arrives.
2. **Sign in against real Supabase**, on the live site, as a person who has never
   signed in before.
3. **Turn on `ANTHROPIC_API_KEY`** and read ten real problems. The front door
   claims SPEC understands their business; check that it does.
4. **Apply the policies to the live database.** ~~Write the missing 18~~ — done,
   22 of 22, and CI now proves the file runs. What is left is running it against
   the live database once and confirming.
5. **Restore a backup** into a scratch database. A backup nobody has restored is
   a belief.
6. **Have somebody who is not you** sign up, on a phone, without help.
7. **Take a real payment — last, by Kris's instruction.** Stripe in test mode end
   to end, then one live transaction you refund. Nothing above depends on it, and
   there is no point proving the till works before the shop does.

None of these is large. All seven are a day's work together, and every one of
them is currently a thing you would find out about from a customer rather than
from a test.

---

## What this document is not

It is not a statement that the product is bad. The engine is correct against a
specification that is itself settled, the four journeys a customer takes are
proven in a browser on every change, and three real bugs were found by tests
written in the last hour — a cross-tenant date leak, five queries that could show
a private mailbox to a whole business, and a colour palette nobody could read.

That is a system that catches things. It is not yet a system that has been
through the one test that matters, which is a real person paying real money and
getting what they paid for.
