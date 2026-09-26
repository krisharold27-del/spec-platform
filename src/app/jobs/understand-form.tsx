'use client';

import { useRef, useState } from 'react';
import { readWork } from './understand-actions';

/**
 * The form that sends photos, plans and the customer's words to be read.
 *
 * Photos from a phone are 3–6 MB each; the request ceiling is 4 MB for all of them. So each photo is
 * redrawn in the browser at 1,600 pixels on its long side as a JPEG, which keeps everything a person
 * would point at in the picture and makes it about a twentieth of the size. Plans go as they are.
 */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.82));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

export function UnderstandForm({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState(false);
  const [photoCount, setPhotoCount] = useState(0);
  const [plansName, setPlansName] = useState('');
  const form = useRef<HTMLFormElement>(null);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.current || busy) return;
    setBusy(true);
    const raw = new FormData(form.current);
    const out = new FormData();
    out.set('jobId', jobId);
    out.set('said', String(raw.get('said') ?? ''));
    for (const f of raw.getAll('photos')) if (f instanceof File && f.size) out.append('photos', await shrink(f));
    const plans = raw.get('plans');
    if (plans instanceof File && plans.size) out.append('plans', plans.size < 3_000_000 ? plans : await shrink(plans));
    try {
      await readWork(out);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={form} onSubmit={send} className="mt-4 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid cursor-pointer gap-1 rounded-2xl border border-dashed border-ink/25 bg-white p-4 text-sm">
          <strong>Photos</strong>
          <span className="text-ink-light">{photoCount ? `${photoCount} photo${photoCount === 1 ? '' : 's'} ready` : 'The board, the wall, the meter — whatever they sent'}</span>
          <input type="file" name="photos" accept="image/*" multiple className="sr-only"
            onChange={e => setPhotoCount(e.currentTarget.files?.length ?? 0)} />
        </label>
        <label className="grid cursor-pointer gap-1 rounded-2xl border border-dashed border-ink/25 bg-white p-4 text-sm">
          <strong>Plans or designs</strong>
          <span className="text-ink-light">{plansName || 'A PDF or a photo of the drawings'}</span>
          <input type="file" name="plans" accept=".pdf,image/*" className="sr-only"
            onChange={e => setPlansName(e.currentTarget.files?.[0]?.name ?? '')} />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <strong>What they told you</strong>
        <textarea name="said" rows={3} maxLength={4000} aria-label="What the customer told you"
          placeholder="Type it, paste their email, or hold to talk on the phone"
          className="w-full rounded-2xl border border-ink/15 bg-white p-3 text-sm" />
      </label>
      <button type="submit" className="btn-primary w-fit text-sm" disabled={busy}>{busy ? 'Reading…' : 'Read it'}</button>
    </form>
  );
}
