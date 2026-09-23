import Link from 'next/link';
import { pillTone, type Light } from '@/lib/today';
import {
  FEEDS, reviewOf, trainingPill, FAIR_PROCESS, draftContract, AWARD_CHECKS,
  turnoverOf, type MonthScore, type TrainingState, type ContractSource,
} from '@/lib/hr';

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

export function ConductTab({ reviews, training }: { reviews: ReviewPerson[]; training: TrainingRow[] }) {
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
        <Empty>
          No process is open. Recording one — each step dated, with a name against it — is the next
          part of People to be built; nothing on this card is stored yet.
        </Empty>
      </Group>
    </>
  );
}

/* ── Pay & exits ─────────────────────────────────────────────────────────────────────────────── */

export interface ContractRow extends ContractSource { roleId: string }
export interface ExitRow { key: string; name: string; roleTitle: string; left: string }

export function PayTab({ contracts, payWeek, inRoles, accountingConnected, exits }: {
  contracts: ContractRow[];
  payWeek: { from: string; to: string };
  inRoles: number;
  accountingConnected: boolean;
  exits: ExitRow[];
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

      <Group
        title="Payroll export"
        blurb="Hours come from SPEC timesheets, leave from People. One step sends the pay run to your accounting system."
        feeds={FEEDS.payroll}
        action={{ label: accountingConnected ? 'See connections' : 'Connect your accounting system', href: '/connections' }}
      >
        <Row title={`Pay run · ${payWeek.from} to ${payWeek.to}`} sub={`${inRoles} ${inRoles === 1 ? 'person' : 'people'} in roles · no hours recorded in SPEC for this week`}>
          <Pill light="pending">Waiting on hours</Pill>
        </Row>
        <Empty>
          {accountingConnected
            ? 'Your accounting system is connected. The export sends once timesheet hours are recorded in SPEC.'
            : 'No accounting system is connected yet. Connect one and the export has somewhere to go; until then nothing is sent.'}
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
