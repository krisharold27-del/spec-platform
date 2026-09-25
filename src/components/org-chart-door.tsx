import Link from 'next/link';

/**
 * The door to the org chart, on the pages people open most.
 *
 * Kris, 25 September, could not find the chart — THE key component of SiteVIP, the thing every
 * score, seat and safety record hangs off — because nothing on My Page, People, the Virtual GM or
 * Setup led to it. It is in the bar now too (second, after My page); this is the same door where
 * somebody is already looking. One component so the words and the address cannot drift.
 */
export function OrgChartDoor({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/org"
      data-org-chart-door
      className={`card flex flex-wrap items-center justify-between gap-3 hover:bg-cream ${className}`}
    >
      <span className="grid gap-0.5">
        <span className="font-serif text-lg text-ink">Org chart</span>
        <span className="text-sm text-ink-light">Who does what, and who reports to whom — everything in SiteVIP hangs off it.</span>
      </span>
      <span className="btn-primary px-4 py-2 text-sm">Open the org chart &rarr;</span>
    </Link>
  );
}
