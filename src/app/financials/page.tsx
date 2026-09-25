import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { Refused } from '@/components/refused';
import { SwitchCards } from '@/components/recommends';
import { FinancialSystemPanel } from '@/components/financial-system';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScope, isTopOfChart } from '@/lib/scope';
import { getTenantById } from '@/lib/queries';
import { refusedReason } from '@/lib/refuse';
import { LIGHT_COLOUR } from '@/lib/today';
import { ANGUS_STORY } from '@/lib/out-simple';
import { financialsFor } from '@/lib/financials-data';
import { anyFigure, glance, headline, SOURCE_WORDS, type Dot } from '@/lib/financials';
import { uploadLedgerFile } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Financials' };

/**
 * Financials — the money, on its own page, beside People on the bar.
 *
 * Kris, 25 September: he could not find the money. It was inside the Virtual GM, two screens down,
 * and the bar had nothing for it. His brief for the page: simple and beautiful — one headline number
 * (cash in the bank, or an honest welcome when nothing is in), no more than six calm tiles, a dot
 * only when something needs attention, payroll as three steps, and Angus Shield quiet rather than
 * sold. No tables on the first screen, no accounting words.
 *
 * Everything is read, nothing written, except the uploaded file's figures — see lib/financials for
 * where each number comes from and why an empty one stays empty.
 */
