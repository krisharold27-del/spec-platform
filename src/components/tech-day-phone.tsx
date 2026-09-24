'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clockOn, clockOff, recordOnJob, attachPhoto } from '@/app/tech-day/actions';
import { SiteVipMark } from '@/components/sitevip-mark';
import { LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';
import { mayUpload, pathFor, photoPromise } from '@/lib/photos';
import { TAKE5, mayStart, concerns, needsNote, take5Line, type Take5 } from '@/lib/take5';
import { REPORT_KINDS } from '@/lib/safety';
import { sendReport } from '@/app/safety/actions';
import { SubmitButton } from '@/components/submit-button';
import {
  MARK_TOOLS, markLabel, markText, maySave, onPlan, savedLine, SAVED_TO, OFFLINE_LINE,
  type Mark, type MarkKind,
} from '@/lib/markup';
import {
  STEPS, EMPTY_DAY, apply, canDo, doneLine, isDone, nextStep, primaryLabel, primaryNote, revive,
  storageKey, summary, timesheet, clock, hoursLabel, bookedOn, hhmm,
  nextAction, dayLine,
  type Material, type StepKey, type TechDayAction, type TechDayState, type Booked, type TechJob,
} from '@/lib/tech-day';

export interface ClearToWork {
  state: 'clear' | 'not_clear' | 'unknown';
  blocked: string[];
}

interface DoneJob {
  title: string;
  minutes: number;
}

/** A Start the office has with no Finish yet — from this phone or another. */
export interface OfficeEntry {
  entryId: string;
  /** The office's own moment of Start. */
  startedAt: string;
  title: string;
  jobId: string | null;
}

/** Browser storage can be missing or refuse (private mode, full) — the day still runs without it. */
const load = (key: string): string | null => {
  try { return window.localStorage.getItem(key); } catch { return null; }
};
const save = (key: string, value: string | null) => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* the day carries on in memory */ }
};

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const nowIso = () => new Date().toISOString();

/** The honest line, said wherever somebody might otherwise think the office already has it. */
function KeptHere({ children }: { children: React.ReactNode }) {
  return <p className="text-center text-[12.5px] leading-5 text-ink-light">{children}</p>;
}

/**
 * The tech's phone. Every tap goes through `apply` in lib/tech-day, so the order the page allows is
 * the order the tests hold — a SWMS before Start, the on-job steps after it, Finish last.
 */
