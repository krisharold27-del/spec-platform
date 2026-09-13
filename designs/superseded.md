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
