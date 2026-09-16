# Readiness — can SPEC take a paying customer?

**Short answer: not yet, and the reasons are specific.**

Kris, 11 September: *"i want a scorecard and i want to know issues are fixed and
the system is stable — i cannot have paying customers until after we are sure."*

So this is written to be argued with. Everything below is **proven**, **assumed**
or **unknown**, and proven means there is a command you can run that fails if it
stops being true. Anything I have only reasoned about is assumed, however
confident the reasoning.

Dated 16 September 2026. Re-run the commands rather than trusting the date.

**The last two steps are fixed, by Kris's instruction:** the Anthropic API key and
Stripe go in *after* everything else is finished, in that order. Nothing above
them depends on either — the product is complete and honest without both, which is
what makes leaving them until last a decision rather than a delay.

---

## Proven

Each of these is enforced by something that runs on every change.

| What | Evidence |
|---|---|
| The engine's arithmetic | 924 tests across 63 files. Pillar, role and team maths, the 90% rule, incentive ceilings, the deduction and its cap, the seven statuses, the rule of 8 — all measured against `designs/the-rules.md` |
| A customer can get in and stay in | `scripts/journey.mjs` — look around, sign up, keep the business you were looking at, sign out, sign back in. Driven in a real browser |
| A stranger's problem reaches their page | `scripts/frontdoor-journey.mjs`, 17 checks. The landing page promises "your page is waiting, with this problem already sitting in the middle of it" and the last check verifies exactly that |
| The improvement register works end to end | `scripts/register-journey.mjs`, 25 checks. Logged, read, ranked, assigned, accepted, marked done, raised again as one entry |
| A missing setting degrades one thing, not everything | CI builds once with **no database at all**. This is the exact failure that took production down on 11 September |
| The database schema builds from nothing, twice | CI migrates an empty Postgres, then repeats it to prove the migration is idempotent |
| It serves, not just compiles | CI starts the built app and requests real pages. "It compiled" and "it serves" are different claims |
| Colour is readable | Contrast measured against both grounds; the build fails if any band drops below 4.5:1 |
| A visitor can never write | One chokepoint, `assertWritable`, and the look-around journey checks it |
| A personal mailbox stays private | `tests/mail.test.ts` reads the source and fails if any query forgets. It found five leaks the day it was written |
| No query reads every business | `tests/tenant-isolation.test.ts`. It found six the day it was written, one of them a real cross-tenant bug — and a seventh on 12 September, before it shipped |
| A seat can be taken exactly once | `scripts/seat-journey.mjs`, 14 checks. Single use, expiring, bound to that address, and a refusal that never says "invalid token" |
| Every table is isolated in the database too | `npm run db:check-rls` applies the real policy file and then asks Postgres what it actually got. **28 of 28** |
| A stranger with the project URL can change nothing | The same command stands up a role with exactly what PostgREST hands an anonymous caller, then tries it: reads the shared rulebook (must work) and deletes it (must not). Added 15 September after Supabase found `rulebook_rules` open to anonymous **delete** |
| The product carries what the designs say | `npm run designs:coverage` — **175 of 175** headings and **473 of 473** labels, per design screen, named individually when one is missing |
| **SPEC Business Solutions' own numbers reach nobody else** | `/cockpit` is not part of the client product. It is the founder's own page for the company that sells SPEC — revenue, client count, the road to 20,000 seats — and it concerns no customer at all. `scripts/cockpit-journey.mjs` drives two real people: an ordinary customer, who is redirected away and is shown none of it on the way past, and an allowlisted address, which gets in. Gated on `ADMIN_EMAILS`, checked on the server on every request — a hidden link is not access control, and the address is guessable |
| The goals survive being set | `scripts/goals-journey.mjs`, 22 checks. Set at step one, visible afterwards on the board pack and monthly scoring, and gone from both when cleared |
| SPEC reads the chart and the leader decides | `scripts/predict-journey.mjs`, 18 checks. Runs with **no API key**, finds a real gap, and a denied role is never proposed again |
| **Which parts of a role a process could do — and who may see that** | `scripts/automation-journey.mjs`, 22 checks. It drives the real page: every verdict carries its reason, the section saying what must STAY with a person is present, hours nobody counted produce no figure, six hours somebody DID count produce one, and no dollar amount is invented from a rate nobody set. The last checks are the point — another business never sees this one's review, and a stranger is sent to sign in |
| The goal reaches a scorecard without setting anybody's target | `scripts/cascade-journey.mjs`, 17 checks. The last one opens the role's own KPI page and confirms the agreed target is still empty |
| An expired ticket stops somebody working | `tests/obligations.test.ts`. It caught a real defect before release: a licence expiring **today** was reported expired, which would have blocked people who were fine |

