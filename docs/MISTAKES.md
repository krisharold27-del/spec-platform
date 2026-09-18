# Mistakes

Kris, 18 September 2026: *"again mistake - keep a record of these as these are now costing me money"*.

He is right that they are, and right that they should be written down. This is that record.

**One rule: every entry names the thing that would have caught it.** A list of apologies is worth
nothing. A list where each line ends in a check that now exists is worth reading, because the same
mistake cannot be on it twice.

Newest first.

---

## 18 September — A coverage check that read the words and called it coverage

**What Kris saw.** He opened `/org` on the live site and said it was not the same as the design.

**What was true.** `SPEC Org Chart.dc.html` offers a right-click menu on every card — Add a direct
report, Rename role & person, Break the link, Make this role vacant, Remove role. The product had
none of it. There was **no way to rename a role anywhere in SPEC at all**: correcting a typo meant
deleting the role and building it again, which throws away its KPIs, its training path and every
closed month that referred to it.

**Why I did not know.** `npm run designs:coverage --deep` reported **100%**, screen by screen, and
printed the word *complete*. All three of its tiers read the design's **markup**, and one of them
opens by deleting every `<script>` — which is exactly where a prototype keeps its menu. The five
things the chart could not do were the five things the check was structurally incapable of looking
for. It did not fail quietly. It passed loudly, which is worse, because I answered questions about
readiness on the strength of it.

**Cost.** Kris set JBI up in front of a customer and could not correct a role name.

**Now caught by.** A fourth tier in `scripts/design-coverage.mjs` that reads only what the other
three throw away — the labels a prototype builds in code. With the prototypes' invented jobs
filtered out it found 15 further real gaps the same day. And `scripts/org-journey.mjs`, which opens
the menu, presses the item and asks the chart whether the role is really there: a phrase check can
only ever prove the words are in the source.

---

## 18 September — The rename box threw away what you typed, about one time in four

**What happened.** Type a name into the panel, press Save, and the form posted an **empty** name. The
action returned without doing anything and the chart came back exactly as it was — no error, nothing
to say what had happened.

**Why.** The two boxes were uncontrolled (`defaultValue`). The chart re-renders whenever anything on
the page finishes a server action, and an uncontrolled input loses its contents the moment React
replaces the element.

**How it was found.** Not by reading the code — twice I read it and concluded it was fine. By
printing the field's value at the instant of submit, from a browser, and watching it come back empty.

**Now caught by.** The value is held in React state, keyed to the role. `scripts/org-journey.mjs`
checks the write survives a reload.

---

## 18 September — The panel stole focus and typed the name into the title

**What happened.** Press *Rename role & person*, click straight into the name box because that is the
box you want, and your first keystrokes land in the **title**. The role ends up called
`Yard LeadR. Nakamura` and the name is nowhere.

**Why.** The panel focused the title box a frame after opening, unconditionally, with no regard for
whether somebody had already put the cursor somewhere.

**How it was found.** Same way as the one above, and only after **two wrong guesses** at the cause —
I blamed a race in the save, then blamed the test's own reload. Printing both boxes at the moment of
submit showed `title: "Yard LeadR. Nakamura"` and settled it in one run.

**Now caught by.** The focus is only taken if nobody is already in the panel, and the journey asserts
the title still reads what it was renamed to after the name is typed.

---

## 18 September — Sign-up told people their form had expired when nothing had expired

**What happened.** Fill the form quickly — a password manager is enough — and SPEC bounced you to
*"This form had been open a while."* on the first screen of the product.

**Why.** A too-quick submission is held for three seconds rather than refused, then checked again.
Node's timer is allowed to fire a whisker early, so the second check sometimes ran at 2,999ms, came
back *too fast* a second time, and every failure in that branch was reported to the customer as
*expired*.

**How it was found.** This suite's own sign-ups started failing intermittently — twice in six runs,
which is a rate a real customer meets too.

**Now caught by.** A 50ms margin, a separate honest message for *too fast*, and two tests in
`tests/bot-check.test.ts` that fail if the margin is removed. Proven by putting the fault back.

---

## 18 September — The cockpit was quoting numbers from a fortnight earlier

**What happened.** The scale checklist — the screen Kris reads to answer *"can this take 20,000
seats"* and *"is it stable"* — said **647 tests** when there were 1,181, **four browser journeys**
when there were fifteen, and **24 of 24 tables** under row-level security when there were 35.

**Why.** Every one of those was true when written. None had been true for a week. `READINESS.md` has
been held to its numbers by a test since September 14; nobody had pointed the same idea at the one
screen the founder actually opens.

**Now caught by.** Three checks in `tests/cockpit.test.ts` that count the tests, the journeys and the
`enableRLS()` calls in the schema, and fail if the copy disagrees.

---

## 18 September — Word and PDF were refused because they were hard

**What Kris said.** *"when i am trying to import my org chart - it doesn't give the option of pdf or
word doc. that how they will do it"*.

**What was true.** The picker took CSV and plain text. The note explaining why said Word and PDF are
compressed formats needing a parser, and that a picker which accepts a `.docx` and then silently
produces nothing is worse than one that never offered.

**Where the reasoning went wrong.** The second half is a good rule and is now what the feature is
built to. The first half was a reason to do the work rather than skip it. **Nobody keeps their org
chart as a CSV.** They keep it as the document somebody made for the induction pack — which means
the format that was skipped was the only one that mattered.

**Now caught by.** `tests/chart-text.test.ts` and `scripts/chart-import-journey.mjs`, which builds a
real `.docx` and a real PDF byte by byte, including a scan containing no text at all.

---

## Earlier

Kept in `docs/READINESS.md`, where each row states what was wrong, what it cost and the command that
now fails if it comes back. The pattern across all of them is one sentence: **a claim nobody checks
quietly stops being true** — and its sharper form, which is the one that has cost the most:
**a check whose failure mode is silence is worse than no check.**
