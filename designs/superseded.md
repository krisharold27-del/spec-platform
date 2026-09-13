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
