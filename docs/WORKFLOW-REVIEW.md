# Workflow review

78 workflows · 73 run end to end · 5 have a step with no home yet.
187 steps, 81 of them (43%) happen without anybody doing anything.

**How to mark this up.** Against any workflow, one of four things:

- **WRONG** — that is not how it works in a trade business.
- **MISSING** — a step that has to happen and is not here.
- **NOT OURS** — real, but not something SPEC should do.
- **SHOULD BE AUTOMATIC** — a step marked Office or Site that SPEC could just do.

The last one is the valuable column. Every step SPEC does is a step nobody has to be trained
to remember, and it is the whole difference from what you walked away from.

---

## Commercial

*Making sure the money is in order — more in than out, and what the work costs under control.*

12 workflows · 11 end to end · 64% of steps automatic

### Winning work

**Find out whether you price it right**

- Starts: A finished job that was quoted.
- Done when: The next quote for that work is priced off what it really takes.
  · **SPEC** — Quoted hours against actual hours, by type of work. *(/jobs?tab=howlong)*
  · **SPEC** — What that does to margin. *(/jobs?tab=wip)*

### Materials, tools and plant

**Raise a purchase order**

- Starts: Materials a job needs ordering.
- Done when: Ordered against the job, with the order on record.
  · **Office** — Raise the order against the job. *(/jobs?tab=stock)*

**Match the supplier’s invoice**

- Starts: The bill arrives.
- Done when: Paid, or held because it does not match the order.
  · **Office** — Record the bill against its order. *(/jobs?tab=stock)*
  · **SPEC** — A bill higher than its order holds payment until somebody says why. *(/jobs?tab=stock)*

**The supplier puts prices up**

- Starts: A new price file.
- Done when: The catalogue is repriced and every quote already out with the old price is named.
  · **Office** — Paste in the supplier’s price file. *(/jobs?tab=catalogue)*
  · **SPEC** — Anything up more than 5% is named, because quotes already out are now wrong. *(/jobs?tab=catalogue)*

**Hire a scissor lift**  ⚠ has a hole

- Starts: A job needs plant you do not own.
- Done when: Off-hired the day it is finished with, not three weeks later.
  · **Office** — The job needs plant. *(/jobs?tab=pipeline)*
  ✗ **Office** — Put it on hire against the job, and be told to off-hire it when the job finishes.
      NOT BUILT: There is no on-hire/off-hire register. Hire that runs past the job is one of the quietest margin leaks in the trade — the cost lands weeks later on a bill nobody connects to the job.

### Getting paid

**Invoice a small job**

- Starts: The job is signed off.
- Done when: Invoiced, and in the accounting system.
  · **SPEC** — Sign-off releases the invoice. *(/jobs?tab=billing)*
  · **SPEC** — It goes to the accounting system — SPEC does not keep a second set of books. *(/connections)*

**Claim on a big job**

- Starts: A stage is done, or the month ends.
- Done when: Claimed and paid.
  · **Office** — Claim by amount or by stage. *(/jobs?tab=billing)*
  · **SPEC** — Variations must be agreed before they can be claimed. *(/jobs?tab=billing)*

**Get the retention back**

- Starts: A builder holds retention.
- Done when: Released when it is due, rather than forgotten.
  · **SPEC** — Retention held shows as a running figure. *(/jobs?tab=billing)*
  · **Office** — It is released when due. *(/jobs?tab=billing)*

**Chase the money**

- Starts: An invoice goes past its terms.
- Done when: Paid, with every chase recorded so the same one never goes twice.
  · **SPEC** — Reminders at 7, 14 and 30 days. *(/jobs?tab=billing)*
  · **SPEC** — Each one recorded. *(/jobs?tab=billing)*

**Did the job make money**

- Starts: A job with labour, materials and variations on it.
- Done when: The real margin, while there is still time to do something.
  · **SPEC** — Labour, materials and variations land on the job live. *(/jobs?tab=pipeline)*
  · **SPEC** — A margin below the benchmark says so on the board, not at invoicing. *(/jobs?tab=wip)*
  · **SPEC** — Margin at risk outranks a billing gap, and asks for a variation. *(/jobs?tab=wip)*

**Will there be enough money**

- Starts: Looking at the weeks ahead.
- Done when: A running balance, and a warning before it goes under the buffer.
  · **SPEC** — Money in and money out, as a running balance forward. *(/jobs?tab=cash)*
  · **Office** — The buffer is the business’s own number, not one SPEC invented. *(/jobs?tab=cash)*

