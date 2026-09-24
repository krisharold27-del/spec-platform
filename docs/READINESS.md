# Readiness — can SPEC take a paying customer?

**Short answer: not yet, and the reasons are specific.**

Kris, 11 September: *"i want a scorecard and i want to know issues are fixed and
the system is stable — i cannot have paying customers until after we are sure."*

So this is written to be argued with. Everything below is **proven**, **assumed**
or **unknown**, and proven means there is a command you can run that fails if it
stops being true. Anything I have only reasoned about is assumed, however
confident the reasoning.

Dated 16 September 2026. Re-run the commands rather than trusting the date.

**The last two steps are fixed, by Kris's instruction:** the Anthropic API key and
Stripe go in *after* everything else is finished, in that order. Nothing above
them depends on either — the product is complete and honest without both, which is
what makes leaving them until last a decision rather than a delay.

---

## Proven

Each of these is enforced by something that runs on every change.

| What | Evidence |
|---|---|
| The engine's arithmetic | 1882 tests across 105 files. Pillar, role and team maths, the 90% rule, incentive ceilings, the deduction and its cap, the seven statuses, the rule of 8 — all measured against `designs/the-rules.md` |
| A customer can get in and stay in | `scripts/journey.mjs` — look around, sign up, keep the business you were looking at, sign out, sign back in. Driven in a real browser |
| A stranger's problem reaches their page | `scripts/frontdoor-journey.mjs`, 17 checks. The landing page promises "your page is waiting, with this problem already sitting in the middle of it" and the last check verifies exactly that |
| The improvement register works end to end | `scripts/register-journey.mjs`, 25 checks. Logged, read, ranked, assigned, accepted, marked done, raised again as one entry |
| A missing setting degrades one thing, not everything | CI builds once with **no database at all**. This is the exact failure that took production down on 11 September |
| The database schema builds from nothing, twice | CI migrates an empty Postgres, then repeats it to prove the migration is idempotent |
| It serves, not just compiles | CI starts the built app and requests real pages. "It compiled" and "it serves" are different claims |
| Colour is readable | Contrast measured against both grounds; the build fails if any band drops below 4.5:1 |
| A visitor can never write | `scripts/journey.mjs` now opens a page with a form on it, fills it in and presses the button. **This row used to say "one chokepoint, `assertWritable`, and the look-around journey checks it", and both halves were wrong.** The journey checked that a visitor could READ and had never once tried to save anything, so the claim rested on reading the code. And `assertWritable` was not what stopped them: twenty-six actions refused a visitor one step earlier, on manage rights, and posted them to /signin — which sees somebody already signed in and forwards them to My Page. A stranger three minutes into evaluating SPEC pressed **Add** and arrived on a different page with nothing said at all. The guard now asks about the look-around first and answers with a sentence (`src/lib/guard.ts`) |
| **A refused save is never dressed up as a fault** | `scripts/pay-journey.mts`, and the visitor checks above. Kris walked this on 16 September, minutes after cancelling the test subscription: Setup rendered fully editable, he typed a name into Head of Commercial, pressed Add — and was shown **"This page did not load. Something went wrong on our end, not yours"** with reference ID 1007727349. The write was correctly blocked; every word the customer could see about it was untrue, said to somebody whose card had just expired. Every write in SPEC goes through a server action, and an uncaught error in one is rendered by Next as that page — so a deliberate refusal and a genuine crash looked identical. A refusal now returns the person to the page they were on with the reason, the Shell carries a standing **read-only** banner so they know before they type, and the journey proves the write is still actually blocked. Proven by putting the fault back: 5 checks fail, printing the same screen Kris saw, reference number and all |
| A personal mailbox stays private | `tests/mail.test.ts` reads the source and fails if any query forgets. It found five leaks the day it was written |
| No query reads every business | `tests/tenant-isolation.test.ts`. It found six the day it was written, one of them a real cross-tenant bug — and a seventh on 12 September, before it shipped |
| **A business that wants to pay can** | `scripts/pay-journey.mts`, 38 checks in a real browser. On 16 September the answer was **no**: `/api/stripe/checkout` existed, worked, was unit-tested, and was reachable from exactly one button — "Fix payment", shown only after a subscription had already FAILED. A business with seats was shown its monthly cost and a Billing button that opened a portal needing a Stripe customer it had never had, and was silently redirected back to the same page. Every test passed; they all checked the rooms rather than whether you could get into the building. The journey now holds the invariant — **a business is either free or has a way to pay** — and was proven by putting the fault back: 5 of its checks fail on the old code |
| **A payment finishes where it started** | `tests/origin.test.ts` (23 checks) and four more in `scripts/pay-journey.mts`. The first real test payment, 16 September, worked and finished on the wrong website: the customer signed up on `www.specbizhq.com`, Stripe charged the card, the webhook landed — and Checkout returned them to `app.specbizhq.com`, because every link back was built from `APP_URL`, one fixed address. A browser keeps its sign-in per address, so they arrived inside a different business and were shown **"Payment received"** above a page that still said nothing had been charged. Nothing threw, and no existing test could have caught it — they all asked whether the checkout worked, and it did. Nobody had asked where it sent the person afterwards. Now every link back (checkout, billing portal, sign-in email, seat invitation, copied seat link) is built from the address the request arrived on, checked against our own domain so a handwritten `Host` header cannot redirect a customer to somebody else's site. The browser check makes the same signed-in request on two names for one machine and fails unless the answer follows the request — one address would not catch it, because a route that ignores the request entirely looks identical. And the "Payment received" banner is now shown only when the business really is subscribed |
| **The first seat is free, in the invoice and not just the wording** | `tests/plan.test.ts` and `scripts/pay-journey.mts`. Kris, 16 September: *"yes do the first seat free"* — settling a contradiction he spotted the day the first payment went through. This product has always said building is free and billing starts when somebody is **invited**; the leader who signs themselves up was never invited by anybody, but they have a way in, so `countSeats` counted them and a business of one was charged A$26. The promise and the invoice were both in the product, disagreeing. `countSeats` is unchanged on purpose — an earlier fix deliberately made it count the owner, because a one-person business used to report as free while using the whole system. `seats` stays the truth about the business and `billable` is the invoice. The browser check signs a business up, confirms **one person pays nothing and is not sent to a checkout**, adds a second, and confirms the page says **A$26, not A$52** — the number is the whole decision, because a free seat that exists only in the label is not a free seat. The seat PRICE does not move, so the rule of 8 stands |
| **What the AI seat is, and who it is for** (was the A$44 training seat, retired by design 15 on 19 September — published for months, never sellable, the supervisor pack never finished) | `tests/training-seat.test.ts` (31 checks) and ten more in `scripts/pay-journey.mts`, which does it the way an administrator does — on the page, with the button, then reads the database to confirm the person is billed differently, the material is really there, and it is on the path for the role they hold. Kris, 16 September: *"we need to be clear what the $44 price is about — i think we need to make training materials available for front line leaders"*. He was right to ask. **It was a number on three screens with nothing behind it**: `seat_training` was a column on the BUSINESS, settable from /admin, printed on the pricing page and the landing page, and no line of code charged it or gated anything on it. A business put on it paid A$26 and got what everybody got. Worse, the landing page printed the A$44 above the words **SPEC Advanced** — two different products wearing one number, while /pricing said Advanced is the same price because it is the same system. A customer reading both pages was told two things that could not both be true. Now: the A$44 is **a seat, not a plan** — the administrator puts individual frontline leaders on it, the server checks the ROLE rather than trusting the form, and a bill is a mixture (a business of forty with six supervisors pays 33 × A$26 + 6 × A$44, not 39 of either). It buys **SPEC's own material**: twelve modules across the four pillars, each with the actual material inside it — a test fails if any module is a title with nothing behind it, and another fails if any of it starts teaching the software rather than the job. Turning the seat on installs the material and puts it on that role's path in one operation, because doing only the billing half is how somebody pays A$44 for a page identical to the A$26 one. If the training price is missing from Stripe the checkout **refuses** rather than falling back to A$26 — A$18 a person a month, every month, is not something anybody would ever notice |
| **A lapsed business is never a dead end** | `tests/plan.test.ts`. Found on the evening of 16 September, hours after the first seat became free. A business of one lets its card expire: Stripe gives up, the webhook writes `lapsed`, every page goes read-only — and the bill is A$0, because the first seat is free. The only button on the screen, "Fix payment", opened a checkout that found nothing to charge for and returned them to the page they came from. Locked out of their own records, with no door, over a debt that does not exist. **Read-only now follows the money**: lapsed AND something actually owed. `assertWritable` and the Shell's banner both ask the same question, so the warning and the lock can no longer disagree. Where the fix lives is decided too — a subscription that is merely unpaid needs a card, so the button opens the portal; a cancelled one no longer exists, so it opens a checkout. And `invoice.paid` lets a business back out: `lapsed` had three ways in and none out, so a customer could put a new card in, be charged, and stay read-only until somebody changed a column by hand |
| **A business can be taken off Stripe — but only if Stripe says so** | `tests/detach-stripe.test.ts` (15 checks) and 7 more in `scripts/delete-journey.mts`. Kris, 17 September: *"yes build the admin control to clear hall contracting"* — a business that went through Stripe in TEST mode months ago, refused on sight by the delete, correctly, and therefore stuck on the live admin list with no way off it. The obvious fix is a button that nulls two columns, and it would be a hole exactly the shape of the guard it bypasses: whoever presses it is asserting *"this was only a test"*, which is the assertion the guard exists because people get wrong. So **the judgement is Stripe's, not the administrator's**. Four facts settle it — which mode SPEC's own key is in, whether Stripe can find the customer, whether any subscription is still running, and whether any invoice has ever actually been paid in live mode. A running subscription refuses; a settled live invoice refuses and outranks everything else; Stripe not answering refuses, because not knowing whether somebody is a paying customer is the one situation where carrying on is indefensible. **The one that is easy to get backwards**: "Stripe cannot find it, so it is safe" is how a real paying customer looks when SPEC is holding a TEST key, since a test key cannot see live objects at all — so that combination is its own named refusal with its own sentence, rather than a branch somebody has to spot. And it is deliberately not a delete: it clears two columns, after which the ordinary delete applies with every one of its guards, the name typed a second time. Two decisions, not one button that quietly does both |
| **Agreeing to the terms, and the record that somebody did** | `tests/legal.test.ts` (15 checks) and `scripts/consent-journey.mjs` (11, in a real browser), plus every other journey now ticks the box. Kris, 18 September, handing over the plumbing brief. The question that gets asked later is never *"did they tick a box"* — it is **"what did they agree to"**, and only the VERSION answers that, because the page gets edited and somebody who signed up in March agreed to the March words. So `terms_version` and `terms_accepted_at` are stamped on the account at the moment of agreement, from one source (`lib/legal`) that also prints the version on the page — two sources for the same version is how a stored record becomes a lie retrospectively. The box is **unticked and required**, and refused **on the server** as well: `required` is a convenience for the person and one line of devtools away from gone, and the record has to be true. Asked in BOTH places an account is created — signing up, and taking an invited seat, which is the one that gets forgotten and is the same act. Never recorded for somebody a manager merely put on the chart: consent for somebody who was not in the room would be worse than none, because it would look like evidence. **The starter draft was not used**: the existing pages already name the real sub-processors, Sydney hosting, per-tenant isolation, a no-AI-training commitment, the real contact address and Victorian governing law, where the draft carried `[LEGAL ENTITY NAME / ABN]` and `[CONTACT EMAIL]` — a live Terms page reading `[CONTACT EMAIL]` is worse than no page. What the draft genuinely added was merged in: an account clause, an IP-and-licence clause, and the reverse-engineering line. A check fails if any placeholder ever appears. The browser check that earns its keep **strips `required` off the input** the way anybody with devtools could and then presses the button: a box enforced only in the browser produces a record saying somebody agreed when the server never asked. It then reads the database, because the point is the record rather than the tick. **Not legally reviewed** — an Australian lawyer still has to read the Liability, Refunds and ACL sections before real money moves |
| **The org chart does what the design says it does** | `scripts/org-journey.mjs` (21 checks in a real browser) and `tests/orgchart.test.ts`. Kris, 18 September: *"this is not the same as on the design site - make sure everything is done 100% - its not the same"*. He was right, and the gap was not small: `SPEC Org Chart.dc.html` offers a right-click menu — **Add a direct report, Rename role & person, Break the link, Make this role vacant, Remove role** — and the product had none of it. There was **no way to rename a role anywhere in SPEC at all**; correcting a typo meant deleting the role and building it again, which throws away its KPIs, its training path and every closed month that referred to it. **The worse half is that `designs:coverage --deep` reported 100% throughout.** All three of its tiers read the design's MARKUP and one of them opens by deleting every `<script>` — which is exactly where a prototype keeps its menu. It did not fail quietly; it passed loudly, screen by screen, and printed the word *complete*. A fourth tier now reads only what the others throw away, and with the prototypes' invented jobs filtered out it finds 15 real gaps the old check could not see. Two departures from the prototype, both deliberate: a **⋯ button** as well as the right-click, because a menu reachable only by right-click is reachable only by people who already know it is there; and **no "Reset structure"**, which in the prototype restores its seed data and here would delete a real business's chart with one press. A check fails if it ever appears. Renaming a person is three different things — correcting an account holder's name, correcting a pencilled name, and pencilling somebody into a vacant role — and **clearing the box does nothing**, because a rename box that could quietly end a placement is a trap. Removing an occupied role is refused **in a sentence on the chart**, not by the error page the server's `throw` would otherwise render |
| **Anyone can report a safety problem, and an anonymous one has no name in the row** | `scripts/safety-journey.mjs` (18 checks in a real browser) on top of `tests/safety.test.ts`. Kris, 23 September: *"An anonymous psychosocial report must never store a name at all."* The unit tests prove `anonymise()` returns nothing identifying — that is the rule, and the rule is not the promise. Between the two sit a form, a server action, a schema default and a column a later edit could quietly start filling, so this journey is **the only one in SPEC that opens the database and reads the stored row back**. Every check that stops at the screen would pass on a build that stores the name and declines to print it. Four things must be absent from that row and each is checked by name: the reporter, the ROLE (which names somebody just as well in a business of forty), the job reference (which places them on a site on a day), and **the minute it was sent** — a timestamp is a name to anybody holding the roster, and it is the one most easily lost in a refactor that tidies up a date. A named hazard, by contrast, must keep its name, or the register has nobody to go back to |
| **The founder can hand administration on, and the last one cannot walk out** | `tests/administrators.test.ts` (16 checks) and `scripts/admin-journey.mjs`. Kris, 24 September: *"original person to sign up begins as an admin but they can change that to someone else if they wish."* The first half was already true. **The second half had no path anywhere in SPEC** — access was written once, by `assignPerson`, when a person was first created, and nothing could change it afterwards. Two faults followed: a founder who handed the GM seat on KEPT administrator, because access lives on the person and not the seat, so a business reached two and could never get back to one; and somebody promoted INTO the top seat did NOT become an administrator, because access is only set when creating a person who does not exist yet — a new GM inherited the chair and not the keys, and the only person who could fix it was the one who left. The rule refuses the last administrator stepping down rather than warning them, because a business with nobody administering it cannot add a seat, change billing or recover an account, and there is no self-service way back. Stepping down drops to manager, not read-only: taking somebody's own scorecards away as a side effect of handing over the keys would be a second change nobody asked for. The journey also found the wider fault — **/settings awaited its `searchParams` and discarded them**, so every refusal on the screen where seats, billing and administration are changed arrived as a page identical to the one you left |
| **Nothing lapses without somebody being told, and a lapse stops the work** | `scripts/compliance-journey.mjs` (18 checks in a real browser) and `tests/compliance.test.ts`. Kris's design of 24 September: *"Every licence, policy, certificate, contract and audit in one place. SPEC warns 60 days before anything lapses, and anything that lapses stops the work it covers."* Two of the six areas are **read, not copied** — licences are the `obligations` rows that already gate Clear to Work on People, and breaches are the corrective actions already raised on Safety. Both say so on screen and link to where they live, and neither can be added from here: a second copy of a hard gate is what makes both pages untrustworthy the day they disagree. The check that matters most is the emptiest one — a business that has recorded nothing counts zero stopping work and zero breaches, which reads as a clean bill of health, so the page says in as many words that it **cannot tell you that you are compliant, only that nobody has written anything down**. It warns at 60 days where Clear to Work warns at 30, and the screen says why: a renewal that takes six weeks against a shorter warning is a fortnight of somebody who cannot be sent anywhere |
| **A month can actually be closed** | `scripts/signoff-journey.mjs` (10 checks in a real browser). Twenty-one journeys existed and **not one had ever taken a month from open to signed** — the single thing SPEC is FOR was covered by unit tests on the pieces and by nothing end to end. It showed. Kris, 19 September, asked what the sign-off felt like: *"having to visit three screens"*, and what he wanted to do in one sitting: *"just sign off what others have marked"*. Approvals printed a card reading **Sign off September scoring** whose only action was a link to `/scoring` — it told him a thing was waiting on him and then sent him elsewhere to do it. The month itself is now on Approvals: what it comes to, every role with what it scored, what is outstanding and who it waits on, and the one action available right now. The journey signs up, puts the founder in the top role, marks every role, submits and **signs without leaving the page** — and it found four faults doing it, every one invisible to the unit tests. `submitPeriod` and `signPeriod` revalidated only `/scoring`, so pressing Submit on Approvals wrote the change and the screen denied it. `signPeriod` records a signature **without locking the month**, so a button keyed on status alone stayed on screen offering to sign a month that had just been signed, above a sentence that still said "Signing accepts it" — press, nothing happens, press again. And the founder could not sign at all until placed on their own chart, because signing is not delegable and `isTopOfChart` starts by asking which role the account holds |
| **Entering KPIs is one press from the chart** | `scripts/org-journey.mjs`. Kris, 18 September: *"its too complicated where i go to enter kpi's"*, then *"org chart and entering kpi's is everything to this system - why is it so hard"*. He was right. **Every route into the KPI screen in the product was an empty state** — a "Set the KPIs" link that showed while a role had none and vanished the moment it had them — so the first time was findable and every time after that meant typing the address or hunting through Setting up. The org chart, which is where the work actually happens, had **no route at all**. And the one on a role's own scorecard pointed at `/setup/kpis` with no role on it, so pressing it from a specific role opened whichever role the screen happened to list first. Now: **"Set this role's KPIs" is the first item on the chart's right-click menu**, carrying the role id — the path the brief describes, where you are looking at the chart, you open the role, you set its numbers — and the scorecard offers an edit link **always** rather than only when empty. The journey presses the menu item on a named card and asserts the KPI screen that opens is THAT role's, because going to the wrong role is the failure that was there before |
| **The navigation bar, and the virtual GM's eight on a business that already existed** | `scripts/nav-journey.mjs` (21 checks in a real browser) and `tests/doors.test.ts`. Kris, 18 September, looking at the product beside the designs: *"yes put the new kpis on jbi and keep the nav bar"*. **SPEC had no navigation at all**, and the reasoning against it was good — a toolbar of five links plus a dropdown of fourteen had made the product two things, a page you work on and a menu you hunt in. Every design screen has carried a bar throughout, and he is the one who opens this at seven in the morning. Six items, not nineteen; the complete grouped directory stays at the bottom of My Page. Built from `doors()` rather than written out again, so a renamed route cannot leave the bar pointing at nothing while the directory quietly stays right — and every item is opened by PRESSING it, because a href that exists is not the same claim as a page that opens. **Board pack had no address at all**: the pack lives at `/board/[periodId]` and was reachable only from a link at the foot of Executive summary once a month had closed, so `/board` is now the door and lands on Executive summary before anything has been closed. The bar wraps on a phone rather than sliding sideways, and nothing in it is under 24px. **The eight KPIs** reached only businesses created after the template changed, which left JBI — the first real customer — on the older generic set. The quick answer was a script pointed at the production database, which is the one thing this project has decided never to do; it is a control in the product instead, on the top role only, reaching precisely the one tenant the signed-in person can touch. Nothing is deleted: the old criteria are marked inactive exactly as an ordinary edit does, so a closed month keeps the scorecard it was scored against |
| **The mark moves, and the chart looks like the chart** | `scripts/mark-journey.mjs` (5 checks in a real browser), `scripts/org-journey.mjs` (24), `tests/orgchart.test.ts`. Kris, 18 September: *"the top left logo is supposed to move - you haven't done half the thing in this build - super disappointed"*, and before it *"fix all the rest especially org chart"*. Both were right. Every design file opens with the mark **playing** — over four and a half seconds the ring runs red, through amber, to green, the hand sweeps round with it and lands on twelve, and a small crown arrives at the end. That is SPEC's argument in four seconds, and the product was drawing the **last frame of it as a still**, on a black disc where the design's is deep sage. The animation is SMIL inside the SVG, which means **no unit test and no phrase check can see it**: the first attempt had markup that matched the design exactly and drew the hand a hundred pixels above the picture, because `animateTransform` on `transform` REPLACES an element's own transform rather than composing with it. So the check asks the browser where the hand actually is, whether it is in a different place a second later, and whether the ring finished green — and it was proven by putting the fault back and watching it fail. On the chart itself: the canvas is one raised panel the way the design draws it, with the viewing selector, the key and the counts inside it; the off-chart tray moved in under a dashed rule instead of sitting two scrolls below; and the two panels the design hangs off the chart — **Role scorecard** and **What the board sees** — exist at all for the first time, so pressing a role now shows what it is measured on and the averages are on the screen where they are made. The prototype's **slider that drags a pillar's score** is deliberately not built: a score in SPEC is what the KPI results add up to, and a control that sets it directly would make every number on the board a matter of opinion. A single click selects a card and a double-click opens its scorecard, which is the design's own mapping — the title used to be a link, so the one gesture that fills the panel navigated away from it instead |
| **There is one SPEC** | `tests/plan.test.ts`, `tests/jcurve.test.ts`, `tests/setup.test.ts`, `tests/enquiry.test.ts`. Kris, 18 September: *"take away the basic and advanced - either use the system with 1 person yourself for free - or add everyone and pay $26 per seat."* There were two tiers, `basic` and `advanced`, decided by one setup question — do you want the power of AI? Three things were wrong with it and they compounded. **It was not a price**: /pricing said both cost the same money, so the only thing the choice did was take features away for nothing in return. **The default punished the newcomer**: a new business landed on Basic, so the one screen that has to argue for the product carried an upsell strip and an Ask box saying asking came with Advanced — free and crippled is a different offer from free. **It argued against the pitch**: SPEC's whole claim is that connecting the systems is where the productivity comes from, and Basic was the tier that could not connect anything. Gone: the setup question, the settings switch, the company setting, the Basic wall on Connections, the upsell strip on My Page, the two pricing cards and the Basic-versus-Advanced comparison table. Every ROW of that table survives as `EVERYTHING_IN_IT` with the columns taken off, so the coverage check is unaffected and nothing was quietly dropped. The register now reads **every** problem, with `selfDiagnosed` kept as the fallback when a read fails — a register that refused an entry because a model was briefly unavailable would lose the thing somebody came to write down. `tenants.tier` stays in the schema and is no longer read: migrations here are additive by design, and dropping a column on the way past is how a rollback becomes a data loss. The shape divergence from `SPEC Pricing.dc.html` is recorded in designs/superseded.md rather than left to be noticed as drift |
| **SPEC does not claim a number arrived on its own** | `tests/no-false-feed.test.ts`. Found on 18 September, minutes after the tiers came out. My Page carried a block headed **"Numbers arriving on their own"**, a count of systems **connected**, and **"last read <date>"** under each. None of it was happening: `connectSystem` writes a row, `markLive` is an administrator pressing a button which sets the status to live and stamps `lastSyncAt` with the moment of the press, and there is **no OAuth anywhere in this repository**, no request to a vendor and no data. The date was when somebody clicked. It mattered less behind the Advanced tier; removing the tiers put it in front of every business, so it is a lie widened by a change meant to be generous and fixed in the same breath. The check found **three more places** saying it that I had not spotted — the J curve, Setup → systems, and the journey payoff. The register itself is real and kept: which systems the business runs, who owns each, and the board's approval for sensitive ones. **The check failed silently first**: its own evidence scan read the comment explaining *"there is no OAuth anywhere in this repository"*, matched `/oauth/i`, decided a connector existed and switched every ban off — proven by putting the banned wording back and watching all four checks pass. Comments are stripped before the evidence scan now, and it is proven both ways. Sixth time prose has been mistaken for behaviour here, and the first time it happened inside the check written to stop it. The ban lifts by itself when a real connector lands, which is asserted rather than assumed |
| **One number for the board, and it refuses to be a guess** | `tests/power-meter.test.ts` (47 checks). Kris, 19 September: *"add the Virtual GM power meter - HACC your power - to the my page - this is the power meter gathering information through the spec system to give an instant percentage to the business leaders and the board on how well the business is tracking"*. Twenty-five measures, five of them heavy hitters carrying 15 points each — somebody hurt, a workers' comp claim, gross profit below the line, a contract breached, people leaving faster than they arrive — and twenty sharing the other 25 — the twenty-fifth being the **Snap Score**, computed from the improvement register rather than read off anybody's scorecard, and the only measure here no business has to remember to create. It is met at 75, the product's own green line for it, so a business never gets two official opinions about the same score on two screens; a register too young to read is *not measured* rather than a fail, because three problems is not a pattern. That weighting IS the opinion: a business with immaculate debtor days and an injured apprentice is not doing well, and an average that says so is worse than no average. The design ships it with a `GM_METERS` mock; it is built instead out of the business's own criteria and how each was marked this month, so changing a mark changes the meter and there is no second copy to go stale. **Most of the work is the refusals.** A slot SPEC has no KPI for is excluded from both sides rather than counted as a miss — a business with no TRIFR criterion is not failing TRIFR. Below six of the twenty-five, or with none of the five heavy hitters, it puts up **no number at all**: one matched KPI that went well reads 100%, which is arithmetically true, completely wrong, and on the screen a board looks at. The ring draws nothing rather than an empty arc, because a ring stuck at zero and a ring with nothing to say look identical and mean opposite things. One miss behind a slot makes the slot a miss, never an average. The match from the business's own words to the framework's is **shown on the row**, because a mapping somebody can see is one they can correct. Read over the viewer's own scope in the query, so a manager's meter is their branch. The design opens the breakdown on a double-click; it is a link here, because a double-click cannot be discovered, reached from a keyboard, or done on a phone |
| **The org chart's own rules, to design 15** | `tests/chart-seats.test.ts` (26 checks). Kris, 19 September: *"now do the org chart"*. **Two seat types**, and the rule is BOTH signals rather than the design's one: a role leads if somebody reports to it **or** its title says it does. By title alone a business renames its way to cheaper seats; by the chart alone a Site Supervisor whose crew has not been drawn yet is billed as somebody who is led. Money rides on it, so the safe direction to be wrong in is the expensive one. The **✓ SPEC Certified** mark only ever shows on a leadership seat somebody is actually in — a tick against an empty chair certifies a vacancy. **Readiness dots** use `MIN_KPIS`, which was the literal `2` here and the literal `2` in `lib/period`; that is how a chart goes green on a pillar against a month that will not open on it, so one place owns it now. The **sign-off deadline** — first Wednesday of next month — is one function rather than a client-side placeholder, because a deadline printed by one rule and enforced by another is a deadline nobody believes twice. A **duplicate KPI is refused case-insensitively**: two spellings of the same measure look like the minimum of two and are really one. And **scoring is the manager's**, not a prototype toggle — with nobody scoring their own card, administrator or not, which is the one place that toggle would have quietly become a way around the rule the product is sold on |
| **A business can link its accounts, and the ledger is guarded** | `tests/xero-net.test.ts` (37 checks), `tests/xero.test.ts`, `scripts/xero-journey.mts` (21 in a real browser against `scripts/fake-xero.mjs`). Kris, 19 September: *"now do the xero oauth"*, after *"be very careful with connectors especially xero and financials - how are we controlling this - not everyone should be able to connect Xero"*. The board decision moved to the **front** of the flow: it used to be checked at `markLive`, which was right while nothing was ever stored, but the moment a customer completes consent SPEC is holding a key to their accounts whatever any row says afterwards — so an unapproved connection cannot start the flow, and it is checked again on the way back, which is the request that actually writes. The refresh token is sealed with AES-256-GCM and the shape every page reads does not carry it. **Rotation is the fault that would have been invisible**: Xero retires a refresh token the moment it is spent, so the new one is stored BEFORE the access token is used, held against the order of the code and proven by reading twice. A login reaching several organisations is asked which, never guessed — taking the first would put somebody else's accounts on a scorecard. Disconnecting deletes the credential rather than blanking a status. **`scripts/fake-xero.mjs` had been claimed by a comment in `lib/xero.ts` since 18 September and did not exist**; it does now, and answers the awkward shapes on demand — no `offline_access`, no Gross Profit line, a cancelled consent, a month with no figure. None of this has spoken to Xero: the egress proxy here denies every Xero host, so what is proven is SPEC's two ends against Xero's published contract and nothing about whether Xero agrees |
| **An org chart can be imported from the file a business actually keeps it in** | `tests/chart-text.test.ts` (20 checks) and `scripts/chart-import-journey.mjs` (14, in a real browser). Kris, 18 September: *"when i am trying to import my org chart - it doesn't give the option of pdf or word doc. that how they will do it"*. The picker took CSV and plain text only, and the note explaining why said Word and PDF are compressed formats needing a parser, and that **a picker which accepts a .docx and then silently produces nothing is worse than one that never offered**. The second half is still the rule and is what most of this is built to. The first half was a reason to do the work: nobody keeps their org chart as a CSV — they keep it as the document somebody made for the induction pack. A `.docx` is now unzipped **in the browser** with `DecompressionStream` and no library at all, and a PDF is read with pdfjs loaded only when somebody actually picks one. **Nothing is uploaded**, which is the promise the whole feature rests on: a payroll export is a list of everybody who works somewhere and never needs to leave their machine. Three quiet failures are held by name, because each one would otherwise look like SPEC being broken: a title Word split mid-word across runs (a spellcheck mark is enough) is put back together; a table row is one line rather than three, which took two attempts — the first fix also swallowed the row break after a row whose last cell was empty, and an empty *reports to* is exactly what the top of every chart has; and a **scanned** chart — a photograph of a page, which opens, has pages, reads perfectly and contains no text at all — is named as a scan rather than failing silently. A `.doc`, `.xls`, Pages or Numbers file gets the one sentence that moves somebody forward instead of "cannot read that". A PDF gives up its names and loses its reporting lines, and the page says so **every time** rather than only when it goes wrong. The journey builds a real .docx and a real PDF byte by byte — the two things that actually break are unzipping in the browser and pdfjs finding its worker inside a Next bundle, and neither is reachable from a unit test |
| **Which prices may be said out loud** | `tests/published-prices.test.ts` (9 checks). Kris, 18 September, setting the three tiers. The seat (A$26) and training (A$1,502, up from A$1,007) are published; **the consulting price is not** — *"At this level people buy trust, not a price tag."* That is not secrecy and not negotiability: the price is fixed and /admin shows it. It is about order — a five-figure monthly number read before anybody has explained what a full day a week buys ends the conversation instead of starting it, so the card says *Let's talk*. A check fails if A$20,888 ever appears on a page a stranger can open, which it did until this morning because nobody had written the rule down. The training price moved because A$1,007 across four sessions read as about A$250 an hour — a freelancer's rate, not Kris teaching somebody to run a business — and **no page may quote an hourly rate at all**, which is now enforced across the whole of `src/` rather than merely understood. All three figures still reduce to 8 |
| **A test business can be cleared, and a real one cannot** | `scripts/delete-journey.mts`, 15 checks against a real database, and it is in `npm run check`. Kris, 16 September: *"yes build a safe way to clear the test businesses"* — the alternative being somebody typing DELETE into a console at the same keyboard that holds the only copy of every real customer. The safety is the whole feature: the name has to be typed exactly, it is never the business you are signed into, and **a business Stripe has ever heard of is refused however carefully it is typed** — that last guard is not about slips, it is about being wrong that a business is a test. Everything happens in one transaction and the database is asked afterwards whether any row anywhere now points at something that has gone; a single orphan rolls the whole thing back. Proven by taking `criteria` out of the delete list: Postgres refuses to remove the role it still points at, nothing is deleted, and the only thing wrong was that it arrived as a stack trace — so a forgotten table is now a sentence, which is the same fault this product spent the day fixing everywhere else |
| **The A$44 cannot be sold before it exists** | `tests/training-seat.test.ts`. Kris, 16 September: *"happy to remove the 44 from the plan for the short term and start cleanly... leave it as a price for the future - i havent finished the supervisor training pack anyway"*. One switch, `TRAINING_SEAT_ON_SALE`, and a test that fails if anybody — supervisor included — can be put on a training seat while it is false. The price stays published and the material, the eligibility rule and the two-rate Stripe bill stay built and tested behind it, because deleting a feature and rebuilding it in a month is how it comes back worse. It also takes `STRIPE_PRICE_SEAT_TRAINING_MONTHLY` off the critical path for the first real payment: no training seats can exist, so checkout never asks for it |
| **Boards — the live artifacts a team pins and argues over** | `tests/boards-live.test.ts` (24 checks) and `scripts/boards-journey.mjs`. Kris, 16 September: *"no build these boards (artifacts) now - this is a key component of running the business properly"*, from design export 3. It is the one screen in SPEC that is the business's own artifact rather than SPEC's reading of the business — the worked example being a Rate Board whose four inputs come from the systems the business already runs, landing on A$105/hr instead of A$115/hr, so the disagreement is with the actuals rather than with whoever set the rate. **Live is derived from the connections, never stored**: a board with one working feed out of two is not live, and the page names the feed that is the reason, because "partly current" reads as "current" on the screen where somebody drops a sell rate by ten dollars an hour. "Editing now" is real — a five-minute window off actual page opens — because a row of faces that are not there would be a lie told on the one page where two people are about to disagree. Conversation boards were NOT folded into it: they share a word and nothing else, and that one is a mirror built to raise one question and reach no verdict |
| **Somebody stuck gets an answer without emailing us** | `tests/help.test.ts` (13 checks) and `scripts/help-journey.mjs` (16). Kris, 17 September: *"lets make an issue register expected from users… go through the full list and lets make sure we have simple answers for them all"*. What existed was one footer link reading "Get help" that opened an email to Kris — a queue with one person at the end of it, bearable at one business and silence at seven in the evening. `/help` now answers 39 questions in the words people use rather than the words the product uses, and it **works signed out**, because the person who most needs help is the one who cannot get in. Every answer is held to the product: the page it names must be a real route and the button it names must be reachable from that page by following its imports — a help page naming a button that is not there is worse than no help page, since somebody following it concludes they are the problem rather than that the instructions are old. Three answers are refusals, said plainly: the one people hunt hardest for is changing somebody's access, and there is no switch, because permissions follow the role. Two faults of my own were caught by these checks — a search for "the" returned all thirty-nine answers, and a browser check asserting "the button it named is really there" passed while still sitting on `/help`, because the help page quotes the label |
| **How simple, intuitive and responsive it is — measured** | `scripts/usability-journey.mjs`. Kris, 17 September: *"consider all possible ways people will not use this properly - then lets test ourselves on how simple and beautiful the system is"*. It signs a business up, reads the doors off My Page, and measures all 25 of them: every one opens inside 2.5s, every page says where you are, nothing shows a fault instead of a sentence, every one is checked signed out, and every page is opened again at 390px of phone. It does not score taste — nothing in it says a colour is right. It found, on its first run: **Executive summary 211px wider than a phone and Conversation boards 316px wider**, so a third of each was off the edge (a card is a grid item, and grid items refuse to shrink below their content, so the table's own scroll never got the chance to work); the **SPEC mark at 35px** — the only navigation the product has, and the hardest thing in it to hit with a thumb; every button at 36px; and the footer links, one of which is *Get help*, at 16px. The two floors it holds things to are WCAG's, not mine — 24px for anything pressable, 40px for a button — because one number meant either failing every quiet link or lowering the bar until the real buttons passed, and a threshold tuned until everything passes is a decoration |
| **The ways people will get it wrong, written down** | `docs/MISUSE.md`. Every row is something a real person will do, sorted by whether SPEC caused it, answers it, or does not handle it yet. The last group is the point: five open ones, named so they are decisions rather than oversights — the worst being two people from one business signing up separately, which is silent, expensive, and entirely foreseeable |
| A seat can be taken exactly once | `scripts/seat-journey.mjs`, 14 checks. Single use, expiring, bound to that address, and a refusal that never says "invalid token" |
| Every table is isolated in the database too | `npm run db:check-rls` applies the real policy file and then asks Postgres what it actually got. **62 of 62** |
| A stranger with the project URL can change nothing | The same command stands up a role with exactly what PostgREST hands an anonymous caller, then tries it: reads the shared rulebook (must work) and deletes it (must not). Added 15 September after Supabase found `rulebook_rules` open to anonymous **delete** |
| The product carries what the designs say | `npm run designs:coverage` — **174 of 174** headings and buttons and **471 of 471** labels, across 24 screens, named individually when one is missing. The percentage rounds DOWN and prints 100 only when every phrase is really there. **The landing page and My Page are pinned word for word** (`designs/pinned.md`): everywhere else a reworded match counts, which is right — the product is not a transcription of a prototype — but on the first thing a stranger sees and the thing a customer opens every morning, "close enough" is how a page drifts a word at a time until it is nobody's design. A loose match on either fails the build and names the phrase. Kris, 16 September: *"make sure the landing page and my page are always perfect"*. Turning it on found two real gaps rather than wording quibbles — My Page showed three training modules and had no way through to the rest, and the landing page had lost its way to reach a person. Five exceptions are written down with a reason each, and "All pages" stopped being counted at all: it is the prototype's own index, and it was passing as reworded on eight screens |
| **SPEC Business Solutions' own numbers reach nobody else** | `/cockpit` is not part of the client product. It is the founder's own page for the company that sells SPEC — revenue, client count, the road to 20,000 seats — and it concerns no customer at all. `scripts/cockpit-journey.mjs` drives two real people: an ordinary customer, who is redirected away and is shown none of it on the way past, and an allowlisted address, which gets in. Gated on `ADMIN_EMAILS`, checked on the server on every request — a hidden link is not access control, and the address is guessable |
| The goals survive being set | `scripts/goals-journey.mjs`, 22 checks. Set at step one, visible afterwards on the board pack and monthly scoring, and gone from both when cleared |
| SPEC reads the chart and the leader decides | `scripts/predict-journey.mjs`, 18 checks. Runs with **no API key**, finds a real gap, and a denied role is never proposed again |
| **The automation review engine** | `scripts/automation-journey.mjs`, 40 checks in a real browser. A business that has just signed up already has 10+ candidates, every one carrying a build brief with a trigger, steps, systems and guardrails. A rejection with no reason is refused by the SERVER, not just by the form. Something written into the intake box reaches work SPEC already knew about and raises its priority. `tests/review-engine.test.ts` holds the brief's own acceptance test: at least ten credible candidates, and the solar quote in the top three without being told about it |
| **Which parts of a role a process could do — and who may see that** | `scripts/automation-journey.mjs`, 22 checks. It drives the real page: every verdict carries its reason, the section saying what must STAY with a person is present, hours nobody counted produce no figure, six hours somebody DID count produce one, and no dollar amount is invented from a rate nobody set. The last checks are the point — another business never sees this one's review, and a stranger is sent to sign in |
| The goal reaches a scorecard without setting anybody's target | `scripts/cascade-journey.mjs`, 17 checks. The last one opens the role's own KPI page and confirms the agreed target is still empty |
| An expired ticket stops somebody working | `tests/obligations.test.ts`. It caught a real defect before release: a licence expiring **today** was reported expired, which would have blocked people who were fine |

**One command runs all of it: `npm run check`.** It prints one line per thing in
plain words and ends with a verdict. A skip is never counted as a pass, and
"I could not check this" and "this is broken" are different sentences.

Last run, 16 September: **WORKING — all 12 checks passed**, nothing skipped.

---

## Assumed

True as far as I can tell by reading the code. **Nothing here has been executed
against the real thing.**

### Payment has never been taken

`src/lib/stripe.ts` and three API routes exist and typecheck. `STRIPE_SECRET_KEY`
has never been set in any environment I have run. **No payment has ever been
attempted, succeeded, failed, or been refunded.** A checkout that 500s on the
first real customer would be discovered by that customer.

### Email is live — and this file is not where you find that out

Kris, 17 September: *"The live site shows the email line as Working, and the key
was last used a couple of minutes before I checked."* `specbizhq.com` is
verified, `RESEND_API_KEY` is in Vercel, and `/status` reads **Working**.

This section used to say the opposite, and I repeated it at him from here after
it had stopped being true — which is the whole lesson. **Nothing in this document
can tell you the state of the live system.** A settings value lives in Vercel and
changes without any commit; a file in the repository cannot know, and a file that
claims to know is worse than silence, because it sounds authoritative.

**So: `app.specbizhq.com/status` is the only answer to "is X switched on".** It
asks the running system rather than reciting a note — which is exactly why it was
built, after /status itself was caught reporting key PRESENCE rather than whether
the key WORKED.

That page cannot be reached from a sandboxed agent session: the egress policy
blocks `specbizhq.com`. Which means the honest answer to a configuration question
from in here is "I cannot see it — what does /status say?", and never a
recollection.

### The automation review has never been opened by a manager

The gate — Managing Director, CEO and board only — is one function,
`mayReadAutomationReview`, called by both the page and the server action, and
`tests/automation.test.ts` proves it refuses every level below the top of the
chart. `scripts/automation-journey.mjs` then proves the real thing for the two
cases it can reach without an invitation: another business never sees this one's
review, and a signed-out stranger is sent to sign in.

What has **not** been done in a browser is the case in the middle: a manager,
inside the same business, signed in as themselves, opening that URL. That needs a
second real person with a seat. It is the same code path as the two that are
proven, and I still would not call it proven until somebody has actually tried it.

Email is live, so nothing is standing in the way of it now. Do it the first time
somebody at JBI takes a seat.

### Sign-in has never run against real Supabase

The journeys run against `scripts/fake-auth.mjs`, which speaks enough of the
provider's HTTP API for the real client to talk to it unmodified. That is a
genuinely strong test of *our* code and proves nothing about Supabase's
behaviour, its rate limits, or its email delivery.

### Tenant isolation rests on application code alone

**Corrected, 12 September.** I first reported "5 of 23 tables have a policy". That
was wrong — I had missed a loop covering eight more. The real figure was 12 of
23, and it is now **39 of 39**, with `rulebook_rules` global by design and
`health_pings` locked to everybody. Every table added since — the goals, the
predicted roles, the cascade — was added to the policy file in the same commit
as the schema, and `npm run db:check-rls` fails if one ever is not.

Two things were genuinely wrong, and both are fixed:

- The file referenced `claude_registrations`, **a table that does not exist**. It
  therefore aborted partway through, and every policy below that line — including
  `role_assignments`, `criteria`, `assessments`, `gates` and `board_outputs` —
  was never created. It now skips a table the database does not have.
- The file needs Supabase's `auth.uid()`, so our own Postgres could never apply
  it, which is why **nobody had ever run it.** `npm run db:check-rls` stubs that
  one function, applies the real file unmodified, runs it twice to prove the
  idempotence it claimed, and then asks the database what it actually got. It is
  in CI.

What remains true: the app connects as the role that owns the tables, which
Postgres lets bypass RLS. So for the app's own path RLS is still not the control
— `tests/tenant-isolation.test.ts` is. The policies now genuinely protect every
other route into the same database, which is what they were always for.

### The key is on. Nothing has been read by a person yet

`ANTHROPIC_API_KEY` was set in Vercel and deployed on 16 September 2026, and the
live site confirms it the only way worth confirming: `/status` asks Anthropic for
a real reading every fifteen minutes and reports what came back. It says
**working**.

That settles the half of step 5 that is plumbing. It does not settle the other
half. **No real reading has ever been judged by a person.** The prompts are the
design's own and the invariants are enforced in code, but the front door's whole
argument is that the reading is good, and nobody has yet typed ten real problems
into it and decided whether it is.

Until somebody has, the honest position is that five things — the front-door
diagnosis, the category mapping, the predicted roles, the KPI cascade and the
board pack's written draft — are now asking Claude instead of falling back, and
what they get back is unreviewed.

Worth keeping in view: every one of them still **degrades honestly** if the key
dies, the credit runs out or Anthropic is down, and says which reading you are
looking at. That is why this step could safely be left until last. It is also why
a dead key would produce no error and no complaint — which is what `/status` now
exists to catch, because nothing else would.

---

## Unknown

Things I have no way to answer from here.

- **Is production actually up?** The agent proxy blocks the live host, so I have
  never loaded the site in a browser. `npm run check` now asks GitHub's own
  commit-status API instead and reports the deployed commit, which answers "is
  what I just pushed live?" but not "does it look right to a person".
- **Backups.** Whatever Supabase does by default. Never configured, never tested,
  never restored. Still step 3.
- ~~**Load.**~~ **Tested, 13 September.** `scripts/load-test.mjs` stands up 20,028
  seats against a local Postgres and found three real scaling faults, including a
  missing index that read 16,008 rows to return 24. Never run against the live
  database, and never with 20,000 people using it at once — what was measured is
  the shape of the queries, not the hosting.
- **Security review.** None. No dependency audit, no penetration test.
- **Legal.** Terms and Privacy are pages with words on them, written by me and
  never read by a lawyer. You are about to take money from businesses and hold
  their staff records.
- **Accessibility beyond colour.** Contrast is measured. Keyboard navigation and
  screen readers are not.

---

## Before the first paying customer

In order, and the order is now fixed. Kris, 14 September: *"adding an anthropic
api key and stripe completion are the final 2 steps once everything else is
complete."*

### Before JBI, specifically

JBI is the first paying customer and the complete test case at the same time.
Every line below is a real thing that has never been done, and they are about to
be the first to do it.

- **Nothing to set up. They pay.** Kris, 16 September: *"i will pay for JBI and
  use it as a complete test case — don't modify."* That reverses the earlier plan
  to put them on the free beta, and it is the stronger call: a customer who is not
  billed never tests billing, and the checkout, the webhook and the seat count
  would have stayed unexercised until a stranger walked them. There is no flag, no
  exception and no branch — they sign up at the front door like anybody else.
  **Which means Stripe (step 6) now comes BEFORE they start, not after.**
- **Invite the first one and watch it land.** Email is live — `/status` reads
  Working — so the first invitation is a real send, not a workaround. Send one to
  yourself before sending forty: a verified domain still has a first email, and
  the thing to check is that it arrives in an inbox rather than in spam. The
  copyable seat link on Setup → Your business is the fallback if it does not.
  Single use, bound to that address, proven by `scripts/seat-journey.mjs`.
- **Prove sign-in with ONE person first.** Nobody has ever signed in against real
  Supabase who had not signed in before. Do it with one JBI person before handing
  links to forty.
- **Know that no backup has ever been restored.** That is step 3 below, and it
  matters more the moment the data is a real business's.

### First — the things a customer would find out for you

1. ~~Send a real invitation.~~ **Done — email is live.** `specbizhq.com` is
   verified and `/status` reads Working. What is still worth doing on the day is
   sending one to yourself and confirming it reaches an inbox rather than spam: a
   verified domain still has a first email.
2. **Sign in against real Supabase**, on the live site, as a person who has never
   signed in before.
3. **Restore a backup** into a scratch database. A backup nobody has restored is
   a belief.
4. **Have somebody who is not you** sign up, on a phone, without help.

None of those four is large, and every one is currently something you would hear
about from a customer rather than from a test.

### Then — and only then — the two keys

Both of these are a paste into a settings box and a redeploy. Neither is a build,
and nothing above depends on either: **the product is complete and honest without
both.** That is what makes leaving them until last a decision rather than a delay.

Neither key is ever pasted into a chat, an email, a document, or a commit. It goes
from the console that issued it straight into the Vercel settings box, and nowhere
else. A key that has been seen outside that path is burnt and has to be reissued —
this has already happened once, to a Resend key, and reissuing takes under a
minute where finding out later does not.

5. **Turn on `ANTHROPIC_API_KEY`** ✅ — *and read ten real problems* ⬜

   The key went in on 16 September 2026 and `/status` says **working**, which it
   only says after asking Anthropic for a real reading and getting one back. The
   plumbing half is done and provable.

   The half that is left is the one that matters, and it is not something I can
   do: **type ten real problems into the front door, in the words a sparky would
   use, and decide whether the reading is any good.** The whole landing page is an
   argument that it is. Nobody has tested that argument yet.

   Do it before JBI sees it, not after.

   No code change was needed. One redeploy — Vercel binds environment variables
   when a deployment is built, so a key added to the settings box does nothing
   until the next deploy picks it up. There is a Redeploy button on the latest
   deployment; that is the whole of it.

   The Console needs credit on it. Without any, the key is valid and every call is
   refused, which looks exactly like not having a key at all: the product falls
   back to the deterministic reading and says so, and nothing appears to be wrong.
   (Funded, $100, 16 September 2026.)

   **Set a monthly spend limit in the Console at the same time.** One endpoint in
   SPEC spends money for people who are not signed in — the front door's problem
   box, `src/app/api/enquiry/route.ts` — because that free reading is the entire
   argument of the landing page. It is capped two ways: one paid read per cookie,
   and twelve an hour from any one address, after which everybody still gets a
   reading, just the deterministic one. Nobody is ever turned away.

   That address cap is a floor and not a ceiling. It counts in the memory of the
   server instance that handled the request, so a busy site with several instances
   running counts several times over, and a spread of addresses is not held to any
   single one of those tallies. Against one person it holds; against a thousand
   machines it does not.

   The limit that does hold is the one Anthropic enforces. A monthly ceiling in
   the Console bounds the worst case absolutely, whatever anybody points at the
   front door, and the failure when it is reached is the good one: the product
   falls back to the deterministic reading and keeps working.

   The other four callers are all behind a sign-in, so their spending is bounded
   by paying customers doing their jobs.

   What changed when it went on — and what to judge when reading the ten:

   | | Before the key | Now |
   |---|---|---|
   | A problem typed on the front door | The deterministic reading — right about the pillars, generic about the business | Claude's reading of their actual words |
   | Predicted roles | The structural half: a stream nobody owns, a pillar nobody measures, a span past seven. True and checkable | That, **plus** a judgement about their trade against their own goals |
   | The KPI cascade | Where the goal has nobody moving it. It refuses to invent a number | The measure **and** the figure, cascaded top down |
   | The board pack | The written draft as generated | Rewritten in plain terms for an owner |

   Every one of those still degrades honestly rather than breaking if the key
   dies, the credit runs out or Anthropic is down, and says which reading you are
   looking at — that is what made leaving this until last safe. It is also why a
   dead key would raise no error and draw no complaint, which is what `/status`
   is now for.

   **Still not done: the reading has never been judged.** Right column, ten real
   problems, a person deciding. Until then the front door is making a promise
   nobody has checked.

6. **Take a real payment.** Step by step in **`docs/STRIPE_SETUP.md`**, which is
   generated from the code and held to it by `tests/stripe-setup.test.ts`. Stripe in
   test mode end to end, then one live transaction you refund. `src/lib/stripe.ts` and three API routes exist and
   typecheck; `STRIPE_SECRET_KEY` has never been set in any environment, so **no
   payment has ever been attempted, succeeded, failed, or been refunded.**

   Last, because there is no point proving the till works before the shop does.

---

## Designed but not built

Design coverage is back to **100%** on both tiers as of 14 September — the three
features export 5 added are built. What is left below is what remains. These are
gaps, not disagreements — `designs/superseded.md` is for wording the product is
RIGHT not to carry, and "we have not built it yet" is explicitly not allowed
there. It belongs here, where it is uncomfortable.

From **design export 5**, 14 September 2026:

| Not built | What it is |
|---|---|
| ~~**Predicted roles — approve or deny**~~ | **Built, 14 September.** SPEC reads the structure and proposes what is missing, each with a reason, and nothing is real until the leader approves it. The structural half is arithmetic on their own chart and runs with no API key at all; Claude's half layers on top where there is one, and each proposal says which it came from. A denied role is never proposed again. `scripts/predict-journey.mjs`, 18 checks |
| ~~**Goals as Setup step 1**~~ | **Built, 14 September.** Three questions before any role or KPI exists, visible afterwards on the board pack and monthly scoring. `scripts/goals-journey.mjs`, 22 checks |
| ~~**Predictive KPIs from the goal**~~ | **Built, 14 September.** The goal worked down the chart, top first. Adopting a row writes the figure as a PROPOSAL and leaves the agreed target empty — SPEC may suggest what a role measures and may never set the number a person is judged against. `scripts/cascade-journey.mjs`, 17 checks |
| **The per-person incentive gate** | A second precondition on Ace beyond being signed off — the business has to have opened the incentive to that person. Until then no months count and the card reads "Incentive not open". One additive column on `role_assignments` |
| **Bring your own AI key** | Connections gains a provider choice: Claude, your own API key, another AI |
| **Viewing the chart from one role** | A "viewing as" selector, plus a team-count badge that collapses a branch |

The coverage check names only the first two, because they are headings. The rest
are body copy and behaviour, which it cannot see — and that limitation has now
cost three visual faults nobody caught. Worth stating plainly: **design coverage
proves the product SAYS what the designs say. It never proves the product looks
or behaves like them.**

---

## What this document is not

It is not a statement that the product is bad. The engine is correct against a
specification that is itself settled, the four journeys a customer takes are
proven in a browser on every change, and three real bugs were found by tests
written in the last hour — a cross-tenant date leak, five queries that could show
a private mailbox to a whole business, and a colour palette nobody could read.

That is a system that catches things. It is not yet a system that has been
through the one test that matters, which is a real person paying real money and
getting what they paid for.

---

## Why it felt like a problem every day

Worth writing down, because the answer changes what to do about it.

Almost none of it was new breakage. It was **old breakage becoming visible**,
because the checks that look for problems were only built in the last few days —
before that, "is it working?" was answered by me re-reading my own work, which
is the one method guaranteed to miss whatever I misunderstood the first time.

Every defect found since has been found by something that runs on its own:

- the seat could only be taken once and then said the wrong thing on a second
  click — found by a browser driving the real link
- five queries could show one person's private mailbox to their whole business —
  found by a test that reads the source
- seven queries read across every business, one of them a genuine leak — same
- a ticket expiring *today* was reported as expired, which would have blocked
  people who were fine — found by its own test, before release
- the row-level security file had never once been run, and aborted partway on a
  table that does not exist — found by applying it for real
- three of four signal colours were unreadable as text — found by measuring

The rate of discovery is high because the *looking* is new, not because the
product got worse. It will fall. What should not fall is the looking: everything
above is now in `npm run check` and in CI, so none of them can come back quietly.
