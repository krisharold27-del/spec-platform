# Screens the designs have and the product does not

A design export can arrive with a screen nobody has built. That is normal — it is how new work
starts — but it must never be quiet.

Two wrong answers, both of which this file exists to avoid:

- **Let the coverage check go red.** A new screen is not a regression. Failing the build on the day
  it arrives punishes the export rather than the product, and the pressure is then to delete the
  screen from the set.
- **Put it in `superseded.md`.** That file is for references — logo studies, palettes — which are
  design thinking rather than screens anybody signs into. A screen that is real and simply unbuilt
  is not a reference, and filing it as one is exactly the quiet lowering that file warns about.

So: a screen listed here is left out of the percentage **and shouted about on every single run**,
with the date it arrived. The number stays honest and the gap stays visible.

The format is the same as `superseded.md` — `### Screen: <name>` — because a line in a diff is the
whole point.

---

### Screen: SPEC Boards

Arrived 16 September 2026, in design export 3, along with a change to My Page.

**What it is.** A gallery of pinned, shareable boards wired to a business's live connected data —
filterable by type, opening into a detail view with the board on the left and, on the right, who is
editing now and a comment thread. Two worked examples: a Rate Board pulling live Simpro job cost and
Xero actuals to validate a sell-rate change from $115 to $105, and a "King of the Mountain" plan with
an owner against each step.

**Why it is not built.** It is a feature, not a copy edit. It needs live feeds, presence, and
threaded comments, none of which exist. The product's `/boards` today is *Conversation boards* — a
different and deliberate thing: a mirror built to raise one question, with no verdict and no live
data in it. They share a word and nothing else, and quietly turning one into the other would lose a
piece of the method.

**The one phrase it leaves uncovered** is `Xero — actuals feed`. It would be easy to put that string
somewhere and make the number go green, which is why it is written down here instead.

**Also unbuilt, from the same export:** My Page's notification bell, whose entries became links in
this export so that "something changed" can be followed rather than hunted. There is no bell in the
product at all, so there is nothing yet for that change to apply to.
