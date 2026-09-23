/**
 * The staff list — every person in the business on one searchable list. Pure, no I/O.
 *
 * Kris, 23 September: *"we must have full staff lists"*. The People screen already had "everyone in
 * your part of the chart", one name per role — which is the HR view, and right for it, but it is not
 * a staff list: it stops at the edge of the viewer's own line and a pooled team role showed one name
 * for five people. This is the whole business, one row per PERSON, leaders and pooled team members
 * alike.
 *
 * ── Two readings, one list ──────────────────────────────────────────────────────────────────────
 *
 * A **directory** — name, role, who they report to, phone, email, start date — is visible to
 * everybody in the business. Knowing a colleague's number is not seeing their scorecard; the chart's
 * structure is already visible to everybody (lib/scope says so in as many words).
 *
 * **Clear to Work and licences** are the working under a hard gate and are read from the
 * scorecard's Compliance pillar, so they keep the "only me and above" rule: shown for the viewer
 * and anybody beneath them, and for nobody else — `null` here, never a guess. The status is exactly
 * the one the schedule refuses a booking on (`crewFor` in lib/jobs-data), so the list and the
 * schedule can never disagree about whether somebody may be sent to site.
 */
import { stateOf, type ObligationState } from './obligations';
import type { Cell } from './csv';

export type ClearState = 'clear' | 'blocked' | 'unknown';

export interface DirRole {
  roleId: string;
  title: string;
  /** "Anthony Ruiz — Operations Manager", the role title alone when it is vacant, null at the top. */
  reportsTo: string | null;
  isTeam: boolean;
}

export interface DirLicence {
  what: string;
  expiresAt: string | null;
  state: ObligationState;
}

export interface DirPerson {
  /** `user:<id>` or `staff:<id>` — the same key bookings and timesheets are held against. */
  key: string;
  name: string;
  roles: DirRole[];
  phone: string | null;
  email: string | null;
  startDate: string | null;
  /** Where the start date came from: stated by the business, or the first placement on the chart. */
  startFrom: 'stated' | 'chart' | null;
  /** Has a SPEC login. */
  hasSeat: boolean;
  /** Only for somebody the viewer may see — see the file comment. Null otherwise. */
  clear: { state: ClearState; label: string; reason: string } | null;
  /** Expired, missing or expiring — worst first. Null when not the viewer's to see. */
  licences: DirLicence[] | null;
  /** May the viewer open this person's scorecard? */
  canOpenCard: boolean;
  /** The staff row behind this person, if any — where contact details for a pencilled name live. */
  staffId: string | null;
  userId: string | null;
}

export interface DirectoryInput {
  roles: readonly { id: string; title: string; reportsToRoleId: string | null; isTeam: boolean; stream: string }[];
  /** Every placement, open and closed — closed ones only date when somebody started. */
  assignments: readonly { roleId: string; userId: string | null; staffId: string | null; fromDate: string; toDate: string | null }[];
  staff: readonly { id: string; name: string; userId: string | null; phone: string | null; email: string | null; startDate: string | null }[];
  users: readonly { id: string; name: string; email: string; phone: string | null; startDate: string | null }[];
  obligations: readonly { what: string; expiresAt: string | null; staffId: string | null; userId: string | null; roleId: string | null }[];
  /** Clear to Work by person key, for the people the viewer may see — `crewFor`'s answer. */
  clearByKey: ReadonlyMap<string, { clear: ClearState; label: string; reason: string }>;
  canSee: (roleId: string) => boolean;
  /** The viewer's own person key, so their own row is always theirs to see. */
  selfKey: string | null;
  /**
   * The role the viewer holds. On a pooled team everybody shares that role, so "their role" would
   * otherwise let one technician read another's licences — sideways. Their own role counts for
   * their own row only; the roles beneath it count for everybody in them.
   */
  ownRoleId?: string | null;
  now: Date;
}

const LICENCE_ORDER: Record<ObligationState, number> = { expired: 0, missing: 1, expiring: 2, current: 3 };

