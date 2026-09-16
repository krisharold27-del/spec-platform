import { LIGHT_INK } from '@/lib/today';
import type { HealthLine, Severity } from '@/lib/site-health';

/**
 * The "is it working" rows, drawn once and used on both screens that show them.
 *
 * /status and /cockpit answer the same question for the same person; the only difference is that
 * one is reachable without signing in. Drawing them twice would let them drift — different words,
 * different colours, eventually different answers — and a business that gets two answers trusts
 * whichever it saw last.
 */

export const HEALTH_TONE: Record<Severity, string> = {
  working: LIGHT_INK.green,
  limited: LIGHT_INK.amber,
  broken: LIGHT_INK.red,
};

/*
  `limited` covers two situations that need opposite words.

  Rendering the page found this: a deliberately wrong API key produced the badge "Not switched on"
  beside the sentence "The key is there but Anthropic refuses it". The badge is the part somebody
  scans, and it said the opposite of the truth — it would send Kris looking for a setting to add
  when the setting was there and the key behind it was dead.

  So the word is a decision, made in lib/site-health where the situation is known, and the severity
  map below is only the fallback. Amber still means amber; it just stops claiming to know WHY.
*/
const STATE_WORD: Record<Severity, string> = {
  working: 'Working',
  limited: 'Not switched on',
  broken: 'Not working',
};

const word = (r: HealthLine) => r.word ?? STATE_WORD[r.severity];

export function HealthRows({ rows }: { rows: HealthLine[] }) {
  return (
    <div className="grid gap-3">
      {rows.map(r => (
        <div key={r.what} className="rounded-lg border border-ink/10 bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-serif text-base text-ink">{r.what}</span>
            <span className="text-sm font-medium" style={{ color: HEALTH_TONE[r.severity] }}>
              {word(r)}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-light">{r.says}</p>
          {r.fix && (
            <p className="mt-2 rounded-lg bg-cream p-3 text-sm text-ink">
              <b>To fix it: </b>{r.fix}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