**Run the pay**

- Starts: The pay period ends.
- Done when: Paid right, with the check done before the run rather than after.
  · **Office** — Approved hours. *(/jobs?tab=time)*
  · **SPEC** — Checked against award rates, levels and allowances BEFORE it goes. *(/people?mode=pay)*
  · **SPEC** — What the check found is kept as written. *(/people?mode=pay)*

---

## Operations

*Getting the work done, safely — the crews, the jobs, the people and everything that keeps them right.*

47 workflows · 44 end to end · 42% of steps automatic

### Doing the work

**Put a job on the board**

- Starts: Work that has been won.
- Done when: It has a day, a crew and a customer who knows when.
  · **Office** — It goes on the board. *(/jobs?tab=pipeline)*
  · **Office** — Drag a crew onto a day. *(/jobs?tab=schedule)*
  · **SPEC** — Nobody who is not clear to work can be put on it. *(/safety?tab=clear)*

**Send the crew out**

- Starts: The day starts.
- Done when: Everybody knows where they are going and the customer knows you are coming.
  · **Site** — Each person sees their own day on their phone. *(/tech-day)*
  · **SPEC** — The customer gets told you are on the way, with an ETA. *(/customer)*

**Take 5 before anything starts**

- Starts: Arriving on site.
- Done when: Five questions answered, and the job cannot start until they are.
  · **Site** — Five questions on the phone, before the job list. *(/tech-day)*
  · **SPEC** — An answer that says the job is not safe stops it there. *(/tech-day)*
  · **SPEC** — It lands on the safety record without anybody filing it. *(/safety?tab=site)*

**The SWMS for this job**

- Starts: Work that needs a safe work method statement.
- Done when: Signed by everybody on it before work starts.
  · **SPEC** — The kit for the job says which SWMS applies. *(/jobs?tab=prebuilds)*
  · **Site** — The crew signs on to it. *(/safety?tab=site)*

**Get onto a builder’s site**

- Starts: A commercial site that will not let you through the gate without an induction.
- Done when: Everybody going has been inducted, and it is on record.
  · **Office** — Record the induction against the person. *(/people?mode=setup)*
  · **SPEC** — Somebody without one is not clear to work. *(/safety?tab=clear)*

**A tradie’s day**

- Starts: Waking up with jobs on.
- Done when: Every job either finished with evidence, or handed on with a reason.
  · **Site** — Take 5 first, to set the day up right. *(/tech-day)*
  · **Site** — Then the jobs, one at a time. *(/tech-day)*
  · **SPEC** — Materials used land on the job cost as they are added. *(/jobs?tab=catalogue)*
  · **Site** — Finish it on the phone. *(/tech-day)*

**Photos from site**

- Starts: Something worth a picture — before, after, or a problem.
- Done when: On the job, visible to the business and nobody else.
  · **Site** — Take it on the phone, against the job. *(/tech-day)*
  · **SPEC** — It shows on the job under From site. *(/jobs?tab=pipeline)*

**Extra work found on site**

- Starts: The job turns out to be bigger than the quote.
- Done when: Priced and agreed BEFORE it is done, with a name against it.
  · **Site** — Price the extra on the phone while you are standing there. *(/tech-day)*
  · **Customer** — The customer agrees it, with their name recorded. *(/customer)*
  · **SPEC** — SPEC refuses to bill one that was never agreed. *(/jobs?tab=billing)*

**The customer signs it off**

- Starts: The work is done.
- Done when: Signed, and the invoice can go.
  · **Customer** — They sign on the phone, on site. *(/tech-day)*
  · **SPEC** — Sign-off is what releases the invoice. *(/jobs?tab=billing)*

**A job stuck waiting on something**

- Starts: Materials, access, an answer, or another trade.
- Done when: It is visibly waiting, with a reason, instead of quietly rotting.
  · **Office** — Put it on hold with what it is waiting for. *(/jobs?tab=pipeline)*
  · **SPEC** — Held jobs show as money not moving. *(/jobs?tab=wip)*

**Turn up and nobody is home**  ⚠ has a hole

