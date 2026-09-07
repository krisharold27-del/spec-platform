import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/ui';
import diagnostic from '../../../../seed/diagnostic.json';
import { saveSection } from './actions';

export const dynamic = 'force-dynamic';

type Q = { id: string; text: string; type?: string; options?: string[] };
type Section = { id: string; title: string; when: string; intro?: string; type?: string; questions?: Q[]; items?: string[]; scale?: string[]; text?: string; patterns?: { name: string; sign: string; fix: string }[] };

export default async function Expectations() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const answers = await db.select().from(schema.diagnostics).where(eq(schema.diagnostics.tenantId, user.tenantId));
  const get = (s: string, q: string) => answers.find(a => a.sectionId === s && a.questionId === q)?.answer ?? '';
  const sections = (diagnostic.sections as Section[]).filter(s => ['before_day_one', 'week_one'].includes(s.when));

  return (
    <Shell title="Business expectations" subtitle="Claude walks the leader through these in week one. Record the genuine answers, not the polite version.">
      <div className="max-w-3xl space-y-8">
        {sections.map(s => (
          <form key={s.id} id={s.id} action={saveSection} className="rounded-lg border bg-white p-5">
            <input type="hidden" name="sectionId" value={s.id} />
            <h2 className="font-serif text-lg font-bold text-ink">{s.title}</h2>
            {s.intro && <p className="mt-1 text-sm text-ink-light">{s.intro}</p>}

            {s.questions?.map(q => (
              <label key={q.id} className="mt-4 block text-sm">
                <span className="font-medium">{q.text}</span>
                {q.type === 'choice'
                  ? <select name={`q:${s.id}:${q.id}`} defaultValue={get(s.id, q.id)} className="mt-1 block rounded border px-2 py-1"><option value="">—</option>{q.options!.map(o => <option key={o} value={o}>{o}</option>)}</select>
                  : <textarea name={`q:${s.id}:${q.id}`} defaultValue={get(s.id, q.id)} rows={2} className="mt-1 w-full rounded border px-3 py-2" />}
              </label>
            ))}

            {s.type === 'rating' && s.items?.map((item, i) => (
              <div key={i} className="mt-3 flex items-center justify-between gap-4 text-sm">
                <span>{item}</span>
                <select name={`q:${s.id}:item${i}`} defaultValue={get(s.id, `item${i}`)} className="rounded border px-2 py-1">
                  <option value="">—</option>{s.scale!.map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
                </select>
              </div>
            ))}

            {s.type === 'agreement' && (
              <div className="mt-3 text-sm">
                <p className="rounded bg-cream/40 p-3 text-slate-700">{s.text}</p>
                <label className="mt-3 flex items-start gap-2"><input type="checkbox" name={`q:${s.id}:accepted`} value="accepted" defaultChecked={!!get(s.id, 'accepted')} className="mt-1" /> I accept this covenant on behalf of the business.</label>
              </div>
            )}

            {s.patterns && (
              <ul className="mt-3 space-y-2 text-sm">
                {s.patterns.map(p => <li key={p.name} className="rounded bg-cream/40 p-3"><b>{p.name}.</b> {p.sign} <span className="text-ink-light">Fix: {p.fix}</span></li>)}
              </ul>
            )}

            {s.type === 'systems_inventory' && <p className="mt-3 text-sm text-ink-light">Systems inventory arrives with the integrations phase; skip for now.</p>}

            {(s.questions || s.type === 'rating' || s.type === 'agreement') && <button className="mt-4 rounded-lg bg-rust px-4 py-2 text-sm text-white hover:bg-rust-dark">Save</button>}
          </form>
        ))}
      </div>
    </Shell>
  );
}
