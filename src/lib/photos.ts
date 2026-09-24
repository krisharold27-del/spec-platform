/**
 * Where a job photo actually lives, and who is allowed to see it.
 *
 * ── Why this is its own file ─────────────────────────────────────────────────────────────────────
 *
 * Until now SPEC recorded that a photo was taken — its caption, who took it, when — and the picture
 * itself stayed on the phone. That is an evidence chain with the evidence missing: a dispute about
 * what the wall looked like before the work started is not settled by a line of text saying somebody
 * photographed it.
 *
 * Kris, 24 September: *"yes connect the file store so photos save"*.
 *
 * Everything here is a pure rule with no network in it, so the decisions that matter — what may be
 * uploaded, where it is put, and whether a given person may read it back — are tested without a
 * blob store, a deployment or a token. The two route handlers are thin wrappers around these.
 *
 * ── Private, not public ──────────────────────────────────────────────────────────────────────────
 *
 * Vercel Blob will serve a file at a public URL. That would have been less code and it is the wrong
 * choice: a photo of a customer's switchboard, their meter box, the inside of their house is their
 * data, held by a business that is our customer. SPEC's headline claim is that one business's data
 * is separated from every other's, proven by row-level security on every table — and a photo
 * readable by anybody holding a link is a hole in exactly that claim, in the one place where the
 * data is a picture of somebody's home.
 *
 * So blobs are stored with `access: 'private'` and reached only through a route that checks the
 * signed-in person's business owns the record first. Nothing hands a blob URL to a browser.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * What may be uploaded
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The formats a phone camera actually produces.
 *
 * A deliberately short list. Anything a browser will not render inline is not a job photo, and the
 * upload token names these so the store itself refuses the rest — a check in the page alone is a
 * check somebody can skip by not using the page.
 */
export const PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

/**
 * The biggest single photo SPEC will take: 20MB.
 *
 * A modern phone photo is 2–6MB, and a burst of them from a full day is what this has to survive.
 * The limit is high enough that nothing a technician takes is ever refused, and low enough that a
 * mistake — a video, a PDF of a plan set — stops here rather than at the bill.
 */
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

export type PhotoRefusal =
  | { ok: true }
  | { ok: false; says: string };

/**
 * May this file be taken as a job photo?
 *
 * The message is written for somebody standing on site holding a phone, so it says what to do
 * rather than what went wrong. "Unsupported MIME type" is not a sentence a technician can act on.
 */
export function mayUpload(file: { type: string; size: number }): PhotoRefusal {
  if (!PHOTO_TYPES.includes(file.type as (typeof PHOTO_TYPES)[number])) {
    return {
      ok: false,
      says: 'That is not a photo SPEC can keep. Take it with the camera, or pick a picture from the phone.',
    };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return {
      ok: false,
      says: `That photo is bigger than ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)}MB. Take it again at a normal size.`,
    };
  }
  if (file.size <= 0) {
    return { ok: false, says: 'That file is empty. Take the photo again.' };
  }
  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Where it is put
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The folder a business's photos live in.
 *
 * ── The prefix is the fence ──────────────────────────────────────────────────────────────────────
 *
 * Every path check in this file comes back to this one string. A photo belonging to business A is
 * under `businesses/A/`, and there is no other place SPEC will write one or read one from. That
 * makes a cross-business read a path that does not start with the right prefix, which is something
 * a test can state plainly and a reviewer can check by eye — rather than a condition buried in a
 * route handler that has to be got right every time.
 */
export const folderFor = (tenantId: string): string => `businesses/${tenantId}/`;

/**
 * Where one photo goes.
 *
 * The job id is in the path so a business's own files are navigable if anybody ever has to look at
 * the store directly, and the extension is kept so a browser knows what it is being handed.
 *
 * `name` is whatever the phone called the file, and it is NOT trusted: only its extension survives,
 * and only when it is one of the handful below. A file called `../../../other-business/x.jpg` ends
 * up as an ordinary photo in this business's own folder.
 */
export function pathFor(tenantId: string, jobId: string, name: string, unique: string): string {
  const ext = extensionOf(name);
  const job = safeSegment(jobId);
  return `${folderFor(tenantId)}jobs/${job}/${safeSegment(unique)}${ext}`;
}

/** The extensions SPEC will put on a stored photo. Anything else becomes `.jpg`. */
const EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];

