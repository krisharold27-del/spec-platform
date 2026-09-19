'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { getScope } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { getRoles, placementShown } from '@/lib/queries';
import { installTraining } from '@/lib/provision';
import { canMove, parseRoles, parseCsv, resolveImport, type ChartRole } from '@/lib/orgchart';

/**
 * Changing the shape of the business.
 *
 * Roles report to roles: moving a role takes everybody under it, and moving a PERSON leaves the
 * role exactly as it was. Those are two different actions on this page and two different actions
 * here, because conflating them is how a business loses a job description.
 */

async function editor() {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  return user;
}

/**
 * ── A refusal is a sentence, not a crash ─────────────────────────────────────────────────────────
 *
 * Kris, 18 September, renaming a role on JBI: *"when changing a name on the org chart it did this"*
 * — and a screenshot of **"This page did not load. Something went wrong on our end."**
 *
 * Nothing had gone wrong on SPEC's end. The server had correctly refused to rename a role outside
 * his part of the chart, by `throw`ing — and a server action that throws renders the generic fault
 * screen. So every guard on this page, fifteen of them, told a customer the product was broken
 * instead of telling them why it had said no. "Move the person out of that role first" and "three
 * roles report to that one" are useful sentences, and not one of them ever reached a screen.
 *
 * This was already the product's own rule, written for exactly one of the fifteen: the org journey
 * asserts that removing an occupied role is *"REFUSED IN WORDS ... and not with a fault screen"*,
 * which passed only because the browser checks that one case before asking. Every other path to a
 * refusal produced the crash page.
 *
 * So: the reason goes back to the chart in the address, and the page says it. `redirect` rather than
 * `throw`, because the work genuinely did not happen and the person has to know that.
 */
function refuse(reason: string): never {
  redirect(`/org?cannot=${encodeURIComponent(reason)}`);
}

/**
 * Why this person may not touch this role — in the words of whichever of the three reasons it is.
 *
 * Every guard on this page said the same thing: *"That role is outside your part of the chart."*
 * Three genuinely different situations wore that one sentence, and for two of them it is not true
 * and leads nowhere:
 *
 *   NOT PLACED — the account holds no role at all, so there is no "part of the chart" for anything
 *   to be outside of. This is the one that matters: SPEC works out what somebody may change by
 *   walking DOWN from their own role, so an owner who is not on their own chart is locked out of
 *   every card on it — including their own — and told the business belongs to somebody else. It is
 *   also invisible from the inside: nothing on the chart says "you are not on this".
 *
 *   NO WRITE ACCESS — placed, can see the whole branch, but read-only. Nothing to do with scope;
 *   an administrator fixes it in one press, and the old sentence never mentioned that.
 *
 *   GENUINELY OUTSIDE — someone else's branch. The original sentence, kept as it was.
 */
function outside(scope: Awaited<ReturnType<typeof getScope>>, access: string): never {
  if (!scope.myRoleId) {
    refuse('You are not in a role on this chart yet, so SPEC cannot tell which part of it is yours — that is why it will not let you change anything. Put yourself in a role from People, then come back.');
  }
  if (access !== 'full' && access !== 'administrator') {
    refuse('Your account can see this chart but not change it. An administrator can give you edit access from Admin.');
  }
  refuse('That role is outside your part of the chart.');
}

/** The chart as the move rules need to see it. Titles and links only — no scores. */
async function chartOf(tenantId: string): Promise<ChartRole[]> {
  const roles = await getRoles(tenantId);
  return roles.map(r => ({
    id: r.id, title: r.title, person: r.holder?.name ?? r.pencilled ?? null,
    pencilled: !r.holder && !!r.pencilled, parentId: r.reportsToRoleId,
    level: r.level, stream: r.stream, pillars: null, scored: r.level !== 'staff', hasKpis: true,
  }));
}

/** Drag a card onto another: the role, and everybody under it, now reports there. */
export async function moveRole(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const ontoId = String(formData.get('ontoId') ?? '');
  const scope = await getScope(user);
  if (!scope.canEdit(roleId)) outside(scope, user.access);

  const chart = await chartOf(user.tenantId);
  const check = canMove(roleId, ontoId, chart);
  if (!check.ok) refuse(check.reason ?? 'That move is not allowed.');

  // Entities are sealed branches: no reporting line may cross one.
  const [role] = await db.select().from(schema.roles).where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  const [onto] = await db.select().from(schema.roles).where(and(eq(schema.roles.id, ontoId), eq(schema.roles.tenantId, user.tenantId)));
  if (!role || !onto) refuse('That role is not in this business.');

  await db.update(schema.roles).set({ reportsToRoleId: ontoId }).where(eq(schema.roles.id, roleId));
  revalidatePath('/org');
}