**One command runs all of it: `npm run check`.** It prints one line per thing in
plain words and ends with a verdict. A skip is never counted as a pass, and
"I could not check this" and "this is broken" are different sentences.

Last run, 16 September: **WORKING — all 11 checks passed**.

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

### The automation review has never been opened by a manager

The gate — Managing Director, CEO and board only — is one function,
`mayReadAutomationReview`, called by both the page and the server action, and
`tests/automation.test.ts` proves it refuses every level below the top of the
chart. `scripts/automation-journey.mjs` then proves the real thing for the two
cases it can reach without an invitation: another business never sees this one's
review, and a signed-out stranger is sent to sign in.

What has **not** been done in a browser is the case in the middle: a manager,
inside the same business, signed in as themselves, opening that URL. That needs a
second seat, which needs an invitation, which needs `RESEND_API_KEY` — step 1 of
the list below. It is the same code path as the two that are proven, and I still
would not call it proven until somebody has actually tried it.

Do it the day the first invitation goes out.

### Sign-in has never run against real Supabase

The journeys run against `scripts/fake-auth.mjs`, which speaks enough of the
provider's HTTP API for the real client to talk to it unmodified. That is a
genuinely strong test of *our* code and proves nothing about Supabase's
behaviour, its rate limits, or its email delivery.

### Tenant isolation rests on application code alone

**Corrected, 12 September.** I first reported "5 of 23 tables have a policy". That
was wrong — I had missed a loop covering eight more. The real figure was 12 of
23, and it is now **28 of 28**, with `rulebook_rules` global by design and
`health_pings` locked to everybody. Every table added since — the goals, the
predicted roles, the cascade — was added to the policy file in the same commit
as the schema, and `npm run db:check-rls` fails if one ever is not.

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

### The key is on. Nothing has been read by a person yet

`ANTHROPIC_API_KEY` was set in Vercel and deployed on 16 September 2026, and the
live site confirms it the only way worth confirming: `/status` asks Anthropic for
a real reading every fifteen minutes and reports what came back. It says
**working**.

That settles the half of step 5 that is plumbing. It does not settle the other
half. **No real reading has ever been judged by a person.** The prompts are the
design's own and the invariants are enforced in code, but the front door's whole
argument is that the reading is good, and nobody has yet typed ten real problems
into it and decided whether it is.

Until somebody has, the honest position is that five things — the front-door
diagnosis, the category mapping, the predicted roles, the KPI cascade and the
board pack's written draft — are now asking Claude instead of falling back, and
what they get back is unreviewed.

Worth keeping in view: every one of them still **degrades honestly** if the key
dies, the credit runs out or Anthropic is down, and says which reading you are
looking at. That is why this step could safely be left until last. It is also why
a dead key would produce no error and no complaint — which is what `/status` now
exists to catch, because nothing else would.

---

## Unknown

Things I have no way to answer from here.

- **Is production actually up?** The agent proxy blocks the live host, so I have
  never loaded the site in a browser. `npm run check` now asks GitHub's own
  commit-status API instead and reports the deployed commit, which answers "is
  what I just pushed live?" but not "does it look right to a person".
- **Backups.** Whatever Supabase does by default. Never configured, never tested,
  never restored. Still step 3.
- ~~**Load.**~~ **Tested, 13 September.** `scripts/load-test.mjs` stands up 20,028
  seats against a local Postgres and found three real scaling faults, including a
  missing index that read 16,008 rows to return 24. Never run against the live
  database, and never with 20,000 people using it at once — what was measured is
  the shape of the queries, not the hosting.
- **Security review.** None. No dependency audit, no penetration test.
- **Legal.** Terms and Privacy are pages with words on them, written by me and
  never read by a lawyer. You are about to take money from businesses and hold
  their staff records.
