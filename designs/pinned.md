# Screens pinned to the design, word for word

Kris, 16 September: *"make sure the landing page and my page are always perfect"*, and then *"yes add
the stricter guard for landing and my page"*.

Everywhere else in SPEC, the coverage check accepts a **reworded** match: the design says "What needs
me today", the product says "What needs you today", and that counts. That is the right standard for
twenty-two screens — the product is not a transcription of a prototype, and a check that forbade
every improvement would be edited out within a week.

It is the wrong standard for these two. The landing page is the first thing a stranger ever sees, and
My Page is the thing a customer opens every morning. On those, "close enough" is how a page drifts a
word at a time until it is nobody's design.

So a screen listed here is held to **exact wording**. A phrase that only matches loosely fails the
build, and the failure names the phrase.

---

## Pinned

### Screen: SPEC Landing
### Screen: SPEC My Page

---

## Allowed to differ

Each one is a line in a diff with a reason next to it. Anything not listed here has to be exact.

### `SPEC My Page` — Today's jobs

A block listing today's jobs pulled from a connected job-management system. SPEC has no job feed:
Connections carries the systems a business runs, and nothing reads a job list out of them yet. The
words exist nearby, which is why this reads as reworded rather than missing — but the block does not
exist, and putting the heading on the page with nothing under it would be worse than not having it.

### `SPEC My Page` — KPI reports from connected systems

The same gap from the other end: numbers arriving from a system rather than typed by a person. SPEC
Basic is defined as every number entered by hand, and the Advanced path feeds KPIs through
Connections — but the My Page block that lists those arrivals is not built.

### `SPEC My Page` — Report a hazard

A one-press action on the phone view. The mobile screen has it; My Page does not, and adding a button
here that opens the same flow would put a safety action two places, which is how one of them goes
stale and somebody presses the wrong one.

### `SPEC My Page` — Snap it in line

The heading beside the Snap Score. The product says **Snap Score — too early to read** until there is
enough history, which is a different and more honest sentence: the design's wording assumes a score
worth reading, and a business in its first month has not got one.

### `SPEC My Page` — Validate in COGS — sign it off

A register entry's sign-off button, worded for a business that runs a COGS meeting. SPEC does not
assume a meeting is called that: the weekly meeting is named by the business, and hard-coding one
company's word for it into every customer's page is exactly the kind of thing the rest of this
product refuses to do.

---

*Everything else on both screens is word for word, and the build fails if that stops being true.*
