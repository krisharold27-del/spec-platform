/**
 * What has been done to this business lately, and by whom — pure, no I/O.
 *
 * SPEC keeps no audit table, and this deliberately does not add one. Everything an administrator
 * does already leaves a dated mark on the row it changed: a seat carries the day it was invited and
 * the day it was taken, a month carries who submitted and who signed it, a board pack carries who
 * approved it or sent it back. An audit log alongside those would be a second copy of the truth,
 * free to disagree with the first — and the disagreement always gets discovered at the worst moment.
 *
 * So this reads the marks that are already there and puts them in one order. It cannot drift from
 * what happened, because it IS what happened.
 *
 * Two rules it keeps:
 *
 *   Nothing undated is shown. A row with no timestamp cannot be placed in a sequence, and guessing
 *   where it goes is worse than leaving it out.
 *
 *   It never names an action nobody took. An invitation that was never accepted shows as invited,
 *   not as joined — the absence is often the thing worth seeing.
 */

export interface ActivityRow {
  /** What happened, in plain words. */
  what: string;
  /** Who did it — an address, or a name where SPEC has one. */
  who: string;
  /** ISO timestamp, used for ordering and shown as a date. */
  when: string;
}

export interface ActivitySources {
  seats: { email: string; name?: string | null; invitedAt?: string | null; acceptedAt?: string | null; access?: string | null }[];
  directors: { name: string; appointedAt?: string | null }[];
  approvals: { title: string; requestedBy: string; requestedAt: string; decidedBy?: string | null; decidedAt?: string | null; state: string }[];
  periods: { period: string; submittedBy?: string | null; submittedAt?: string | null; signedBy?: string | null; signedAt?: string | null }[];
  packs: { period: string; approvedBy?: string | null; sentBackBy?: string | null; sentBackAt?: string | null; createdAt?: string | null }[];
  connections: { name: string; category: string; createdAt?: string | null; status: string }[];
}

/** A dated entry, or nothing. Keeps every caller below from repeating the same guard. */
const at = (when: string | null | undefined, what: string, who: string | null | undefined): ActivityRow[] =>
  when && who ? [{ what, who, when }] : [];

export function adminActivity(s: Partial<ActivitySources>, limit = 12): ActivityRow[] {
  const rows: ActivityRow[] = [];

  for (const u of s.seats ?? []) {
    const who = u.name || u.email;
    rows.push(...at(u.invitedAt, `${who} was invited${u.access ? ` as ${u.access}` : ''}`, u.email));
    rows.push(...at(u.acceptedAt, `${who} took their seat`, u.email));
  }

  for (const d of s.directors ?? []) {
    rows.push(...at(d.appointedAt, `${d.name} was recorded as a director`, d.name));
  }

  for (const a of s.approvals ?? []) {
    rows.push(...at(a.requestedAt, `Asked for: ${a.title}`, a.requestedBy));
    if (a.state !== 'waiting') {
      rows.push(...at(a.decidedAt, `${a.state === 'approved' ? 'Approved' : 'Declined'}: ${a.title}`, a.decidedBy));
    }
  }

  for (const p of s.periods ?? []) {
    rows.push(...at(p.submittedAt, `${p.period} was submitted for sign-off`, p.submittedBy));
    rows.push(...at(p.signedAt, `${p.period} was signed off and locked`, p.signedBy));
  }

  for (const b of s.packs ?? []) {
    // A pack has no approval timestamp of its own, so an approved pack is dated by when it was
    // generated. Better an honest "this pack, approved by X" than a date this file invented.
    if (b.approvedBy) rows.push(...at(b.createdAt, `The ${b.period} board pack was approved`, b.approvedBy));
    rows.push(...at(b.sentBackAt, `The ${b.period} board pack was sent back`, b.sentBackBy));
  }

  for (const c of s.connections ?? []) {
    rows.push(...at(c.createdAt, `${c.name} was added under ${c.category.replace(/_/g, ' ')}`, 'an administrator'));
  }

  return rows
    .sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0))
    .slice(0, limit);
}
