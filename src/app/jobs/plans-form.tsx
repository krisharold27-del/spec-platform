'use client';

import { useRef, useState } from 'react';
import { readPlansAction } from './understand-actions';

/** Drop the plans: a PDF goes as it is; a photo of a drawing is kept sharp enough to count from. */
async function prepare(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

export function PlansForm({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const files = [...(input.current?.files ?? [])];
    if (!files.length || busy) return;
    setBusy(true);
    const out = new FormData();
    out.set('jobId', jobId);
    for (const f of files.slice(0, 4)) out.append('plans', await prepare(f));
    try { await readPlansAction(out); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={send} className="mt-4 grid gap-3">
      <label className="grid cursor-pointer gap-1 rounded-2xl border border-dashed border-ink/25 bg-white p-6 text-center text-sm">
        <strong>Drop the plans here</strong>
        <span className="text-ink-light">{names || 'PDF or photos of the drawings'}</span>
        <input ref={input} type="file" name="plans" accept=".pdf,image/*" multiple className="sr-only"
          onChange={e => setNames([...(e.currentTarget.files ?? [])].map(f => f.name).join(', '))} />
      </label>
      <button type="submit" className="btn-primary w-fit text-sm" disabled={busy || !names}>{busy ? 'Counting…' : 'Count it'}</button>
    </form>
  );
}