- Starts: The crew is on the doorstep and cannot get in.
- Done when: The visit is recorded, the customer is told, and it is rebooked.
  · **Site** — The tradie is standing there now and needs one button. *(/tech-day)*
  ✗ **Site** — Record a no-access, tell the customer, and rebook it — in one press, from the doorstep.
      NOT BUILT: Today it is a phone call to the office and a note. A no-access costs an hour of a crew and is the single most common thing that wrecks a day, and SPEC does not count them — so nobody can see which customers do it repeatedly.

**A project over weeks**

- Starts: A job too big for one visit.
- Done when: Every stage finished, claimed and closed.
  · **Office** — Split it into stages. *(/jobs?tab=pipeline)*
  · **Office** — Book crew across the days it needs. *(/jobs?tab=schedule)*
  · **Office** — Claim by stage as each one is done. *(/jobs?tab=billing)*
  · **SPEC** — Budget against actual, live, while there is still time to act. *(/jobs?tab=wip)*

**Put a subbie on the job**

- Starts: More work than your own crew can cover.
- Done when: The subbie is on the job, checked, and their claim is paid against it.
  · **Office** — Their insurances, licences and checks are current — all six. *(/people?mode=subbies)*
  · **SPEC** — A subbie missing any of the six cannot be booked. *(/people?mode=subbies)*
  · **SPEC** — Their claim goes against the job cost. *(/jobs?tab=billing)*

**You are the subbie**

- Starts: A builder engages you on their job.
- Done when: You claim on their schedule and get paid.
  · **Office** — The builder is the customer and their site is the job. *(/jobs?tab=customers)*
  · **Office** — Claim progressively against their schedule. *(/jobs?tab=billing)*
  · **SPEC** — Retention they hold is tracked and released. *(/jobs?tab=billing)*

**Go back and fix it**

- Starts: A callback — something you did is not right.
- Done when: Fixed, and the cause is recorded so it stops happening.
  · **Office** — The callback is raised against the original job. *(/jobs?tab=rework)*
  · **Office** — The cause is one of four, not a free-text excuse. *(/jobs?tab=rework)*
  · **SPEC** — Rework as a share of work, against the target. *(/jobs?tab=rework)*

### Materials, tools and plant

**Pick it up from the supplier**

- Starts: The crew needs gear today.
- Done when: It is on the job cost, not on a docket in a glovebox.
  · **Site** — Add what was bought against the job. *(/tech-day)*
  · **SPEC** — It lands on the job cost. *(/jobs?tab=catalogue)*

**Keep the vans stocked**

- Starts: A van is short of what the week needs.
- Done when: A reorder list that becomes an order in one press.
  · **Office** — See what is on each van and in the yard. *(/jobs?tab=stock)*
  · **SPEC** — The reorder list is built from the schedule ahead. *(/jobs?tab=stock)*

**Count the stock**

- Starts: Time to count.
- Done when: Counted, with the date on it.
  · **Site** — Count, and the last-counted date is kept. *(/jobs?tab=stock)*

**Keep the catalogue streamlined**

- Starts: The catalogue grows every time somebody adds a one-off.
- Done when: It stays fast, and the business is told before it does not.
  · **SPEC** — Dead items are counted against the size of the catalogue. *(/jobs?tab=catalogue)*
  · **SPEC** — The business is told only when it is BOTH big and mostly dead — not every day. *(/jobs?tab=catalogue)*

**Give somebody a tool**

- Starts: A tool goes out with a person or a van.
- Done when: It is known who has it and when it is next due for test.
  · **Office** — The tool is assigned. *(/jobs?tab=tools)*
  · **SPEC** — Its next test date is worked out from the interval. *(/jobs?tab=tools)*

**Test and tag**

- Starts: Items due for testing.
- Done when: Every item tested, with the result and the next date.
  · **Site** — Each item with its result, photo and next due date. *(/jobs?tab=service)*
  · **SPEC** — A failed item outranks any date and becomes a job. *(/jobs?tab=service)*

**Utes, trailers and plant**

- Starts: Rego, servicing and weekly checks come due.
- Done when: Nothing on the road out of rego or unchecked.
  · **Office** — Rego and servicing for every vehicle and bit of plant. *(/jobs?tab=tools)*
  · **Site** — The weekly ute check, done on the phone. *(/safety?tab=site)*

### People

**Set up a new employee**

