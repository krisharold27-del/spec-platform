import Link from 'next/link';
import { pillTone, type Light } from '@/lib/today';
import {
  FEEDS, reviewOf, trainingPill, FAIR_PROCESS, draftContract, AWARD_CHECKS,
  turnoverOf, type MonthScore, type TrainingState, type ContractSource,
  stepLine,
} from '@/lib/hr';
import {
  parseSteps, nextStep, processComplete, stalled, contractLine, inForce,
  CONTRACT_LABEL, isContractState, parseRows, parseIssues, totalHours, mayExport, payRunLine,
} from '@/lib/hr-records';
import { SubmitButton } from '@/components/submit-button';
import {
  claimState, CLAIM_LABEL, daysUntil, byUrgency, fundingStats, fundingLine, amountLabel,
  type Claim,
} from '@/lib/apprentice-funding';
import {
  openRecord, sendContract, signContract, takeStep, runPayCheck, exportPayRun,
} from './actions';

/**
 * People's Reviews & conduct and Pay & exits tabs — `SPEC People.dc.html`, 23 September.
 *
 * Drawn the way the design draws them: one card per group, a title and a sentence, an action on the
 * right, rows under it, and a "Feeds" line naming the number the group moves. Everything here is
 * built from what SPEC already holds — the KPI board, the training path, the chart and its history.
 * Where a group needs a record SPEC does not keep yet (a warning's steps, an exit's reason, the
 * award's name, hours), the card shows its structure and says plainly that nothing is recorded,
 * rather than inventing a row.
 */

function Pill({ light, children }: { light: Light; children: React.ReactNode }) {
  return <span className="pill shrink-0" style={pillTone(light)}>{children}</span>;
}

function Group({ title, blurb, feeds, action, children }: {
  title: string; blurb: string; feeds: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[62ch]">
          <h2 className="font-serif text-xl text-ink">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-light">{blurb}</p>
        </div>
        {action && <Link href={action.href} className="btn-secondary shrink-0">{action.label}</Link>}
      </div>
      <div className="mt-4 grid gap-2">{children}</div>
      <p className="mt-4 text-xs text-ink-light">Feeds <strong className="text-ink">{feeds}</strong></p>
    </section>
  );
}

