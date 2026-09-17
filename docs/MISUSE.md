# Ways people will not use SPEC properly

Kris, 17 September: *"consider all possible ways people will not use this properly - then lets test
ourselves on how simple and beautiful the system is - how intutive and responsive"*.

This is the first half. Every row is something a real person will do — most of them reasonably, a
few of them because SPEC invited it. The column that matters is the last one: **what happens now**,
and whether that is a sentence, a check, or nothing yet.

Three kinds of entry, and they are not the same problem:

| | |
|---|---|
| **Ours** | SPEC caused it. These get fixed, not documented. |
| **Answered** | Reasonable thing to do, handled, and `/help` says so in their words. |
| **Open** | Real, not yet handled. Named here so it is a decision rather than an oversight. |

---

## Getting in

| What they do | Kind | What happens now |
|---|---|---|
| Fill the sign-up form in under three seconds — password manager, or just quick | **Ours, fixed** | Used to bounce to an empty form reading "Press Create again." The wait is now served server-side and they never see it. `waitOutMs` |
| Get one box wrong and lose the other three | **Ours, fixed** | Every bounce now carries the name, business and email back into the boxes, and each message says so. The password never travels — it would sit in the address bar and in every log |
| Sign in with a personal address instead of the invited one | Answered | `/help` — "I cannot sign in", first answer, because it is the commonest cause by a distance |
| Forget the password | Answered | `/reset`, and `/help` explains that the same answer is given whether or not the address exists, so "no email" means "wrong address" |
| Open an invitation that has already been used | Answered | `/help` — sign out and open it again, or ask for a fresh one |
| **Two people from the same business both sign up** | Answered | Two separate businesses, split data. `/help` says pick one and invite everybody into it, and that nothing in the spare one is lost meanwhile. **Still the most expensive mistake available**, because it is silent — see Open, below |
| Bookmark a page, open it signed out | Answered | Every door sends them to sign-in; the usability journey checks all 25 and fails on any that shows a fault instead |
| Assume SPEC is broken when it is their password | Answered | `/status` is public and says plainly whether SPEC is up. Linked from `/signin` and `/help` |

## Setting it up

| What they do | Kind | What happens now |
|---|---|---|
| **Put people's names in as roles** — "Dave", not "Site Supervisor" | Answered | The classic org-chart mistake, and everything in SPEC hangs off getting it right. `/help` says it in one line: *a role is a JOB, not a person* — two people can do one role, one person can do three |
| Make everybody an administrator | Not possible | There is no access switch. Permissions follow the role, so the only way to change what somebody sees is to move them on the chart. `/help` says so and marks it as a deliberate refusal |
| Write twenty KPIs for one role | Answered | `/help`: two per pillar, twelve for a role, *"if you are adding the thirteenth, something else should come off"* |
| Write a KPI nobody can answer — "improve safety" | Answered | `/help` gives the test: if two honest people would answer it differently at month end, it needs rewording, not a better scoring system |
| Try to delete a KPI and find no delete button | **Answered, and it catches everybody** | Clearing the text is how a KPI goes. There is no button. `/help` spells it out because nothing on the screen does |
| Abandon setup half way | Answered | The six steps are derived from actual data, never ticked boxes, so leaving and coming back knows where they were — and a step can un-complete itself if the data changes |
| Wait until the systems are connected before starting | Answered | `/help`: SPEC works entirely on typed numbers and that is a complete way to run it. Connections are useful, never required, and not the thing to do first |
| Assume somebody from SPEC will set it up | Open | Nothing says otherwise on the way in. Worth a line on the landing page |

## The monthly rhythm

