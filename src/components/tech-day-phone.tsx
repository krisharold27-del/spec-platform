'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SiteVipMark } from '@/components/sitevip-mark';
import { LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';
import {
  STEPS, EMPTY_DAY, apply, canDo, doneLine, isDone, nextStep, primaryLabel, primaryNote, revive,
  storageKey, summary, timesheet, clock, hoursLabel,
  type Material, type StepKey, type TechDayAction, type TechDayState,
} from '@/lib/tech-day';

export interface ClearToWork {
  state: 'clear' | 'not_clear' | 'unknown';
  blocked: string[];
}

interface DoneJob {
  title: string;
  minutes: number;
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
export function TechDayPhone({ userId, name, firstName, clear }: {
  userId: string; name: string; firstName: string; clear: ClearToWork;
}) {
  const [day, setDay] = useState('');
  const [s, setS] = useState<TechDayState>(EMPTY_DAY);
  const [finished, setFinished] = useState<DoneJob[]>([]);
  const [view, setView] = useState<'today' | 'job' | 'done'>('today');
  const [panel, setPanel] = useState<StepKey | null>(null);
  const [now, setNow] = useState(nowIso);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [signature, setSignature] = useState<string | null>(null);

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
    if (kept.job && !kept.finishedAt) setView('job');
  }, [userId]);

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

  const primary = () => {
    const n = nextStep(s);
    if (n === 'start') { act({ type: 'start', at: nowIso() }); setPanel(null); return; }
    if (n === 'finish') {
      const at = nowIso();
      const done = apply(s, { type: 'finish', at });
      act({ type: 'finish', at });
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
    if (k === 'start' && canDo(s, 'start')) { act({ type: 'start', at: nowIso() }); setPanel(null); return; }
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

            {(!s.job || s.finishedAt) && <OpenJob onOpen={job => { act({ type: 'open', job }); setView('job'); }} />}

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

            <KeptHere>
              Booked jobs land here once the office schedules you on the Jobs board. Until then your day is
              kept on this phone.
            </KeptHere>
          </>
        )}

        {view === 'job' && s.job && (
          <>
            <div className="rounded-[20px] bg-white p-[18px] shadow-sm">
              <span className="text-[12.5px] text-ink-light">On the job</span>
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
              <KeptHere>Clocking since {clock(sheet.start!)} · {hoursLabel(sheet.minutes)} so far. Kept on this phone for now.</KeptHere>
            )}
          </>
        )}

        {view === 'done' && (
          <DoneScreen s={s} now={now} signature={signature} onNext={nextJob} />
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

/** Name the job you are on. Replaced by the office's schedule once jobs are stored. */
function OpenJob({ onOpen }: { onOpen: (job: { title: string; site: string }) => void }) {
  const [title, setTitle] = useState('');
  const [site, setSite] = useState('');
  return (
    <form
      onSubmit={e => { e.preventDefault(); if (title.trim()) onOpen({ title, site }); }}
      className="grid gap-2 rounded-[20px] bg-white px-[18px] py-4 shadow-sm"
    >
      <h2 className="text-[15px] font-bold">Today&rsquo;s jobs</h2>
      <p className="text-[13px] leading-5 text-ink-light">Nothing booked for you here yet. Start the job you&rsquo;re on:</p>
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

function PhotosPanel({ urls, onAdd, onDone }: { urls: string[]; onAdd: (files: File[]) => void; onDone: () => void }) {
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
      <p className="text-[12.5px] leading-5 text-ink-light">Photos stay on this phone for now — they are not uploaded to the job yet.</p>
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

function DoneScreen({ s, now, signature, onNext }: { s: TechDayState; now: string; signature: string | null; onNext: () => void }) {
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
        Your timesheet built itself from Start and Finish. It is kept on this phone for now: the office&rsquo;s
        Jobs board does not take timesheets, photos or sign-offs from the phone yet, so tell your supervisor
        the job is done the way you do today.
      </p>
      <button type="button" onClick={onNext} className="min-h-[52px] rounded-full bg-ink px-4 py-4 text-[15.5px] font-semibold text-white">
        Next job &rarr;
      </button>
    </div>
  );
}
