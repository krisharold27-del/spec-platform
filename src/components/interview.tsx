'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { saveAnswer } from '@/app/setup/expectations/actions';

export type Step = {
  sectionId: string;
  questionId: string;
  sectionTitle: string;
  intro?: string;
  text: string;
  kind: 'text' | 'choice' | 'rating' | 'agreement';
  options?: string[];
  agreementText?: string;
};

/**
 * One question at a time. Answers save as they are given — no Save button — and a choice advances
 * straight to the next question, because this is meant to feel like the leader being interviewed
 * rather than filling in a form. Free text saves on leaving the field or on Next.
 */
export function Interview({ steps, initial }: { steps: Step[]; initial: Record<string, string> }) {
  const firstUnanswered = useMemo(() => {
    const i = steps.findIndex(s => !initial[`${s.sectionId}:${s.questionId}`]);
    return i === -1 ? steps.length : i;
  }, [steps, initial]);

  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [i, setI] = useState(firstUnanswered);
  const [saving, startSaving] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const done = i >= steps.length;
  const step = done ? null : steps[i];
  const key = step ? `${step.sectionId}:${step.questionId}` : '';
  const value = step ? answers[key] ?? '' : '';
  const answeredCount = steps.filter(s => answers[`${s.sectionId}:${s.questionId}`]).length;
  const progress = Math.round((answeredCount / steps.length) * 100);

  function persist(k: string, sectionId: string, questionId: string, v: string) {
    setAnswers(a => ({ ...a, [k]: v }));
    startSaving(async () => {
      await saveAnswer(sectionId, questionId, v);
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    });
  }

  function answerAndAdvance(v: string) {
    if (!step) return;
    persist(key, step.sectionId, step.questionId, v);
    setI(n => n + 1);
  }

  function next() {
    if (step) persist(key, step.sectionId, step.questionId, value);
    setI(n => Math.min(n + 1, steps.length));
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-lg border border-ink/10 bg-white p-8 text-center">
          <div className="label-caps">Diagnostic complete</div>
          <h2 className="mt-2 font-serif text-2xl font-bold text-ink">{answeredCount} of {steps.length} answered</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-light">
            Everything is saved. These answers drive the org chart, the KPIs and the first board pack.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/journey" className="btn-primary">Back to the journey</Link>
            <button onClick={() => setI(0)} className="btn-secondary">Review answers</button>
          </div>
        </div>
      </div>
    );
  }

  const prev = i > 0 ? steps[i - 1] : null;
  const newSection = !prev || prev.sectionId !== step!.sectionId;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between text-xs text-ink-light">
        <span>Question {i + 1} of {steps.length}</span>
        <span aria-live="polite" className="text-ink-light/70">
          {saving ? 'Saving…' : savedAt ? `Saved ${savedAt}` : 'Answers save automatically'}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-rust transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-6 rounded-lg border border-ink/10 bg-white p-6 sm:p-8">
        <div className="label-caps">{step!.sectionTitle}</div>
        {newSection && step!.intro && <p className="mt-2 text-sm text-ink-light">{step!.intro}</p>}

        <h2 className="mt-3 font-serif text-xl font-bold leading-snug text-ink">{step!.text}</h2>

        {step!.kind === 'agreement' && step!.agreementText && (
          <p className="mt-4 rounded-lg bg-cream/50 p-4 text-sm text-ink-light">{step!.agreementText}</p>
        )}

        <div className="mt-5">
          {step!.kind === 'text' ? (
            <>
              <textarea
                autoFocus
                rows={4}
                value={value}
                onChange={e => setAnswers(a => ({ ...a, [key]: e.target.value }))}
                onBlur={e => persist(key, step!.sectionId, step!.questionId, e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); next(); } }}
                placeholder="The genuine answer, not the polite version…"
                className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-rust focus:outline-none focus:ring-1 focus:ring-rust/30"
              />
              <p className="mt-1 text-[11px] text-ink-light/60">⌘/Ctrl + Enter for the next question</p>
            </>
          ) : step!.kind === 'agreement' ? (
            <div className="flex flex-wrap gap-3">
              <button onClick={() => answerAndAdvance('accepted')} className="btn-primary">Accept on behalf of the business</button>
              <button onClick={() => setI(n => n + 1)} className="btn-secondary">Not yet</button>
            </div>
          ) : (
            <div className="grid gap-2">
              {step!.options!.map(o => {
                const label = o.replace(/_/g, ' ');
                const chosen = value === o;
                return (
                  <button
                    key={o}
                    onClick={() => answerAndAdvance(o)}
                    className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                      chosen ? 'border-rust bg-rust/5 font-medium text-ink' : 'border-ink/15 bg-white hover:border-rust/50 hover:bg-cream/40'
                    }`}
                  >
                    <span className="first-letter:uppercase">{label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-ink/10 pt-4">
          <button
            onClick={() => setI(n => Math.max(n - 1, 0))}
            disabled={i === 0}
            className="text-sm text-ink-light hover:text-rust disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Back
          </button>
          <div className="flex items-center gap-4">
            <button onClick={() => setI(n => n + 1)} className="text-sm text-ink-light/70 hover:text-rust">Skip</button>
            <button onClick={next} className="btn-primary">Next</button>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-ink-light/60">
        Nothing here is final — come back and change any answer at any time.
      </p>
    </div>
  );
}
