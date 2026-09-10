import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { getCurrentUser, myBusinesses } from '@/lib/auth';
import { openBusiness } from './actions';

export const dynamic = 'force-dynamic';

/** One email, more than one business — a group owner, a consultant, a founder with a sandbox. */
export default async function Businesses() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const businesses = await myBusinesses();
  return (
    <Shell title="Your businesses" subtitle={businesses.length === 1 ? 'You have one business on SPEC.' : 'Choose which one to open. SPEC remembers your choice on this browser.'}>
      <ul className="max-w-xl divide-y divide-ink/10 rounded-lg border border-ink/10 bg-white">
        {businesses.map(b => (
          <li key={b.tenantId} className="flex items-center justify-between gap-4 p-4">
            <span className="font-medium text-ink">{b.name}</span>
            {b.current
              ? <span className="text-sm text-ink-light">Open now</span>
              : <form action={openBusiness}><input type="hidden" name="tenantId" value={b.tenantId} /><button className="rounded-lg bg-rust px-4 py-2 text-sm text-white hover:bg-rust-dark">Open</button></form>}
          </li>
        ))}
      </ul>
    </Shell>
  );
}
