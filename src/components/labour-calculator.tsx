'use client';

import { useState } from 'react';
import { calculate, money, LEAKS, DEFAULTS } from '@/lib/calculator';
import { LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';

/**
 * "Your labour bill has 10 to 30% more to give."
 *
 * Every figure is computed from the reader's own four numbers, so the page makes a claim about
 * their business rather than telling them about somebody else's. Each line can be switched off, and
 * switching one off removes it from the headline and from every dollar figure — a reader who
 * disagrees with a line should be able to delete it and still trust what is left.
 */
export function LabourCalculator({ seatCostAnnual, currencySymbol = '$' }: {
  seatCostAnnual: number; currencySymbol?: string;
}) {
  const [revenue, setRevenue] = useState(DEFAULTS.revenue);
  const [headcount, setHeadcount] = useState(DEFAULTS.headcount);
  const [labourShare, setLabourShare] = useState(DEFAULTS.labourShare);
  const [improvement, setImprovement] = useState(DEFAULTS.improvement);
  const [off, setOff] = useState<string[]>([]);

  const r = calculate({ revenue, headcount, labourShare, improvement, off, seatCostAnnual });
  const fmt = (n: number) => money(n, currencySymbol);
  const toggle = (id: string) => setOff(o => (o.includes(id) ? o.filter(x => x !== id) : [...o, id]));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="card">
        <h3 className="font-serif text-lg text-ink">Your numbers</h3>
        <p className="mt-1 text-xs text-ink-light">Nothing is sent anywhere. This runs in your browser.</p>

        <div className="mt-4 grid gap-4">
          <Slider
            label="Revenue a year" value={revenue} min={1_000_000} max={60_000_000} step={500_000}
            onChange={setRevenue} display={fmt(revenue)}
          />
          <Slider
            label="People" value={headcount} min={5} max={200} step={1}
            onChange={setHeadcount} display={`${headcount}`}
          />
          <Slider
            label="Labour as a share of revenue" value={labourShare} min={10} max={60} step={1}
            onChange={setLabourShare} display={`${labourShare}%`}
          />
          <Slider
            label="How much more you think is in it" value={improvement} min={10} max={30} step={1}
            onChange={setImprovement} display={`${improvement}%`}
          />
        </div>

        <p className="mt-4 text-sm text-ink-light">
          Labour is {labourShare}% of revenue — {fmt(r.labourCost)} a year. Everything below is a share of
          that, never of revenue.
        </p>
      </div>

      <div className="grid gap-4">
        <div className="rounded-lg bg-sage-100 p-4">
          <div className="label-caps">The gap, at your numbers</div>
          <div className="mt-1 font-serif text-4xl text-ink">{fmt(r.gap)}</div>
          <p className="mt-2 text-sm text-ink">
            {r.gapPctOfLabour.toFixed(1)}% of the labour bill — {r.gapPctOfRevenue.toFixed(1)}% of revenue, and{' '}
            {fmt(r.perPerson)} a person.
          </p>
          <div className="mt-4 border-t border-ink/10 pt-3">
            <div className="label-caps">Recoverable in the first twelve months</div>
            <div className="mt-1 font-serif text-2xl" style={{ color: LIGHT_INK.green }}>{fmt(r.recoverable)}</div>
            <p className="mt-2 text-xs text-ink-light">
              {r.multiple === null
                ? 'Switch a line back on to compare it against what SPEC costs.'
                : `SPEC at ${headcount} seats costs ${fmt(r.seatCost)} a year. The recoverable figure is ${Math.round(r.multiple)} times that.`}
            </p>
          </div>
        </div>

        <div className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-serif text-lg text-ink">Where it goes</h3>
            <span className="text-xs text-ink-light">
              {off.length ? `${off.length} switched off` : 'Switch off anything you disagree with'}
            </span>
          </div>
          <ul className="mt-3 grid gap-3">
            {r.lines.map(l => (
              <li key={l.id} className={l.on ? '' : 'opacity-50'}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={l.on}
                    onChange={() => toggle(l.id)}
                    className="mt-1 accent-rust"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm text-ink">{l.name}</span>
                      <span className="font-mono text-sm text-ink">{fmt(l.amount)}</span>
                    </span>
                    <span className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-cream">
                      <span
                        className="h-full"
                        style={{ width: `${Math.max((l.amount / Math.max(r.gap, 1)) * 100, 0)}%`, background: LIGHT_COLOUR.amber }}
                      />
                      <span
                        className="h-full"
                        style={{ width: `${Math.max((l.recoverable / Math.max(r.gap, 1)) * 100, 0)}%`, background: LIGHT_COLOUR.green }}
                      />
                    </span>
                    <span className="mt-1 block text-xs text-ink-light">{l.where}</span>
                    <span className="mt-1 block text-xs text-rust-700">{l.how}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-light">
            Amber is what is leaking; green is what is realistically recoverable in year one. The rates are
            published against each line rather than rolled into one number, so you can argue with any of them.
          </p>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, display }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (n: number) => void; display: string;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="label-caps">{label}</span>
        <span className="font-mono text-sm text-ink">{display}</span>
      </span>
      <input
        type="range"
        className="mt-2 w-full accent-rust"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </label>
  );
}