/**
 * Break a link: the role, and everybody under it, comes off the chart.
 *
 * The branch is not deleted and nothing is lost — it goes to the tray, is counted, and drops out of
 * every average until it is dragged back. Excluding it quietly would be the dishonest option.
 */
export async function breakLink(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const scope = await getScope(user);
  if (!scope.canEdit(roleId)) outside(scope, user.access);
  await db.update(schema.roles).set({ reportsToRoleId: null })
    .where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  revalidatePath('/org');
}

/**
 * Drag a name pill onto another card: the PERSON moves, the roles stay put.
 *
 * If the destination already has somebody, the two swap. That is almost always what was meant — and
 * the alternative, silently vacating one of them, loses a placement nobody asked to lose.
 */
export async function movePerson(formData: FormData) {
  const user = await editor();
  const fromRoleId = String(formData.get('fromRoleId') ?? '');
  const toRoleId = String(formData.get('toRoleId') ?? '');
  if (!fromRoleId || !toRoleId || fromRoleId === toRoleId) return;

  const scope = await getScope(user);
  if (!scope.canEdit(fromRoleId) || !scope.canEdit(toRoleId)) {
    refuse('Both roles have to be inside your part of the chart.');
  }

  /*
    Two roles, asked for by name.

    This used to read EVERY open placement in the database and then look for two of them in
    JavaScript — fine on a test business, a full table scan across every customer at twenty
    thousand seats, and it trusted a role id from a form without ever checking it belonged to this
    business. Asking for the two roles asks the database for exactly what is wanted.

    And it takes the placement the CARD is showing, through the same `placementShown` the chart is
    drawn from. Picking a different one is how dragging a name pill moved somebody nobody had
    touched — the same fault as the rename, one screen over.
  */
  const placementsOn = async (roleId: string) => placementShown(
    await db.select().from(schema.roleAssignments)
      .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate))),
  );
  const from = await placementsOn(fromRoleId);
  const to = await placementsOn(toRoleId);
  if (!from) return;

  // Assignments are opened and closed, never deleted, so the chart can always answer who held a
  // role in March.
  const today = new Date().toISOString().slice(0, 10);
  await db.update(schema.roleAssignments).set({ toDate: today }).where(eq(schema.roleAssignments.id, from.id));
  if (to) await db.update(schema.roleAssignments).set({ toDate: today }).where(eq(schema.roleAssignments.id, to.id));

  await db.insert(schema.roleAssignments).values({
    id: randomUUID(), roleId: toRoleId, userId: from.userId, staffId: from.staffId, fromDate: today,
  });
  if (to) {
    await db.insert(schema.roleAssignments).values({
      id: randomUUID(), roleId: fromRoleId, userId: to.userId, staffId: to.staffId, fromDate: today,
    });
  }
  revalidatePath('/org');
}

/** Add a role under another. It starts vacant, because roles exist before people. */
export async function addRole(formData: FormData) {
  const user = await editor();
  const title = String(formData.get('title') ?? '').trim();
  const parentId = String(formData.get('parentId') ?? '') || null;
  if (!title) return;

  const scope = await getScope(user);
  if (parentId && !scope.canEdit(parentId)) outside(scope, user.access);

  let stream = 'operations';
  let level = 'manager';
  if (parentId) {
    const [parent] = await db.select().from(schema.roles)
      .where(and(eq(schema.roles.id, parentId), eq(schema.roles.tenantId, user.tenantId)));
    if (!parent) refuse('That role is not in this business.');
    stream = parent.stream;
    level = parent.level === 'gm' ? 'manager' : parent.level === 'manager' ? 'supervisor' : 'staff';
  }

  const id = randomUUID();
  await db.insert(schema.roles).values({
    id, tenantId: user.tenantId, title, stream, level,
    defaultAccess: level === 'staff' ? 'readonly' : 'full',
    reportsToRoleId: parentId, sortOrder: 99,
  });
  // A new role inherits the path its level starts with, so nobody meets a blank curriculum.
  await installTraining(user.tenantId, [{ roleId: id, level }]);
  revalidatePath('/org');
}

