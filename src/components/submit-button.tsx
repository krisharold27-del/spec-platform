'use client';
import { useFormStatus } from 'react-dom';

/** A submit button that greys out while the form is working, so it can never be pressed twice. */
export function SubmitButton({
  children,
  pending = 'One moment…',
  className = 'btn-primary w-full py-2.5',
  /*
    For the few places a colour is DATA rather than a design choice — a plan's step states carry
    their own colours in lib/boards-live, and repeating them as classes here would be a second
    place for the same decision to live and disagree from.
  */
  style,
  // Two buttons on one form that mean two things ("Start a job" / "Start a quote") say which by value.
  name,
  value,
}: {
  children: React.ReactNode; pending?: string; className?: string; style?: React.CSSProperties;
  name?: string; value?: string;
}) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={busy} aria-busy={busy} style={style} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
      {busy ? pending : children}
    </button>
  );
}
