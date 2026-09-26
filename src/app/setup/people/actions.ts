'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { emailConfirmed } from '@/lib/auth';
import { requireManager } from '@/lib/guard';
import { assertWritable } from '@/lib/plan';
import { roleChangeFor, type AssignmentRow, type RoleRow, type StaffRow } from '@/lib/staff';
import { inviteToSeat } from '@/lib/invite';
import { readNames } from '@/lib/ready-for-october';
import { getScope } from '@/lib/scope';
import { seatKindFromForm } from '@/lib/chart-seats';
import { syncSubscriptionSeats } from '@/lib/plan';

const now = () => new Date().toISOString();

async function requireLeader() {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  return user;
}

async function chartFor(tenantId: string) {
  const roles = await db.select().from(schema.roles).where(and(eq(schema.roles.tenantId, tenantId), eq(schema.roles.active, true)));
  const staff = await db.select().from(schema.staff).where(eq(schema.staff.tenantId, tenantId));
  /*
    Scoped through this business's own roles rather than read whole and filtered afterwards.

    The filter that used to follow was correct, but "read everything, then keep ours" is the exact
    shape that leaked in boards-data — one clause written slightly wrong and another company's rows
    are in the result. It also grows with every customer SPEC ever signs.
  */
  const ourRoleIds = roles.map(r => r.id);
  const assignments = ourRoleIds.length
    ? await db.select().from(schema.roleAssignments).where(inArray(schema.roleAssignments.roleId, ourRoleIds))
    : [];
  const roleIds = new Set(roles.map(r => r.id));
  return {
    roles: roles as unknown as RoleRow[],
    staff: staff as unknown as StaffRow[],
    assignments: assignments.filter(a => roleIds.has(a.roleId)) as unknown as AssignmentRow[],
  };
}

/**
 * Revalidate, and push any billing change this write may have caused onto the live Stripe
 * subscription. `tenantId` is optional because not every caller moves a person who could hold a
 * seat — `addStaff` only adds a name to the directory, nothing is placed and nothing can be billed
 * differently. Every action that opens or closes a role assignment passes it, because the staff row
 * being moved may already be linked to a real login (see the note on `classifySeats` in
 * lib/plan) — best-effort, never breaks the write, and every outcome is logged as `[seat-sync]`; see
 * `syncSubscriptionSeats`.
 */
async function done(paths = ['/setup/business', '/org', '/journey'], tenantId?: string) {
  for (const p of paths) revalidatePath(p);
  if (tenantId) await syncSubscriptionSeats(tenantId);
}

/**
 * Write a name straight onto a role — the one action the org chart page needs.
 *
 * Adding to the directory and then placing from a dropdown is two steps for what is one thought:
 * "Anthony runs operations." This does both, and reuses an existing directory entry when the name
 * already exists so the same person in two roles still raises the move-or-merge question.
 */
export async function nameRole(formData: FormData) {
  const user = await requireLeader();
  const roleId = String(formData.get('roleId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!roleId || !name) redirect('/setup/business');

  const chart = await chartFor(user.tenantId);
  if (!chart.roles.some(r => r.id === roleId)) redirect('/setup/business');

  const held = await accountHolderOn(roleId, user.tenantId);
  if (held) heldBySomebody(held, user.id);

  const existing = chart.staff.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    const change = roleChangeFor(existing.id, roleId, chart.roles, chart.assignments, chart.staff);
    if (change) redirect(`/setup/business?change=${existing.id}&to=${roleId}`);
    await openAssignment(roleId, existing.id);
  } else {
    const staffId = randomUUID();
    await db.insert(schema.staff).values({ id: staffId, tenantId: user.tenantId, name, userId: null, createdAt: now() });
    await openAssignment(roleId, staffId);
  }
  await done(['/setup/business', '/org', '/journey'], user.tenantId);
  redirect('/setup/business');
}

/** Add a name to the directory. No email, no account, no charge — just a name on the chart. */
export async function addStaff(formData: FormData) {
  const user = await requireLeader();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) redirect('/setup/business?error=name');
  await db.insert(schema.staff).values({ id: randomUUID(), tenantId: user.tenantId, name, userId: null, createdAt: now() });
  // No role assignment touched — nobody's billing can have changed. See the note on `done`.
  await done();
  redirect('/setup/business');
}

/**
 * Pencil someone into a role.
 *
 * If they already hold another role this does nothing yet — it hands back a prompt asking whether
 * this is a move or a merge, because guessing would either strand a role the business still needs
 * or quietly take one away from someone.
 */
