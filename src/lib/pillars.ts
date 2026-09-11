/**
 * The four pillars as presentation values — pure, and safe to import from a client component.
 *
 * These live here rather than in components/ui because ui.tsx's Shell reaches for the signed-in
 * user, which pulls `next/headers` in behind it. A client component that only wants a pillar's name
 * should not drag the server's request context along with it.
 *
 * Colours match the `safety` / `people` / `earnings` / `compliance` tokens in tailwind.config.ts —
 * repeated as hex because these are used in inline styles, which Tailwind cannot generate from a
 * dynamic value. Change them in both places or in neither.
 */
import type { Pillar } from './scoring';

export const PILLAR_META: Record<Pillar, { name: string; letter: string; colour: string; question: string }> = {
  safety:     { name: 'Safety',     letter: 'S', colour: '#b2622d', question: 'Are we going well in Safety?' },
  people:     { name: 'People',     letter: 'P', colour: '#728157', question: 'Does everyone love coming to work?' },
  earnings:   { name: 'Earnings',   letter: 'E', colour: '#a67c1a', question: 'Are we making money?' },
  compliance: { name: 'Compliance', letter: 'C', colour: '#7d5068', question: 'Are we clear to work?' },
};

/** No score renders as a dash, never as 0%. */
export const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
