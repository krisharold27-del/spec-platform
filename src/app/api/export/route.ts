import { getCurrentUser } from '@/lib/auth';
import { seatFor } from '@/lib/seat-of';
import { fromSeat } from '@/lib/money-sight';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { zip } from '@/lib/zip';
import { filesFor, archiveName } from '@/lib/export-everything';
import { sheetsFor } from '@/lib/export-data';
import { mayExportEverything } from '@/lib/money-sight';

export const dynamic = 'force-dynamic';

/**
 * Everything the business has, in one file.
 *
 * ── The promise, finally kept ────────────────────────────────────────────────────────────────────
 *
 * Question 6 on the owner questions page — *"If I leave, do I get my data back?"* — has been
 * answered "yes, in one click" since the page was written. Until 26 September that was a paragraph
 * on the Admin screen with no button, no route and no code. The business that decided to leave
 * would have discovered it on the worst day it ever had with SPEC.
 *
 * ── Owner only, and refused rather than filtered ─────────────────────────────────────────────────
 *
 * `mayExportEverything` already decides this and the Admin screen already draws it, so the rule has
 * one home. It is checked again HERE because hiding a button is not access control: this is every
 * customer, every wage and every incident in one download, and it is the single most valuable
 * request in the product to forge.
 *
 * A refusal is a flat 403 rather than a smaller export. Quietly handing a supervisor a partial
 * archive called "everything" would teach them they have it all when they do not.
 *
 * ── Read-only, so it works on the day it is needed ───────────────────────────────────────────────
 *
 * Nothing here writes, and it deliberately does not go through `assertWritable`. A business whose
 * card has failed, or whose subscription has lapsed, is exactly the business most likely to be
 * leaving — an export that stopped working when the payment did would make the data-ownership
 * promise worthless at the only moment it counts.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response('Sign in first.', { status: 401 });

  /* The same two calls the Admin screen makes, so the button and the route cannot disagree about
     who the owner is. */
  if (!mayExportEverything(fromSeat(await seatFor(user)))) {
    return new Response('Only the owner can export everything.', { status: 403 });
  }

  const [tenant] = await db.select({ name: schema.tenants.name })
    .from(schema.tenants).where(eq(schema.tenants.id, user.tenantId));
  const business = tenant?.name ?? 'Your business';

  const now = new Date();
  const on = now.toISOString().slice(0, 10);
  const sheets = await sheetsFor(user.tenantId);
  const bytes = zip(filesFor(business, now.toISOString().replace('T', ' ').slice(0, 16), sheets), now);

  return new Response(bytes as BodyInit, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${archiveName(business, on)}"`,
      /* Never cached, never stored by anything in between: this is the whole business in one file. */
      'cache-control': 'private, no-store',
      'content-length': String(bytes.length),
    },
  });
}