export function extensionOf(name: string): string {
  const dot = String(name ?? '').toLowerCase().lastIndexOf('.');
  const ext = dot === -1 ? '' : String(name).toLowerCase().slice(dot);
  return EXTENSIONS.includes(ext) ? ext : '.jpg';
}

/**
 * One path segment, with everything that could climb out of the folder removed.
 *
 * Slashes, dots and anything unusual go, rather than being escaped — an id in SPEC is a uuid or a
 * short key, so nothing legitimate is lost, and a rule that DELETES the dangerous characters cannot
 * be got wrong the way a rule that escapes them can.
 */
export const safeSegment = (v: string): string =>
  String(v ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120) || 'unknown';

/**
 * Is this stored path one THIS business is allowed to touch?
 *
 * Asked on the way in, when a token is issued, and again on the way out, when a photo is served.
 * Both, deliberately: the first stops a photo being written into somebody else's folder, the second
 * stops one being read out of it, and neither is the other's backstop.
 */
export function ownsPath(tenantId: string, path: string): boolean {
  const p = String(path ?? '');
  if (!p || p.includes('..') || p.startsWith('/')) return false;
  return p.startsWith(folderFor(tenantId));
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Whether there is anywhere to put it at all
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Is a file store connected?
 *
 * SPEC has run without one, and says so on the screen rather than pretending the picture is safe
 * somewhere. That stays true until the token is set, and the moment it is, the same screen starts
 * saying the opposite — because it reads this rather than carrying a sentence somebody has to
 * remember to change.
 *
 * The token itself never appears in a file, a commit or a chat. It is set in the deployment's own
 * settings and read from the environment here.
 */
export const storeConnected = (
  env: Record<string, string | undefined> = process.env,
): boolean => Boolean(env.BLOB_READ_WRITE_TOKEN);

/**
 * What the phone says under the photo button.
 *
 * Two sentences, chosen by whether there is a store. The version shown when there is not is the one
 * SPEC has been showing all along, and it is kept word for word: a technician who reads "stays on
 * this phone" and then finds out it did not would never trust the screen again.
 */
export function photoPromise(connected: boolean): string {
  return connected
    ? 'Photos are saved to the job. Everyone in the office can see them against it.'
    : 'Photos stay on this phone for now — they are not uploaded to the job yet.';
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Reading one back
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The address a photo is served from.
 *
 * By RECORD id, never by path. The path is never given to a browser and never accepted from one:
 * a route that takes a pathname from the address bar is a route whose safety rests entirely on
 * getting one string comparison right on every request, forever. Looking the record up by its id,
 * scoped to the business, is the same check every other read in SPEC already makes.
 */
export const photoHref = (recordId: string): string => `/api/photo/${encodeURIComponent(recordId)}`;

/**
 * May this person be shown this record's photo?
 *
 * Two conditions, both required: the record belongs to their business, and it actually has a file
 * against it. A record with no `fileRef` is a photo taken before the store was connected — the
 * caption and the chain are there, the picture is not, and the answer is a plain no rather than a
 * broken image.
 */
export function mayRead(
  record: { tenantId: string; kind: string; fileRef: string | null } | undefined | null,
  tenantId: string,
): boolean {
  if (!record) return false;
  if (record.tenantId !== tenantId) return false;
  if (record.kind !== 'photo') return false;
  if (!record.fileRef) return false;
  return ownsPath(tenantId, record.fileRef);
}

/** How a photo reads in a list when SPEC holds the picture, and when it only holds the note. */
export function photoLine(r: { what: string; who: string; fileRef: string | null }): string {
  const caption = r.what?.trim() || 'No caption';
  return r.fileRef ? `${caption} — ${r.who}` : `${caption} — ${r.who} · picture stayed on the phone`;
}