- Starts: Somebody starts.
- Done when: They can be booked on a job, and the seat is paid for.
  · **Office** — They are on the chart, as team or leadership. *(/people?mode=setup)*
  · **Office** — Company email — which is their login for the job system. *(/people?mode=setup)*
  · **Office** — Licences with expiry dates, and their induction. *(/people?mode=setup)*
  · **SPEC** — Their training path comes from the role, not from a list somebody keeps. *(/training)*
  · **Office** — Payment is finalised once everybody has a role — not once every certificate is in. *(/people?mode=setup)*

**The person does their half on their phone**

- Starts: The office sends them a link.
- Done when: Their licences and tickets are in, photographed from their own wallet.
  · **Office** — The office sends a link, and can see how far they have got. *(/people?mode=setup)*
  · **Them** — The person opens it on their phone — no account, no password — and puts their own details, licences and expiry dates in off the cards in their wallet. *(/join)*
  · **Them** — They can say they have read the induction. They cannot mark themselves inducted — that stays the business’s. *(/join)*

**Take on an apprentice**

- Starts: An apprentice starts.
- Done when: Set up like anybody else, and the funding that applies is claimed.
  · **Office** — Set up the same as any employee. *(/people?mode=setup)*
  · **Office** — Their training contract and stage. *(/training)*
  · **SPEC** — Funding that applies is named, with what to claim and when. *(/people?mode=pay)*

**Take on a subcontractor**

- Starts: A subbie is engaged.
- Done when: All six checks current, or they cannot be booked.
  · **Office** — Ticked as a subcontractor rather than an employee. *(/people?mode=setup)*
  · **Office** — All six checks: insurances, licence, ABN and the rest. *(/people?mode=subbies)*
  · **SPEC** — Anything within 30 days of expiring is chased. *(/people?mode=subbies)*

**Hours to payroll**

- Starts: The week ends.
- Done when: Approved hours, costed to jobs, ready for the pay run.
  · **Site** — Hours come from Start and Finish on the phone. *(/tech-day)*
  · **SPEC** — They cost to the job as they arrive. *(/jobs?tab=time)*
  · **Office** — Approved before the run. *(/jobs?tab=time)*
  · **SPEC** — Checked against award rates and allowances BEFORE the run goes, not after. *(/people?mode=pay)*

**Somebody wants time off**

- Starts: A leave request.
- Done when: Approved or not, and the schedule knows.
  · **Them** — Requested on the phone. *(/my-page)*
  · **Leader** — Approved in one tap, and balances stay current. *(/people)*
  · **SPEC** — Who is available shows on the schedule. *(/jobs?tab=schedule)*

**A licence is about to run out**

- Starts: An expiry date coming up.
- Done when: Renewed before it stops somebody working.
  · **SPEC** — Expiring licences are named ahead of time. *(/compliance)*
  · **SPEC** — An expired one already stops them being booked. *(/safety?tab=clear)*

**Somebody needs training**

- Starts: A role with a training path, or a gap found in a review.
- Done when: Finished, and on record against the role.
  · **SPEC** — The path comes from the role on the chart. *(/training)*
  · **SPEC** — What is done, due or overdue. *(/training)*

**A performance review**

- Starts: The review falls due.
- Done when: A conversation held on real numbers, recorded.
  · **Leader** — The last three months of their KPI board is the agenda. *(/people?mode=conduct)*
  · **Them** — Their own scorecard, which they can see too. *(/my-page)*

**Something has to be addressed**

- Starts: Conduct or performance that cannot be left.
- Done when: A fair process, every step recorded, none skipped.
  · **Leader** — Five steps, in order. *(/people?mode=conduct)*
  · **SPEC** — SPEC refuses any step but the next one. *(/people?mode=conduct)*

**Fill an empty seat**

- Starts: A seat on the chart with nobody in it.
- Done when: Somebody starts in it.
  · **SPEC** — The vacancy comes from the empty seat, not a job ad somebody wrote. *(/people?mode=hiring)*
  · **Office** — Candidates scored against the KPIs the role actually holds. *(/people?mode=hiring)*
  · **Office** — They start. *(/people?mode=setup)*

**Somebody leaves**  ⚠ has a hole

- Starts: A resignation, or a last day.
- Done when: Access gone, tools back, final pay right, seat not still being paid for.
  · **Office** — Tools they hold are on record. *(/jobs?tab=tools)*
  ✗ **Office** — One last-day list: close their login, get the tools and keys back, final pay, and stop billing for the seat.
      NOT BUILT: Every piece exists separately and nothing joins them. The two that bite are a login that still works months later, and a seat still being paid for — both are things a business only finds by accident.