function Row({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-cream px-4 py-3">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="text-xs text-ink-light">{sub}</span>
      </span>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-cream px-4 py-3 text-sm text-ink-light">{children}</p>;
}

/* ── Reviews & conduct ───────────────────────────────────────────────────────────────────────── */

export interface ReviewPerson { roleId: string; name: string; roleTitle: string; months: MonthScore[] }
export interface TrainingRow { key: string; name: string; roleTitle: string; sub: string; state: TrainingState }

type RecordRow = {
  id: string; kind: string; personName: string; state: string; stepsDone: number;
  steps: string; body: string; sentAt: string | null; signedAt: string | null;
  reviewAt: string | null; updatedAt: string;
};

export function ConductTab({ reviews, training, conduct, people, manage }: {
  reviews: ReviewPerson[];
  training: TrainingRow[];
  conduct: RecordRow[];
  people: string[];
  manage: boolean;
}) {
  return (
    <>
      <Group
        title="Performance reviews"
        blurb="No separate review form. The review is the last three months of the person’s KPI board, plus one conversation about what comes next."
        feeds={FEEDS.reviews}
      >
        {reviews.length ? reviews.map(r => {
          const review = reviewOf(r.months);
          return (
            <Row key={r.roleId} title={`${r.name} · ${r.roleTitle}`} sub={review.line}>
              <span className="flex items-center gap-3">
                <Link href={`/scorecard/${r.roleId}`} className="text-xs text-rust-700 hover:underline">Open a scorecard</Link>
                <Pill light={review.light}>{review.label}</Pill>
              </span>
            </Row>
          );
        }) : (
          <Empty>Nobody in your part of the chart holds a scored role yet. A review appears here the month their board is first marked.</Empty>
        )}
      </Group>

      <Group
        title="Training records"
        blurb="Every module finished, in progress or due, pulled from SPEC Training. Nothing to keep up to date by hand."
        feeds={FEEDS.training}
        action={{ label: 'Go to training', href: '/training' }}
      >
        {training.length ? training.map(t => {
          const pill = trainingPill(t.state);
          return (
            <Row key={t.key} title={`${t.name} · ${t.roleTitle}`} sub={t.sub}>
              <Pill light={pill.light}>{pill.label}</Pill>
            </Row>
          );
        }) : (
          <Empty>No role in your part of the chart has a training path yet. Set one in Training and every module shows here, per person.</Empty>
        )}
      </Group>

      {/*
        The one group with nothing behind it yet. The process is the design's — five steps, none
        skippable — and it is drawn as the structure it will hold rather than as a form that saves
        nowhere. An honest first step: say what it is and that nothing is open.
      */}
      <Group
        title="Warnings & disciplinary"
        blurb="A fair process, one step at a time: raise the concern, offer a support person, meet, give the outcome in writing, set a review date. SPEC will not let a step be skipped."
        feeds={FEEDS.conduct}
      >
        <ol className="grid gap-2">
          {FAIR_PROCESS.map((s, i) => (
            <li key={s.key} className="flex items-start gap-3 rounded-xl bg-cream px-4 py-3">
              <span className="pill shrink-0" style={pillTone('pending')}>Step {i + 1}</span>
              <span className="grid gap-0.5">
                <span className="text-sm font-semibold text-ink">{s.label}</span>
                <span className="text-xs text-ink-light">{s.note}</span>
              </span>
            </li>
          ))}
        </ol>
        {/*
          The processes actually open. Only the NEXT step can be taken — `mayTake` refuses anything
          else, on the server. A step skipped is a process a tribunal can unpick.
        */}
        {conduct.length > 0 && (
          <ul className="mt-4 grid gap-2">
            {conduct.map(r => {
              const done = parseSteps(r.steps);
              const next = nextStep(r.stepsDone);
              const late = stalled(r);
              return (
                <li key={r.id} className="rounded-2xl bg-cream px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-ink">{r.personName}</span>
                    <span className="pill" style={pillTone(late ? 'red' : processComplete(r.stepsDone) ? 'green' : 'amber')}>
                      {stepLine(r.stepsDone)}
                    </span>
                  </div>
                  {r.body && <p className="mt-1 text-sm text-ink-light">{r.body}</p>}
                  {done.length > 0 && (
                    <ol className="mt-2 grid gap-1 text-sm text-ink-light">
                      {done.map(d => (
                        <li key={`${d.step}-${d.at}`}>
                          <b className="text-ink">{FAIR_PROCESS[d.step]?.label}</b> · {d.at.slice(0, 10)} — {d.note}
                        </li>
                      ))}
                    </ol>
                  )}
                  {late && (
                    <p className="mt-2 text-sm text-ink">
                      Started and not finished. The person has been told there is a concern and heard
                      nothing since — worse than never having raised it.
                    </p>
                  )}
                  {manage && next && (
                    <form action={takeStep} className="mt-3 grid gap-2 border-t border-cream-border pt-3 sm:grid-cols-4">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="step" value={next.index} />
                      <p className="text-sm text-ink sm:col-span-4">
                        <b>Next: {next.label}.</b> {next.note}
                      </p>
                      <input name="note" required placeholder="What happened at this step" className="input sm:col-span-3" />
                      {next.index === FAIR_PROCESS.length - 1 && (
                        <input type="date" name="reviewAt" className="input" aria-label="Review date" />
                      )}
                      <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">Record it</SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {manage && (
          <form action={openRecord} className="mt-4 grid gap-2 border-t border-cream-border pt-4 sm:grid-cols-4">
            <input type="hidden" name="kind" value="conduct" />
            <input name="personName" required list="people-list" placeholder="Who" className="input" />
            <input name="body" required placeholder="What the concern is — specific, and in writing" className="input sm:col-span-2" />
            <SubmitButton className="btn-secondary px-4 py-2">Raise it</SubmitButton>
            <datalist id="people-list">{people.map(n => <option key={n} value={n} />)}</datalist>
          </form>
        )}

        {conduct.length === 0 && <Empty>No process is open.</Empty>}
      </Group>
    </>
  );
}

/* ── Pay & exits ─────────────────────────────────────────────────────────────────────────────── */

export interface ContractRow extends ContractSource { roleId: string }
export interface ExitRow { key: string; name: string; roleTitle: string; left: string }

export function PayTab({ contracts, payWeek, inRoles, accountingConnected, exits, signed, roles, people, run, manage, claims, today }: {
  contracts: ContractRow[];
  payWeek: { from: string; to: string };
  inRoles: number;
  accountingConnected: boolean;
  exits: ExitRow[];
  signed: RecordRow[];
  roles: { id: string; title: string }[];
  people: string[];
  run: {
    id: string; fromDate: string; toDate: string; rows: string; issues: string;
    checkedAt: string | null; exportedAt: string | null;
  } | null;
  manage: boolean;
  /** Apprentice incentive and rebate claims — see lib/apprentice-funding. */
  claims: Claim[];
  today: string;
}) {
  const turnover = turnoverOf(exits.map(() => null));
  return (
    <>
      <Group
        title="Contracts & onboarding"
        blurb="Contracts are drafted from the role on the org chart: title, who it reports to, start date and what it is measured on. Pay and the award level are the business’s to set."
        feeds={FEEDS.contracts}
        action={{ label: 'Open the org chart', href: '/org' }}
      >
        {contracts.length ? contracts.map(c => (
          <details key={c.roleId} className="rounded-xl bg-cream px-4 py-3">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
              <span className="grid min-w-0 gap-0.5">
                <span className="text-sm font-semibold text-ink">{c.person} · {c.roleTitle}</span>
                <span className="text-xs text-ink-light">
                  {c.startDate ? `In the role since ${c.startDate}` : 'Start date not on the chart'} · drafted from the role
                </span>
              </span>
              <Pill light="pending">Draft — not issued</Pill>
            </summary>
            <pre className="mt-3 whitespace-pre-wrap font-body text-xs leading-5 text-ink">{draftContract(c)}</pre>
          </details>
        )) : (
          <Empty>Nobody holds a role in your part of the chart yet. Place somebody on the org chart and their contract drafts itself here.</Empty>
        )}

        {/*
          The contracts actually issued. Nothing is in force until the person accepts — said in
          those words, because "sent" reads like "done" and a contract sent and never returned is
          the most common gap in a small business's file.
        */}
        {signed.length > 0 && (
          <ul className="mt-4 grid gap-2">
            {signed.map(r => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{r.personName}</span>
                  <span className="block text-sm text-ink-light">{contractLine(r)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Pill light={inForce(r) ? 'green' : r.state === 'declined' ? 'red' : 'amber'}>
                    {CONTRACT_LABEL[(isContractState(r.state) ? r.state : 'draft')]}
                  </Pill>
                  {manage && r.state === 'draft' && (
                    <form action={sendContract}>
                      <input type="hidden" name="id" value={r.id} />
                      <SubmitButton className="btn-secondary px-3 py-1 text-xs">Send it</SubmitButton>
                    </form>
                  )}
                  {manage && r.state === 'sent' && (
                    <form action={signContract} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="accepted" value="on" />
                      <SubmitButton className="btn-secondary px-3 py-1 text-xs">They accepted</SubmitButton>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {manage && (
          <form action={openRecord} className="mt-4 grid gap-2 border-t border-cream-border pt-4 sm:grid-cols-4">
            <input type="hidden" name="kind" value="contract" />
            <input name="personName" required list="pay-people" placeholder="Who" className="input" />
            <select name="roleId" defaultValue="" className="input sm:col-span-2">
              <option value="">Which role — SPEC drafts it from the chart</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
            <SubmitButton className="btn-secondary px-4 py-2">Draft it</SubmitButton>
            <datalist id="pay-people">{people.map(n => <option key={n} value={n} />)}</datalist>
          </form>
        )}
      </Group>

      {/*
        The business's award, never one written into the product. SPEC has nowhere to keep the
        award's name yet, so the card says what it will check and waits to be told which award.
      */}
      <Group
        title="Award & pay rules"
        blurb="Checked against the business’s award — the one you name, and the level each person sits at in it. Every pay run, each person’s level, rate, allowances and overtime are checked against it, and anyone under is flagged."
        feeds={FEEDS.award}
      >
        {AWARD_CHECKS.map(c => (
          <Row key={c} title={c} sub="Against your award, per person, every pay run">
            <Pill light="pending">Award not named yet</Pill>
          </Row>
        ))}
        <Empty>
          No award is named for this business yet, so nothing has been checked and nobody is flagged.
          Naming it is the first step; SPEC does not guess which one applies.
        </Empty>
      </Group>

      {/*
        Apprentice funding, design 17. Real money a business is entitled to and routinely does not
        claim — not by decision, but because the window opens on a date buried in a training
        contract and nobody is watching for it. So the DATE is what this leads on.

        SPEC never invents an amount: the figures change with the scheme, the state, the year of the
        apprenticeship and the employer, and a made-up number shown as claimable is a business
        budgeting for money that is not coming. The design says the same — "Amounts are confirmed
        with your Apprenticeship Support Network provider."
      */}
      <Group
        title="Apprentice funding"
        blurb="Government incentives and rebates for every apprentice, from their training contract. SPEC tells you the day each claim opens. Amounts are confirmed with your Apprenticeship Support Network provider — SPEC does not guess them."
        feeds="Earnings · Cash flow"
      >
        <p className="mb-3 text-sm font-semibold text-ink">{fundingLine(fundingStats(claims, today))}</p>
        {byUrgency(claims, today).map(c => {
          const state = claimState(c, today);
          const days = daysUntil(c.opensAt, today);
          const light: Light = state === 'claimable' ? 'amber'
            : state === 'received' ? 'green'
              : state === 'missed' ? 'red' : 'pending';
          return (
            <Row
              key={c.id}
              title={`${c.who} · ${c.what}`}
              sub={
                state === 'received' ? `Received ${c.receivedAt}`
                  : state === 'claimed' ? `Lodged ${c.claimedAt}, waiting on payment`
                    : state === 'missed' ? `Window closed ${c.closesAt}`
                      : days !== null && days > 0 ? `Opens ${c.opensAt}, in ${days} ${days === 1 ? 'day' : 'days'}`
                        : `Open now · ${amountLabel(c.amountCents)}`
              }
            >
              <Pill light={light}>{CLAIM_LABEL[state]}</Pill>
            </Row>
          );
        })}
        <Empty>
          No apprentice claims recorded yet. Add each one from the training contract when an
          apprentice starts — the date it opens is the part worth having, and it is the part
          everybody forgets.
        </Empty>
      </Group>

      <Group
        title="Payroll export"
        blurb="Hours come from SPEC timesheets, leave from People. One step sends the pay run to your accounting system."
        feeds={FEEDS.payroll}
        action={{ label: accountingConnected ? 'See connections' : 'Connect your accounting system', href: '/connections' }}
      >
        {run ? (() => {
          const rows = parseRows(run.rows);
          const issues = parseIssues(run.issues);
          return (
            <div className="mt-2 rounded-2xl bg-cream px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-ink">Pay run · {run.fromDate} to {run.toDate}</span>
                <Pill light={run.exportedAt ? 'green' : run.checkedAt ? 'amber' : 'pending'}>
                  {payRunLine(run, issues)}
                </Pill>
              </div>
              <p className="mt-1 text-sm text-ink-light">
                {rows.length} {rows.length === 1 ? 'person' : 'people'} · {totalHours(rows)} hours, from the timesheets SPEC already holds.
              </p>
              {issues.length > 0 && (
                <ul className="mt-2 grid gap-1 text-sm">
                  {issues.map(i => (
                    <li key={`${i.check}-${i.who}`} className="text-ink">
                      <b>{i.who}</b> · {i.check} — {i.says}
                    </li>
                  ))}
                </ul>
              )}
              {manage && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-cream-border pt-3">
                  <form action={runPayCheck}>
                    <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">Check it again</SubmitButton>
                  </form>
                  {mayExport(run) && (
                    <form action={exportPayRun}>
                      <input type="hidden" name="id" value={run.id} />
                      <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">Send to the accounting system</SubmitButton>
                    </form>
                  )}
                </div>
              )}
            </div>
        );
        })() : (
          <>
            <Row title={`Pay run · ${payWeek.from} to ${payWeek.to}`} sub={`${inRoles} ${inRoles === 1 ? 'person' : 'people'} in roles · not checked yet`}>
              <Pill light="pending">Not checked</Pill>
            </Row>
            {manage && (
              <form action={runPayCheck} className="mt-3">
                <SubmitButton className="btn-secondary px-5 py-2">Check this week against the award</SubmitButton>
              </form>
            )}
          </>
        )}
        <Empty>
          Checked before it goes, never after — a check that runs afterwards finds underpayments
          already made. {accountingConnected
            ? 'Your accounting system is connected, so the export has somewhere to go.'
            : 'No accounting system is connected yet, so the run is checked here and sent when one is.'}
        </Empty>
      </Group>

      <Group
        title="Exits & exit reasons"
        blurb="Every exit gets a reason. Right-reason exits (retirement, a real step up, moving away) never count against the business. Wrong-reason exits do."
        feeds={FEEDS.exits}
      >
        {exits.length ? (
          <>
            {exits.map(e => (
              <Row key={e.key} title={`${e.name} · ${e.roleTitle}`} sub={`Left ${e.left}`}>
                <Pill light="pending">Reason not recorded</Pill>
              </Row>
            ))}
            <p className="text-xs text-ink-light">
              {turnover.wrong} counted against the business · {turnover.unrecorded} without a reason yet, and
              those are never counted as wrong.
            </p>
          </>
        ) : (
          <Empty>Nobody has left a role in your part of the chart. An exit shows here from the chart’s own history the day a placement closes.</Empty>
        )}
      </Group>
    </>
  );
}