- **Accessibility beyond colour.** Contrast is measured. Keyboard navigation and
  screen readers are not.

---

## Before the first paying customer

In order, and the order is now fixed. Kris, 14 September: *"adding an anthropic
api key and stripe completion are the final 2 steps once everything else is
complete."*

### Before JBI, specifically

JBI can be migrated onto SPEC **now**, and the first two below are the only ones
that have to happen before their crew touches it.

- **Put them on the free beta.** /admin → the business → Billing → Beta. Nothing
  is charged however many people are in it, and it survives Stripe being switched
  on later. Without it they would be free only because the till is not plugged in,
  and the first live invoice would go to the person who agreed to be the guinea
  pig.
- **Invite by link, not by email.** No invitation has ever been sent, so use the
  copyable seat link on Setup → Your business. One link each, single use, bound to
  that address. Proven by `scripts/seat-journey.mjs`.
- **Prove sign-in with ONE person first.** Nobody has ever signed in against real
  Supabase who had not signed in before. Do it with one JBI person before handing
  links to forty.
- **Know that no backup has ever been restored.** That is step 3 below, and it
  matters more the moment the data is a real business's.

### First — the things a customer would find out for you

1. **Send a real invitation.** Verify the sender domain, invite yourself from a
   second address, and confirm it does not land in spam. Without this a
   customer's team never arrives.
2. **Sign in against real Supabase**, on the live site, as a person who has never
   signed in before.
3. **Restore a backup** into a scratch database. A backup nobody has restored is
   a belief.
4. **Have somebody who is not you** sign up, on a phone, without help.

None of those four is large, and every one is currently something you would hear
about from a customer rather than from a test.

### Then — and only then — the two keys

Both of these are a paste into a settings box and a redeploy. Neither is a build,
and nothing above depends on either: **the product is complete and honest without
both.** That is what makes leaving them until last a decision rather than a delay.

Neither key is ever pasted into a chat, an email, a document, or a commit. It goes
from the console that issued it straight into the Vercel settings box, and nowhere
else. A key that has been seen outside that path is burnt and has to be reissued —
this has already happened once, to a Resend key, and reissuing takes under a
minute where finding out later does not.

5. **Turn on `ANTHROPIC_API_KEY`** ✅ — *and read ten real problems* ⬜

   The key went in on 16 September 2026 and `/status` says **working**, which it
   only says after asking Anthropic for a real reading and getting one back. The
   plumbing half is done and provable.

   The half that is left is the one that matters, and it is not something I can
   do: **type ten real problems into the front door, in the words a sparky would
   use, and decide whether the reading is any good.** The whole landing page is an
   argument that it is. Nobody has tested that argument yet.

   Do it before JBI sees it, not after.

   No code change was needed. One redeploy — Vercel binds environment variables
   when a deployment is built, so a key added to the settings box does nothing
   until the next deploy picks it up. There is a Redeploy button on the latest
   deployment; that is the whole of it.

   The Console needs credit on it. Without any, the key is valid and every call is
   refused, which looks exactly like not having a key at all: the product falls
   back to the deterministic reading and says so, and nothing appears to be wrong.
   (Funded, $100, 16 September 2026.)

   **Set a monthly spend limit in the Console at the same time.** One endpoint in
   SPEC spends money for people who are not signed in — the front door's problem
   box, `src/app/api/enquiry/route.ts` — because that free reading is the entire
   argument of the landing page. It is capped two ways: one paid read per cookie,
   and twelve an hour from any one address, after which everybody still gets a
   reading, just the deterministic one. Nobody is ever turned away.

   That address cap is a floor and not a ceiling. It counts in the memory of the
   server instance that handled the request, so a busy site with several instances
   running counts several times over, and a spread of addresses is not held to any
   single one of those tallies. Against one person it holds; against a thousand
   machines it does not.

   The limit that does hold is the one Anthropic enforces. A monthly ceiling in
   the Console bounds the worst case absolutely, whatever anybody points at the
   front door, and the failure when it is reached is the good one: the product
   falls back to the deterministic reading and keeps working.

   The other four callers are all behind a sign-in, so their spending is bounded
   by paying customers doing their jobs.

   What changed when it went on — and what to judge when reading the ten:

   | | Before the key | Now |
   |---|---|---|
   | A problem typed on the front door | The deterministic reading — right about the pillars, generic about the business | Claude's reading of their actual words |
   | Predicted roles | The structural half: a stream nobody owns, a pillar nobody measures, a span past seven. True and checkable | That, **plus** a judgement about their trade against their own goals |
   | The KPI cascade | Where the goal has nobody moving it. It refuses to invent a number | The measure **and** the figure, cascaded top down |
   | The board pack | The written draft as generated | Rewritten in plain terms for an owner |

   Every one of those still degrades honestly rather than breaking if the key
   dies, the credit runs out or Anthropic is down, and says which reading you are
   looking at — that is what made leaving this until last safe. It is also why a
   dead key would raise no error and draw no complaint, which is what `/status`
   is now for.

   **Still not done: the reading has never been judged.** Right column, ten real
   problems, a person deciding. Until then the front door is making a promise
   nobody has checked.