### Safety and compliance

**Report a hazard**

- Starts: Somebody sees something that could hurt the next person.
- Done when: On the safety register with an owner and a date.
  · **Site** — Reported from the job on the phone, not on a form back at the office. *(/tech-day)*
  · **SPEC** — It lands straight on the safety register. *(/safety?tab=hazards)*
  · **Office** — A corrective action with an owner and a review date. *(/safety?tab=hazards)*

**Report a near miss**

- Starts: It nearly happened.
- Done when: Recorded and acted on, the same as if it had.
  · **Site** — Reported from the job on the phone. *(/tech-day)*
  · **SPEC** — Treated as seriously as an injury, because the difference is often luck. *(/safety?tab=hazards)*

**Somebody is hurt**

- Starts: An injury at work — any injury, including a plaster from the kit.
- Done when: The business has been told, immediately, and the steps are underway.
  · **Site** — Reported from the phone, on the job it happened on. *(/tech-day)*
  · **SPEC** — The alert goes up immediately. It is a breach whatever the severity, and it cannot be switched off. *(/safety?tab=incidents)*
  · **SPEC** — Whoever carries safety and the top of the chart are told. Not a setting. *(/safety?tab=today)*
  · **Office** — The steps to take, in order — never "investigate". *(/safety?tab=incidents)*

**A serious injury**

- Starts: Somebody is seriously hurt, or it is otherwise notifiable.
- Done when: The regulator has been called and the site left as it is.
  · **SPEC** — The alert says this stopped being internal the moment it happened. *(/safety?tab=incidents)*
  · **Office** — Do not disturb the site. Call the regulator now. *(/safety?tab=incidents)*

**A workers’ compensation claim**

- Starts: An injury past first aid.
- Done when: Claim lodged on time and the person back on suitable duties.
  · **SPEC** — Anything past first aid starts a claim — waiting for lost time lodges late. *(/safety?tab=incidents)*
  · **Office** — Suitable duties agreed in writing before they come back. *(/safety?tab=incidents)*
  · **Office** — The return-to-work case has an owner. *(/safety?tab=incidents)*

**Know your TRIFR**

- Starts: A builder asks for it before letting you on site.
- Done when: A real number from real hours, not an estimate.
  · **SPEC** — Injuries from the register, hours from the timesheets — both already in SPEC. *(/jobs?tab=time)*
  · **SPEC** — TRIFR and LTIFR, always quoted with the hours behind them. *(/safety?tab=today)*
  · **SPEC** — Under about 10,000 hours SPEC says so rather than publishing a meaningless rate. *(/safety?tab=today)*

**Close out a corrective action**

- Starts: An action raised off a hazard, incident or inspection.
- Done when: Done, with a review date that came and was met.
  · **Office** — Every open action with its owner. *(/safety?tab=hazards)*
  · **SPEC** — Overdue ones are named. *(/safety?tab=today)*

**Run a toolbox talk**

- Starts: A scheduled talk.
- Done when: Everybody who should have been there has signed on.
  · **Site** — Crew signs on for the talk. *(/safety?tab=site)*
  · **SPEC** — Who should be there comes from the schedule, so missing names show up on their own. *(/safety?tab=site)*

**Inspect a site**

- Starts: A scheduled inspection.
- Done when: Done, with what it found turned into actions.
  · **Site** — The inspection, on the phone, on site. *(/safety?tab=site)*
  · **SPEC** — What it found becomes corrective actions. *(/safety?tab=hazards)*

**Somebody is not coping**

- Starts: A psychosocial report.
- Done when: Acted on, without ever knowing who made it.
  · **Them** — Reported anonymously — no name is stored at all, ever. *(/safety?tab=hazards)*
  · **Leader** — The business acts on the pattern, not the person. *(/safety?tab=hazards)*

**Nobody unclear goes out**

- Starts: Anybody being put on a job.
- Done when: Either clear, or not bookable.
  · **SPEC** — Licences, inductions and tickets decide it. *(/safety?tab=clear)*
  · **SPEC** — The schedule refuses somebody who is not clear. *(/jobs?tab=schedule)*

**Certificate of electrical compliance**  ⚠ has a hole

- Starts: Electrical work that is finished.
- Done when: The certificate issued to the customer and lodged where the state requires.
  · **Site** — The job is signed off on site. *(/tech-day)*
  ✗ **Site** — Issue the certificate of compliance for the state the job is in, and keep a copy against the job.
      NOT BUILT: This is legally required on electrical work and differs by state. It is currently done outside SPEC, so the one document that proves the work was lawful is the one document the job does not hold.

