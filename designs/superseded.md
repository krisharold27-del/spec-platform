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
