'use client';
import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * "Something not right? Tell SPEC." — the one-line report box.
 *
 * Enter sends; Shift+Enter starts a new line, because a phone keyboard and a desk keyboard both
 * expect that and a report typed at the scene should not need a mouse. The kind chips are part of
 * the same form, so nothing is sent until the person presses send.
 *
 * A wellbeing report is anonymous unless the person ticks the box to put their name to it — the
 * default is the one that gets the report written.
 */
export function SafetyReportBox({
  kinds, initialKind, jobRef, jobFromSystem, action,
}: {
  kinds: { key: string; label: string; placeholder: string }[];
  initialKind: string;
  jobRef: string | null;
  jobFromSystem: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [kind, setKind] = useState(kinds.some(k => k.key === initialKind) ? initialKind : kinds[0].key);
  const [editingJob, setEditingJob] = useState(!jobRef);
  const form = useRef<HTMLFormElement>(null);
  const current = kinds.find(k => k.key === kind) ?? kinds[0];
  const wellbeing = kind === 'wellbeing';

  return (
    <form ref={form} action={action} className="mt-4">
      <input type="hidden" name="kind" value={kind} />
      <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label="What kind of report">
        {kinds.map(k => (
          <button
            key={k.key}
            type="button"
            role="radio"
            aria-checked={k.key === kind}
            onClick={() => setKind(k.key)}
            className={`rounded-full px-4 py-2 text-sm ${k.key === kind ? 'bg-ink text-cream' : 'bg-cream text-ink hover:bg-ink/5'}`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2 rounded-3xl bg-cream py-1.5 pl-5 pr-1.5">
        <textarea
          name="text"
          required
          rows={1}
          maxLength={1000}
          placeholder={current.placeholder}
          aria-label="Describe what happened"
          className="min-h-[44px] flex-1 resize-none border-0 bg-transparent py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-light"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (e.currentTarget.value.trim()) form.current?.requestSubmit();
            }
          }}
        />
        <Send />
      </div>

      {wellbeing ? (
        <label className="mt-3 flex items-center gap-2 text-sm text-ink-light">
          <input type="checkbox" name="named" className="h-4 w-4" />
          Put my name to it. Leave this unticked and nobody — not the GM, not SPEC — can see who sent it.
        </label>
      ) : (
        <p className="mt-3 text-[13px] leading-5 text-ink-light">
          {jobRef && !editingJob ? (
            <>
              Tagged to your job{jobFromSystem ? ' from your job system' : ''}: <strong className="text-ink">{jobRef}</strong>{' '}
              <input type="hidden" name="jobRef" value={jobRef} />
              <button type="button" className="text-rust-700 hover:underline" onClick={() => setEditingJob(true)}>Not this job?</button>
            </>
          ) : (
            <label className="flex flex-wrap items-center gap-2">
              Job or site, if you know it
              <input name="jobRef" defaultValue={jobRef ?? ''} maxLength={80} className="input w-56 py-1.5 text-sm" aria-label="Job or site" />
            </label>
          )}
        </p>
      )}
      <p className="mt-2 text-xs text-ink-light">Enter sends. Shift+Enter for a new line.</p>
    </form>
  );
}

function Send() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Send report"
      className="grid h-11 w-11 flex-none place-content-center rounded-full bg-rust text-xl text-cream hover:bg-rust-600 disabled:cursor-wait disabled:opacity-60"
    >
      →
    </button>
  );
}