export function TechDayPhone({ userId, name, firstName, clear, booked = [], open = null, records = [], items = [], tenantId = '', storeConnected = false }: {
  userId: string; name: string; firstName: string; clear: ClearToWork;
  /** The office's bookings for this person, either side of today — the phone keeps its own day's. */
  booked?: Booked[];
  /** An office Start with no Finish, if there is one. */
  open?: OfficeEntry | null;
  /** What has already been recorded on today's jobs: the SWMS, photos, materials, the sign-off. */
  records?: { jobId: string; kind: string; who: string; what: string; atTime: string }[];
  /** The catalogue, so materials come off a list rather than being typed as a note. */
  items?: { id: string; name: string }[];
  /**
   * This business, so a photo is uploaded into its own folder.
   *
   * Only ever a suggestion: the upload route checks the path against the SIGNED-IN person's
   * business before it issues a token, so a phone that sends somebody else's id gets nothing. It is
   * here because the file has to be addressed before it is sent, not because it is trusted.
   */
  tenantId?: string;
  /**
   * Whether there is anywhere to put a picture.
   *
   * Read on the server from the environment and handed down, so every sentence on this phone about
   * what happens to a photo follows whether a store is really connected — never a line of copy
   * somebody has to remember to change on the day it is.
   */
  storeConnected?: boolean;
}) {
  const router = useRouter();
  /** What the office said about the last Start or Finish, when it could not take it. */
  const [officeNote, setOfficeNote] = useState<string | null>(null);
  const [day, setDay] = useState('');
  const [s, setS] = useState<TechDayState>(EMPTY_DAY);
  const [finished, setFinished] = useState<DoneJob[]>([]);
  const [view, setView] = useState<'today' | 'job' | 'done'>('today');
  const [panel, setPanel] = useState<StepKey | null>(null);
  const [now, setNow] = useState(nowIso);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  /** This morning's Take 5. Kept on the phone so it survives a basement and a dropped signal. */
  const [take5, setTake5] = useState<Take5 | null>(null);

  const key = day ? storageKey(userId, day) : '';

  // Read back what this phone kept for today, once, after the page is in the browser.
  useEffect(() => {
    const d = localDay();
    setDay(d);
    const k = storageKey(userId, d);
    const kept = revive(load(k));
    setS(kept);
    try { setFinished(JSON.parse(load(`${k}.finished`) ?? '[]') as DoneJob[]); } catch { setFinished([]); }
    setSignature(load(`${k}.signature`));
    try {
      const kept = load(`${k}.take5`);
      setTake5(kept ? (JSON.parse(kept) as Take5) : null);
    } catch { setTake5(null); }
    if (kept.job && !kept.finishedAt) setView('job');
    // The office already has this phone's Start (the answer was lost on the way back): take its entry.
    if (kept.startedAt && !kept.finishedAt && !kept.entryId && open) {
      const joined = apply(kept, { type: 'saved', entryId: open.entryId });
      setS(joined);
      save(k, JSON.stringify(joined));
    }
  }, [userId, open]);

  // The clock the running timesheet counts against.
  useEffect(() => {
    const t = setInterval(() => setNow(nowIso()), 30_000);
    return () => clearInterval(t);
  }, []);

  const act = useCallback((a: TechDayAction) => {
    setS(prev => {
      const next = apply(prev, a);
      if (key && next !== prev) save(key, JSON.stringify(next));
      return next;
    });
    setNow(nowIso());
  }, [key]);

  /** Start: the hours begin on the phone at once, and the office is told. No signal never stops work. */
  const startNow = () => {
    if (!canDo(s, 'start')) return;
    act({ type: 'start', at: nowIso() });
    setPanel(null);
    setOfficeNote(null);
    clockOn({ jobId: s.job?.jobId ?? null, day: localDay(), clock: hhmm(new Date()) })
      .then(r => { if (r.ok) act({ type: 'saved', entryId: r.entryId }); else setOfficeNote(r.reason); })
      .catch(() => setOfficeNote('No signal — your Start is kept on this phone. Tell your supervisor your start time.'));
  };

  /** Finish: stop the office's clock too, when it has the Start. */
  const finishAtOffice = (entryId: string | null) => {
    if (!entryId) return;
    clockOff({ entryId, clock: hhmm(new Date()) })
      .then(r => { if (!r.ok) setOfficeNote(r.reason); else router.refresh(); })
      .catch(() => setOfficeNote('No signal — the office did not get your Finish. Tell your supervisor your finish time.'));
  };

  const primary = () => {
    const n = nextStep(s);
    if (n === 'start') { startNow(); return; }
    if (n === 'finish') {
      const at = nowIso();
      const done = apply(s, { type: 'finish', at });
      act({ type: 'finish', at });
      finishAtOffice(s.entryId);
      const list = [...finished, { title: done.job?.title ?? 'Job', minutes: timesheet(done, at).minutes }];
      setFinished(list);
      if (key) save(`${key}.finished`, JSON.stringify(list));
      setPanel(null);
      setView('done');
      return;
    }
    if (n) setPanel(n);
  };

  const nextJob = () => {
    act({ type: 'reset' });
    photoUrls.forEach(u => URL.revokeObjectURL(u));
    setPhotoUrls([]);
    setSignature(null);
    if (key) { save(key, null); save(`${key}.signature`, null); }
    setPanel(null);
    setView('today');
  };

  const tap = (k: StepKey) => {
    if (k === 'start' && canDo(s, 'start')) { startNow(); return; }
    if (canDo(s, k)) setPanel(p => (p === k ? null : k));
  };

  const next = nextStep(s);
  const sheet = timesheet(s, now);
  const dayMinutes = finished.reduce((t, j) => t + j.minutes, 0) + (sheet.running ? sheet.minutes : 0);

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="sticky top-0 z-10 border-b border-ink/10 bg-surface">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-2">
          {view === 'today' ? (
            <h1 className="font-serif text-[22px] text-ink">{firstName ? `Morning, ${firstName}` : 'Today'}</h1>
          ) : (
            <button type="button" onClick={() => { setPanel(null); setView('today'); }} className="min-h-[44px] py-2.5 text-[15px] text-rust-700">
              &larr; Today
            </button>
          )}
          <SiteVipMark size={17} />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-md flex-1 content-start gap-3 px-4 pb-6 pt-4">
        {view === 'today' && (
          <>
            <ClearCard clear={clear} />

            {s.job && !s.finishedAt && (
              <button type="button" onClick={() => setView('job')} className="block w-full rounded-[20px] bg-white px-[18px] py-4 text-left shadow-sm">
                <span className="flex justify-between gap-2 text-[13px] text-ink-light">
                  <span>{s.startedAt ? `Started ${clock(s.startedAt)} · ${hoursLabel(sheet.minutes)}` : 'Not started'}</span>
                  <Chip tone="green">Now</Chip>
                </span>
                <span className="mt-1.5 block text-[17px] font-bold leading-snug">{s.job.title}</span>
                {s.job.site && <span className="mt-1 block text-sm text-ink-light">{s.job.site}</span>}
              </button>
            )}

            {/* A Start the office has that this phone does not — begun on another phone. */}
            {open && !(s.startedAt && !s.finishedAt) && (
              <div className="grid gap-2 rounded-[20px] bg-white px-[18px] py-4 shadow-sm">
                <span className="text-[13px] text-ink-light">Started {clock(open.startedAt)} on another phone</span>
                <span className="text-[17px] font-bold leading-snug">{open.title}</span>
                <button type="button" onClick={() => finishAtOffice(open.entryId)} className="btn-primary min-h-[48px] text-base">Finish it here</button>
              </div>
            )}

            {(!s.job || s.finishedAt) && (
              <BookedJobs
                jobs={bookedOn(booked, day)}
                records={records}
                items={items}
                who={name}
                tenantId={tenantId}
                storeConnected={storeConnected}
                onOpen={job => { act({ type: 'open', job }); setView('job'); }}
              />
            )}

            {(!s.job || s.finishedAt) && (
              <OpenJob
                booked={bookedOn(booked, day).length > 0}
                onOpen={job => { act({ type: 'open', job }); setView('job'); }}
              />
            )}

            {finished.length > 0 && (
              <section className="rounded-[20px] bg-white px-[18px] py-4 shadow-sm">
                <h2 className="text-[15px] font-bold">Done today</h2>
                <ul className="mt-2 grid gap-1.5 text-[14.5px]">
                  {finished.map((j, i) => (
                    <li key={i} className="flex justify-between gap-3"><span className="min-w-0 truncate">{j.title}</span><strong>{hoursLabel(j.minutes)}</strong></li>
                  ))}
                </ul>
                <p className="mt-2 flex justify-between border-t border-ink/10 pt-2 text-[14.5px]"><span>Your timesheet today</span><strong>{hoursLabel(dayMinutes)}</strong></p>
              </section>
            )}

            {/*
              ── The day starts here ───────────────────────────────────────────────────────────

              Kris: "start with a safety take 5 and set up the day right". Before the job list,
              because that is the order the day happens in — and a Take 5 under the jobs is a Take 5
              done after somebody has already picked up the tools.

              Kept on this phone like everything else here, so it works with no signal. It is
              recorded against the job the moment one is started.
            */}
            {!take5 ? (
              <section className="rounded-[20px] bg-white p-4 shadow-sm">
                <Take5Panel onDone={t => { setTake5(t); if (key) save(`${key}.take5`, JSON.stringify(t)); }} />
              </section>
            ) : (
              <KeptHere>{take5Line(take5)}</KeptHere>
            )}

            {officeNote && <KeptHere>{officeNote}</KeptHere>}
            <KeptHere>
              Jobs the office books you on land here. Start and Finish go straight to the office&rsquo;s
              timesheets;{' '}
              {storeConnected
                ? 'photos, materials and sign-offs go onto the job.'
                : 'photos, materials and sign-offs stay on this phone for now.'}
            </KeptHere>
          </>
        )}

        {view === 'job' && s.job && (
          <>
            <div className="rounded-[20px] bg-white p-[18px] shadow-sm">
              <span className="text-[12.5px] text-ink-light">On the job{s.job.ref ? ` · ${s.job.ref}` : ''}</span>
              <p className="mt-1.5 font-serif text-[22px] leading-tight">{s.job.title}</p>
              {s.job.site && <p className="mt-2 text-sm leading-[21px] text-ink-light">{s.job.site}</p>}
            </div>

            {STEPS.map(step => {
              const done = isDone(s, step.key);
              const isNext = next === step.key;
              const open = panel === step.key;
              const blocked = !done && !canDo(s, step.key);
              return (
                <div key={step.key} className={`rounded-[18px] bg-white shadow-sm ${isNext ? 'ring-2 ring-rust' : ''}`}>
                  <button
                    type="button"
                    onClick={() => tap(step.key)}
                    aria-expanded={open}
                    disabled={blocked}
                    className={`flex min-h-[64px] w-full items-center gap-3.5 px-4 py-3.5 text-left ${done ? 'opacity-85' : ''} ${blocked ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`grid h-[30px] w-[30px] flex-none place-content-center rounded-full text-[15px] font-bold ${done ? 'bg-light-green text-white' : 'bg-cream shadow-[inset_0_0_0_2px_rgba(32,30,29,0.25)]'}`}
                      aria-hidden
                    >
                      {done ? '✓' : ''}
                    </span>
                    <span className="grid gap-0.5">
                      <span className="text-[15.5px] font-bold">{step.label}</span>
                      <span className="text-[13px] text-ink-light">{done ? doneLine(s, step.key) : blocked ? (step.key === 'start' ? 'After the SWMS is signed' : 'After you start the job') : step.sub}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-ink/10 px-4 pb-4 pt-3">
                      {step.key === 'swms' && <SwmsPanel name={name} onSign={by => { act({ type: 'swms', by, at: nowIso() }); setPanel(null); }} />}
                      {step.key === 'photos' && (
                        <PhotosPanel
                          connected={storeConnected}
                          urls={photoUrls}
                          onAdd={files => {
                            const urls = files.map(f => URL.createObjectURL(f));
                            setPhotoUrls(u => [...u, ...urls]);
                            act({ type: 'photos', count: files.length });
                          }}
                          onDone={() => setPanel(null)}
                        />
                      )}
                      {step.key === 'materials' && <MaterialsPanel onSave={items => { act({ type: 'materials', items }); setPanel(null); }} />}
                      {step.key === 'sign' && (
                        <SignPanel
                          onSign={(by, image) => {
                            act({ type: 'sign', by, at: nowIso() });
                            setSignature(image);
                            if (key) save(`${key}.signature`, image);
                            setPanel(null);
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/*
              The as-built, beside the steps rather than inside them. The six steps are a fixed
              order — SWMS, start, photos, materials, sign-off, finish — and marking up the plan is
              not one of them: it happens whenever something is found, which may be three times in a
              morning or not at all. Putting it in the sequence would make it a step people skip.
            */}
            {/*
              Straight into the safety register, with this job against it — see `SomethingWrong`.
              Beside the day's work rather than buried in a menu: a hazard somebody has to go
              looking for is a hazard that gets mentioned in the ute on the way home instead.
            */}
            <SomethingWrong jobRef={s.job?.ref ?? s.job?.title ?? ''} />

            <details className="rounded-[20px] bg-white p-4 shadow-sm">
              <summary className="flex min-h-[44px] cursor-pointer items-center text-[15px] font-bold">
                Mark up the plan
              </summary>
              <div className="pt-3">
                <MarkUpPanel
                  onSave={marks => {
                    if (s.job) {
                      void recordOnJob({
                        jobId: s.job.jobId ?? '',
                        kind: 'photo',
                        who: name,
                        what: savedLine(marks),
                      });
                    }
                  }}
                />
              </div>
            </details>

            {next && (
              <>
                <button
                  type="button"
                  onClick={primary}
                  className={`min-h-[54px] rounded-full px-4 py-4 text-base font-bold text-white ${next === 'finish' ? 'bg-light-green' : 'bg-rust'}`}
                >
                  {primaryLabel(s)}
                </button>
                <p className="text-center text-[12.5px] text-ink-light">{primaryNote(s)}</p>
              </>
            )}
            {sheet.running && (
              <KeptHere>
                Clocking since {clock(sheet.start!)} · {hoursLabel(sheet.minutes)} so far.{' '}
                {s.entryId ? 'The office has your Start.' : 'Kept on this phone — the office has not got your Start yet.'}
              </KeptHere>
            )}
            {officeNote && <KeptHere>{officeNote}</KeptHere>}
          </>
        )}

        {view === 'done' && (
          <DoneScreen s={s} now={now} signature={signature} onNext={nextJob} note={officeNote} connected={storeConnected} />
        )}
      </main>

      <nav className="sticky bottom-0 border-t border-ink/10 bg-white" aria-label="On the phone">
        <div className="mx-auto flex max-w-md justify-around px-3 pb-5 pt-2 text-xs text-ink-light">
          <Link href="/tech-day" aria-current="page" className="inline-flex min-h-[44px] items-center font-bold text-ink">Today</Link>
          <Link href="/site" className="inline-flex min-h-[44px] items-center">Report</Link>
          <Link href="/my-page" className="inline-flex min-h-[44px] items-center">My page</Link>
          <Link href="/mirrors?ask=1" className="inline-flex min-h-[44px] items-center">Ask SPEC</Link>
        </div>
      </nav>
    </div>
  );
}

function Chip({ tone, children }: { tone: 'green' | 'amber'; children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: `color-mix(in srgb, ${LIGHT_COLOUR[tone]} 14%, transparent)`, color: LIGHT_INK[tone] }}
    >
      {children}
    </span>
  );
}

/** Clear to work, from this person's own card. Pass or fail, never a percentage; unread is neutral. */
function ClearCard({ clear }: { clear: ClearToWork }) {
  if (clear.state === 'clear') {
    return (
      <div className="rounded-[18px] px-4 py-3.5 text-sm leading-[21px]" style={{ background: `color-mix(in srgb, ${LIGHT_COLOUR.green} 12%, transparent)`, color: LIGHT_INK.green }}>
        <strong>Clear to work.</strong> Nothing on your card is holding you back this month.
      </div>
    );
  }
  if (clear.state === 'not_clear') {
    return (
      <div className="rounded-[18px] px-4 py-3.5 text-sm leading-[21px]" style={{ background: `color-mix(in srgb, ${LIGHT_COLOUR.red} 10%, transparent)`, color: LIGHT_INK.red }}>
        <strong>Not clear to work.</strong> {clear.blocked.join('; ')}. Talk to your supervisor before you start.
      </div>
    );
  }
  return (
    <div className="rounded-[18px] bg-white px-4 py-3.5 text-sm leading-[21px] text-ink-light shadow-sm">
      <strong className="text-ink">Clear to work:</strong> not recorded on your card yet this month.
    </div>
  );
}

/**
 * The jobs the office booked you on today, one press to open — and the next thing to do on each.
 *
 * ── Outsimple them: one step, never a menu ─────────────────────────────────────────────────────
 *
 * SimPro's field app asks the technician to navigate. This asks them to press the next thing. The
 * order is fixed — sign the SWMS, start, photos, materials, the client signs — so SPEC knows where
 * the day has got to and shows one button, not five tabs.
 */
function BookedJobs({ jobs, onOpen, records = [], items = [], who = '', tenantId = '', storeConnected = false }: {
  jobs: Booked[];
  onOpen: (job: TechJob) => void;
  records?: { jobId: string; kind: string; who: string; what: string; atTime: string }[];
  items?: { id: string; name: string }[];
  who?: string;
  /** Passed through to the photo step — see the note on `TechDayPhone`. */
  tenantId?: string;
  storeConnected?: boolean;
}) {
  if (!jobs.length) return null;
  return (
    <section className="grid gap-2 rounded-[20px] bg-white px-[18px] py-4 shadow-sm">
      <h2 className="text-[15px] font-bold">Today&rsquo;s jobs</h2>
      {jobs.map(j => {
        const mine = records.filter(r => r.jobId === j.jobId);
        return (
          <div key={j.jobId} className="grid gap-2 rounded-2xl bg-cream px-4 py-3">
            <button
              type="button"
              onClick={() => onOpen({ title: j.title, site: j.site, jobId: j.jobId, ref: j.ref })}
              className="grid min-h-[44px] gap-0.5 text-left"
            >
              <span className="text-[12.5px] text-ink-light">{j.ref} · {j.client}</span>
              <span className="text-[16px] font-bold leading-snug">{j.title}</span>
              {j.site && <span className="text-sm text-ink-light">{j.site}</span>}
            </button>
            <p className="text-[13px] text-ink-light">{dayLine(mine, mine.some(r => r.kind !== 'swms'))}</p>
            <NextThing jobId={j.jobId} records={mine} items={items} who={who} tenantId={tenantId} storeConnected={storeConnected} />
          </div>
        );
      })}
    </section>
  );
}

/** Name a job that is not on the schedule — the hours still reach the office, as not on a booked job. */
function OpenJob({ onOpen, booked }: { onOpen: (job: TechJob) => void; booked: boolean }) {
  const [title, setTitle] = useState('');
  const [site, setSite] = useState('');
  return (
    <form
      onSubmit={e => { e.preventDefault(); if (title.trim()) onOpen({ title, site }); }}
      className="grid gap-2 rounded-[20px] bg-white px-[18px] py-4 shadow-sm"
    >
      <h2 className="text-[15px] font-bold">{booked ? 'Somewhere else?' : 'Today’s jobs'}</h2>
      <p className="text-[13px] leading-5 text-ink-light">
        {booked ? 'On a job that isn’t on your schedule? Name it:' : 'Nothing booked for you today. Start the job you’re on:'}
      </p>
      <input className="input py-3 text-base" value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required placeholder="The job — e.g. rough-in, units 301–304" aria-label="The job" />
      <input className="input py-3 text-base" value={site} onChange={e => setSite(e.target.value)} maxLength={160} placeholder="Where — site and suburb" aria-label="Where" />
      <button type="submit" className="btn-primary min-h-[48px] text-base">Open the job</button>
    </form>
  );
}

function SwmsPanel({ name, onSign }: { name: string; onSign: (by: string) => void }) {
  const [by, setBy] = useState(name);
  const [read, setRead] = useState(false);
  return (
    <form onSubmit={e => { e.preventDefault(); if (read && by.trim()) onSign(by); }} className="grid gap-2.5">
      <p className="text-[13px] leading-5 text-ink-light">
        The job&rsquo;s SWMS isn&rsquo;t attached on the phone yet — read the one on site or from your supervisor, then sign here.
      </p>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={read} onChange={e => setRead(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-rust" />
        I have read the SWMS for this job and will work to it.
      </label>
      <input className="input py-3 text-base" value={by} onChange={e => setBy(e.target.value)} maxLength={120} required aria-label="Your name" placeholder="Your name" />
      <button type="submit" disabled={!read || !by.trim()} className="btn-primary min-h-[48px] text-base disabled:opacity-50">Sign the SWMS</button>
    </form>
  );
}

function PhotosPanel({ urls, onAdd, onDone, connected }: { urls: string[]; onAdd: (files: File[]) => void; onDone: () => void; connected: boolean }) {
  return (
    <div className="grid gap-2.5">
      <label className="btn-primary flex min-h-[48px] cursor-pointer items-center justify-center text-base">
        Take or add photos
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) onAdd(f); e.target.value = ''; }}
        />
      </label>
      {urls.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- local previews from the camera, not served images */}
          {urls.map(u => <img key={u} src={u} alt="" className="aspect-square w-full rounded-lg object-cover" />)}
        </div>
      )}
      {/*
        The panel on the step list is a quick counter — "three photos added" — and it is NOT where a
        photo is attached to the job; `NextThing` does that, one at a time, with a caption, because
        a photo nobody can describe is not evidence. So this says where the pictures are, which
        follows the store rather than a sentence somebody has to remember to change.
      */}
      <p className="text-[12.5px] leading-5 text-ink-light">
        {connected
          ? 'Counted here. Add them to the job one at a time below, so each one says what it shows.'
          : 'Photos stay on this phone for now — they are not uploaded to the job yet.'}
      </p>
      {urls.length > 0 && <button type="button" onClick={onDone} className="btn-secondary min-h-[44px]">Done for now</button>}
    </div>
  );
}

function MaterialsPanel({ onSave }: { onSave: (items: Material[]) => void }) {
  const [rows, setRows] = useState<Material[]>([{ name: '', qty: 1 }]);
  const set = (i: number, m: Partial<Material>) => setRows(r => r.map((x, j) => (j === i ? { ...x, ...m } : x)));
  return (
    <div className="grid gap-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <input className="input min-w-0 flex-1 py-3 text-base" value={r.name} onChange={e => set(i, { name: e.target.value })} maxLength={120} placeholder="What was used" aria-label={`Item ${i + 1}`} />
          <input className="input w-20 py-3 text-base" type="number" inputMode="numeric" min={1} value={r.qty} onChange={e => set(i, { qty: Number(e.target.value) })} aria-label={`How many of item ${i + 1}`} />
        </div>
      ))}
      <button type="button" onClick={() => setRows(r => [...r, { name: '', qty: 1 }])} className="justify-self-start py-2 text-sm text-rust-700">+ Another item</button>
      <p className="text-[12.5px] leading-5 text-ink-light">No van stock list on the phone yet — type what went in.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave(rows)} disabled={!rows.some(r => r.name.trim())} className="btn-primary min-h-[48px] flex-1 text-base disabled:opacity-50">Save materials</button>
        <button type="button" onClick={() => onSave([])} className="btn-secondary min-h-[48px]">Nothing used</button>
      </div>
    </div>
  );
}

/** The client signs on the glass. */
function SignPanel({ onSign }: { onSign: (by: string, image: string | null) => void }) {
  const [by, setBy] = useState('');
  const [inked, setInked] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#201e1d';
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const [x, y] = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const [x, y] = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setInked(true);
  };
  const up = () => { drawing.current = false; };
  const clear = () => {
    const c = canvas.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    setInked(false);
  };

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (!by.trim() || !inked) return;
        let image: string | null = null;
        try { image = canvas.current?.toDataURL('image/png') ?? null; } catch { image = null; }
        onSign(by, image);
      }}
      className="grid gap-2.5"
    >
      <input className="input py-3 text-base" value={by} onChange={e => setBy(e.target.value)} maxLength={120} required placeholder="Client’s name and role — e.g. site manager" aria-label="Who is signing" />
      <canvas
        ref={canvas}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Sign here"
        className="h-40 w-full touch-none rounded-2xl bg-cream"
      />
      <div className="flex items-center justify-between text-[12.5px] text-ink-light">
        <span>Sign in the box above.</span>
        <button type="button" onClick={clear} className="min-h-[36px] text-rust-700">Clear</button>
      </div>
      <button type="submit" disabled={!by.trim() || !inked} className="btn-primary min-h-[48px] text-base disabled:opacity-50">Client signs off</button>
    </form>
  );
}

function DoneScreen({ s, now, signature, onNext, note, connected }: { s: TechDayState; now: string; signature: string | null; onNext: () => void; note: string | null; connected: boolean }) {
  const sum = summary(s, now);
  const sheet = timesheet(s, now);
  return (
    <div className="grid gap-3 pt-5">
      <div className="grid h-[76px] w-[76px] place-content-center rounded-full bg-light-green text-[34px] text-white" aria-hidden>✓</div>
      <p className="mt-1.5 font-serif text-[26px] leading-tight">Signed off. Nice work.</p>
      <div className="grid gap-2 rounded-[20px] bg-white px-[18px] py-4 text-[14.5px]">
        <div className="flex justify-between"><span>Hours on the job</span><strong>{sum.hours}</strong></div>
        <div className="flex justify-between"><span>Materials used</span><strong>{sum.materials}</strong></div>
        <div className="flex justify-between"><span>Photos</span><strong>{sum.photos}</strong></div>
        {sheet.start && sheet.finish && (
          <div className="flex justify-between text-ink-light"><span>Timesheet</span><span>{clock(sheet.start)} → {clock(sheet.finish)}</span></div>
        )}
        {s.signedBy && <div className="flex justify-between text-ink-light"><span>Signed by</span><span>{s.signedBy}</span></div>}
        {/* eslint-disable-next-line @next/next/no-img-element -- the signature drawn on this phone */}
        {signature && <img src={signature} alt={`Signature of ${s.signedBy ?? 'the client'}`} className="h-20 w-full rounded-lg bg-cream object-contain" />}
      </div>
      <p className="text-sm leading-[21px] text-ink-light">
        {s.entryId
          ? 'Your timesheet built itself from Start and Finish and is on the office’s Timesheets, waiting for approval. '
          : 'Your timesheet built itself from Start and Finish, but the office did not get it — tell your supervisor your hours. '}
        {connected
          ? 'Photos you added to the job are with the office. Materials and the sign-off are on the job card.'
          : 'Photos, materials and the sign-off stay on this phone for now, so tell your supervisor the job is done the way you do today.'}
      </p>
      {note && <p className="text-[12.5px] leading-5 text-ink-light">{note}</p>}
      <button type="button" onClick={onNext} className="min-h-[52px] rounded-full bg-ink px-4 py-4 text-[15.5px] font-semibold text-white">
        Next job &rarr;
      </button>
    </div>
  );
}

/**
 * The next thing to press on this job, and nothing else.
 *
 * One button. The SWMS comes before everything; the client's signature ends it. Between them the
 * technician is on site with a customer waiting, so nothing here argues — the order is shown, not
 * enforced, and the office sees what was missed on the job card.
 */
function NextThing({ jobId, records, items, who, tenantId, storeConnected }: {
  jobId: string;
  records: { kind: string; who: string; what: string; atTime: string }[];
  items: { id: string; name: string }[];
  who: string;
  tenantId: string;
  storeConnected: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [file, setFile] = useState<File | null>(null);

  const started = records.some(r => r.kind !== 'swms');
  const next = nextAction(records, started);
  if (!next) {
    return <p className="text-[13px] font-semibold" style={{ color: LIGHT_INK.green }}>Signed off. Nothing left on this one.</p>;
  }

  /*
    ── The picture, when there is somewhere to put it ────────────────────────────────────────────

    The file goes phone → store directly, because a serverless function takes 4.5MB of body and a
    phone photo is often more; the token that allows it is issued by /api/photo/upload only after
    it has checked this person's business owns the path and the job. Then the row is written, which
    is what makes the photo part of the job rather than a file in a bucket.

    If any of that fails the day does NOT stop. The caption, who and when are recorded the way they
    always were, and the technician is told the picture did not go — the job is still in front of
    them and a phone that refuses to record anything is a phone that gets put away.
  */
  const sendPhoto = async (): Promise<boolean> => {
    if (!file || !storeConnected) return false;
    const allowed = mayUpload(file);
    if (!allowed.ok) { setSaid(allowed.says); return false; }

    try {
      const { upload } = await import('@vercel/blob/client');
      const unique = (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
      const done = await upload(pathFor(tenantId, jobId, file.name, unique), file, {
        access: 'private',
        handleUploadUrl: '/api/photo/upload',
        clientPayload: JSON.stringify({ jobId }),
      });
      const answer = await attachPhoto({ jobId, path: done.pathname, caption: what, who });
      setSaid(answer.says);
      return answer.ok;
    } catch {
      setSaid('The photo did not go — SPEC kept what it shows, who took it and when. Keep the picture on the phone.');
      return false;
    }
  };

  const send = async () => {
    setBusy(true);

    if (next.key === 'photo' && file && storeConnected) {
      const saved = await sendPhoto();
      setBusy(false);
      if (saved) { setOpen(false); setWhat(''); setFile(null); return; }
      // It did not go. Fall through on the NEXT press rather than silently recording a photo the
      // technician believes was uploaded.
      return;
    }

    const answer = await recordOnJob({
      jobId,
      kind: next.key,
      who: next.key === 'signoff' ? (what || 'The client') : who,
      what: next.key === 'signoff' ? 'Signed that the work is done' : what,
      itemId: next.key === 'materials' ? itemId : null,
      qty: next.key === 'materials' ? Number(qty) : null,
    });
    setBusy(false);
    setSaid(answer.says);
    if (answer.ok) { setOpen(false); setWhat(''); setItemId(''); setQty('1'); }
  };

  return (
    <div className="grid gap-2">
      {said && <p className="text-[13px] text-ink-light">{said}</p>}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-primary min-h-[48px] text-base"
        >
          {next.key === 'swms' ? 'Sign the SWMS'
            : next.key === 'photo' ? 'Add a photo'
              : next.key === 'materials' ? 'Materials used'
                : 'Client sign-off'}
        </button>
      ) : (
        <div className="grid gap-2">
          <p className="text-[13px] text-ink-light">{next.prompt}</p>

          {next.key === 'materials' ? (
            <div className="grid gap-2">
              <select
                value={itemId}
                onChange={e => setItemId(e.target.value)}
                className="input min-h-[48px] text-base"
                aria-label="What came off the van"
              >
                <option value="">What came off the van</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <input
                value={qty}
                onChange={e => setQty(e.target.value)}
                inputMode="numeric"
                className="input min-h-[48px] text-base"
                aria-label="How many"
                placeholder="How many"
              />
            </div>
          ) : (
            <input
              value={what}
              onChange={e => setWhat(e.target.value)}
              className="input min-h-[48px] text-base"
              aria-label={next.key === 'signoff' ? 'Who signed' : 'What it is'}
              placeholder={
                next.key === 'swms' ? 'Which SWMS you signed'
                  : next.key === 'photo' ? 'What the photo shows'
                    : 'Who signed'
              }
            />
          )}

          {/*
            The picture itself, when there is somewhere to put it.

            SPEC ran without a file store for a long time and said so plainly rather than pretending
            the image was safe somewhere — the caption, who took it and when are the evidence chain
            and they were always kept. Both sentences still exist and `photoPromise` picks between
            them, so the screen follows the store rather than a line somebody has to remember.
          */}
          {next.key === 'photo' && (
            <div className="grid gap-2">
              {storeConnected && (
                <label className="btn-secondary flex min-h-[48px] cursor-pointer items-center justify-center text-base">
                  {file ? 'Different photo' : 'Take or choose the photo'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    aria-label="Take or choose the photo"
                    onChange={e => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
              {file && <p className="text-[12.5px] text-ink-light">{file.name} ready to go.</p>}
              <p className="text-[12.5px] text-ink-light">{photoPromise(storeConnected)}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={send} disabled={busy} className="btn-primary min-h-[48px] flex-1 text-base">
              {busy ? 'One moment…' : 'Record it'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary min-h-[48px] px-5">
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Mark up the plan — the as-built, recorded by the person who did the work.
 *
 * ── Marks, not a photo of biro ───────────────────────────────────────────────────────────────────
 *
 * What normally happens is a photo of a paper plan with pen on it, and somebody in the office tries
 * to read it a week later. This records each mark as a mark — a kind, a place on the plan, a note,
 * and metres for a cable run — so it can go onto the job, the office copy and the certificate
 * without anybody redrawing anything.
 *
 * ── It has to work in a basement ─────────────────────────────────────────────────────────────────
 *
 * Everything here is kept on the phone until it is saved, and the screen says so. Marking up must
 * never depend on a signal: a screen that fails where the work happens is a screen people stop
 * opening, and then the business has no as-built at all.
 *
 * Every target is 44px, because this is a thumb on a phone in a switchroom.
 */
function MarkUpPanel({ onSave }: { onSave: (marks: Mark[]) => void }) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const [tool, setTool] = useState<MarkKind | null>(null);
  const [what, setWhat] = useState('');
  const [metres, setMetres] = useState('');
  const [saved, setSaved] = useState(false);

  const place = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tool) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    const mark: Mark = {
      kind: tool,
      x, y,
      what: what.trim(),
      metres: tool === 'cable' ? Number(metres) || null : null,
    };
    if (!onPlan(mark)) return;
    setMarks(m => [...m, mark]);
    setTool(null); setWhat(''); setMetres(''); setSaved(false);
  };

  const allowed = maySave(marks);

  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="text-[15px]">Mark up the plan</strong>
        <span className="text-xs text-ink-light">What was actually installed</span>
      </div>

      {/*
        The plan. Without a drawing loaded it is a plain grid to place marks on — which is still the
        useful half, because the marks and their notes are what the office reads. A grid that says
        it is a grid is better than a picture that pretends to be the drawing.
      */}
      <div
        onClick={place}
        role={tool ? 'button' : undefined}
        aria-label={tool ? `Tap where the ${markLabel(tool).toLowerCase()} goes` : 'The plan'}
        className={`relative aspect-[4/3] overflow-hidden rounded-xl bg-cream ${tool ? 'cursor-crosshair ring-2 ring-rust' : ''}`}
      >
        <div className="grid h-full w-full grid-cols-2 grid-rows-2">
          {['1', '2', '3', '4'].map(n => (
            <div key={n} className="border-2 border-ink/20" />
          ))}
        </div>
        {marks.map((m, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
            style={{ left: `${m.x}%`, top: `${m.y}%`, background: LIGHT_COLOUR.amber }}
          >
            {markText(m)}
          </span>
        ))}
        {!marks.length && !tool && (
          <span className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-ink-light">
            Pick a tool below, then tap where it goes.
          </span>
        )}
      </div>

      {tool && (
        <div className="grid gap-2 rounded-xl bg-cream p-3">
          <p className="text-[12.5px] text-ink-light">{MARK_TOOLS.find(t => t.key === tool)?.hint}</p>
          {tool === 'cable' ? (
            <input
              value={metres}
              onChange={e => setMetres(e.target.value)}
              inputMode="decimal"
              className="input min-h-[44px] text-base"
              aria-label="How many metres"
              placeholder="How many metres"
            />
          ) : (
            <input
              value={what}
              onChange={e => setWhat(e.target.value)}
              className="input min-h-[44px] text-base"
              aria-label="What it is"
              placeholder={tool === 'point' ? 'Which point, and where it went' : 'What the next person needs to know'}
            />
          )}
          <p className="text-[12.5px] font-semibold text-ink">Now tap the plan where it goes.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {MARK_TOOLS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTool(tool === t.key ? null : t.key); setWhat(''); setMetres(''); }}
            aria-pressed={tool === t.key}
            className={`min-h-[44px] rounded-full px-3.5 py-2.5 text-[13.5px] font-semibold ${
              tool === t.key ? 'bg-ink text-white' : 'bg-cream text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="flex items-center gap-1.5 text-[12.5px]" style={{ color: LIGHT_INK.green }}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LIGHT_COLOUR.green }} />
        {OFFLINE_LINE}
      </p>

      {saved ? (
        <p className="rounded-xl bg-cream px-3.5 py-2.5 text-[13px] text-ink">{savedLine(marks)}</p>
      ) : (
        <>
          <button
            type="button"
            disabled={!allowed.ok}
            onClick={() => { onSave(marks); setSaved(true); }}
            className="btn-primary min-h-[48px] text-base disabled:opacity-50"
          >
            Save as the as-built
          </button>
          {!allowed.ok && <p className="text-[12.5px] text-ink-light">{allowed.why}</p>}
          <p className="text-[12.5px] text-ink-light">Goes to {SAVED_TO.join(', ').toLowerCase()}.</p>
        </>
      )}
    </div>
  );
}

/**
 * Take 5 — the two minutes before the tools come out.
 *
 * Kris: *"start with a safety take 5 and set up the day right"*. Five questions about THIS site,
 * THIS morning — not a SWMS, which is written once for a kind of work. The rules are in lib/take5
 * and tested there; this is the phone.
 *
 * One question at a time, two big buttons. A five-question form with ten small controls gets tapped
 * through, and a Take 5 that gets tapped through is worse than none: it produces a record saying
 * somebody checked when nobody did.
 */
function Take5Panel({ onDone }: { onDone: (t: Take5) => void }) {
  const [answers, setAnswers] = useState<Record<string, 'yes' | 'no'>>({});
  const [note, setNote] = useState('');

  const t: Take5 = { answers, note, at: new Date().toISOString() };
  const at = TAKE5.findIndex(q => !answers[q.key]);
  const q = at === -1 ? null : TAKE5[at];
  const verdict = mayStart(t);
  const raised = concerns(t);

  if (q) {
    return (
      <div className="grid gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <strong className="text-[15px]">Take 5</strong>
          <span className="text-xs text-ink-light">{at + 1} of {TAKE5.length}</span>
        </div>
        <p className="text-[17px] font-semibold leading-6 text-ink">{q.ask}</p>
        <div className="grid grid-cols-2 gap-2">
          {(['yes', 'no'] as const).map(a => (
            <button
              key={a}
              type="button"
              onClick={() => setAnswers(s => ({ ...s, [q.key]: a }))}
              className={`min-h-[52px] rounded-full text-base font-bold ${
                a === 'yes' ? 'bg-light-green text-white' : 'bg-cream text-ink'
              }`}
            >
              {a === 'yes' ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
        <p className="text-[12.5px] leading-5 text-ink-light">{q.ifNot}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <strong className="text-[15px]">Take 5</strong>

      {/*
        The one that stops the day. Four of the five can be a no and the day carries on sensibly;
        working on something that has not been isolated and tested dead is the one that kills
        electricians, so SPEC says stop and means it.
      */}
      {!verdict.ok && (
        <p
          className="rounded-xl px-3.5 py-3 text-[14px] font-semibold leading-5"
          style={{ background: `color-mix(in srgb, ${LIGHT_COLOUR.red} 14%, transparent)`, color: LIGHT_INK.red }}
        >
          {verdict.why}
        </p>
      )}

      {raised.length > 0 && (
        <div className="grid gap-2">
          <p className="text-[13px] text-ink-light">
            {raised.length === 1 ? 'One thing' : `${raised.length} things`} to sort before you start.
          </p>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            className="input text-base"
            aria-label="What is not right"
            placeholder="What is it? This goes on the job and to your supervisor."
          />
        </div>
      )}

      <button
        type="button"
        disabled={!verdict.ok || needsNote(t)}
        onClick={() => onDone(t)}
        className="btn-primary min-h-[52px] text-base disabled:opacity-50"
      >
        {verdict.ok ? 'Done — start the day' : 'Cannot start yet'}
      </button>
      {needsNote(t) && (
        <p className="text-[12.5px] text-ink-light">Write what it is first — a note nobody can read is a problem nobody can fix.</p>
      )}
      <button type="button" onClick={() => setAnswers({})} className="text-[12.5px] text-ink-light underline">
        Start the five again
      </button>
    </div>
  );
}

/**
 * Something is not right — straight into the safety register, from the job.
 *
 * Kris: *"in the jobs easy incident report and hazard or near miss directly into safety system"*.
 *
 * The job reference goes with it, so the office does not have to ask where. It posts to the same
 * `sendReport` every other report uses — there is no second safety register and no phone-only
 * shortcut that lands somewhere different, which is how a business ends up with two sets of numbers.
 */
function SomethingWrong({ jobRef }: { jobRef: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('hazard');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[48px] rounded-full border-2 border-rust px-4 text-[15px] font-bold text-rust"
      >
        Something&rsquo;s not right
      </button>
    );
  }

  return (
    <form action={sendReport} className="grid gap-2.5 rounded-[20px] bg-white p-4 shadow-sm">
      <strong className="text-[15px]">Tell the office</strong>
      <input type="hidden" name="jobRef" value={jobRef} />
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-wrap gap-1.5">
        {REPORT_KINDS.filter(k => k.key !== 'wellbeing').map(k => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(k.key)}
            aria-pressed={kind === k.key}
            className={`min-h-[44px] rounded-full px-3.5 text-[13.5px] font-semibold ${
              kind === k.key ? 'bg-ink text-white' : 'bg-cream text-ink'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <textarea
        name="text"
        rows={3}
        required
        className="input text-base"
        aria-label="What happened"
        placeholder={REPORT_KINDS.find(k => k.key === kind)?.placeholder ?? 'One line is enough.'}
      />
      <p className="text-[12.5px] leading-5 text-ink-light">
        Goes straight onto the safety register with this job against it. A report is never held
        against you.
      </p>
      <div className="flex gap-2">
        <SubmitButton className="btn-primary min-h-[48px] flex-1 text-base" pending="Sending…">Send it</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary min-h-[48px] px-5">Not now</button>
      </div>
    </form>
  );
}