**Keep the business’s own insurances current**

- Starts: Public liability and workers’ compensation come up for renewal.
- Done when: Current, with the certificate on hand when a builder asks.
  · **Office** — Every policy and document with its expiry. *(/compliance)*
  · **SPEC** — Anything expiring is named before it bites. *(/compliance)*

---

## Growth

*Making sure new work keeps coming in, steadily — not in the panic after a quiet month.*

12 workflows · 11 end to end · 38% of steps automatic

### Winning work

**The phone rings**

- Starts: Somebody calls wanting a price or a sparkie out.
- Done when: It is on the board with a name against it, or booked.
  · **Office** — Take the details while they are on the phone. *(/jobs?tab=leads)*
  · **SPEC** — It lands on the list with its age against the two-day target. *(/jobs?tab=leads)*
  · **Office** — Either book it straight in, or send a price. *(/jobs?tab=schedule)*

**An enquiry comes in online**

- Starts: Somebody fills in the form on the website.
- Done when: Same list as a phone call, with where it came from recorded.
  · **SPEC** — The enquiry arrives and joins the same queue as a phone call. *(/jobs?tab=leads)*
  · **SPEC** — Where it came from is kept, so the business can see what actually works. *(/jobs?tab=ace)*

**A customer you already have rings back**

- Starts: A name already in the system calls.
- Done when: The new job sits under their history, not as a stranger.
  · **SPEC** — Customers past their own rhythm come up on their own, worked out of the job history already here — SPEC finds them, rather than somebody reading four years of jobs. *(/jobs?tab=growth)*
  · **Office** — Ring them, and raise the job against the same customer and site without leaving Jobs. *(/jobs?tab=customers)*

**Build and send a quote**

- Starts: A lead that needs a price.
- Done when: Sent, with the margin known before it went.
  · **Office** — Price it from the catalogue and the kits. *(/jobs?tab=quotes)*
  · **SPEC** — Margin worked out as you go, against the benchmark. *(/jobs?tab=quotes)*
  · **Office** — Sent to the customer. *(/jobs?tab=quotes)*

**The customer accepts**

- Starts: They say yes — online or on the phone.
- Done when: A job exists, carrying the quote’s prices as its budget.
  · **Customer** — They accept on their own page, without an account. *(/customer)*
  · **SPEC** — The quote becomes a job, and its prices become the budget. *(/jobs?tab=pipeline)*

**Chase a quote nobody answered**

- Starts: A quote has been out longer than it should be.
- Done when: Answered, or marked lost with a reason.
  · **SPEC** — A quote that has gone quiet raises itself at 3, 7 and 14 days — the same way invoices have chased themselves since September. *(/jobs?tab=growth)*
  · **SPEC** — The chase is written, and each of the three says something different. The last one lets them off the hook, which is the one that gets answers. *(/jobs?tab=growth)*
  · **Office** — Send it and press once. The same chase never goes twice, and a quote nobody touched gets the chase that is DUE rather than the first one late. *(/jobs?tab=growth)*

**Record why one was lost**

- Starts: They went elsewhere.
- Done when: The reason is in the system, not in somebody’s head.
  · **Office** — Mark it lost with the reason — price, timing, or never heard back. *(/jobs?tab=quotes)*
  · **SPEC** — The pattern across lost quotes shows up on the Sales Ace. *(/jobs?tab=ace)*

**A builder invites you to tender**

- Starts: An invitation with a closing date.
- Done when: Submitted before it closes, or declined on purpose rather than by accident.
  · **Office** — The tender goes on with its closing date. *(/jobs?tab=tenders)*
  · **SPEC** — SPEC counts it down and says so on the day. A closing date in somebody’s inbox passes in the week the estimator is covering for somebody else. *(/jobs?tab=growth)*
  · **Office** — Count off the plans. *(/jobs?tab=takeoff)*
  · **Office** — Price it and submit. *(/jobs?tab=tenders)*

**Count off the plans**

- Starts: A set of drawings.
- Done when: A priced quantity list you can quote from.
  · **Office** — Count what is on the drawings, by type. *(/jobs?tab=takeoff)*
  · **Office** — Turn the counts into a priced quote. *(/jobs?tab=quotes)*