export async function placeStaff(formData: FormData) {
  const user = await requireLeader();
  const staffId = String(formData.get('staffId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');
  if (!staffId || !roleId) redirect('/setup/business');

  const chart = await chartFor(user.tenantId);
  if (!chart.staff.some(s => s.id === staffId) || !chart.roles.some(r => r.id === roleId)) redirect('/setup/business');

  const held = await accountHolderOn(roleId, user.tenantId);
  if (held) heldBySomebody(held, user.id);

  const change = roleChangeFor(staffId, roleId, chart.roles, chart.assignments, chart.staff);
  if (change) redirect(`/setup/business?change=${staffId}&to=${roleId}`);

  await openAssignment(roleId, staffId);
  await done(['/setup/business', '/org', '/journey'], user.tenantId);
  redirect('/setup/business');
}

/** The leader's answer to the move-or-merge question. */
export async function resolveRoleChange(formData: FormData) {
  const user = await requireLeader();
  const staffId = String(formData.get('staffId') ?? '');
  const toRoleId = String(formData.get('toRoleId') ?? '');
  const fromRoleId = String(formData.get('fromRoleId') ?? '');
  const decision = String(formData.get('decision') ?? '');

  const chart = await chartFor(user.tenantId);
  // Every id must be this business's own — they come from a form anybody can edit.
  const ours = (roleId: string) => chart.roles.some(r => r.id === roleId);
  if (!chart.staff.some(s => s.id === staffId) || !ours(toRoleId) || (decision === 'move' && !ours(fromRoleId))) {
    redirect('/setup/business');
  }

  if (decision === 'move') {
    // The old role is vacated and goes back on the board as open, keeping its KPIs for whoever is next.
    await db.update(schema.roleAssignments).set({ toDate: now() })
      .where(and(eq(schema.roleAssignments.roleId, fromRoleId), isNull(schema.roleAssignments.toDate)));
  }
  // On a merge the existing assignment is simply left open — they hold both.
  await openAssignment(toRoleId, staffId);
  await done(['/setup/business', '/org', '/journey'], user.tenantId);
  redirect('/setup/business');
}

/** Close whoever is on this role and open a new assignment. History is kept, never overwritten. */
/**
 * Who holds this role with their own SPEC login, if anybody.
 *
 * ── The write that cost Kris a day ───────────────────────────────────────────────────────────────
 *
 * 19 September. He signed JBI up, which puts HIM in the General Manager role with his own account.
 * He then did the obvious thing on the screen that exists for it — typed a name into the General
 * Manager row on Setting up → Your business — and `openAssignment` closed **every** open placement
 * on that role, his own included, and replaced it with a name that has no login behind it.
 *
 * Nothing said so. And SPEC decides what somebody may touch by walking down from their own role, so
 * from that moment he held none: locked out of his own chart, unable to rename the card, and
 * eventually shown a form offering to ask an administrator — himself — for permission. Every one of
 * those was a symptom. This was the cause.
 *
 * The product already refuses this everywhere else. `renamePerson` will not take a role from
 * somebody with a login; nor will `claimRole`. The one screen a new customer is actually sent to
 * did it silently. A person with an account is never displaced by somebody typing a name.
 */
async function accountHolderOn(roleId: string, tenantId: string) {
  const open = await db.select().from(schema.roleAssignments)
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  const held = open.find(a => a.userId);
  if (!held?.userId) return null;
  const [who] = await db.select().from(schema.users)
    .where(and(eq(schema.users.id, held.userId), eq(schema.users.tenantId, tenantId)));
  return who ? { id: who.id, name: who.name } : null;
}

/** Say no, on the screen they are standing on. */
function refuseSetup(reason: string): never {
  redirect(`/setup/business?cannot=${encodeURIComponent(reason)}`);
}

/**
 * The sentence for whichever of the two it is — and they are genuinely different situations.
 *
 * Taking the role off YOURSELF is the one that did the damage, and the reason it is worth its own
 * wording is that nobody doing it thinks that is what they are doing. They think they are writing
 * down who the General Manager is.
 */
function heldBySomebody(held: { id: string; name: string }, mine: string): never {
  if (held.id === mine) {
    refuseSetup(
      `You are in that role yourself, with your own login. Typing a name here would take it off you `
      + `and leave your account on no role at all — which is how you lose the ability to change the `
      + `chart. If somebody else should hold it, put them in from the org chart instead.`,
    );
  }
  refuseSetup(
    `${held.name} holds that role with their own SPEC login, so typing a name here will not replace `
    + `them — that would take a seat off somebody without asking. Move them from People first.`,
  );
}

async function openAssignment(roleId: string, staffId: string) {
  await db.update(schema.roleAssignments).set({ toDate: now() })
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  await db.insert(schema.roleAssignments).values({ id: randomUUID(), roleId, staffId, userId: null, fromDate: now() });
}

/** Take someone off a role. They stay in the directory — removing a name is not a decision to lose it. */
export async function unplaceStaff(formData: FormData) {
  const user = await requireLeader();
  const roleId = String(formData.get('roleId') ?? '');
  const chart = await chartFor(user.tenantId);
  if (!chart.roles.some(r => r.id === roleId)) redirect('/setup/business');
  await db.update(schema.roleAssignments).set({ toDate: now() })
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  await done(['/setup/business', '/org', '/journey'], user.tenantId);
  redirect('/setup/business');
}

/**
 * The invite — the only action here that emails anyone or costs anything.
 *
 * Everything above this point is free and private to the leader. This creates the account, sends
 * the login link, and starts that seat's monthly charge, so it is a separate button with the price
 * written next to it rather than a side effect of typing a name.
 */
export async function invite(formData: FormData) {
  const user = await requireLeader();
  // Security arrives when it matters: the first seat given out needs the giver's email confirmed.
  if (!(await emailConfirmed())) redirect('/account/verify?next=/setup/business');

  const scope = await getScope(user);
  /*
    Kris, 23 September: *"only someone in a leadership seat can invite someone to join the org
    chart - they then decide if this is a leadership seat or member seat."* Same gate `/org` uses —
    see `mayInvite` in lib/scope — and the same rule is what lets them choose the seat kind below.
  */
  if (!scope.canInvite) redirect('/setup/business?error=not_leader');

  const staffId = String(formData.get('staffId') ?? '');
  const email = String(formData.get('email') ?? '');
  const seatKind = seatKindFromForm(formData.get('seatKind'), scope.canInvite);

  /*
    The rule itself lives in lib/invite, because the org chart gives out seats too and two copies
    of "make an account, spend a seat, send the link" drifting apart is how somebody ends up billed
    for a seat that was never sent. This screen keeps what is its own: who may press the button,
    and where they end up afterwards.
  */
  const outcome = await inviteToSeat(user.tenantId, staffId, email, seatKind);
  if (!outcome.ok) redirect(outcome.reason === 'no-email' ? '/setup/business?error=email' : '/setup/business');

  // No tenantId here: `inviteToSeat` already pushed this seat onto Stripe itself.
  await done(['/setup/business', '/org', '/journey', '/team', '/billing']);
  if (!outcome.sent) redirect(`/setup/business?notsent=${encodeURIComponent(outcome.email)}`);
  redirect('/setup/business?invited=1');
}

/**
 * Add everybody at once, from a pasted list.
 *
 * ── Kris, 26 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"HR for Monday is add everyone into the system and then make sure they all have a place on the
 * org chart."*
 *
 * `addStaff` above takes ONE name per submission. For a business of thirty-five that is thirty-five
 * round trips through a form — the single biggest piece of friction between a decision to go live
 * and a business that actually is, and the kind that gets a rollout postponed rather than reported
 * as a problem.
 *
 * The staff list already exists somewhere: a payroll screen, a spreadsheet, a group chat. So the
 * box takes whatever shape that paste arrives in, and `readNames` does the tidying — see the note
 * there on why it will never split a name on spaces.
 *
 * ── Names only, and nothing else happens ─────────────────────────────────────────────────────────
 *
 * No invitations, no emails, no seats, no charge. A name on the chart is just a name until somebody
 * is deliberately invited, and that rule is what makes it safe to paste a whole company in one go
 * before anybody has decided who gets a login.
 */
export async function addEveryone(formData: FormData) {
  const user = await requireLeader();
  await assertWritable(user.tenantId);

  const names = readNames(String(formData.get('names') ?? ''));
  if (!names.length) redirect('/setup/business?added=0&already=0');

  /* One read and one insert, not one of each per name — thirty-five people must not be seventy
     round trips, which is the fault this action exists to remove. */
  const existing = await db.select({ name: schema.staff.name })
    .from(schema.staff).where(eq(schema.staff.tenantId, user.tenantId));
  const have = new Set(existing.map(s => s.name.trim().toLowerCase()));

  const fresh = names.filter(n => !have.has(n.toLowerCase()));
  if (fresh.length) {
    await db.insert(schema.staff).values(fresh.map(name => ({
      id: randomUUID(),
      tenantId: user.tenantId,
      name,
      userId: null,
      createdAt: now(),
    })));
  }

  await done(['/setup/business', '/org', '/people'], user.tenantId);
  redirect(`/setup/business?added=${fresh.length}&already=${names.length - fresh.length}`);
}
