import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import {
  MAX_PHOTO_BYTES, PHOTO_TYPES, ownsPath, storeConnected,
} from '@/lib/photos';

/**
 * Issues the short-lived token a phone uses to put a photo straight into the store.
 *
 * ── Why the phone uploads directly, and not through SPEC ─────────────────────────────────────────
 *
 * A serverless function takes at most 4.5MB of request body. A photo off a modern phone is
 * routinely more than that, so a photo posted to SPEC and forwarded on would fail for exactly the
 * pictures a technician most wants kept — the wide shot of the board, the close-up of the fault.
 * The file goes phone → store, and SPEC's part is deciding whether it may.
 *
 * ── Which means THIS is the gate ─────────────────────────────────────────────────────────────────
 *
 * Everything the browser says is a request, not a fact. The pathname arrives from the phone, so it
 * is checked against the signed-in person's own business here, before a token exists — a token
 * issued for a path in somebody else's folder is a cross-business write, and no later check would
 * undo it because the file would already be there.
 *
 * The token also carries the size and type limits, so the STORE refuses an oversized or non-image
 * upload even if the page that asked for the token has been tampered with. A rule enforced only in
 * the page is a rule enforced only for people using the page.
 */
export async function POST(request: Request): Promise<Response> {
  /*
    No store, no token, and a plain answer rather than a five-hundred. The phone shows the sentence
    it has always shown — the picture stays on the phone — and the day carries on.
  */
  if (!storeConnected()) {
    return Response.json(
      { error: 'No file store is connected, so SPEC cannot keep the picture yet.' },
      { status: 503 },
    );
  }

  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in first.' }, { status: 401 });

  // A business that is read-only over a failed payment does not get to write new files either.
  try {
    await assertWritable(user.tenantId);
  } catch {
    return Response.json({ error: 'This business is read-only until the payment is sorted.' }, { status: 403 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        /*
          The two questions, in order: is this path inside this business's own folder, and is the
          job it names actually this business's job. The first stops the file landing somewhere it
          should not; the second stops a real technician attaching photos to a job that is not
          theirs to attach to.
        */
        if (!ownsPath(user.tenantId, pathname)) {
          throw new Error('That is not a place this business may write.');
        }

        const jobId = String(safeJson(clientPayload)?.jobId ?? '').slice(0, 64);
        const [job] = await db.select({ id: schema.jobs.id }).from(schema.jobs)
          .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.tenantId, user.tenantId)));
        if (!job) throw new Error('That job is not in this business.');

        return {
          allowedContentTypes: [...PHOTO_TYPES],
          maximumSizeInBytes: MAX_PHOTO_BYTES,
          // Two photos taken a second apart must never be one file. The store adds the randomness
          // rather than SPEC trusting the name a phone chose.
          addRandomSuffix: true,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ tenantId: user.tenantId, jobId }),
        };
      },
      /*
        Deliberately not used to write the row.

        Vercel calls this from the outside once an upload finishes, which means it never fires
        against a laptop — so a product that recorded the photo here would work in production and
        silently do nothing everywhere it is developed and tested. The row is written by
        `attachPhoto`, one path, the same one everywhere, and `head()` there proves the file really
        arrived rather than taking the phone's word for it.
      */
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'That upload was refused.' },
      { status: 400 },
    );
  }
}

/** The phone's payload, or nothing. A malformed one is a refusal, never a crash. */
function safeJson(v: string | null): { jobId?: string } | null {
  try { return v ? JSON.parse(v) : null; } catch { return null; }
}