/**
 * Rename a role.
 *
 * The title is the one thing on a chart everybody reads, and until now the only way to correct one
 * was to remove the role and build it again — which throws away its KPIs, its training path and
 * every closed month that referred to it. A typo should cost a keystroke, not a history.
 *
 * The row is updated in place on purpose. A role is the seat, not the words on it: renaming
 * "Ops Manager" to "Operations Manager" does not make it a different job, and every locked month
 * that scored that seat still scored THIS seat.
 */
export async function renameRole(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const title = String(formData.get('title') ?? '').trim().slice(0, 200);
  // An empty box is somebody clearing it to type, not asking for a role with no name.
  if (!title) return;

  const scope = await getScope(user);
  if (!scope.canEdit(roleId)) outside(scope, user.access);

  await db.update(schema.roles).set({ title })
    .where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  revalidatePath('/org');
  revalidatePath('/people');
  revalidatePath(`/scorecard/${roleId}`);
}

/**
 * Put a name against a role, or correct the one that is there.
 *
 * Three cases, and they are three different things happening to the data:
 *
 *   Somebody holds it with an account — their name is corrected. It is the same person; a
 *   misspelling on a chart is a misspelling, not a new employee.
 *
 *   Somebody is pencilled in — the name on the staff row is corrected. Same again.
 *
 *   The role is vacant — a name is pencilled in. Free, silent, nobody is emailed. An invitation is
 *   a separate, deliberate act on /people, and it stays that way: typing a name into a chart must
 *   never send mail to a person who has not been told they are getting it.
 *
 * Clearing the box does NOTHING. Emptying a role is `vacateRole`, which is its own menu item and
 * its own decision — a rename box that could silently end somebody's placement because a cursor
 * landed in it and a key was pressed is a trap, not a convenience.
 */
export async function renamePerson(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const name = String(formData.get('person') ?? '').trim().slice(0, 200);
  if (!name) return;

  const scope = await getScope(user);
  if (!scope.canEdit(roleId)) outside(scope, user.access);

  const [role] = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  if (!role) refuse('That role is not in this business.');

  const openRows = await db.select().from(schema.roleAssignments)
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));

  /*
    ── Rename the person the CARD is showing, not whichever row came back first ──────────────────

    Kris, 19 September, on JBI: *"i am the GM but it wont let me change from anthony to my name"*.

    A role is meant to hold one person, and mostly does — but nothing in the schema enforces it, and
    a role that has picked up a second open assignment (an account holder AND a pencilled-in name)
    was being renamed at random. `getRoles`, which draws the chart, always shows the ACCOUNT HOLDER
    and falls back to the pencilled name only when there is no account. This took whatever the
    database handed back first. So the rename could land on the staff row while the card was reading
    the user row: press Save, nothing on the card changes, no error, nothing to do about it.

    The two had to agree, so the rule is now written ONCE — `placementShown`, beside `getRoles`,
    which is the query that draws the card. `tests/placement.test.ts` hands it the rows in both
    orders, because a database promises nothing about the order of rows and the old code was a coin
    toss that mostly came up heads.
  */
  const open = placementShown(openRows);

  if (open?.userId) {
    // Tenant-scoped on purpose: a user id arriving from a form must never reach another business's row.
    const done = await db.update(schema.users).set({ name })
      .where(and(eq(schema.users.id, open.userId), eq(schema.users.tenantId, user.tenantId)))
      .returning({ id: schema.users.id });
    /*
      A write that changed nothing must never look like a write that worked. If it did not land,
      the person is owed a sentence rather than a card that stubbornly keeps the old name.
    */
    if (!done.length) refuse('SPEC could not change that name. Nothing has been altered — tell Kris what you were doing.');
  } else if (open?.staffId) {
    const done = await db.update(schema.staff).set({ name })
      .where(and(eq(schema.staff.id, open.staffId), eq(schema.staff.tenantId, user.tenantId)))
      .returning({ id: schema.staff.id });
    if (!done.length) refuse('SPEC could not change that name. Nothing has been altered — tell Kris what you were doing.');
  } else {
    /*
      Vacant. Reuse a name already in the directory rather than creating a second row for the same
      person — two "Dave Morgan"s is how a business ends up with one person's training record split
      down the middle. Matched case-insensitively, because nobody types their own staff list the
      same way twice.
    */
    const existing = (await db.select().from(schema.staff).where(eq(schema.staff.tenantId, user.tenantId)))
      .find(s => s.name.trim().toLowerCase() === name.toLowerCase());

    if (existing) {
      /*
        Already somewhere else on the chart. This is the move-or-merge question `placeStaff` asks on
        /setup/business, and guessing it here would either strand a role the business still needs or
        quietly take one off somebody. Point at the screen that can ask properly.
      */
      const [held] = await db.select().from(schema.roleAssignments)
        .where(and(eq(schema.roleAssignments.staffId, existing.id), isNull(schema.roleAssignments.toDate)));
      if (held) refuse(`${existing.name} already holds another role. Move them from People, so SPEC can ask whether that is a move or a second seat.`);
    }

    const staffId = existing?.id ?? randomUUID();
    if (!existing) {
      await db.insert(schema.staff).values({
        id: staffId, tenantId: user.tenantId, name, userId: null, createdAt: new Date().toISOString(),
      });
    }
    await db.insert(schema.roleAssignments).values({
      id: randomUUID(), roleId, staffId, fromDate: new Date().toISOString().slice(0, 10),
    });
  }

  revalidatePath('/org');
  revalidatePath('/people');
}

