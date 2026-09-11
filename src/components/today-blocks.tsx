'use client';

import { useState } from 'react';
import Link from 'next/link';
import { answerFor, ASK_PROMPTS, type Answer, type TodoItem } from '@/lib/today';
import { SubmitButton } from '@/components/submit-button';
import type { RoleScore } from '@/lib/scoring';
import type { ScorecardRow } from '@/lib/queries';
import { LIGHT_COLOUR } from '@/lib/today';
import type { PathLine, PathProgress, Signoff } from '@/lib/training';
import { logWeeklyMeeting, continueModule } from '@/app/today/actions';

/**
 * The three parts of Today that respond to a press.
 *
 * Only one of them writes anything — the meeting log. Ticking an item and reading an answer are
 * both deliberately local: the list is derived from the real state of the month, so an item leaves
 * it when the underlying thing is actually dealt with, not when somebody ticks a box here.
 */

/** What needs me today. Each item carries the page the work is actually done on. */
export function TodoList({ items }: { items: TodoItem[] }) {
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const done = items.filter(i => ticked[i.id]).length;

  if (!items.length) {
    return (
      <p className="mt-4 text-sm text-ink-light">
        Nothing is waiting on you. Your month is marked, your team is scored and this week is logged.
      </p>
    );
  }

  return (
    <>
      <div className="mt-1 text-sm text-ink-light">{done} of {items.length} worked through</div>
      <ul className="mt-4 grid gap-2">
        {items.map(item => {
          const off = !!ticked[item.id];
          return (
            <li key={item.id}>
              <div className={`flex items-start gap-3 rounded-lg p-3 transition-colors ${off ? 'bg-sage-100' : 'bg-cream'}`}>
                <button
                  type="button"
                  aria-pressed={off}
                  onClick={() => setTicked(t => ({ ...t, [item.id]: !t[item.id] }))}
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-content-center rounded-full text-xs transition-colors ${
                    off ? 'bg-sage-700 text-cream' : 'border border-ink/25 text-transparent hover:border-rust'
                  }`}
                >
                  ✓<span className="sr-only">Mark as worked through</span>
                </button>
                <div className="min-w-0">
                  <Link
                    href={item.href}
                    className={`block text-sm font-semibold hover:text-rust ${off ? 'text-ink-light line-through' : 'text-ink'}`}
                  >
                    {item.label}
                  </Link>
                  <div className="mt-0.5 text-xs text-ink-light">{item.meta}</div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Ask anything.
 *
 * The answers are computed on this page from the numbers already on it — no model is called, no
 * key leaves the server, and nothing is written. SPEC reads to inform; it never writes to change.
 */
export function AskPanel({ rows, score, meetingLogged }: { rows: ScorecardRow[]; score: RoleScore; meetingLogged: boolean }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const ask = (q: string) => {
    setQuestion(q);
    setAnswer(answerFor(q, { rows, score, reports: [], meetingLogged }));
  };

  return (
    <>
      <p className="mt-2 text-sm text-ink-light">
        Answered from your own card and the roles reporting to you. Nothing is sent anywhere, and nothing
        here can change a number.
      </p>
      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={e => { e.preventDefault(); ask(question.trim()); }}
      >
        <input
          className="input flex-1"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          aria-label="Ask a question about your month"
          placeholder={ASK_PROMPTS[0]}
        />
        <button type="submit" className="btn-primary shrink-0">Ask</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {ASK_PROMPTS.map(q => (
          <button key={q} type="button" onClick={() => ask(q)} className="rounded-full bg-surface px-3 py-1.5 text-xs text-ink hover:bg-cream">
            {q}
          </button>
        ))}
      </div>
      {answer && (
        <div className="mt-4 rounded-lg bg-surface p-4">
          <div className="label-caps text-rust-700">{answer.source}</div>
          <p className="mt-1 text-sm text-ink">{answer.text}</p>
        </div>
      )}
    </>
  );
}

/** Changes you should know about. Acknowledging is local — it clears the card, not the change. */
export function ChangeList({ items }: { items: { id: string; kind: string; title: string; body: string; href: string }[] }) {
  const [seen, setSeen] = useState<Record<string, boolean>>({});

  if (!items.length) {
    return <p className="mt-4 text-sm text-ink-light">Nothing has changed under you since you were last here.</p>;
  }

  return (
    <div className="mt-4 grid gap-3">
      {items.map(c => {
        const ack = !!seen[c.id];
        return (
          <div key={c.id} className={`rounded-lg p-4 transition-colors ${ack ? 'bg-cream' : 'bg-rust-100'}`}>
            <div className="label-caps">{c.kind}</div>
            <Link href={c.href} className="mt-1 block font-serif text-base text-ink hover:text-rust">{c.title}</Link>
            <p className="mt-1 text-sm text-ink-light">{c.body}</p>
            <button
              type="button"
              disabled={ack}
              onClick={() => setSeen(s => ({ ...s, [c.id]: true }))}
              className={`mt-3 rounded-full px-3 py-1.5 text-xs transition-colors ${
                ack ? 'text-ink-light' : 'bg-surface text-ink hover:bg-cream'
              }`}
            >
              {ack ? 'Acknowledged' : 'Got it'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The training path for the role this person holds.
 *
 * The path belongs to the role, so the modules are the job's rather than the person's, and the
 * sign-off at the bottom is a manager's decision — the bar reaching the end makes somebody ready
 * to be signed off, never signed off.
 */
export function TrainingPath({ path, progress, signoff }: { path: PathLine[]; progress: PathProgress; signoff: Signoff }) {
  if (!path.length) {
    return (
      <p className="mt-3 text-sm text-ink-light">
        Nothing is assigned to this role yet. Training hangs off the job rather than the person, so
        whoever holds this role inherits the path once it is set.
      </p>
    );
  }

  const overall = Math.round((progress.pct ?? 0) * 100);
  return (
    <>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full transition-[width] duration-200"
          style={{ width: `${Math.max(overall, 2)}%`, background: progress.pathComplete ? LIGHT_COLOUR.green : LIGHT_COLOUR.amber }}
        />
      </div>
      <div className="mt-1.5 text-xs text-ink-light">{overall}% of the path</div>

      <ul className="mt-4 grid gap-3">
        {path.map(m => {
          const tone = m.state === 'complete' ? LIGHT_COLOUR.green
            : m.due === 'overdue' ? LIGHT_COLOUR.red
            : m.state === 'in_progress' ? LIGHT_COLOUR.amber
            : LIGHT_COLOUR.pending;
          return (
            <li key={m.moduleId} className="rounded-lg bg-surface p-3" style={{ borderLeft: `4px solid ${tone}` }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-serif text-base text-ink">{m.title}</span>
                <span className="label-caps" style={{ color: m.state === 'not_started' ? undefined : tone }}>
                  {m.state === 'complete' ? 'Complete' : m.state === 'in_progress' ? 'In progress' : 'Not started'}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-light">{m.summary}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream">
                <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.max(m.progress, 2)}%`, background: tone }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-ink-light">
                  {m.core && <span className="pill pill-neutral mr-2">Core</span>}
                  {m.note}
                </span>
                {m.state !== 'complete' && (
                  <form action={continueModule}>
                    <input type="hidden" name="moduleId" value={m.moduleId} />
                    <SubmitButton className="btn-primary px-3 py-1.5 text-xs" pending="…">{m.action}</SubmitButton>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 border-t border-ink/10 pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="label-caps">Sign-off</span>
          <span
            className="font-serif text-sm"
            style={{ color: signoff.state === 'signed' ? LIGHT_COLOUR.green : signoff.state === 'ready' ? LIGHT_COLOUR.amber : undefined }}
          >
            {signoff.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-light">{signoff.note}</p>
      </div>
    </>
  );
}

/** The weekly meeting. The one thing on Today that writes: a date, never what was said. */
export function MeetingLog({ logged, canManage }: { logged: boolean; canManage: boolean }) {
  if (logged) {
    return <p className="mt-3 text-sm text-ink-light">Logged for this week. The month stays scoreable.</p>;
  }
  if (!canManage) {
    return <p className="mt-3 text-sm text-ink-light">Not logged this week. Whoever runs the meeting logs it.</p>;
  }
  return (
    <form action={logWeeklyMeeting} className="mt-3">
      <SubmitButton className="btn-secondary" pending="Logging…">Log this week&rsquo;s meeting</SubmitButton>
    </form>
  );
}