/** An email address that is really an address — never a placeholder somebody typed to get past a form. */
const realEmail = (e: string | null | undefined): string | null => (e && e.includes('@') ? e.trim() : null);
const clean = (s: string | null | undefined): string | null => (s && s.trim() ? s.trim() : null);

export function buildDirectory(input: DirectoryInput): DirPerson[] {
  const { roles, assignments, staff, users, obligations, clearByKey, canSee, now } = input;
  const roleById = new Map(roles.map(r => [r.id, r]));
  const open = assignments.filter(a => !a.toDate && roleById.has(a.roleId));

  const keyOf = (userId: string | null, staffId: string | null): string | null => {
    if (userId) return `user:${userId}`;
    if (!staffId) return null;
    const linked = staff.find(s => s.id === staffId)?.userId;
    return linked ? `user:${linked}` : `staff:${staffId}`;
  };

  /** Who holds a role, for "reports to". The account holder first, the way the chart draws it. */
  const holderName = (roleId: string): string | null => {
    const here = open.filter(a => a.roleId === roleId);
    const withSeat = here.find(a => a.userId);
    const a = withSeat ?? here[0];
    if (!a) return null;
    return (a.userId ? users.find(u => u.id === a.userId)?.name : undefined)
      ?? (a.staffId ? staff.find(s => s.id === a.staffId)?.name : undefined) ?? null;
  };
  const reportsTo = (roleId: string): string | null => {
    const parentId = roleById.get(roleId)?.reportsToRoleId;
    const parent = parentId ? roleById.get(parentId) : undefined;
    if (!parent) return null;
    const who = holderName(parent.id);
    return who ? `${who} — ${parent.title}` : parent.title;
  };

  const people = new Map<string, DirPerson>();
  const ensure = (key: string, userId: string | null, staffId: string | null): DirPerson => {
    let p = people.get(key);
    if (!p) {
      const u = userId ? users.find(x => x.id === userId) : undefined;
      const s = staffId ? staff.find(x => x.id === staffId) : staff.find(x => userId && x.userId === userId);
      p = {
        key, name: u?.name ?? s?.name ?? 'Somebody', roles: [],
        phone: clean(u?.phone) ?? clean(s?.phone),
        email: realEmail(u?.email) ?? realEmail(s?.email),
        startDate: clean(u?.startDate) ?? clean(s?.startDate),
        startFrom: null, hasSeat: Boolean(u), clear: null, licences: null, canOpenCard: false,
        staffId: s?.id ?? null, userId: u?.id ?? null,
      };
      if (p.startDate) p.startFrom = 'stated';
      people.set(key, p);
    }
    return p;
  };

  // Everybody on the chart, one row per person however many roles or teams they sit in.
  for (const a of open) {
    const key = keyOf(a.userId, a.staffId);
    if (!key) continue;
    const userId = key.startsWith('user:') ? key.slice(5) : null;
    const p = ensure(key, userId, a.staffId ?? null);
    const r = roleById.get(a.roleId)!;
    if (!p.roles.some(x => x.roleId === r.id)) {
      p.roles.push({ roleId: r.id, title: r.title, reportsTo: reportsTo(r.id), isTeam: r.isTeam });
    }
  }
  // And everybody the business has named who is not on the chart yet — still staff.
  for (const s of staff) {
    const key = s.userId ? `user:${s.userId}` : `staff:${s.id}`;
    ensure(key, s.userId, s.id);
  }
  for (const u of users) ensure(`user:${u.id}`, u.id, null);

  for (const p of people.values()) {
    // Start date: stated, else the first day they were put on the chart.
    if (!p.startDate) {
      const theirs = assignments
        .filter(a => (p.userId && a.userId === p.userId) || (p.staffId && a.staffId === p.staffId))
        .map(a => a.fromDate).filter(Boolean).sort();
      if (theirs[0]) { p.startDate = theirs[0].slice(0, 10); p.startFrom = 'chart'; }
    }

    const mine = p.key === input.selfKey
      || p.roles.some(r => canSee(r.roleId) && r.roleId !== (input.ownRoleId ?? null));
    p.canOpenCard = p.roles.some(r => canSee(r.roleId));
    if (!mine) continue;

    const c = clearByKey.get(p.key);
    p.clear = c ? { state: c.clear, label: c.label, reason: c.reason } : null;
    const roleIds = new Set(p.roles.map(r => r.roleId));
    p.licences = obligations
      .filter(o => (o.roleId && roleIds.has(o.roleId))
        || (p.userId && o.userId === p.userId)
        || (p.staffId && o.staffId === p.staffId))
      .map(o => ({ what: o.what, expiresAt: o.expiresAt, state: stateOf(o, now) }))
      .filter(l => l.state !== 'current')
      .sort((a, b) => LICENCE_ORDER[a.state] - LICENCE_ORDER[b.state] || (a.expiresAt ?? '').localeCompare(b.expiresAt ?? ''));
  }

  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Search on anything a person would type: a name, a role, a number, part of an address, a boss. */
export function searchDirectory(list: readonly DirPerson[], q: string): DirPerson[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  return list.filter(p => {
    const hay = [p.name, p.phone, p.email, ...p.roles.flatMap(r => [r.title, r.reportsTo])]
      .filter(Boolean).join(' ').toLowerCase();
    const digits = hay.replace(/\D/g, '');
    return words.every(w => hay.includes(w) || (/^\d{3,}$/.test(w.replace(/\D/g, '')) && digits.includes(w.replace(/\D/g, ''))));
  });
}

/** One line for the licences cell: "White card expired 2026-09-01; Forklift expiring 2026-10-10". */
export function licenceLine(ls: readonly DirLicence[] | null): string {
  if (ls === null) return '';
  if (!ls.length) return 'Nothing expiring';
  return ls.map(l => l.state === 'missing' ? `${l.what}: nothing recorded`
    : `${l.what} ${l.state === 'expired' ? 'expired' : 'expires'} ${l.expiresAt?.slice(0, 10) ?? ''}`.trim()).join('; ');
}

export const DIRECTORY_HEADER = ['Name', 'Role', 'Reports to', 'Phone', 'Email', 'Start date', 'Clear to work', 'Licences', 'SPEC login'] as const;

/** The CSV rows. The gated columns are blank — not "unknown" — for anybody outside the viewer's line. */
export function directoryRows(list: readonly DirPerson[]): Cell[][] {
  return list.map(p => [
    p.name,
    p.roles.map(r => r.title).join('; ') || 'Not on the chart yet',
    [...new Set(p.roles.map(r => r.reportsTo).filter(Boolean))].join('; '),
    p.phone, p.email, p.startDate,
    p.clear?.label ?? '',
    licenceLine(p.licences),
    p.hasSeat ? 'Yes' : 'No',
  ]);
}

/** Phone numbers typed any way at all, dialled the way a phone needs: "tel:+61412345678". */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return digits.replace(/\D/g, '').length >= 3 ? `tel:${digits}` : null;
}

