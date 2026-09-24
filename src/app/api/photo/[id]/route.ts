import { get } from '@vercel/blob';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { mayRead, storeConnected } from '@/lib/photos';

/**
 * Hands back one job photo, to somebody whose business owns it.
 *
 * ── By record id, never by path ──────────────────────────────────────────────────────────────────
 *
 * The obvious version of this route takes a pathname in the query string and streams whatever is
 * there. It is one string comparison away from serving any business's photos to anyone signed in,
 * forever, on every request. This takes a RECORD id instead and looks the row up scoped to the
 * caller's business — the same read every other screen in SPEC makes, so it is wrong only if the
 * whole product is wrong. The stored path is never given to a browser and never accepted from one.
 *
 * `mayRead` then asks the rest: that the row really is this business's, that it is a photo, and
 * that it has a file against it at all. A photo recorded before the store was connected has its
 * caption and its chain and no picture, and the honest answer there is 404 rather than a broken
 * image with a story behind it.
 *
 * ── Not found, for everything ────────────────────────────────────────────────────────────────────
 *
 * A missing record and another business's record answer identically. A 403 on the second would
 * confirm the id exists, which is the one thing somebody guessing ids is trying to learn.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response('Not found', { status: 404 });

  const { id } = await params;
  const recordId = String(id ?? '').slice(0, 64);

  const [record] = await db.select({
    tenantId: schema.jobRecords.tenantId,
    kind: schema.jobRecords.kind,
    fileRef: schema.jobRecords.fileRef,
  }).from(schema.jobRecords)
    .where(and(
      eq(schema.jobRecords.id, recordId),
      eq(schema.jobRecords.tenantId, user.tenantId),
    ));

  if (!mayRead(record, user.tenantId)) return new Response('Not found', { status: 404 });
  if (!storeConnected()) return new Response('Not found', { status: 404 });

  const found = await get(record.fileRef!, { access: 'private' }).catch(() => null);
  if (!found) return new Response('Not found', { status: 404 });

  return new Response(found.stream, {
    headers: {
      'Content-Type': found.blob.contentType || 'image/jpeg',
      // Never let a proxy or a CDN hold somebody's site photo on behalf of the next person to ask.
      'Cache-Control': 'private, no-cache',
      // The store is told only images may land there; this says so again on the way out, so a file
      // that somehow is not one cannot be talked into running as something else.
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
