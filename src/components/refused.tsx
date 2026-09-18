/**
 * Why SPEC said no, at the top of the screen it said no on.
 *
 * One component so every screen refuses the same way and none of them has to invent it. See
 * lib/refuse for what this is for: a refusal is a rule working, and the reason is nearly always the
 * next thing the person needs to know. It used to be a crash page.
 *
 * `role="status"` rather than `alert`: it is the answer to something they just did, not an
 * emergency, and a screen reader should read it when it gets there rather than interrupting.
 */
export function Refused({ reason }: { reason: string }) {
  if (!reason) return null;
  return (
    <p
      role="status"
      className="mb-6 rounded-lg border-l-4 border-rust-400 bg-surface p-4 text-sm text-ink"
    >
      {reason}
    </p>
  );
}
