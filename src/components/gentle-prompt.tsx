import { ASK, YES, CHECK, gentle, type GentleKey } from '@/lib/gentle';
import { LIGHT_COLOUR } from '@/lib/today';

/**
 * "Hang on a second, is this correct?" — the only way SPEC tells somebody they may be wrong.
 *
 * One component for all seven places, so the wording cannot drift into seven slightly different
 * questions. The colour is AMBER and never red: red is what SPEC uses for something that has gone
 * wrong, and this is a question whose answer is often yes.
 *
 * Both buttons are real. "Yes, it's right" keeps what was entered and records the choice for the
 * person's leader to see — which is the whole safety net. The business finds out a fortnight later
 * that somebody confirmed six over-twelve-hour days in a row, and that is a conversation rather
 * than a blocked timesheet at six o'clock on site.
 */
export function GentlePrompt({ what, facts, confirm, check, hidden }: {
  what: GentleKey;
  facts?: Record<string, string>;
  /** Keeps what was entered. Null renders the prompt without buttons, for a read-only screen. */
  confirm?: (fd: FormData) => Promise<void>;
  /** Lets the person go and fix it themselves. */
  check?: string;
  /** Anything the confirm action needs carrying with it. */
  hidden?: Record<string, string>;
}) {
  const prompt = gentle(what, facts ?? {});

  return (
    <div
      className="grid gap-2 rounded-xl border border-sand-300 bg-sand-50 p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: LIGHT_COLOUR.amber }}
      data-gentle={what}
    >
      <span className="font-serif text-lg text-ink" data-gentle-ask>{ASK}</span>
      <span className="text-sm text-ink-light" data-gentle-because>{prompt.because}</span>
      {(confirm || check) && (
        <div className="mt-1 flex flex-wrap gap-2">
          {confirm && (
            <form action={confirm}>
              {Object.entries(hidden ?? {}).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <input type="hidden" name="promptKey" value={what} />
              <button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white" data-gentle-yes>
                {YES}
              </button>
            </form>
          )}
          {check && (
            <a href={check} className="rounded-full border border-sand-300 px-4 py-2 text-sm font-semibold text-ink" data-gentle-check>
              {CHECK}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
