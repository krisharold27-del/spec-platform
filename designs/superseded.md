# Design elements the product deliberately does not carry

`npm run designs:coverage` asks one question — **does the product say what the
designs say?** — and its value is entirely in the number being trustworthy. A
check stuck below 100% for reasons everybody has agreed to stops being read, and
then the day it drops for a real reason, nobody notices.

So when a design element is deliberately superseded, it is written down **here**,
with the decision behind it, and the coverage check skips it. This file is the
audit trail: adding a line is a deliberate act that shows up in a diff and has to
be justified, which is the opposite of quietly lowering the bar.

A line is only allowed here when the product is RIGHT not to carry the wording.
"We have not built it yet" is not a reason — that is a gap, and it belongs on the
readiness list where it is uncomfortable.

## The list

### `Add another business — coming soon`

**Design:** SPEC My Page — an item in the account dropdown, beside the business
name and Sign out.

**Why the product does not carry it:** that dropdown no longer exists. SPEC has
no navigation bar at all — the shape is a landing page for arriving, then My
Page, and everything else branching from the bottom of it. The account menu went
with the toolbar.

The capability itself is not lost. Somebody holding seats in more than one
business gets a **Your group** section with Group and Switch business in it, from
`lib/doors`. What is gone is a menu item advertising something unbuilt to the
95% of customers who have exactly one business, on the screen they open every
morning. A permanent "coming soon" on a daily page is clutter that ages badly.

**Decided:** 13 September 2026, with the navigation bar.

### `of met`

**Design:** `SPEC My Page.dc.html` — the second line of the "Everything else" row in
the Virtual GM Power Meter breakdown: `{{ gm.otherMet }} of {{ gm.otherTotal }} met
{{ gm.otherArrow }}`.

