/*
  EVERY PAGE IN SPEC — generated, never written by hand.

  Kris, 26 September: *"we really must keep an eye on the list of functions of this system -
  how can i check you have everything."*

  Fair question, and "I checked" is not an answer — it is the same answer that was true every
  day Mirrors sat off the menu. What he needs is a page he opens HIMSELF that cannot fall
  behind, and a hand-written list of everything is the one document guaranteed to.

  So `scripts/reachable.mjs` walks src/app and writes this; /pages reads it and shows the
  audit; `tests/reachable.test.ts` regenerates it and fails if it has gone stale. Add a page and
  the build tells you to run `npm run reachable -- --write`. The list cannot quietly stop being
  true.

  A TS module rather than a file read at runtime, because src/ is not deployed: a page that
  walked the filesystem in production would find nothing and call it a clean bill of health.
*/
export interface PageRow {
  route: string;
  /** Something in the product links to it — a menu, or the screen it belongs under. */
  linked: boolean;
  /** How somebody reaches it when nothing links to it. Empty for the ordinary case. */
  reachedBy: string;
}

export const EVERY_PAGE: PageRow[] = [
  { route: "/", linked: true, reachedBy: "" },
  { route: "/account/password", linked: true, reachedBy: "" },
  { route: "/account/verify", linked: true, reachedBy: "" },
  { route: "/admin", linked: true, reachedBy: "" },
  { route: "/auth/confirm", linked: true, reachedBy: "where the sign-in email lands. The address only ever arrives in an email, and linking it from inside the app would be meaningless: you are already signed in by the time you could press it." },
  { route: "/billing", linked: true, reachedBy: "" },
  { route: "/board", linked: true, reachedBy: "" },
  { route: "/boards", linked: true, reachedBy: "" },
  { route: "/businesses", linked: true, reachedBy: "" },
  { route: "/charter", linked: true, reachedBy: "" },
  { route: "/clients", linked: true, reachedBy: "" },
  { route: "/cockpit", linked: true, reachedBy: "" },
  { route: "/compliance", linked: true, reachedBy: "" },
  { route: "/connections", linked: true, reachedBy: "" },
  { route: "/coverage", linked: true, reachedBy: "" },
  { route: "/crm", linked: true, reachedBy: "" },
  { route: "/curve", linked: true, reachedBy: "" },
  { route: "/customer", linked: true, reachedBy: "" },
  { route: "/financials", linked: true, reachedBy: "" },
  { route: "/group", linked: true, reachedBy: "" },
  { route: "/help", linked: true, reachedBy: "" },
  { route: "/how", linked: true, reachedBy: "" },
  { route: "/inbox", linked: true, reachedBy: "" },
  { route: "/intake", linked: true, reachedBy: "" },
  { route: "/investor", linked: true, reachedBy: "reached by a link sent to a specific person, and gated on `isAdminEmail` besides. It is deliberately not advertised in the menu of a customer's business." },
  { route: "/jobs", linked: true, reachedBy: "" },
  { route: "/join", linked: true, reachedBy: "" },
  { route: "/journey", linked: true, reachedBy: "" },
  { route: "/look/decide", linked: true, reachedBy: "" },
  { route: "/look/thanks", linked: true, reachedBy: "" },
  { route: "/me", linked: true, reachedBy: "" },
  { route: "/meeting", linked: true, reachedBy: "" },
  { route: "/mirrors", linked: true, reachedBy: "" },
  { route: "/mirrors/conversations", linked: true, reachedBy: "" },
  { route: "/money", linked: true, reachedBy: "" },
  { route: "/my-page", linked: true, reachedBy: "" },
  { route: "/org", linked: true, reachedBy: "" },
  { route: "/org/automation", linked: true, reachedBy: "" },
  { route: "/pages", linked: true, reachedBy: "" },
  { route: "/people", linked: true, reachedBy: "" },
  { route: "/pricing", linked: true, reachedBy: "" },
  { route: "/privacy", linked: true, reachedBy: "" },
  { route: "/questions", linked: true, reachedBy: "" },
  { route: "/reset", linked: true, reachedBy: "" },
  { route: "/safety", linked: true, reachedBy: "" },
  { route: "/scorecard", linked: true, reachedBy: "" },
  { route: "/scoring", linked: true, reachedBy: "" },
  { route: "/seat", linked: true, reachedBy: "" },
  { route: "/sectors", linked: true, reachedBy: "" },
  { route: "/settings", linked: true, reachedBy: "" },
  { route: "/setup", linked: true, reachedBy: "" },
  { route: "/setup/board", linked: true, reachedBy: "" },
  { route: "/setup/business", linked: true, reachedBy: "" },
  { route: "/setup/expectations", linked: true, reachedBy: "" },
  { route: "/setup/focus", linked: true, reachedBy: "" },
  { route: "/setup/goals", linked: true, reachedBy: "" },
  { route: "/setup/kpis", linked: true, reachedBy: "" },
  { route: "/setup/path", linked: true, reachedBy: "" },
  { route: "/setup/people", linked: true, reachedBy: "" },
  { route: "/setup/roles", linked: true, reachedBy: "" },
  { route: "/setup/systems", linked: true, reachedBy: "" },
  { route: "/signin", linked: true, reachedBy: "" },
  { route: "/signout", linked: true, reachedBy: "kept for anybody who has it bookmarked or is sent it. The nav signs out in one press without it; this page exists so that URL is never a dead end." },
  { route: "/signup", linked: true, reachedBy: "" },
  { route: "/site", linked: true, reachedBy: "" },
  { route: "/spec", linked: true, reachedBy: "" },
  { route: "/start", linked: true, reachedBy: "the four-questions opener, reached from campaigns and from links sent to a business before it has an account. Not linked from inside the product because everybody inside it is past that question." },
  { route: "/status", linked: true, reachedBy: "" },
  { route: "/subbie", linked: true, reachedBy: "the subcontractor's own paperwork page, at `/subbie/<token>`. The address only ever arrives in a link sent to that subcontractor, and it carries their insurance and licences, so it is marked `noindex` and is deliberately not advertised anywhere inside the business's menus. A subbie is not a seat holder and never signs in." },
  { route: "/summary", linked: true, reachedBy: "" },
  { route: "/switch", linked: true, reachedBy: "" },
  { route: "/team", linked: true, reachedBy: "" },
  { route: "/tech-day", linked: true, reachedBy: "" },
  { route: "/terms", linked: true, reachedBy: "" },
  { route: "/today", linked: true, reachedBy: "" },
  { route: "/training", linked: true, reachedBy: "" },
  { route: "/virtual-gm", linked: true, reachedBy: "" },
  { route: "/welcome", linked: true, reachedBy: "the old address of the landing page, which is now simply the site root. Kept because addresses outlive the reasons for them: a link in an email, a bookmark, an advert already printed. Nothing links to it deliberately, since linking it would spread the address that was retired." },
  { route: "/workflows", linked: true, reachedBy: "" },
];
