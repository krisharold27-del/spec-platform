# The designs

The SPEC Business Solutions design project, exported from claude.ai/design.

These are prototypes in HTML, not production code. They are committed here so
the product can be checked against them on every change, and so the reference
survives the machine it was exported from.

## After every export, run this

```
npm run designs:check
```

It answers one question — **is the whole design project here?** — and ends with
either:

```
COMPLETE — 21 screens, one export, nothing missing.
```

or an `INCOMPLETE` line naming what is wrong. It catches the two ways a design
set goes quietly out of date:

- **a screen that was never sent.** Every screen the navigation links to must
  exist as a file. This is how `SPEC My Page.dc.html` was found — linked from
  the nav, never received, nobody aware of it.
- **screens from different exports mixed together.** Every screen of one export
  shares a logo, so two logos in this folder means two exports. This is how
  eighteen screens turned out to be a day behind while looking current.

Then, for what is built against them:

```
npm run designs:coverage                  # headings and buttons
node scripts/design-coverage.mjs --deep   # every label — noisier, misses less
```

Both run in CI on every change, and neither fails a build: an incomplete export
is a fact about what arrived, not a fault in the code being tested.

## Getting the designs here

Send the **whole project**, never individual files. Individual files are what
caused both problems above — every screen shares a nav and a logo, so a change
to either lands on all twenty-one at once, and sending three of them leaves
eighteen behind with nothing to show that they are.

- **From claude.ai/code (the cloud):** use Claude Design's **"Send to Claude
  Code Web"**. It seeds the whole project into the workspace.
- **From Claude Code on a desktop machine:** run `/design-login` once. After
  that the project can be read directly from Claude Design, with no export step
  at all — this is the one that removes the manual step for good.

## Decisions that are settled

**The mascot is the feathertail glider.** Confirmed by Kris, 12 September 2026.
An earlier handoff README described the brand story as a pistol shrimp; that is
superseded. The glider is what ships.

**The mark is the ring and the hand.** Separate from the mascot. The ring's arc
is the score and travels red → amber → green; the hand sweeps round once, snaps
and stays. `src/components/spec-mark.tsx` draws it from a real score, so the
logo shows how the business is actually going rather than being decoration.

**Colour is the score; the letter is the pillar.** Option D. A pillar carries no
colour of its own — see the note at the top of `src/lib/pillars.ts`.

## Where this set stands

Twenty-one screens, one export, nothing missing. `npm run designs:check` reports
COMPLETE.

It did not always. The set carried one broken link for several exports: **SPEC My
Scorecard's `← Back to my page` pointed at `SPEC Today.dc.html`** — a screen that
had been renamed to My Page. The label was updated and the href was not, so the
check read it as a twenty-second screen that had been linked to and never sent.
It is repointed at `SPEC My Page.dc.html` here, in this folder, which is where
the fault was.

That is the rule this folder runs on: **a fault found in the designs is fixed in
the designs.** Noting it in a README and waiting for the next export is how a set
stays broken for a month — and the next export overwrites the fix anyway unless
the same change is made upstream in Claude Design. Fix it here so the check goes
green, and make the same change there so it stays green.

### Two screens were renamed, and it matters

| Was | Is now |
|---|---|
| SPEC Today | **SPEC My Page** |
| SPEC Role | **SPEC My Scorecard** |

The first is the one with consequences. The Build Checklist records screen 5
being reopened deliberately: it was the home screen, it is now My Page, and the
separate chat page proposed as screen 16 is folded into it. The product follows:
My Page is served at `/my-page`, and `/today` is a redirect kept for bookmarks.