**Why the product does not carry it:** it was never a phrase, only the connective
tissue of one. `labels()` strips every `{{ }}` template hole and keeps whatever
English survives either side, and here that is two words with a number's worth of
meaning removed from between them — "of" belonging to the count before it, "met"
to the count after. The product's own equivalent, `{reading.sharedMet} of
{SHARED_SLOTS} met` in `src/components/power-meter.tsx`, says the identical thing
with the numbers present, which is the whole point of the row: it exists to tell
somebody 3 of 20 met, not to say "of met" on its own. No wording is missing from
the page — the fragment just cannot appear verbatim in source the way the design's
static markup happens to, once a real count sits where the design left a hole.

**Decided:** 20 September 2026, chasing why `designs:coverage --deep --enforce`
would not clear 100% on a page nobody had touched.

### `Virtual GM Power Meter Hack Your Power`
### `Hack Your Power`

**Design:** `SPEC My Page.dc.html` — the Power Meter pill's tagline. The 23 September export
arrived saying **Hack** Your Power again.

**Why the product does not carry it:** the word is **HACC**, deliberately. Kris, 22 September:
*"its not hack - its HACC - Haness [Harness] Anterior Cingulate Cortex - the key concept of the
training and programs to improve performance."* Commit c0b7865 corrected the product, the test that
pins the pill and the design file itself; the design tool has since re-exported its own pun over the
correction. `src/components/power-meter.tsx` keeps **HACC Your Power**, and
`tests/power-meter.test.ts` holds it there. Reverting the product to match the export would undo a
decision the owner made in words.

The first line is the same tagline glued to the label by the design's single `<button>` — see
`Virtual GM Power Meter HACC Your Power` in `designs/pinned.md` for why the check reads it that way.

**Decided:** 22 September 2026 (the word); recorded here 23 September 2026, when the export reverted it.

## Screens that are not product screens

Some pages in the design project are references rather than things the product
builds: explorations, palettes, logo studies. They belong in the project — that
is where design thinking lives — but holding the code to their wording would mean
shipping a page about logo options to customers.

Listed the same way and for the same reason: a deliberate line in a diff.

### Screen: SPEC Logo Concepts

A study of logo directions and what the mark's motion is meant to say. The mark
itself IS in the product — `src/components/spec-mark.tsx` draws the ring and the
hand from a real score — but the page comparing candidate concepts is a design
document, not a screen anybody signs in to see.

**Decided:** 13 September 2026.

### Screen: SPEC Mascot

The confirmed mascot silhouette — the feathertail glider, in the brand accent,
locked. A brand reference like the logo study: the mascot appears in the product
where it belongs, but the page declaring it is a design document, not a screen
anybody signs in to see.

**Decided:** 13 September 2026.

### Block: `SPEC Training` — the four non-negotiables, tinted by pillar

Design export 7 added *How SPEC manages people* to the training screen, and the
block is built: the stance, the four non-negotiables and the reading list are all
on `/training`, word for word.

One thing is deliberately not carried across. The design gives each of the four its
own colour — green Safety, **red People**, blue Earnings, rust Compliance — as an
identity. SPEC has an older rule, written into `src/lib/pillars.ts` and enforced by
the `Badge` component: **colour says how something is GOING, never what it IS.**
Pillar colours are kept out of `PILLAR_META` on purpose, because the wrong thing
should be hard to reach.

Painting People red as an identity would make that pillar read as failing — on the
one page whose entire argument is that failure is management's doing and fixable.
So the letter badges carry the identity and the cards stay neutral.

If the rule ever changes, it changes in `lib/pillars.ts` for the whole product and
not on one screen. `tests/manage-people.test.ts` fails if the block starts
hard-coding those four hex values.

**Decided:** 17 September 2026.

---

### `Close the open corrective action from the yard inspection`
### `Finish psychosocial safety basics`
### `Working at heights today`

A prototype has to put *something* on the screen, and these are that something: three
invented rows in the demo data of My Page and the mobile field view — a corrective
action at a made-up yard, a training module due, a toolbox talk about scaffold work.

SPEC writes those lines itself, from a real business's real month. "Hold the missed
one-to-one with Tom Alderson" is generated from an actual missed one-to-one; the
words around it are already in the product and already checked. Carrying the
prototype's particular examples would mean hard-coding somebody else's to-do list
into everybody's.

Two of the three are nearly real and worth saying so, because that is what made them
look like gaps rather than data:

**Psychosocial safety basics** is a genuine SPEC training module — `seed/training_modules.json`
has shipped it all along. Only the word *Finish* in front of it is the prototype's.
This check now reads `seed/` as well as `src/` for exactly that reason.

**Corrective actions** are real too: obligations and the Zero Harm gate both hold
them. The yard inspection is not.

**Decided:** 18 September 2026, when the `scripted()` tier started reading the labels
prototypes build in code rather than write in markup — which is how the org chart's
missing right-click menu had stayed invisible at 100% coverage.

---

### `Divisional whales (~20 customers)`

The growth plan in `SPEC Cockpit.dc.html` names one channel "divisional whales". SPEC's own
copy says **"Divisional customers (~20 of them)"** — same twenty customers, same four
thousand seats, different word.

"Whale" is sales-desk slang for a customer big enough to carry a quarter. It is a fine word
in a spreadsheet and the wrong one on a screen Kris will one day turn round to show somebody.
The cockpit is a founder's page today; it is a board page later, and the people described as
whales are the people in the room.

Not a rewording of a feature — the row, the number and the reasoning are identical.

**Decided:** 18 September 2026.

---

### Screen shape: the two pricing tiers

`SPEC Pricing.dc.html` shows SPEC Basic beside SPEC Advanced, and a comparison
table with a column for each. The product no longer has either.

Kris, 18 September: *"take away the basic and advanced - either use the system with
1 person yourself for free - or add everyone and pay $26 per seat. SPEC is sure you
will want everyone in here once you feel the power and productivity improvement
potential."*

Three things were wrong with the two tiers, and they compounded.

**It was not a price.** The pricing page said both tiers cost the same money,
because it is the same system. So the only thing the choice did was take features
away for nothing in return, and there is no honest sentence explaining why somebody
would pick that.

**The default punished the newcomer.** A new business landed on Basic, so the one
screen that has to argue for the product carried an upsell strip and an Ask box
saying asking came with Advanced. Free and crippled is a different offer from free.

**It argued against the pitch.** SPEC's whole claim is that connecting the systems
is where the productivity comes from. A tier that shipped with connectors switched
off was the product disagreeing with itself on its own pricing page.

Every ROW of that comparison survives, as `EVERYTHING_IN_IT` in `lib/plan` — the
same six things, with the columns taken off, because there is nothing left to
compare. The wording is therefore all still present and the coverage check is
unaffected; what changed is the shape, which is why this is recorded here rather
than left to be noticed as drift.

`tenants.tier` stays in the schema and is no longer read. Migrations here are
additive by design, and dropping a column on the way past is how a rollback becomes
a data loss.

**Decided:** 18 September 2026.

### `Simpro linked · jobs, sites, crews and vehicles`

**Design:** `SPEC Safety.dc.html` — the status pill in the page header.

**Why the product does not carry it:** it names a vendor, and the never list is
explicit — connectors are by category, never by vendor, in the schema or the UI.
The designs were drawn around one client's job system (DECISIONS.md, 11
September: build the shape generically). `/safety` carries the same pill by
category: *"Your job system is linked · jobs, sites, crews and vehicles"* when a
live job-management connection exists, and *"Manual · no job system connected"*
when it does not — manual being a complete mode, not a lesser one.

**Decided:** 23 September 2026, building `/safety`.

### `Tagged to your Simpro job:`

**Design:** `SPEC Safety.dc.html` — the line under the one-line report box.

**Why the product does not carry it:** the same rule — no vendor names. The
report box says *"Tagged to your job"* (and *"from your job system"* when one is
connected), with the job the person last reported against, and lets them change
it. Nothing about the behaviour is lost; only the brand is.

**Decided:** 23 September 2026, building `/safety`.


---

### `Use Priya's photos and message`
### `Use the Epping plans from Paul's email`
### `Approve and send to Paul`
### `Materials for J-4431`
### `EV charger install · Better, smart 7 kW`
### `Home built before 1980`

