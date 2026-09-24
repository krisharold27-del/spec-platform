import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  mayUpload, pathFor, ownsPath, folderFor, extensionOf, safeSegment,
  mayRead, photoHref, photoLine, photoPromise, storeConnected,
  MAX_PHOTO_BYTES, PHOTO_TYPES,
} from '../src/lib/photos';

/*
  ── Photos that actually save ────────────────────────────────────────────────────────────────────

  Kris, 24 September: *"yes connect the file store so photos save"*.

  SPEC recorded that a photo was taken — the caption, who took it, when — and the picture stayed on
  the phone. That is an evidence chain with the evidence missing: nobody settles an argument about
  what a switchboard looked like by reading a line of text saying somebody photographed it.

  The thing worth testing hardest is not the upload. It is that one business's site photos can never
  be read by another, because a photo is a picture of somebody's home or workplace and SPEC's
  headline claim is that businesses are separated.
*/

const record = (over: Partial<{ tenantId: string; kind: string; fileRef: string | null }> = {}) => ({
  tenantId: 't1', kind: 'photo', fileRef: 'businesses/t1/jobs/j1/abc.jpg', ...over,
});

describe('what may be uploaded', () => {
  it('takes the formats a phone camera actually produces', () => {
    for (const type of PHOTO_TYPES) {
      expect(mayUpload({ type, size: 2_000_000 }).ok, type).toBe(true);
    }
  });

  /*
    The refusal is read by somebody standing on site holding a phone, so it says what to do. A
    technician cannot act on "unsupported MIME type".
  */
  it('REFUSES ANYTHING THAT IS NOT A PHOTO, in words somebody on site can act on', () => {
    const no = mayUpload({ type: 'application/pdf', size: 1_000 });
    expect(no.ok).toBe(false);
    expect(no.ok === false && no.says).toContain('camera');
    expect(mayUpload({ type: 'video/mp4', size: 1_000 }).ok, 'a video is not a job photo').toBe(false);
  });

  it('refuses one too big to be a photo, and says the size', () => {
    expect(MAX_PHOTO_BYTES).toBe(20 * 1024 * 1024);
    const big = mayUpload({ type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 });
    expect(big.ok).toBe(false);
    expect(big.ok === false && big.says).toContain('20MB');
    expect(mayUpload({ type: 'image/jpeg', size: MAX_PHOTO_BYTES }).ok, 'exactly the limit is fine').toBe(true);
  });

  it('refuses an empty file rather than storing nothing under a caption', () => {
    expect(mayUpload({ type: 'image/jpeg', size: 0 }).ok).toBe(false);
  });
});

describe('where a photo is put', () => {
  it('puts it in this business’s own folder, under its job', () => {
    const p = pathFor('t1', 'job-9', 'IMG_4021.JPG', 'u-1');
    expect(p).toBe('businesses/t1/jobs/job-9/u-1.jpg');
    expect(p.startsWith(folderFor('t1'))).toBe(true);
  });

  /*
    ── The name on the phone is not trusted ─────────────────────────────────────────────────────

    A file called `../../../other-business/x.jpg` must become an ordinary photo in this business's
    own folder. The rule DELETES the dangerous characters rather than escaping them, because a rule
    that deletes cannot be got subtly wrong the way a rule that escapes can.
  */
  it('CANNOT BE TALKED OUT OF THAT FOLDER by the name the phone sends', () => {
    const p = pathFor('t1', '../../t2/jobs/x', '../../../etc/passwd', '../../escape');
    expect(p).not.toContain('..');
    // The property that matters is not what the folder ends up CALLED — the separators are gone,
    // so `../../t2/jobs/x` becomes the harmless folder name `t2jobsx` inside this business's own
    // tree. It is who owns the result that decides whether anything escaped.
    expect(ownsPath('t1', p), 'still this business’s').toBe(true);
    expect(ownsPath('t2', p), 'and reachable by nobody else').toBe(false);
    expect(p.startsWith('businesses/t1/')).toBe(true);
  });

  it('keeps a real extension and falls back to .jpg for anything else', () => {
    expect(extensionOf('a.HEIC')).toBe('.heic');
    expect(extensionOf('a.png')).toBe('.png');
    expect(extensionOf('no-extension')).toBe('.jpg');
    expect(extensionOf('sneaky.php')).toBe('.jpg');
  });

  it('never lets a segment be empty, which would collapse the path', () => {
    expect(safeSegment('///')).toBe('unknown');
    expect(safeSegment('ok-id_9')).toBe('ok-id_9');
  });
});