/** Take a role off the chart for good. Never used on a role with anybody in it. */
export async function removeRole(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const scope = await getScope(user);
  if (!scope.canEdit(roleId)) outside(scope, user.access);

  const open = await db.select().from(schema.roleAssignments)
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  if (open.length) refuse('Move the person out of that role first — removing it would lose their placement.');

  const children = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.reportsToRoleId, roleId), eq(schema.roles.tenantId, user.tenantId)));
  if (children.length) refuse(`${children.length} role(s) report to that one. Move them first.`);

  // Deactivated, not deleted: a locked month keeps the structure it had.
  await db.update(schema.roles).set({ active: false })
    .where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  revalidatePath('/org');
}

/** Make a role vacant: the person leaves, the role and its KPIs stay exactly as they are. */
export async function vacateRole(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const scope = await getScope(user);
  if (!scope.canEdit(roleId)) outside(scope, user.access);
  await db.update(schema.roleAssignments).set({ toDate: new Date().toISOString().slice(0, 10) })
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  revalidatePath('/org');
}

/**
 * Start from what the business already has: a paste, or a CSV.
 *
 * Anything whose manager cannot be matched is still created — it lands unlinked, where a person can
 * see the problem and drag it in. Refusing the whole import over one bad line would be worse.
 */
export async function importChart(formData: FormData) {
  const user = await editor();
  const text = String(formData.get('text') ?? '');
  const csv = String(formData.get('csv') ?? '');
  const parsed = csv.trim() ? parseCsv(csv) : parseRoles(text);
  if (!parsed.length) return;

  const { rows } = resolveImport(parsed);
  const existing = await getRoles(user.tenantId);
  const byTitle = new Map(existing.map(r => [r.title.toLowerCase(), r.id]));

  // Two passes: every role exists before any reporting line is drawn.
  const created: { title: string; id: string; level: string }[] = [];
  for (const r of rows) {
    if (byTitle.has(r.title.toLowerCase())) continue;
    const id = randomUUID();
    const level = r.parentTitle ? 'manager' : 'gm';
    await db.insert(schema.roles).values({
      id, tenantId: user.tenantId, title: r.title, stream: 'operations', level,
      defaultAccess: 'full', reportsToRoleId: null, sortOrder: 50,
    });
    byTitle.set(r.title.toLowerCase(), id);
    created.push({ title: r.title, id, level });
  }

  for (const r of rows) {
    const id = byTitle.get(r.title.toLowerCase());
    const parentId = r.parentTitle ? byTitle.get(r.parentTitle.toLowerCase()) ?? null : null;
    if (!id || !parentId || id === parentId) continue;
    await db.update(schema.roles).set({ reportsToRoleId: parentId }).where(eq(schema.roles.id, id));
  }

  // A name in the paste is a staff row: free, silent, and nobody is emailed.
  for (const r of rows) {
    if (!r.person) continue;
    const roleId = byTitle.get(r.title.toLowerCase());
    if (!roleId) continue;
    const held = await db.select().from(schema.roleAssignments)
      .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
    if (held.length) continue;
    const staffId = randomUUID();
    await db.insert(schema.staff).values({
      id: staffId, tenantId: user.tenantId, name: r.person, createdAt: new Date().toISOString(),
    });
    await db.insert(schema.roleAssignments).values({
      id: randomUUID(), roleId, staffId, fromDate: new Date().toISOString().slice(0, 10),
    });
  }

  if (created.length) await installTraining(user.tenantId, created.map(c => ({ roleId: c.id, level: c.level })));
  revalidatePath('/org');
}