**Work to a builder’s schedule of rates**  ⚠ has a hole

- Starts: A builder gives you an agreed rate card and sends work against it.
- Done when: Every job under that agreement prices itself off the agreed rates.
  · **Office** — Work comes in against an existing agreement rather than as a fresh quote. *(/jobs?tab=leads)*
  ✗ **Office** — Hold the agreed rate card against the customer, so a job under it prices itself.
      NOT BUILT: There is no rate card on a customer. Today the rates live in a spreadsheet and get typed in per quote, which is exactly where a business loses margin without noticing.

**Sell a maintenance agreement**

- Starts: A customer with equipment that needs looking at on an interval.
- Done when: An agreement that raises its own jobs.
  · **Office** — Set the agreement up with its interval. *(/jobs?tab=service)*
  · **Office** — When it comes due, one press raises the job. *(/jobs?tab=service)*

### Getting paid

**Ask for a review**

- Starts: A job finished well.
- Done when: Asked — every customer, with no filtering.
  · **Office** — The ask goes to every customer. There is no branch on how happy they seemed. *(/jobs?tab=reviews)*
  · **SPEC** — Asked once, and recorded so it is not asked twice. *(/jobs?tab=reviews)*

---

## The whole business

*Holding the three together, and deciding when they disagree.*

7 workflows · 7 end to end · 33% of steps automatic

### Running the business

**The weekly meeting**

- Starts: The same time every week.
- Done when: Decisions made and written down, not a discussion that repeats next week.
  · **SPEC** — The agenda is the numbers, already there. *(/meeting)*
  · **Leader** — Decisions are recorded against who made them. *(/board)*

**Score the month**

- Starts: The month ends.
- Done when: Every role scored, and the scores are what reviews and Aces read from.
  · **Leader** — Each role scored against what it holds. *(/scoring)*
  · **Leader** — Approvals go through the inbox. *(/inbox)*
  · **SPEC** — A run of months is what makes somebody an Ace — never the live month. *(/jobs?tab=jobace)*

**Who does what**

- Starts: The business grows, or somebody moves.
- Done when: A chart where every role has a name and what it is measured on.
  · **Office** — Paste the structure in, or bring it from a document. *(/org)*
  · **Office** — Each seat carries its KPIs. *(/org)*

**The board pack**

- Starts: The board meets.
- Done when: One pack, built from what already happened.
  · **SPEC** — Built from the months already scored. *(/board)*

**What should be automated**

- Starts: Roles broken into tasks.
- Done when: A queue of things worth building, in order.
  · **Office** — Tasks scored and sorted. *(/org/automation)*
  · **Leader** — Approved, parked or rejected into a build queue. *(/org/automation)*

**Connect the system you already run**

- Starts: A business arriving with simPRO, or a CRM, or a payroll system.
- Done when: Its data is inside SPEC, as SPEC’s own rows.
  · **Office** — Connect it by category — never by vendor. *(/connections)*
  · **SPEC** — It writes rows SPEC owns, on a schedule. No screen reads it live. *(/jobs?tab=pipeline)*

**Turn the old system off**

- Starts: The business decides it no longer needs what it came with.
- Done when: Everything keeps working. Only new rows stop arriving.
  · **Office** — See how much is already SPEC’s own — jobs, quotes, timesheets. *(/connections)*
  · **Office** — Turn it off. The rows stay; they just stop being refreshed, and the screen says so honestly. *(/connections)*
  · **SPEC** — The ledger is the exception: SPEC reads it and never replaces it. *(/connections)*

---

## The holes, gathered

- **Work to a builder’s schedule of rates** — Hold the agreed rate card against the customer, so a job under it prices itself.
- **Turn up and nobody is home** — Record a no-access, tell the customer, and rebook it — in one press, from the doorstep.
- **Hire a scissor lift** — Put it on hire against the job, and be told to off-hire it when the job finishes.
- **Somebody leaves** — One last-day list: close their login, get the tools and keys back, final pay, and stop billing for the seat.
- **Certificate of electrical compliance** — Issue the certificate of compliance for the state the job is in, and keep a copy against the job.

## Still sends somebody to a second screen

- **Take on an apprentice** — the office visits /people and /training
- **Score the month** — the leader visits /scoring and /inbox

## What is not here at all

This is the question worth most of your time. The map was written from the outside looking in.
A trade business does things nobody writes down, and those are exactly the ones a system ends
up not doing.
