'use client';
import { useMemo, useState } from 'react';
import {
  priceQuote, lineFrom, addToLines, stepLine, marginAdvice, money, money2, MARKUPS, MARGIN_BENCHMARK,
  type QuoteLine, type CatalogueItem, type Kit, type LabourRate,
} from '@/lib/jobs';
import { LIGHT_COLOUR } from '@/lib/today';

/* The four lights, from the one place they are defined. Pending is the warm grey, never red. */
const LIGHT = LIGHT_COLOUR;

/**
 * The live quote builder.
 *
 * Every change reprices on the spot through lib/jobs — the same functions the tests hold — so what
 * the leader sees is exactly what the server will save. The server never trusts the prices from
 * here, only which lines and how many: see `saveQuote`.
 */
export function QuoteBuilder({
  quoteId, heading, subheading, client, initialLines, initialMarkup, sent, sentLine,
  items, kits, rates, action, example = false,
}: {
  quoteId: string;
  heading: string;
  subheading: string;
  client: string;
  initialLines: QuoteLine[];
  initialMarkup: number;
  /** A quote that has gone out is read, not edited. */
  sent: boolean;
  sentLine?: string;
  items: CatalogueItem[];
  kits: Kit[];
  rates: LabourRate[];
  action?: (formData: FormData) => void | Promise<void>;
  /** The worked example: interactive, never saved. */
  example?: boolean;
}) {
  const [lines, setLines] = useState<QuoteLine[]>(initialLines);
  const [markup, setMarkup] = useState(initialMarkup);
  const [pick, setPick] = useState('');
  const t = useMemo(() => priceQuote(lines, markup), [lines, markup]);
  const ctx = { items, kits, rates };
  const locked = sent;

  const add = (kind: QuoteLine['kind'], ref: string) => {
    const l = lineFrom(kind, ref, ctx, 1);
    if (l) setLines(ls => addToLines(ls, l));
  };

  const marginPct = t.margin === null ? null : Math.round(t.margin * 100);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="card">
        <span className="text-xs text-ink-light">{subheading}</span>
        <h2 className="mt-1 font-serif text-2xl text-ink">{heading}</h2>
        <div className="mt-4 grid gap-2">
          {lines.map((l, i) => {
            const p = t.lines[i];
            return (
              <div key={`${l.kind}:${l.ref}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-2.5">
                <span className="grid min-w-0 flex-[1_1_220px] gap-0.5">
                  <span className="text-sm font-semibold text-ink">{l.name}</span>
                  <span className="text-xs text-ink-light">
                    {l.kind === 'labour' ? 'Labour' : l.kind === 'kit' ? `Kit · includes ${l.hours} h labour` : 'Item'}
                    {' · '}
                    {l.kind === 'labour' ? `${money2(l.rateChargeCents)} per hour` : `${money2(l.unitCostCents)} cost per ${l.kind === 'kit' ? 'kit' : 'unit'}`}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  {!locked && (
                    <button type="button" aria-label={`Less ${l.name}`} onClick={() => setLines(ls => stepLine(ls, i, -1))}
                      className="h-8 w-8 rounded-full bg-surface text-base text-ink">−</button>
                  )}
                  <span className="min-w-[38px] text-center text-sm font-bold">{l.kind === 'labour' ? `${l.qty} h` : l.qty}</span>
                  {!locked && (
                    <button type="button" aria-label={`More ${l.name}`} onClick={() => setLines(ls => stepLine(ls, i, 1))}
                      className="h-8 w-8 rounded-full bg-surface text-base text-ink">+</button>
                  )}
                  <span className="min-w-[84px] text-right text-sm font-bold">{money(p?.sellCents ?? 0)}</span>
                </span>
              </div>
            );
          })}
          {!lines.length && (
            <p className="rounded-2xl bg-cream px-4 py-3 text-sm text-ink-light">
              Nothing on it yet. Add an item, a kit or some labour below and the price builds itself.
            </p>
          )}
        </div>

        {!locked && !example && (
          <>
            <p className="label-caps mb-2 mt-5">Add from catalogue, kits or labour</p>
            {items.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                <select className="input min-w-0 flex-1" value={pick} onChange={e => setPick(e.target.value)} aria-label="Catalogue item">
                  <option value="">An item from the catalogue…</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name} · {money2(i.costCents)} per {i.unit}</option>)}
                </select>
                <button type="button" className="btn-secondary shrink-0" disabled={!pick} onClick={() => { add('item', pick); setPick(''); }}>+ Add</button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {kits.map(k => (
                <button key={k.id} type="button" onClick={() => add('kit', k.id)} className="rounded-full bg-cream px-3.5 py-2 text-sm text-ink hover:bg-ink/5">+ {k.name}</button>
              ))}
              {rates.map(r => (
                <button key={r.id} type="button" onClick={() => add('labour', r.id)} className="rounded-full bg-cream px-3.5 py-2 text-sm text-ink hover:bg-ink/5">+ {r.name} hour</button>
              ))}
            </div>
            {!items.length && !kits.length && !rates.length && (
              <p className="mt-2 text-sm text-ink-light">
                The catalogue is empty. Add the items you use and your labour rates on the Catalogue tab, and they appear here.
              </p>
            )}
          </>
        )}
      </section>

      <section className="card shadow-md">
        <p className="label-caps mb-3">The price</p>
        <div className="grid gap-2 text-sm">
          <Row label={`Materials (cost ${money(t.materialCostCents)})`} value={money(t.materialSellCents)} />
          <Row label={`Labour (${t.hours} h)`} value={money(t.labourSellCents)} />
          <Row label="Total ex GST" value={money(t.exGstCents)} />
          <Row label="GST" value={money(t.gstCents)} />
          <Row label="Your cost" value={money(t.costCents)} />
        </div>
        <p className="label-caps mb-2 mt-5">Materials markup</p>
        <div className="flex gap-2">
          {MARKUPS.map(m => (
            <button key={m} type="button" disabled={locked} onClick={() => setMarkup(m)}
              aria-pressed={m === markup}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${m === markup ? 'bg-ink text-cream' : 'bg-cream text-ink'} disabled:cursor-default`}>
              {m}%
            </button>
          ))}
        </div>
        <div className="mt-5 rounded-2xl bg-cream px-5 py-4">
          <p className="font-serif text-3xl leading-none text-ink">{money(t.incGstCents)}</p>
          <p className="mt-2 text-sm text-ink-light">
            inc GST · {marginPct === null ? 'margin shows once there is a line' : `${marginPct}% margin`} · benchmark {Math.round(MARGIN_BENCHMARK * 100)}%
          </p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full" style={{ background: LIGHT[t.light], width: `${t.margin === null ? 0 : Math.max(4, Math.min(100, t.margin * 200))}%` }} />
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-light">{marginAdvice(t)}</p>

        {example ? (
          <p className="mt-4 text-xs text-ink-light">
            A worked example with illustrative prices — nothing here is saved or is your business&rsquo;s.
            Press the buttons: the markup and the quantities reprice it the way your own quotes will be priced.
          </p>
        ) : locked ? (
          <p className="mt-4 text-sm text-ink">{sentLine}</p>
        ) : action ? (
          <form action={action} className="mt-4 grid gap-2">
            <input type="hidden" name="quoteId" value={quoteId} />
            <input type="hidden" name="markup" value={markup} />
            <input type="hidden" name="lines" value={JSON.stringify(lines.map(l => ({ kind: l.kind, ref: l.ref, qty: l.qty })))} />
            <button type="submit" name="intent" value="send" className="btn-primary w-full py-2.5" disabled={!lines.length}>
              Quote sent to {client}
            </button>
            <button type="submit" name="intent" value="save" className="btn-ghost w-full">Save the draft</button>
            <p className="text-xs text-ink-light">
              SPEC never emails a quote. Send it your usual way, then press the button: the job moves to Quoted
              carrying this price, and the price is fixed from then on.
            </p>
          </form>
        ) : null}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3"><span>{label}</span><strong>{value}</strong></div>
  );
}
