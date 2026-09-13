import Link from 'next/link';
import { healthFacts } from '@/lib/health-facts';
import { lines, verdict, VERDICT_LINE, VERDICT_NOTE } from '@/lib/site-health';
import { HealthRows, HEALTH_TONE } from '@/components/health-rows';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'SPEC — is it working?' };

/**
 * Is the live site working right now?
 *
 * **No sign-in, and that is the whole point.** The question this answers is "is it broken, or is it
 * me?" — asked at the moment somebody cannot get in. A status page behind a sign-in is useless in
 * exactly the situation it exists for.
 *
 * The same answer also appears on /cockpit, so the owner has one page rather than two. Both read
 * from lib/health-facts and render the same rows through the same component: two screens that
 * disagree about whether the product is working would be worse than either of them alone.
 *
 * It names no business and no person, and reports settings only as present or absent — never a
 * value, never a prefix, never a length. Nothing is cached; a cached status page is worse than none.
 */
export default async function Status() {
  const facts = await healthFacts();
  const rows = lines(facts);
  const overall = verdict(rows);

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="label-caps">SPEC Business Solutions</p>
      <h1 className="mt-2 font-serif text-3xl" style={{ color: HEALTH_TONE[overall] }}>
        {VERDICT_LINE[overall]}
      </h1>
      <p className="mt-2 text-base text-ink-light">{VERDICT_NOTE[overall]}</p>

      <div className="mt-8">
        <HealthRows rows={rows} />
      </div>

      <p className="mt-8 text-xs text-ink-light">
        Checked just now, {new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC. Refresh to
        check again — nothing on this page is remembered between visits. It names no business and no
        person, and never shows the value of a setting.
      </p>
      <p className="mt-3 text-xs text-ink-light">
        <Link href="/welcome" className="underline">SPEC</Link>
      </p>
    </main>
  );
}
