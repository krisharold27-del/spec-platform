'use client';
import { useFormStatus } from 'react-dom';

/** A submit button that greys out while the form is working, so it can never be pressed twice. */
export function SubmitButton({ children, pending = 'One moment…', className = 'btn-primary w-full py-2.5' }: {
  children: React.ReactNode; pending?: string; className?: string;
}) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" disabled={busy} aria-busy={busy} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
      {busy ? pending : children}
    </button>
  );
}
