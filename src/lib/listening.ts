/**
 * siteVIP listening — what trades are saying in public about job software and about siteVIP, heard
 * every night, grouped, and turned into a proposed fix for Kris to approve (Design 20,
 * `SPEC Cockpit.dc.html`: "Nothing ships until you approve it. Small and quick beats big and slow.").
 *
 * Public sources only. A customer's own words inside SPEC — their "Not simple?" reports, what they
 * typed into a problem box — are theirs, and SPEC as a company does not read them (design rule 6).
 * So this listens where anybody could: forums, review sites, public threads.
 *
 * Pure: what the model returns is untrusted and is cleaned here.
 */

export interface Heard {
  theme: string;
  /** What trades are saying, in their words, one or two sentences. */
  heard: string;
  /** Where it was said — public http(s) links only. */
  sources: string[];
  /** The small, quick fix SPEC would make. A proposal: nothing ships until it is approved. */
  fix: string;
}

const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function cleanHeard(raw: unknown): Heard[] {
  const list = Array.isArray(raw) ? raw
    : Array.isArray((raw as { themes?: unknown } | null)?.themes) ? (raw as { themes: unknown[] }).themes : [];
  return list.slice(0, 6).map(t => {
    const x = (t ?? {}) as Record<string, unknown>;
    const sources = (Array.isArray(x.sources) ? x.sources : [])
      .map(s => clip(s, 300))
      .filter(s => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s))
      .slice(0, 4);
    return { theme: clip(x.theme, 80), heard: clip(x.heard, 400), sources, fix: clip(x.fix, 300) };
  }).filter(h => h.theme && h.heard && h.fix && h.sources.length > 0);
}

/** Once a night: listening again inside twenty hours would only hear the same threads. */
export const LISTEN_EVERY_HOURS = 20;
export const dueToListen = (lastRunAt: string | null | undefined, now = new Date()): boolean =>
  !lastRunAt || now.getTime() - Date.parse(lastRunAt) >= LISTEN_EVERY_HOURS * 3_600_000;
