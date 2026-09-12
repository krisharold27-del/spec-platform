# The designs

The SPEC Business Solutions design project, exported from claude.ai/design.

These are prototypes in HTML, not production code. They are committed here so
`scripts/design-coverage.mjs` can check the product against them on every
change, and so the reference survives the machine it was exported from.

Run the check with:

```
node scripts/design-coverage.mjs          # headings and buttons
node scripts/design-coverage.mjs --deep   # every label — noisier, misses less
```

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

## These files are not all the same age

The design project shares one navigation bar and one logo across every screen,
so a change to either lands on all of them at once. That makes it possible to
tell, from the files themselves, which ones are current:

```
grep -L "SPEC My Page.dc.html" *.dc.html    # screens on the older nav
```

As of 12 September 2026, three screens (Admin, Board Pack, Connections) carry
that day's navigation and animated logo; eighteen still carry the previous
day's. They were sent one file at a time, and only those three arrived.

**Two things follow from that.** The eighteen older screens may be missing
changes nobody has seen here. And `SPEC My Page.dc.html` — a screen the new
navigation links to — has never been received at all.

Sending files individually loses work. The reliable routes are Claude Design's
**"Send to Claude Code Web"**, or running `/design-login` once from Claude Code
on a desktop machine, after which the project can be read directly.