/** "mailto:" only for something that is an address. Opens the person's own mail app — SPEC sends nothing. */
export function mailHref(email: string | null | undefined): string | null {
  const e = realEmail(email);
  return e && /^[^\s@]+@[^\s@]+$/.test(e) ? `mailto:${e}` : null;
}

/** A phone or email a form sent: trimmed, bounded, empty is "not recorded". */
export function contactField(raw: unknown, max: number): string | null {
  const s = String(raw ?? '').trim().slice(0, max);
  return s ? s : null;
}

/** A date a form sent: an ISO day or nothing. */
export function isoDay(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
}

/**
 * May this viewer change this person's phone, email and start date?
 *
 * Themselves — anybody may keep their own number right. Otherwise a manager for somebody in a role
 * they manage (`canEdit`, the same line as everything else they manage), or an administrator for
 * somebody not on the chart yet, who is nobody's line and still needs a phone number.
 */
export function mayEditContact(
  p: Pick<DirPerson, 'key' | 'roles'>,
  viewer: { access: string },
  scope: { canEdit(roleId: string): boolean },
  selfKey: string,
): boolean {
  if (p.key === selfKey) return true;
  if (p.roles.some(r => scope.canEdit(r.roleId))) return true;
  return !p.roles.length && viewer.access === 'administrator';
}
