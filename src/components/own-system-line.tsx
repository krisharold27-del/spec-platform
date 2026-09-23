import Link from 'next/link';
import { connectHref, connectLabel, type OwnLine } from '@/lib/coverage';

/**
 * The one calm line at the top of a module tab when the business runs that part in its own system.
 *
 * Nothing else changes: the SPEC screens underneath keep working and nothing is hidden. Not a
 * warning and never red — a choice the business made, said back once, with the way to connect it if
 * it is not connected yet and the way back to SPEC. Renders nothing when the line is null.
 */
export function OwnSystemLine({ line, connected, className = 'mb-5' }: { line: OwnLine | null; connected: boolean; className?: string }) {
  if (!line) return null;
  return (
    <p className={`${className} rounded-xl bg-surface px-4 py-3 text-sm text-ink-light`} data-own-system>
      {line.text}{' '}
      {connected ? 'Connected.' : (
        <Link href={connectHref(line.category)} className="text-rust-700 hover:underline">{connectLabel(line.category)} →</Link>
      )}
      {' · '}
      <Link href="/coverage" className="text-rust-700 hover:underline">Switch back to SPEC</Link>
    </p>
  );
}
