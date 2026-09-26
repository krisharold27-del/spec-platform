# Pages nothing links to, and how each one is actually opened

`scripts/reachable.mjs` walks every route under `src/app` and fails the build if nothing anywhere in
the source points at it. `tests/reachable.test.ts` runs it.

A page nobody can reach is not in the product, whatever the file tree says — that is the lesson of
26 September, when Scoring and Mirrors spent two days off the menu while every check passed because
nothing had been *deleted*. See `docs/NOTHING-COMES-OFF.md`.

## The escape hatch, and why it is narrow

A handful of pages are genuinely opened some other way: from an email, from a bookmark, from a
printed advert, from a link somebody was sent. Those are real and they belong here.

What does **not** belong here is a page that ought to be linked and is not. That was the state of
`/questions`, `/setup/roles` and `/setup/people` when this check was first run — all three built,
all three working, none of them reachable. They were given doors in the directory rather than lines
in this file, which is the right way round. **Adding a line here is the last resort, not the fix.**

Each line says how the page is really opened. Format — the route in backticks, then the reason:

```
- `/route` — how somebody actually gets here.
```

## The list

- `/auth/confirm` — where the sign-in email lands. The address only ever arrives in an email, and
  linking it from inside the app would be meaningless: you are already signed in by the time you
  could press it.
- `/welcome` — the old address of the landing page, which is now simply the site root. Kept because
  addresses outlive the reasons for them: a link in an email, a bookmark, an advert already printed.
  Nothing links to it deliberately, since linking it would spread the address that was retired.
- `/signout` — kept for anybody who has it bookmarked or is sent it. The nav signs out in one press
  without it; this page exists so that URL is never a dead end.
- `/start` — the four-questions opener, reached from campaigns and from links sent to a business
  before it has an account. Not linked from inside the product because everybody inside it is past
  that question.
- `/subbie` — the subcontractor's own paperwork page, at `/subbie/<token>`. The address only ever
  arrives in a link sent to that subcontractor, and it carries their insurance and licences, so it
  is marked `noindex` and is deliberately not advertised anywhere inside the business's menus. A
  subbie is not a seat holder and never signs in.
- `/investor` — reached by a link sent to a specific person, and gated on `isAdminEmail` besides.
  It is deliberately not advertised in the menu of a customer's business.