Design 20's invented business, carried in the prototype so its screens have something to show: a
customer called Priya with an EV charger, a builder called Paul with plans for a duplex in Epping,
job J-4431, a pre-build named "EV charger install · Better, smart 7 kW", and a photo reading that
added an hour for a pre-1980 house. The two "Use …" buttons exist only to load that invented data
into a prototype that has no database.

Every feature behind them is built, and says these things with the business's own data (26
September): **Understand the work** reads a job's photos, plans and message into a scope priced
from the business's own pre-builds, with any extra time as its own line (`src/app/jobs/understand-panel.tsx`);
**Estimate from plans** counts drawings the same way, and its button reads "Approve and send to"
the job's own customer (`plans-panel.tsx`); **Materials for** is followed by the job's own
reference (`materials-panel.tsx`). Carrying the prototype's names would put a stranger's customer
in every business's quote — design rule 13, nothing client-specific, applies to invented clients
as much as real ones. `scripts/admin-control-journey.mjs` drives all three with real rows.

**Decided:** 26 September 2026, when the features were built.

---

### `Phone notifications`

`SPEC Admin.dc.html` lists "Phone notifications — same events, to the mobile number on file"
beside email notifications, and its own note calls the pair a placeholder.

SPEC does not send text messages, and that is a decision rather than a gap. On 26 September, when
people could first be reached by phone number instead of email, it was settled that SPEC hands
back the message ready to send and the admin sends it from the phone already in their hand
(`src/app/org/page.tsx`, "SPEC does not send the text"). A switch promising texts SPEC will not
send would be the kind of claim `lib/notify` was written to stop making — it lists, beside the
loudness setting, exactly what SPEC sends today.

**Decided:** 26 September 2026.

---

### `Two things to check with Priya first`
### `Quote Q-2296 sent · on the Jobs board`
### `Q-2297 built · ready for Leah`
### `EV charger and switchboard upgrade · Marrickville`
### `Today · J-4402 Northside`
### `Invoice INV-8852`
### `Microsoft 365 · jbielectrical.com.au ·`
### `Sample data until the listener is live`

More of Design 20's invented business, found by the deep tier: a customer's name, quote, job and
invoice numbers, a suburb, and a mailbox on a real-looking domain. The product says each of these
with the business's own records — "Two things to check with" the job's own customer (`lib/understand`
`checkLine`), "Quote … sent · on the Jobs board" with the quote's own reference (`plans-panel.tsx`),
the customer page's job title and site from the job itself. The domain is the strongest case: a
real business's mailbox name in the product would break design rule 13 outright.

"Sample data until the listener is live" is the prototype labelling its own placeholder. The
listener is built (`lib/listening-data`, run nightly from `/api/ping`), so the cockpit shows what
was actually heard, or says plainly that it has not listened yet.

**Decided:** 26 September 2026.

---

### `Owner, Commercial and estimators`

`SPEC Jobs.dc.html` labels "Is our rate right?" as seen by the owner, Commercial and estimators. The
product's rule is that **money is leadership** (`lib/sight`): the rate panel sits on a money tab, so
it is seen by leadership seats. An estimator who leads people sees it; an estimator on a team seat
does not, because the rate is the price list. Printing a line that says estimators see it would be
wrong for exactly the people it names.

**Decided:** 26 September 2026.

---

### `Essential — your financial system`
### `Their walkthrough:`

Both are from `SPEC Setup v1.dc.html`, which `designs/MANIFEST.md` keeps "for reference only. Build
SPEC Setup, not v1." The current Setup is built from `SPEC Setup.dc.html`. "Essential" would also
contradict design rule 7 — no connector is ever required; manual is a complete, permanent mode.

**Decided:** 26 September 2026.
