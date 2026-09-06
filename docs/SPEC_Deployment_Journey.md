# SPEC Business Solutions — Deployment Journey

How a business goes from hearing about SPEC to being SPEC. This is the usability spec: every step is something the app shows, tracks and gates. The app's `/journey` page is this document made live.

Design constraints: the leader does this without a consultant in the room; Claude is the guide at every step; nothing advances on a guess; if it's not simple, it's wrong.

---

## Stage 0 — Sign in online

1. **Sign up** with a work email. The signer becomes the top role (General Manager, or Owner/MD if the business has no GM — Claude asks which).
2. **Name the business**, sector, size band. That is the whole form.
3. **Claude registration — required before anything else.** SPEC is delivered through Claude, so the business must have Claude in place. The app checks one of two paths and will not open the journey until one is done:
   - *Business has its own Claude account* (Team/Enterprise): the leader confirms the workspace exists and that the managers who will hold full-access roles have seats. The SPEC platform uses its own Claude connection for guidance, board output and explanations; the business's Claude workspace is where day-to-day work with SPEC happens (connectors to their job, accounting and CRM systems live there).
   - *Business has no Claude yet*: the app shows exactly what to set up (a Claude Team plan, seats for supervisor level and above) and holds the journey at this step until confirmed.
   Why it's a gate: every SPEC failure in the record came from the leadership layer disengaging. Registering Claude first is the first act of commitment, and it's what makes the rest self-serve.

## Stage 1 — Deploy into the organisation (week 1)

Claude runs these as a conversation; the app records the answers.

4. **Question Zero.** Why now — what number or moment made this worth doing. If the answer is vague, Claude says so and slows down rather than pushing on.
5. **Business expectations.** The organisational diagnostic (what we do well, what we want to do well in years 1–3, same or different), the Financial Truth Matrix, and the First Meeting questions (success, commercial reality, coverage checklist, timeline, confidence, trust, communication, systems, NPS baseline).
6. **Covenant.** The leader reads and accepts the leadership covenant and the three early-warning signs. This is a click, but it's the click that matters.
7. **Org chart — roles first.** Claude proposes the roles the business needs (GM; Commercial, Operations, Growth heads; supervisors under Operations) and the leader confirms or edits. No names yet. Roles exist before people.
8. **KPIs per role.** Claude proposes two per pillar from the templates, tuned to the sector and the expectations from step 5. Targets are negotiated, not imposed — the app records proposed vs agreed. Weights must sum to 100%.
9. **Assign people.** The leader puts a person into each role by email. Access follows the role (supervisor and above full, staff read-only). Invites go out.

**Gate to Stage 2:** every manager role has a person, every role has eight KPIs, the covenant is accepted.

## Stage 2 — Cascade (weeks 1–2)

10. **Each manager repeats steps 7–9 for their own reports.** When a manager accepts their invite, Claude walks them through their own scorecard first ("this scores the role's expectations, not you"), then their team's roles and KPIs. Supervisors define staff roles; staff get the read-only checklist view.

**Gate to Stage 3:** every role in the org chart has a holder or is explicitly marked vacant with a hiring plan.

## Stage 3 — Run the rhythm (month 1)

11. **Weekly SOG meeting** logged in the app: billables presented, power meter reviewed, every miss carries a proposed fix.
12. **Score the month.** Each full-access holder scores their own role's criteria (Y/N/NA with a note). Gates entered: Zero Harm figures, training compliance.
13. **Lock the period; board output.** Claude generates the board output from the data — pillars vs 90%, gates, plain-terms summary, what's needed from the owner, data-integrity flags. The leader approves it. Month 1 is a baseline month and the output says so.

## Stage 4 — Steps that ensure success (months 2–12)

The app tracks these as milestones with dates; Claude nudges when one slips.

- **Month 1:** all roles scored at least once; both gates reporting real numbers; SOG meeting held every week.
- **Month 3:** cost and revenue coverage checklist has no "unknown" items; early-warning lever one (billables/GP) live; STAR rating being assigned monthly.
- **Month 6:** two consecutive months with every pillar ≥ 90% *or* a named fix per pillar below 90%; the leader's time in day-to-day decisions measurably down (their own step-5 answer is the yardstick).
- **Month 12:** business is SPEC (90% rule met); supervisors signed off as capable; the engagement steps down — Claude keeps running the day-to-day, the company principal attends the board meeting only.

## What Claude does at each step

- Explains *why* the step exists, from SPEC principles, in one paragraph.
- Proposes a default (roles, KPIs, targets) so the leader edits rather than invents.
- Refuses to advance on empty or vague input, and says what's missing.
- Answers "why this KPI?" for any criterion, reasoning from the business's own expectations.
- Never presents an empty template as a result.

## Failure shapes the journey is built to catch

Focus drifting to hours rather than outcomes; the leader pulling back control once things become visible; the system becoming onerous. Each has a named fix in the covenant, and the journey page shows the fix when the pattern appears (missed meetings, unscored roles, edits to locked periods attempted).