| What they do | Kind | What happens now |
|---|---|---|
| **Mark everything green to be kind** | Answered, and unfixable in software | The single thing that makes the whole product worthless. `/help` says it plainly: *a month with nothing amber in it is a month nobody looked at*, and that the fix is not in SPEC |
| Nobody marks anything; the month closes empty | Answered | `/help`: mark it roughly and honestly, because a blank month teaches the business that SPEC is optional |
| Mark something wrong and look for how to undo it | Answered | Mark it again — until the month is locked. `/help` explains why locked is final |
| Submit the month too early | Answered | Reopen works right up until it is signed. `/help` |
| One person marks everybody's roles | Open | Possible within scope rules (you may mark beneath you). Not wrong exactly — a GM marking a whole small business is legitimate — but it is how scoring becomes one person's opinion. No signal for it today |
| Sign off their own work on the register | Not possible | Refused with a sentence: *"Somebody else signs this off — it goes to the weekly meeting."* |

## Money

| What they do | Kind | What happens now |
|---|---|---|
| Not realise the second seat costs | Answered | Naming somebody on the chart is free and separate from inviting them — inviting is the billed act, and is a different press. `/help` and `/pricing` both say the first seat is free for good |
| Let the card expire, conclude SPEC broke | Answered | The read-only banner says what happened and offers the way out on the same line. `/help`: *nothing has been deleted, everything comes back the moment it is sorted* |
| Stop paying and expect their data deleted | Answered | It is not. Read-only, indefinitely. Deleting a business is deliberately not a button |
| Look for the $44 training seat | Answered | It is off sale until the supervisor pack is finished. Anybody already on one is not billed for it, and the administrator is told it is coming rather than left wondering |

## Data

| What they do | Kind | What happens now |
|---|---|---|
| Remove somebody who has history | Answered | The role stays and so does everything they scored — history belongs to the business, not to a login. `/help` says this, because it is the fear that stops people tidying up |
| Delete a KPI mid-month | Answered | Months already marked against it keep their marks |
| Add the same person twice under two emails | Open | Nothing detects it. Two seats, two sets of scores, and the duplicate is only visible by reading the chart |
| Rename a role and lose the thread | Answered | Roles are deactivated, never deleted, and history follows the role |

## On a phone

| What they do | Kind | What happens now |
|---|---|---|
| Open it on a phone on site | **Ours, fixed** | Two pages slid sideways — Executive summary by 211px, Conversation boards by 316px — so a third of each was off the edge. Both fixed, and every door is now measured at 390px on every run |
| Try to hit a small control with a thumb | **Ours, fixed** | The SPEC mark — the only navigation the product has — was 35px. Buttons were 36px. Footer links, including *Get help*, were 16px. All now measured against WCAG's floors on every run |
| Lose signal mid-save | Open | The form posts and fails. Nothing is lost from the page, but nothing tells them it did not save either |

## Expectations

| What they do | Kind | What happens now |
|---|---|---|
| Expect a board to be live when nothing is connected | Answered | A board never claims to be live while any input is missing, and names the feed that is the reason — because "partly current" reads as "current" on the screen where somebody drops a sell rate by ten dollars an hour |
| Confuse the Board with a board | Answered | Same word, two things. The door notes tell them apart and `/help` has the question outright |
| Want to tell us SPEC should work differently | Answered | `/intake`. If somebody has already asked, saying it again pushes it up the list |

---

## Still open, in the order worth fixing them

1. **Two people from the same business sign up separately.** Silent, expensive, and entirely
   foreseeable. A business signing up with an email domain SPEC has already seen could be told so —
   *"three people at jbielectrical.com.au already use SPEC. Did you mean to join them?"* — before a
   second business exists rather than after.

2. **Look-arounds accumulate.** Every press of "Have a look inside" provisions a real tenant, and an
   unclaimed one is never cleared. The journeys now clean up after themselves; production does not.

3. **The same person added twice under two emails.** Two seats, two sets of scores, no warning.

4. **A save lost to bad signal** says nothing. On a site, this is not rare.

5. **Nothing says SPEC is self-serve** on the way in, so somebody may sit waiting to be onboarded.

---

*The second half of Kris's question — how simple, intuitive and responsive it actually is — is
measured rather than argued, by `scripts/usability-journey.mjs`, on every run.*