describe('whose photo it is', () => {
  it('owns what is in its own folder', () => {
    expect(ownsPath('t1', 'businesses/t1/jobs/j1/a.jpg')).toBe(true);
  });

  /* The one that matters. This is the whole separation claim, in one line. */
  it('NEVER OWNS ANOTHER BUSINESS’S PHOTO', () => {
    expect(ownsPath('t1', 'businesses/t2/jobs/j1/a.jpg')).toBe(false);
    expect(ownsPath('t2', 'businesses/t1/jobs/j1/a.jpg')).toBe(false);
  });

  it('and refuses anything that could climb out of a folder', () => {
    expect(ownsPath('t1', 'businesses/t1/../t2/a.jpg')).toBe(false);
    expect(ownsPath('t1', '/businesses/t1/a.jpg')).toBe(false);
    expect(ownsPath('t1', '')).toBe(false);
  });

  /*
    A business id that is a PREFIX of another must not open the longer one's folder. `folderFor`
    ends in a slash for exactly this reason, and without it `t1` would own `t12`'s photos.
  */
  it('AND A BUSINESS WHOSE ID STARTS THE SAME IS STILL A DIFFERENT BUSINESS', () => {
    expect(ownsPath('t1', 'businesses/t12/jobs/j1/a.jpg')).toBe(false);
    expect(folderFor('t1').endsWith('/'), 'the trailing slash is what stops it').toBe(true);
  });
});

describe('reading one back', () => {
  it('lets somebody in the business see their own job photo', () => {
    expect(mayRead(record(), 't1')).toBe(true);
  });

  it('NEVER SERVES ANOTHER BUSINESS’S PHOTO, whatever the record says', () => {
    expect(mayRead(record({ tenantId: 't2' }), 't1')).toBe(false);
    // Belt and braces: a row that somehow carries another business's path is refused too.
    expect(mayRead(record({ fileRef: 'businesses/t2/jobs/j1/a.jpg' }), 't1')).toBe(false);
  });

  it('says no to a record with no picture, rather than a broken frame', () => {
    expect(mayRead(record({ fileRef: null }), 't1')).toBe(false);
  });

  it('and to a record that is not a photo at all', () => {
    expect(mayRead(record({ kind: 'signoff' }), 't1')).toBe(false);
    expect(mayRead(undefined, 't1')).toBe(false);
  });

  /*
    By record id, never by path. A route that takes a pathname from the address bar rests entirely
    on getting one comparison right on every request, forever.
  */
  it('IS ADDRESSED BY RECORD ID, so no path is ever in a page or an address bar', () => {
    expect(photoHref('rec-1')).toBe('/api/photo/rec-1');
    expect(photoHref('a/b')).not.toContain('/b');
  });
});

