# Things taken out of the product, and who said so

Kris, 26 September:

> *"time to start being careful - you're removing things and you need to stop - do not remove
> functions - unless i tell you to - make this a hard rule."*

`docs/public-surface.txt` lists every exported name in `src/lib` and `src/components`.
`tests/surface.test.ts` compares that list against the code and **fails the build** if a name has
stopped existing. The only way past is a line in this file.

## How to add a line

One line per name, and the name has to match the ledger **exactly**, `path :: name`, because that
string is what the check looks for:

```
- 2026-09-26 — `src/lib/example.ts :: oldThing` — Kris, in chat: "drop the old thing, nobody uses it"
```

Three parts, all of them load-bearing:

- **the date**, so "when did this go" is answerable a year later;
- **the exact `path :: name`**, so the check can find it and nothing else is quietly covered;
- **who said so, in their words.** Not "unused", not "dead code", not "refactored away". Those are
  the reasons that removed the thing a customer was relying on. A person asked for this, or it
  does not go.

Renames count as removals. If `oldName` became `newName`, the old name has left the product as far
as anything calling it is concerned — record it, and say what it became.

## Removals

*Nothing yet.*
