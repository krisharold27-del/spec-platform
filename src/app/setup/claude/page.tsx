import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/ui';
import { registerClaude } from './actions';

export const dynamic = 'force-dynamic';

export default async function ClaudeRegistration() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const reg = (await db.select().from(schema.claudeRegistrations).where(eq(schema.claudeRegistrations.tenantId, user.tenantId)))[0];
  return (
    <Shell title="Register Claude" subtitle="Required before the journey opens.">
      <div className="max-w-2xl">
        <div className="rounded-lg border-l-4 border-slate-900 bg-white p-4 text-sm">
          <div className="font-medium">Why this comes first</div>
          <p className="mt-1 text-slate-600">SPEC is delivered through Claude: it guides every step, explains why each KPI exists, and writes the monthly board output from your data. Registering Claude first is the first act of commitment — and it is what lets the rest run without a consultant in the room.</p>
        </div>
        <form action={registerClaude} className="mt-6 space-y-5">
          <fieldset className="rounded-lg border bg-white p-4">
            <legend className="px-1 text-sm font-medium">Which describes your business?</legend>
            <label className="mt-2 flex gap-3 text-sm"><input type="radio" name="path" value="own_workspace" defaultChecked={reg?.path !== 'needs_setup'} />
              <span><b>We already use Claude</b> (Team or Enterprise). Our managers have seats.</span></label>
            <label className="mt-3 flex gap-3 text-sm"><input type="radio" name="path" value="needs_setup" defaultChecked={reg?.path === 'needs_setup'} />
              <span><b>We don't have Claude yet.</b> Show me what to set up.</span></label>
          </fieldset>
          <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">
            <div className="font-medium text-slate-900">What's needed</div>
            <p className="mt-1">A Claude workspace for the business, with a seat for every person who will hold a role at supervisor level or above (the full-access users). Staff below supervisor are read-only and need no seat. Your job, accounting, CRM and safety systems connect to Claude there; SPEC reads the results.</p>
            <label className="mt-3 block">Workspace name (optional)<input name="workspaceName" defaultValue={reg?.workspaceName ?? ''} className="mt-1 w-full rounded border px-3 py-2" placeholder="e.g. Northside Electrical" /></label>
            <label className="mt-3 flex items-start gap-2"><input type="checkbox" name="seatsConfirmed" defaultChecked={reg?.seatsConfirmed} className="mt-1" />
              <span>I confirm the business has a Claude workspace and seats for everyone who will be supervisor level or above.</span></label>
          </div>
          <button className="rounded-lg bg-slate-900 px-5 py-2 text-white hover:bg-slate-700">Save and continue</button>
          {reg && !reg.seatsConfirmed && <p className="text-sm text-amber-800">Saved. The journey stays closed until seats are confirmed.</p>}
        </form>
      </div>
    </Shell>
  );
}