describe('the route that serves them', () => {
  const route = readFileSync('src/app/api/photo/[id]/route.ts', 'utf8');

  it('SCOPES THE LOOKUP TO THE SIGNED-IN BUSINESS, not just the id', () => {
    expect(route).toContain('eq(schema.jobRecords.tenantId, user.tenantId)');
    expect(route).toContain('mayRead(record, user.tenantId)');
  });

  /*
    A 403 on somebody else's record would confirm the id exists, which is the one thing a person
    guessing ids is trying to learn. Missing and forbidden must be indistinguishable.
  */
  it('ANSWERS THE SAME FOR A MISSING RECORD AND SOMEBODY ELSE’S', () => {
    // The CODE, not the comments above it — which is why this looks for the status it returns
    // rather than for the digits appearing anywhere in the file.
    expect(route).not.toMatch(/status:\s*40[13]/);
    expect(route.match(/status:\s*404/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('never lets a proxy keep somebody’s site photo for the next person', () => {
    expect(route).toContain("'Cache-Control': 'private, no-cache'");
    expect(route).toContain('nosniff');
  });
});

describe('the route that issues the upload token', () => {
  const route = readFileSync('src/app/api/photo/upload/route.ts', 'utf8');

  /*
    This is the gate. A token issued for a path in another business's folder is a cross-business
    WRITE, and no later check undoes it — the file is already there.
  */
  it('REFUSES A TOKEN FOR A PATH OUTSIDE THIS BUSINESS’S FOLDER', () => {
    expect(route).toContain('ownsPath(user.tenantId, pathname)');
  });

  it('and for a job that is not this business’s', () => {
    expect(route).toContain('eq(schema.jobs.tenantId, user.tenantId)');
  });

  /* Limits on the TOKEN, so the store refuses even if the page asking has been tampered with. */
  it('PUTS THE SIZE AND TYPE LIMITS ON THE TOKEN, not only in the page', () => {
    expect(route).toContain('allowedContentTypes');
    expect(route).toContain('maximumSizeInBytes: MAX_PHOTO_BYTES');
  });

  it('never overwrites, so two photos a second apart are never one file', () => {
    expect(route).toContain('addRandomSuffix: true');
    expect(route).toContain('allowOverwrite: false');
  });

  it('refuses a business that is read-only over a failed payment', () => {
    expect(route).toContain('assertWritable');
  });

  it('is private storage, never a public URL', () => {
    const phone = readFileSync('src/components/tech-day-phone.tsx', 'utf8');
    expect(phone).toContain("access: 'private'");
    expect(phone).not.toContain("access: 'public'");
  });
});

describe('writing the row', () => {
  const actions = readFileSync('src/app/tech-day/actions.ts', 'utf8');
  // To the end of the file rather than to the first `\n}` — the parameter type closes with one of
  // those, so slicing there read four lines of the signature and nothing that does any work.
  const body = actions.slice(actions.indexOf('export async function attachPhoto'));

  /*
    The phone says where it put the file. A row that claims a photo nobody uploaded is worse than
    the honest gap SPEC had before, because this one looks complete.
  */
  it('PROVES THE FILE IS REALLY THERE before it records one', () => {
    expect(body).toContain('head(path)');
    expect(body).toContain('did not reach the store');
  });

  it('and checks the path and the job belong to this business', () => {
    expect(body).toContain('ownsPath(user.tenantId, path)');
    expect(body).toContain('eq(schema.jobs.tenantId, user.tenantId)');
  });

  /*
    Vercel's own upload callback cannot reach a laptop, so a product that wrote the row there would
    work in production and do nothing everywhere it is developed and tested.
  */
  it('DOES NOT DEPEND ON A CALLBACK THAT NEVER FIRES LOCALLY', () => {
    const upload = readFileSync('src/app/api/photo/upload/route.ts', 'utf8');
    expect(upload).not.toMatch(/onUploadCompleted:\s*async/);
  });
});

describe('what the screen promises', () => {
  /*
    SPEC ran a long time with nowhere to put a picture and said so, word for word. A technician who
    read "stays on this phone" and later found out it had not would never trust the screen again —
    so the old sentence is kept exactly, and which one shows is decided by the store.
  */
  it('KEEPS THE OLD PROMISE WORD FOR WORD when there is no store', () => {
    expect(photoPromise(false)).toBe('Photos stay on this phone for now — they are not uploaded to the job yet.');
  });

  it('and says the opposite the moment there is one', () => {
    expect(photoPromise(true)).toContain('saved to the job');
    expect(photoPromise(true)).not.toContain('stay on this phone');
  });

  /* Read from the environment, so nobody has to remember to change a sentence on the day. */
  it('IS DECIDED BY THE TOKEN BEING SET, never by a line of copy', () => {
    expect(storeConnected({})).toBe(false);
    expect(storeConnected({ BLOB_READ_WRITE_TOKEN: '' })).toBe(false);
    expect(storeConnected({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_x' })).toBe(true);
  });

  it('never appears as a token in any file that ships', () => {
    for (const f of [
      'src/lib/photos.ts',
      'src/app/api/photo/upload/route.ts',
      'src/app/api/photo/[id]/route.ts',
      'src/components/tech-day-phone.tsx',
    ]) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/vercel_blob_rw_[A-Za-z0-9]/);
    }
  });

  it('a photo from before the store says so rather than showing a broken frame', () => {
    expect(photoLine({ what: 'Board before', who: 'Jack', fileRef: null })).toContain('stayed on the phone');
    expect(photoLine({ what: 'Board before', who: 'Jack', fileRef: 'businesses/t1/a.jpg' })).toBe('Board before — Jack');
  });

  it('and one with no caption still reads as something', () => {
    expect(photoLine({ what: '', who: 'Jack', fileRef: 'businesses/t1/a.jpg' })).toContain('No caption');
  });
});
