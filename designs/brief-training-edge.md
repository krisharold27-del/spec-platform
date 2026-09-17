# Brief for design — give training its own edge

Kris, 17 September: *"why dont we make all the training have a purple edge — something
very different"*.

Handing this back to design rather than picking a colour in code, because it is a
system-wide decision and there is a collision in it that has to be solved before any
hex value is chosen.

---

## The ask

Training should look like a **different kind of thing** from the rest of SPEC. Everywhere
a person meets training — the page, their path, a module, the SPEC library — carries one
consistent edge, so it is recognisable at a glance without reading.

## Why this is a sound idea, and not a break of the colour rule

SPEC has one firm rule about colour, in `src/lib/pillars.ts`:

> Colour says how something is **going**, never what it **is**.

It exists because green, amber and red are signals. Anything coloured by identity risks
being read as a score — which is why the Design 7 training block does **not** tint its four
non-negotiables the way the export drew them (see `superseded.md`).

A training edge does not break that rule, because it is not a signal. It says *which part of
the product you are in*, the way a tab does. One consistent accent used for wayfinding is
not the same as colouring a thing by what it is. **It only holds if the colour cannot be
mistaken for a signal or for a pillar** — which is where the problem is.

---

## The problem: purple is already taken

`tailwind.config.ts`, the four pillars, retuned onto the warm axis:

| Pillar | | |
|---|---|---|
| Safety | `#b2622d` | terracotta |
| People | `#728157` | sage |
| Earnings | `#a67c1a` | ochre |
| **Compliance** | **`#7d5068`** | **mulberry — a purple** |

And every training module is already tagged with a pillar — that is the whole point of the
training model: a module is tied to a pillar and through it to a KPI the role is scored on.

So a purple edge on all training means:

- a **Safety** module wearing the colour of **Compliance**
- a **Compliance** module where the edge and the tag agree by accident, which will look
  like the rule is "the edge shows the pillar" — and then every other module looks wrong

Two purples on a warm cream ground, a few points apart, is the version of this that quietly
fails: nobody can tell which is which, and the four pillars stop being four clearly different
things.

**This is the thing to solve. Everything else below is just constraints.**

## Four ways out — design's call, not mine

1. **A purple far enough from mulberry to be obviously a different thing** — a deeper or
   cooler violet that reads as "not one of the four" at a glance. The risk is the cream
   ground: the cold violet was deliberately taken *out* of the palette because it sat oddly
   on cream.
2. **Move Compliance off mulberry** so purple is free. A whole-product repaint of one pillar,
   and the four are deliberately tuned to sit close in lightness so none of them shouts —
   so this is a real piece of work, not a swap.
3. **Keep the idea, drop the colour.** Mark training by *treatment* rather than hue — a
   double edge, a dashed edge, a heavier weight, a different corner radius, a texture. It
   cannot collide with anything, and it survives somebody later adding a fifth pillar.
4. **Use the second voice.** Sage `#7a8a5e` is already the product's genuine second accent
   rather than a highlight. Less "very different" than Kris asked for, but nothing to resolve.

Recommendation, for what it is worth: **3 or 1.** Option 3 is the only one with no collision
at all, and Kris asked for *"something very different"*, which a treatment delivers as well as
a hue does.

---

## Constraints any answer must meet

**Ground.** It sits on two: the page `#f5ead8` (cream) and the card `#ebddc5` (surface). It
has to work on both — several things in SPEC look right on one and vanish on the other.

**Contrast.** `tests/colour.test.ts` fails the build below **4.5:1** for anything carrying
text. An edge alone is not text, but if the treatment includes a label, a tint behind words,
or a coloured heading, it has to clear AA on **both** grounds.

**Never a signal.** It must not be confusable with green `#4f7a3f`, amber `#c67139`,
red `#a63b26` or pending `#8c8681`. Amber is the accent terracotta, so anything warm is
already crowded.

**Never a pillar.** See above. Distinct from all four, and visibly so at edge width.

**Phone.** Every screen is measured at 390px on every build. An edge that only reads at
desktop width is not built.

---

## Where it has to appear, or it is worse than nothing

A marker used in four places out of six teaches people it means something it does not. All
of these:

| Where | What |
|---|---|
| `/training` | The page itself — its own identity |
| `/training` | *SPEC's training for frontline leaders* — the A$44 library block |
| `/training` | My path, and each role's path in the team block |
| `/my-page` | The training block on somebody's page |
| `/my-page` | Ace run steps, where they are training steps |
| Anywhere a module appears | The module row itself |

`components/today-blocks.tsx` (`TrainingPath`), `components/curriculum-editor.tsx`,
`components/material.tsx` and `app/training/page.tsx` are where these live.

---

## What "done" looks like

A token in the design system — one name, one value, defined once — not a hex repeated in six
files. Shown against **both** grounds, at edge width, next to the four pillar colours and the
four signal colours, so the "cannot be confused with either" claim can be checked by eye
rather than asserted.

Then it comes back as a design export and gets built like everything else.

---

---

## ANSWERED — design export 8, 17 September

Design took **option 3: keep the idea, drop the hue.**

> "All 4 pillar colors and the red/amber/green status colors are already spoken for — a 5th
> colour risks looking like one of those. So instead of a new color, I used a shape: a dashed
> outline ring around the label — same colour as the text, just a different line style. It reads
> as 'training' no matter what colour sits inside it."

```css
outline: 1.5px dashed color-mix(in srgb, var(--color-text) 45%, transparent);
outline-offset: 2px;
```

Two things about it worth keeping, because neither is obvious:

**It borrows the text's own colour**, so it works inside a chip of any colour — including one
already tinted green, amber or grey by the module's status. It can never read as a signal,
because it has no colour of its own to read.

**`outline`, not `border`.** An outline takes no space in layout, so adding one to a label moves
nothing around it. A border would have reflowed every module row by 3px and broken the alignment
of the rows beside it.

**Built** as `.ring-training` in `globals.css`, one definition, on both places a module's pillar
label appears: the SPEC library list on `/training` and the curriculum editor.

**A correction on my part.** I reported that export 8 did not answer this brief. It did — I
searched the export for a new colour and for `border-left` declarations, found neither, and
concluded there was no answer. The answer was an `outline` property with no colour in it, so my
search could not have found it. I looked for the solution I had imagined rather than for a
solution.
