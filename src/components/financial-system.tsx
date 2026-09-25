import Link from 'next/link';
import { SwitchCards } from '@/components/recommends';
import { ANGUS_SHIELD, type LedgerPanel } from '@/lib/virtual-gm-overview';
import { ANGUS_STORY } from '@/lib/out-simple';

/**
 * Your financial system — which one the business uses, its connection, and Angus Shield as the
 * quiet option beside it, with Switch when ready.
 *
 * One component, drawn on both /financials and the Virtual GM, so the two can never describe the
 * business's books differently. `children` is where a page adds its own way in (the file upload on
 * /financials). Angus is offered, never pushed: the business's own system stays first, and the
 * Switch when ready card only says what would need to be true.
 */
export function FinancialSystemPanel({
  ledger, back, id, children,
}: { ledger: LedgerPanel; back: string; id?: string; children?: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-20" data-vgm-ledger={ledger.state} data-financial-system>
      <h2 className="font-serif text-2xl text-ink">Your financial system</h2>
      <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink">{ledger.says}</p>
      <Link href={ledger.href} className="btn-secondary mt-4 inline-flex items-center">{ledger.action}</Link>

      {children}

      <div className="mt-6 border-t border-cream-border pt-5" data-vgm-angus>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-serif text-lg text-ink">
            {ANGUS_SHIELD.name}
            <span className="ml-2 font-sans text-sm italic text-ink-light">{ANGUS_STORY.tagline}</span>
          </span>
          <span className="pill pill-neutral">{ANGUS_SHIELD.switchable ? 'Ready to switch' : 'Not switchable yet'}</span>
        </div>
        <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-ink-light">{ANGUS_SHIELD.line}</p>
        <p className="mt-1 text-xs text-ink-light">Your choice, always. Nothing moves until you say so.</p>
      </div>
      <div className="mt-4">
        <SwitchCards areas={['accounting']} back={back} inset />
      </div>
    </section>
  );
}
