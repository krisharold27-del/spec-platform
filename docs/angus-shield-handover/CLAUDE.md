# Angus Shield — rule book for every Claude Code session

Angus Shield is the financial system for trade businesses, built by **SPEC Business Solutions**.
**Read this file first in every session, then `docs/BRIEF.md`, then `DECISIONS.md`.**

## Order of authority

1. `docs/BRIEF.md`, the product brief. Where anything disagrees with it, it wins.
2. This file: working rules.
3. `DECISIONS.md`: the running record of corrections. Newest at the bottom.

## The mantra: OUTSIMPLE THEM

Same as SiteVIP. A trade business wants to invoice, get paid, pay its bills, and lodge on time.
Every screen is judged against that. A screen that needs explaining has lost.

**Missing a function is not simple.** If the owner has to keep a second system for payroll, bank
feeds or lodgement, Angus Shield has failed the mantra. Simple is how each function works, never
which functions are missing.

## Relationship to SPEC / SiteVIP

- Angus Shield is a **separate product** with its own repo, database, deployment and billing.
- SiteVIP reads the financial system **by category**. Angus Shield is one system in that category,
  exactly like Xero or MYOB. SiteVIP never names it, and a SiteVIP customer is never required to
  use it.
- No shared database. Anything SiteVIP needs, it gets through the same connector any financial
  system would provide.

## Non-negotiable rules for a financial system

1. **The ledger is append-only.** A posted journal is never edited or deleted. Corrections are
   reversing entries, dated and attributed.
2. **Every journal balances.** Debits equal credits, enforced on write and in tests.
3. **Money is integer minor units** (cents), never floats. Currency is stored on every amount.
4. **A locked period stays locked.** Nothing recalculates history.
5. **Every change is attributed:** who, when, and from which screen or import.
6. **Tenant isolation:** RLS by `tenant_id`, plus server-side checks on every read and write.
   Nobody at SPEC Business Solutions reads a customer's books.
7. **No AI path posts a transaction, changes a rate or lodges anything.** AI can propose; a person
   confirms.
8. **Nothing client-specific in the repo.** No names, no figures.
9. **Nothing lives only in a chat.** Decisions go in `DECISIONS.md`, specs go in `docs/`.

## Stack

Same as SPEC: Next.js App Router, TypeScript, Drizzle ORM, Supabase Postgres with RLS by
`tenant_id`, Tailwind, Vercel, Resend, Stripe, Anthropic API (server-side only, and no key ever
reaches the browser). Pure logic lives in `src/lib/`, tested in `tests/` with vitest. Australian
English in UI copy.

Every session ends with `npm test` passing, a commit and a push. Keep commits small.

## Live configuration: never state it, always ask

Nothing in this repo knows the live state of Vercel, Stripe or Supabase. Check the running
system before telling anybody something needs configuring.