6. **Take a real payment.** Stripe in test mode end to end, then one live
   transaction you refund. `src/lib/stripe.ts` and three API routes exist and
   typecheck; `STRIPE_SECRET_KEY` has never been set in any environment, so **no
   payment has ever been attempted, succeeded, failed, or been refunded.**

   Last, because there is no point proving the till works before the shop does.

---

## Designed but not built

Design coverage is back to **100%** on both tiers as of 14 September — the three
features export 5 added are built. What is left below is what remains. These are
gaps, not disagreements — `designs/superseded.md` is for wording the product is
RIGHT not to carry, and "we have not built it yet" is explicitly not allowed
there. It belongs here, where it is uncomfortable.

From **design export 5**, 14 September 2026:

| Not built | What it is |
|---|---|
| ~~**Predicted roles — approve or deny**~~ | **Built, 14 September.** SPEC reads the structure and proposes what is missing, each with a reason, and nothing is real until the leader approves it. The structural half is arithmetic on their own chart and runs with no API key at all; Claude's half layers on top where there is one, and each proposal says which it came from. A denied role is never proposed again. `scripts/predict-journey.mjs`, 18 checks |
| ~~**Goals as Setup step 1**~~ | **Built, 14 September.** Three questions before any role or KPI exists, visible afterwards on the board pack and monthly scoring. `scripts/goals-journey.mjs`, 22 checks |
| ~~**Predictive KPIs from the goal**~~ | **Built, 14 September.** The goal worked down the chart, top first. Adopting a row writes the figure as a PROPOSAL and leaves the agreed target empty — SPEC may suggest what a role measures and may never set the number a person is judged against. `scripts/cascade-journey.mjs`, 17 checks |
| **The per-person incentive gate** | A second precondition on Ace beyond being signed off — the business has to have opened the incentive to that person. Until then no months count and the card reads "Incentive not open". One additive column on `role_assignments` |
| **Bring your own AI key** | Connections gains a provider choice: Claude, your own API key, another AI |
| **Viewing the chart from one role** | A "viewing as" selector, plus a team-count badge that collapses a branch |

The coverage check names only the first two, because they are headings. The rest
are body copy and behaviour, which it cannot see — and that limitation has now
cost three visual faults nobody caught. Worth stating plainly: **design coverage
proves the product SAYS what the designs say. It never proves the product looks
or behaves like them.**

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

---

## Why it felt like a problem every day

Worth writing down, because the answer changes what to do about it.

Almost none of it was new breakage. It was **old breakage becoming visible**,
because the checks that look for problems were only built in the last few days —
before that, "is it working?" was answered by me re-reading my own work, which
is the one method guaranteed to miss whatever I misunderstood the first time.

Every defect found since has been found by something that runs on its own:

- the seat could only be taken once and then said the wrong thing on a second
  click — found by a browser driving the real link
- five queries could show one person's private mailbox to their whole business —
  found by a test that reads the source
- seven queries read across every business, one of them a genuine leak — same
- a ticket expiring *today* was reported as expired, which would have blocked
  people who were fine — found by its own test, before release
- the row-level security file had never once been run, and aborted partway on a
  table that does not exist — found by applying it for real
- three of four signal colours were unreadable as text — found by measuring

The rate of discovery is high because the *looking* is new, not because the
product got worse. It will fall. What should not fall is the looking: everything
above is now in `npm run check` and in CI, so none of them can come back quietly.
