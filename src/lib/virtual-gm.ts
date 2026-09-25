/**
 * The virtual GM — what SPEC is, said in the only terms a business already has a number for.
 *
 * Design export 9, which put this on both the landing page and the pricing page.
 *
 * ── Why it is one line and why it is where it is ─────────────────────────────────────────────────
 *
 * On the landing page it sits immediately after "Simple." and before the box that asks for a real
 * problem. That is the whole of the argument before any demonstration: one sentence that names what
 * this is, against a cost the reader already knows. Everything after it is evidence.
 *
 * The page's own rule is that nothing is claimed before it is demonstrated — so this is deliberately
 * not a claim about results. It is a claim about CATEGORY: not "SPEC will fix your business" but
 * "this is the job you were about to hire for". The reader can check that against their own payroll
 * without taking SPEC's word for anything.
 *
 * ── Four headlines, and only one of them ships ───────────────────────────────────────────────────
 *
 * The export carries four and marks `cost` as the default, which is the one built. The other three
 * are kept here rather than thrown away, because the choice is Kris's and swapping it is one line —
 * but only one can be on the page, and a page that says the same thing four ways says nothing.
 */

export type GmHeadline = 'cost' | 'never_sick' | 'reframe' | 'stop_paying';

export const GM_HEADLINES: Record<GmHeadline, string> = {
  cost: 'Before you pay for an expensive GM, start with SPEC.',
  never_sick:
    'A great GM costs you three hundred grand a year. SPEC costs a fraction — and never takes a sick day.',
  reframe: 'Why hire a three-hundred-grand GM? Just use SPEC — your virtual GM.',
  stop_paying: 'Stop paying three hundred grand for management. Start using SPEC.',
};

/**
 * The one on the page.
 *
 * Kris tried `never_sick` and came back to this one, which is also the export's default. It is the
 * shortest of the four and the only one that is an instruction rather than an argument: it does not
 * try to win the comparison on the page, it just says what to do first. The comparison is still
 * there for anybody who wants it — /pricing puts SPEC beside a A$300,000 GM directly.
 *
 * Changing it is this line. The other three stay in GM_HEADLINES because the choice is Kris's and
 * has already moved twice; deleting the road back would be the wrong kind of tidy.
 */
export const GM_HEADLINE: GmHeadline = 'cost';

export const VIRTUAL_GM = {
  /** The eyebrow above the headline, on both pages. */
  kicker: 'The virtual GM + virtual admin',
  headline: GM_HEADLINES[GM_HEADLINE],
  /**
   * Kris, 25 September: *"SPEC runs BOTH the GM and the Admin Department virtually. Not just a
   * Virtual GM - Virtual GM + Virtual Admin."* Said once here and read by every page that carries
   * the headline. Worded to what is true today: the admin work runs in SPEC, and Angus Shield takes
   * over payroll and the books only when a business chooses to switch — see lib/switch.
   */
  both:
    'SPEC runs both the GM and the admin department, virtually. The GM side reads the whole business '
    + 'and says what to pull this week. The admin side — payroll checks, invoicing, bills, compliance '
    + 'paperwork, HR admin and reporting — runs in SPEC, with Angus Shield to take over payroll and the '
    + 'books when you are ready.',
  /**
   * Pricing only. The whole ladder in four sentences — try it, add training, and if neither gets
   * you there, the program does. "No ongoing GM" is the point of the paragraph: every other line
   * is about what you buy, and that one is about what you stop buying.
   */
  ladder:
    'Give us a go. Add some training if you need it. And if that doesn’t get you there, our '
    + '6–12 month program will. No ongoing GM. Amazing results.',
};

/**
 * What a general manager actually costs, put beside the consulting price.
 *
 * ── Why there is no SPEC number in it ────────────────────────────────────────────────────────────
 *
 * There used to be one to compare against. The design drew the consulting package at A$20,000,
 * SPEC published A$20,888 — the rule of 8 outranked the mock-up — and the claim was arithmetic:
 * twelve months at A$20,888 is A$250,656 against a loaded GM at about A$300,000.
 *
 * Kris's Stripe handoff of 19 September archives that product — *"Not part of the current offer"* —
 * and makes consulting quote-only. So the sentence keeps the GM's cost, which is a fact about the
 * market and still true, and stops naming SPEC's. "This sits comfortably under that" is only an
 * honest sentence while the other side of it has not been invented.
 */
export const GM_COMPARISON =
  'A fully-loaded GM runs about A$300,000 a year once you load super, car, bonus and recruitment. '
  + 'This sits comfortably under that.';