export default async function Financials({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const arrival = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const [tenant, scope] = await Promise.all([getTenantById(user.tenantId), getScope(user)]);
  /*
    The whole business's money is for the people who run it: anybody who manages, and whoever sits
    at the top of the chart (a read-only GM or owner still reads the numbers). Everybody else is told
    so plainly on the page the menu opened — never bounced somewhere else without a word.
  */
  if (!canManage(user.access) && !isTopOfChart(scope)) {
    return (
      <Shell title="Financials" headline="The money, in plain English.">
        <p className="card max-w-[60ch] text-sm text-ink" data-financials-closed>
          The business’s money is for the people who run it. Your own card, with its working, is on{' '}
          <Link href="/my-page" className="text-rust-700 hover:underline">My page</Link>.
        </p>
      </Shell>
    );
  }
  const view = await financialsFor(user);
  const admin = scope.canAdminister;
  const input = { figures: view.figures, sources: view.sources, overdueCents: view.overdueCents, billsOverOrder: view.billsOverOrder };
  const top = headline(input);
  const tiles = glance(input);
  const hasAny = anyFigure(view.figures);
  const booksIn = Object.values(view.sources).some(s => s === 'ledger' || s === 'upload');

  const upload = admin ? <UploadForm compact={booksIn} /> : null;

  return (
    <Shell title="Financials" headline={`${tenant?.name ?? 'Your business'}: the money, in plain English.`}>
      <Refused reason={refusedReason(arrival)} />
      {arrival.read === '1' && (
        <p className="mb-4 rounded-lg bg-sage-100 px-4 py-3 text-sm text-sage-800" role="status" data-financials-read>
          Read. The figures below are from your file.
        </p>
      )}

      {/* ── The headline: cash, or the welcome ───────────────────────────────────────────────── */}
      {hasAny ? (
        <section id="glance" className="scroll-mt-20" aria-label="The money at a glance" data-financials-glance>
          <div className="py-2 sm:py-4" data-financials-headline>
            <span className="label-caps">{top.label}</span>
            <div className="mt-2 flex items-center gap-3">
              <span className={`font-serif leading-none ${top.value ? 'text-6xl text-ink sm:text-7xl' : 'text-4xl text-ink-light'}`} data-financials-cash>
                {top.value ?? 'Not in yet'}
              </span>
              {top.dot && <DotMark dot={top.dot} />}
            </div>
            <p className="mt-2 text-sm text-ink-light">
              {top.value ? `${top.says} ${top.source ? capital(SOURCE_WORDS[top.source]) + '.' : ''}` : 'Upload a Balance Sheet and the bank balance lands here.'}
            </p>
          </div>

          <ul className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {tiles.map((t, i) => {
              const body = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-ink-light">{t.label}</span>
                    {t.dot && <DotMark dot={t.dot} />}
                  </div>
                  <span className={`mt-2 block font-serif leading-none ${t.value ? 'text-2xl text-ink sm:text-3xl' : 'text-xl text-ink-light'}`}>
                    {t.value ?? '—'}
                  </span>
                  <span className="mt-2 block text-sm text-ink">{t.says}</span>
                  {/* Named only when it differs from where the headline came from — said once, not five times. */}
                  {t.source && t.source !== top.source && <span className="mt-1 block text-xs text-ink-light">{capital(SOURCE_WORDS[t.source])}</span>}
                </>
              );
              return (
                // An odd tile out on a phone takes the whole row rather than sitting alone.
                <li key={t.key} className={i === tiles.length - 1 && tiles.length % 2 ? 'col-span-2 lg:col-span-1' : undefined} data-financials-tile={t.key}>
                  {t.href && t.value ? (
                    <Link href={t.href} className="card block h-full p-4 transition-colors hover:border-rust-300 sm:p-5">{body}</Link>
                  ) : (
                    <div className="card h-full p-4 sm:p-5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <Welcome admin={admin} />
      )}

      {/* ── What needs you ───────────────────────────────────────────────────────────────────── */}
      {hasAny && (
        <section className="mt-12" data-financials-needs>
          <h2 className="font-serif text-2xl text-ink">What needs you</h2>
          {view.needs.length ? (
            <ul className="mt-4 grid gap-2">
              {view.needs.map(n => (
                <li key={n.key}>
                  <Link href={n.href} className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-4 transition-colors hover:border-rust-300" data-financials-need={n.key}>
                    <span className="text-sm text-ink">{n.says}</span>
                    <span className="text-sm font-medium text-rust-700">{n.action} &rarr;</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-light">Nothing. Every invoice, bill and timesheet is where it should be.</p>
          )}
        </section>
      )}

      {/* ── Payroll: hours in, checked, sent to pay ──────────────────────────────────────────── */}
      <section id="payroll" className="mt-12 scroll-mt-20" data-financials-payroll>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl text-ink">Payroll</h2>
          <span className="text-sm text-ink-light">This week</span>
        </div>
        <p className="mt-1 max-w-[60ch] text-sm text-ink-light">
          Who worked, on which job, where and when — straight from the phone. Checked, approved, then
          sent to your payroll.
        </p>
        <ol className="mt-5 grid gap-3 sm:grid-cols-3" data-financials-steps>
          {view.payroll.steps.map((s, i) => (
            <li key={s.key} className="card flex gap-3" data-financials-step={s.key} data-done={s.done || undefined}>
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  s.done ? 'bg-sage-600 text-white' : 'border border-ink/20 text-ink-light'
                }`}
              >
                {s.done ? '✓' : i + 1}
              </span>
              <div className="min-w-0">
                <span className="block font-serif text-lg leading-tight text-ink">{s.title}</span>
                <span className="mt-1 block text-sm text-ink-light">{s.says}</span>
                <span className="sr-only">{s.done ? 'Done.' : 'Not yet.'}</span>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          {view.payroll.next ? (
            <Link href={view.payroll.next.href} className="btn-primary inline-flex items-center" data-financials-next>
              {view.payroll.next.label}
            </Link>
          ) : (
            <Link href="/jobs?tab=time" className="btn-secondary inline-flex items-center">See the week’s timesheets</Link>
          )}
        </div>

        {view.payroll.worked.length > 0 && (
          <details className="mt-5" data-financials-worked>
            <summary className="cursor-pointer text-sm text-rust-700">Who worked this week ({view.payroll.worked.length})</summary>
            <ul className="mt-3 grid gap-2">
              {view.payroll.worked.map(w => (
                <li key={w.who} className="card-inset grid gap-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{w.who}</span>
                    <span className="text-sm text-ink">{w.hours} hrs · {w.days} {w.days === 1 ? 'day' : 'days'}</span>
                  </div>
                  <span className="text-xs text-ink-light">{w.jobs.length ? w.jobs.join(' · ') : 'Not on a job'}</span>
                  {w.waiting > 0 && <span className="text-xs text-ink-light">{w.waiting} waiting on approval</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="mt-5">
          <SwitchCards areas={['payroll']} back="/financials" />
        </div>
      </section>

      {/* ── Your financial system ────────────────────────────────────────────────────────────── */}
      <div className="mt-12">
        <FinancialSystemPanel
          ledger={view.ledger.state === 'none' && view.upload
            ? { ...view.ledger, says: 'No accounting system is connected, so the figures above come from the file you uploaded. Connect it once and they keep themselves up to date.' }
            : view.ledger}
          back="/financials"
          id="your-system"
        >
          {view.ledgerNote && <p className="mt-3 text-sm text-ink-light" data-financials-ledger-note>{view.ledgerNote}</p>}
          {view.upload && (
            <p className="mt-3 text-xs text-ink-light">
              Last file: {view.upload.fileName}, {new Date(view.upload.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}.
            </p>
          )}
          {hasAny && upload}
        </FinancialSystemPanel>
      </div>

      <p className="mt-10 text-sm">
        <Link href="/virtual-gm" className="text-rust-700 hover:underline">The whole business: Virtual GM + Virtual Admin &rarr;</Link>
      </p>
    </Shell>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const DOT_WORDS: Record<Dot, string> = { green: 'Fine', amber: 'Worth a look', red: 'Needs you now' };

function DotMark({ dot }: { dot: Dot }) {
  return (
    <span className="inline-flex items-center" title={DOT_WORDS[dot]}>
      <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: LIGHT_COLOUR[dot] }} />
      <span className="sr-only">{DOT_WORDS[dot]}</span>
    </span>
  );
}

/** The file upload — the way in that works today, with nothing to connect. */
function UploadForm({ compact }: { compact?: boolean }) {
  return (
    <form action={uploadLedgerFile} className={compact ? 'mt-5 grid gap-2' : 'grid gap-3'} data-financials-upload>
      {compact && <span className="text-sm text-ink">Upload a newer file</span>}
      <input
        type="file"
        name="file"
        accept=".csv,text/csv"
        multiple
        required
        aria-label="Your exported report, as CSV"
        className="block w-full text-sm text-ink-light file:mr-3 file:rounded-full file:border file:border-ink/20 file:bg-surface file:px-4 file:py-2 file:text-sm file:text-ink"
      />
      <SubmitButton className={compact ? 'btn-secondary justify-self-start' : 'btn-primary justify-self-start'}>Read my file</SubmitButton>
    </form>
  );
}

/**
 * Nothing in yet. The welcome, not an apology — three ways in, each one big, each one honest about
 * what it does. Never a made-up figure.
 */
function Welcome({ admin }: { admin: boolean }) {
  return (
    <section className="card px-5 py-8 sm:px-8 sm:py-10" aria-labelledby="welcome-heading" data-financials-empty>
      <span className="label-caps">The money at a glance</span>
      <h2 id="welcome-heading" className="mt-2 max-w-[24ch] font-serif text-3xl leading-tight text-ink sm:text-4xl">
        Let’s get your numbers in.
      </h2>
      <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-ink-light">
        Cash, profit, GST, wages, who owes you and who you owe — on one page. Nothing is shown until it
        comes from your own books. Pick whichever suits; you can change later.
      </p>

      <ol className="mt-8 grid gap-3 lg:grid-cols-3">
        <li className="card-inset grid content-start gap-2 bg-cream p-5" data-financials-way="connect">
          <span className="font-serif text-xl text-ink">Connect</span>
          <span className="text-sm text-ink-light">Link your accounting system once. SiteVIP reads it and never writes to it.</span>
          <Link href="/connections?category=financials" className="btn-primary mt-2 inline-flex items-center justify-self-start">Connect your books</Link>
        </li>
        <li className="card-inset grid content-start gap-2 bg-cream p-5" data-financials-way="upload">
          <span className="font-serif text-xl text-ink">Upload a file</span>
          <span className="text-sm text-ink-light">
            Export the Profit and Loss or Balance Sheet from your accounting system as CSV, and drop it in. Works today.
          </span>
          {admin ? (
            <div className="mt-2"><UploadForm /></div>
          ) : (
            <span className="mt-2 text-xs text-ink-light">An administrator of the business puts the file in.</span>
          )}
        </li>
        <li className="card-inset grid content-start gap-2 bg-cream p-5" data-financials-way="angus">
          <span className="font-serif text-xl text-ink">
            Try Angus Shield
          </span>
          <span className="text-sm italic text-ink-light">{ANGUS_STORY.tagline}</span>
          <span className="text-sm text-ink-light">
            Runs in Shadow beside your books and checks it can match them. Nothing in your system changes.
          </span>
          <Link href="#your-system" className="btn-secondary mt-2 inline-flex items-center justify-self-start">See how it works</Link>
        </li>
      </ol>
    </section>
  );
}
