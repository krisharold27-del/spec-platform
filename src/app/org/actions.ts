'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { emailConfirmed } from '@/lib/auth';
import { inviteToSeat } from '@/lib/invite';
import { reachBy, EITHER_WILL_DO, NEITHER_SAYS } from '@/lib/reach';
import { getScope } from '@/lib/scope';
import { assertWritable, syncSubscriptionSeats } from '@/lib/plan';
import { getRoles, placementShown } from '@/lib/queries';
import { installTraining } from '@/lib/provision';
import { canMove, parseRoles, parseCsv, resolveImport, type ChartRole } from '@/lib/orgchart';
import { PILLARS, evenWeights, type Pillar } from '@/lib/scoring';
import { addKpi, addMember, teamName, mayHoldTeam, seatKindFromForm } from '@/lib/chart-seats';

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
function refuse(reason: string, roleId?: string): never {
  /*
    The role comes back in the address when there is one, so a refusal lands on the card it is
    about. A sentence about a supervisor's KPI, read on the General Manager's panel, is a sentence
    about nothing anybody can see.
  */
  const back = roleId ? `role=${encodeURIComponent(roleId)}&` : '';
  redirect(`/org?${back}cannot=${encodeURIComponent(reason)}`);
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
    // canMove refuses to hang a role under a team, or to drag a team, so it has to know which is
    // which. Without this every team on the chart is a valid drop target.
    isTeam: r.isTeam,
    badges: [],
    kpiCounts: { safety: 0, people: 0, earnings: 0, compliance: 0 },
  }));
}

/** Drag a card onto another: the role, and everybody under it, now reports there. */
export async function moveRole(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const ontoId = String(formData.get('ontoId') ?? '');
  const scope = await getScope(user);
  if (!scope.canShapeChart(roleId)) outside(scope, user.access);

  const chart = await chartOf(user.tenantId);
  const check = canMove(roleId, ontoId, chart);
  if (!check.ok) refuse(check.reason ?? 'That move is not allowed.');

  // Entities are sealed branches: no reporting line may cross one.
  const [role] = await db.select().from(schema.roles).where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  const [onto] = await db.select().from(schema.roles).where(and(eq(schema.roles.id, ontoId), eq(schema.roles.tenantId, user.tenantId)));
  if (!role || !onto) refuse('That role is not in this business.');

  await db.update(schema.roles).set({ reportsToRoleId: ontoId }).where(eq(schema.roles.id, roleId));
  revalidatePath('/org');
  revalidatePath('/billing');
  // Reparenting can change who leads whom — the moved role's own holder, or whoever used to be
  // the only thing reporting to its old or new parent. See the note on syncSubscriptionSeats.
  await syncSubscriptionSeats(user.tenantId);
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
  if (!scope.canShapeChart(roleId)) outside(scope, user.access);
  await db.update(schema.roles).set({ reportsToRoleId: null })
    .where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  revalidatePath('/org');
  revalidatePath('/billing');
  // The old parent may have just lost its last direct report — see the note on syncSubscriptionSeats.
  await syncSubscriptionSeats(user.tenantId);
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
  if (!scope.canShapeChart(fromRoleId) || !scope.canShapeChart(toRoleId)) {
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

  for (const path of ['/org', '/my-page', '/people', '/team', '/billing']) revalidatePath(path);
  // A swap can change what one or both of the people just moved are billed as — see the note on
  // syncSubscriptionSeats.
  await syncSubscriptionSeats(user.tenantId);

  /*
    ── Say what the drag did, both halves of it ─────────────────────────────────────────────────

    Kris, 19 September, on how Anthony came to be General Manager of JBI: *"i was moving the boxes
    and moved anthonys and then his name went to gm"*.

    That is this action working exactly as designed — the destination was filled, so the two swapped
    — and the design's own comment says a swap "is almost always what was meant". It was. What was
    NOT meant, and what nothing on the screen said, is the other half: the swap moved KRIS out of
    the General Manager role and down into Anthony's.

    From that moment his account held a role near the bottom of his own chart. SPEC decides what
    somebody may touch by walking DOWN from their role, so he could no longer rename the top card,
    and was eventually shown a form offering to ask an administrator — himself — for permission.
    Every one of those was a symptom of a drag that never reported its second half.

    So it reports both halves, by name, and when the person who moved is the one who did the
    dragging it says what that changes. A swap is reversible by dragging back; one you never knew
    happened is not.
  */
  const nameOf = async (placement: { userId: string | null; staffId: string | null }) => {
    if (placement.userId) {
      const [who] = await db.select().from(schema.users)
        .where(and(eq(schema.users.id, placement.userId), eq(schema.users.tenantId, user.tenantId)));
      return { name: who?.name ?? 'Somebody', isYou: placement.userId === user.id };
    }
    if (placement.staffId) {
      const [who] = await db.select().from(schema.staff)
        .where(and(eq(schema.staff.id, placement.staffId), eq(schema.staff.tenantId, user.tenantId)));
      return { name: who?.name ?? 'Somebody', isYou: false };
    }
    return { name: 'Somebody', isYou: false };
  };

  const titleOf = async (roleId: string) => {
    const [role] = await db.select().from(schema.roles)
      .where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
    return role?.title ?? 'that role';
  };

  const mover = await nameOf(from);
  const fromTitle = await titleOf(fromRoleId);
  const toTitle = await titleOf(toRoleId);

  let said = `${mover.name} is now ${toTitle}.`;
  if (to) {
    const swapped = await nameOf(to);
    said += ` ${swapped.isYou ? 'You have' : `${swapped.name} has`} moved to ${fromTitle}.`;
    if (swapped.isYou) {
      said += ' What you can change in SPEC follows the role you are in, so that has changed too —'
        + ' drag the names back if it was not what you meant.';
    }
  }
  redirect(`/org?moved=${encodeURIComponent(said)}`);
}

/** Add a role under another. It starts vacant, because roles exist before people. */
export async function addRole(formData: FormData) {
  const user = await editor();
  const title = String(formData.get('title') ?? '').trim();
  const parentId = String(formData.get('parentId') ?? '') || null;
  if (!title) return;

  const scope = await getScope(user);
  if (parentId && !scope.canShapeChart(parentId)) outside(scope, user.access);

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
  if (!scope.canShapeChart(roleId)) outside(scope, user.access);

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
  if (!scope.canShapeChart(roleId)) outside(scope, user.access);

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

/**
 * Give the person on this card a login.
 *
 * ── Why this is on the chart ─────────────────────────────────────────────────────────────────────
 *
 * Kris, 19 September: *"i need to know how to invite new people - add their email and send to them"*.
 *
 * The whole invitation was already built and already proven end to end — the link, the password set
 * on arrival, landing on their own My Page, single use, bound to that address. The only door to it
 * was **Setting up → Your business**, and the screen where a leader actually thinks about who works
 * for them had none. So he could not find it, and a feature nobody can find is not a feature.
 *
 * The rule itself is `lib/invite`, shared with that Setup screen. What belongs HERE is who may press
 * it: the role has to be inside the caller's own branch — *"only managers can change staff in their
 * business unit"* — which `canEdit` already means, and which is why this cannot simply take a staff
 * id from the form. It takes the ROLE, and finds the person on it the same way the card does.
 */
export async function invitePerson(formData: FormData) {
  const user = await editor();
  // Security arrives when it matters: the first seat given out needs the giver's own email confirmed.
  if (!(await emailConfirmed())) redirect('/account/verify?next=/org');

  const roleId = String(formData.get('roleId') ?? '');
  /*
    Whatever they had (Kris, 26 September). The field is still called `email` because renaming a
    form field breaks links and fixes nothing; what it CARRIES now is either an address or a number,
    and `reachBy` says which. See lib/reach for why this is not an SMS gateway.
  */
  const reach = reachBy(String(formData.get('email') ?? ''));

  const scope = await getScope(user);
  if (!scope.canShapeChart(roleId)) outside(scope, user.access);
  /*
    Kris, 23 September: *"only someone in a leadership seat can invite someone to join the org
    chart - they then decide if this is a leadership seat or member seat."* A team seat cannot
    spend another seat, full stop — see `mayInvite` in lib/scope.
  */
  if (!scope.canInvite) refuse('Only somebody on a leadership seat can invite people onto the chart.');

  const openRows = await db.select().from(schema.roleAssignments)
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  const placement = placementShown(openRows);

  if (!placement) refuse('There is nobody in that role yet. Put a name on the card first, then invite them.');
  if (placement.userId) refuse('They already have a SPEC login, so there is nothing to send.');
  if (!placement.staffId) refuse('SPEC cannot tell who is in that role. Put the name on the card again.');

  if (reach.kind === 'nothing') refuse(`How do you reach them? ${EITHER_WILL_DO}`);
  if (reach.kind === 'unreadable') refuse(NEITHER_SAYS);

  /*
    ── A phone number is a route, not a refusal (26 September) ─────────────────────────────────

    Until today this answered "That does not look like an email address." and stopped. An owner
    working down thirty-eight people, with a mobile number for eleven of them, hit a wall eleven
    times and had nothing to do about it — which does not read as a missing feature, it reads as
    "I'll sort this out tonight", and those eleven are then never in the system at all.

    So the number is kept and a join link is issued: the same link Setting up → Your business has
    always handed out, which the person opens on their phone with no account and fills in their own
    half, their own email included. Nothing is charged, because nothing has been created — the seat
    starts when they finish, not when the owner gives up trying to remember an address.
  */
  if (reach.kind === 'phone') {
    const token = randomBytes(16).toString('hex');
    await db.update(schema.staff)
      .set({ phone: reach.phone, setupToken: token })
      .where(and(eq(schema.staff.id, placement.staffId), eq(schema.staff.tenantId, user.tenantId)));

    for (const path of ['/org', '/setup/business', '/people', '/team', '/journey']) revalidatePath(path);
    redirect(`/org?texted=${encodeURIComponent(placement.staffId)}`);
  }

  // The same rule that let them invite at all is what lets them choose the seat — see `canInvite`.
  const seatKind = seatKindFromForm(formData.get('seatKind'), scope.canInvite);

  const outcome = await inviteToSeat(user.tenantId, placement.staffId, reach.email, seatKind);
  if (!outcome.ok) {
    refuse(
      outcome.reason === 'no-email' ? NEITHER_SAYS
      : outcome.reason === 'already-has-an-account' ? 'They already have a SPEC login, so there is nothing to send.'
      : 'SPEC could not send that invitation. Nothing has been charged.',
    );
  }

  for (const path of ['/org', '/setup/business', '/people', '/team', '/journey']) revalidatePath(path);

  /*
    A seat has started being charged either way, so the leader is told which of the two happened.
    "Invited" for an email that never left is the version of this that costs somebody a week — they
    wait, the new person waits, and the bill arrives regardless.
  */
  if (!outcome.sent) {
    refuse(`${outcome.name} has a seat, but the email did not send. Their invitation is on Setting up → Your business — send them the link yourself.`);
  }
  redirect(`/org?invited=${encodeURIComponent(outcome.email)}`);
}

/**
 * Change which seat somebody already invited is billed on — leadership, team, or back to letting
 * the chart decide.
 *
 * Kris, 23 September, after a real misclassified seat at JBI: *"we need the capacity to choose
 * whether leadership seat or team seat"* — and, the same day, that the choice belongs to whoever
 * may invite in the first place: *"only someone in a leadership seat can invite someone to join the
 * org chart - they then decide if this is a leadership seat or member seat."* Same gate as
 * `invitePerson`, `scope.canInvite`, because this is the same decision made at a different moment —
 * fixing one after the fact rather than getting it right at the invite. Writing `seatKindOverride`
 * is the ONLY thing this does: `resolveSeatKind` (lib/chart-seats) is what actually reads it
 * wherever billing and training eligibility are computed, so there is exactly one place this can
 * disagree with the bill.
 */
export async function setSeatKind(formData: FormData) {
  /*
    ── Posted from /billing too, so it answers on /billing (23 September) ──────────────────────────

    The Pricing page posts here as well as the chart card. A refusal used to send the person to the
    CHART with the reason, and a success said nothing at all — so pressing Save on /billing either
    jumped somewhere else or appeared to do nothing, and whether the live subscription moved was
    something only the Vercel logs knew. From /billing both now land back on /billing, the refusal
    in words and the save with what happened to the subscription (`?seat_sync=`).
  */
  const fromBilling = formData.get('from') === 'billing';
  const no = (reason: string, roleId?: string): never => {
    if (fromBilling) redirect(`/billing?cannot=${encodeURIComponent(reason)}`);
    refuse(reason, roleId);
  };

  const user = await editor();
  const scope = await getScope(user);

  const roleId = String(formData.get('roleId') ?? '');
  if (!scope.canShapeChart(roleId)) {
    if (fromBilling) no('That role is outside what your account can change.');
    outside(scope, user.access);
  }
  if (!scope.canInvite) no('Only somebody on a leadership seat can change how another seat is billed.', roleId);

  const raw = String(formData.get('seatKind') ?? '');
  const seatKind = raw === 'leadership' || raw === 'team' ? raw : null; // 'auto' (or anything else) clears it

  const openRows = await db.select().from(schema.roleAssignments)
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  const placement = placementShown(openRows);
  if (!placement?.userId) no('Nobody with a SPEC login is in that role, so there is nothing to bill differently.', roleId);

  await db.update(schema.users).set({ seatKindOverride: seatKind })
    .where(and(eq(schema.users.id, placement!.userId!), eq(schema.users.tenantId, user.tenantId)));

  revalidatePath('/org');
  revalidatePath('/billing');
  revalidatePath('/journey');
  revalidatePath('/training');
  // The whole reason this button exists — pushed straight through to the live subscription rather
  // than waiting for somebody to notice the invoice is wrong. See the note on syncSubscriptionSeats.
  const outcome = await syncSubscriptionSeats(user.tenantId);
  // Outside any try: redirect() works by throwing.
  if (fromBilling) redirect(`/billing?seat_sync=${outcome.status}`);
}

/** Take a role off the chart for good. Never used on a role with anybody in it. */
export async function removeRole(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const scope = await getScope(user);
  if (!scope.canShapeChart(roleId)) outside(scope, user.access);

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

/**
 * "This role is me." Put the signed-in account into it.
 *
 * ── The thing that was missing, not the thing that was broken ────────────────────────────────────
 *
 * Kris, 19 September, four times: *"i am the GM but it wont let me change from anthony to my name"*,
 * *"I still cant change my name in the org chart"*, *"I can't change GM back to me"*.
 *
 * I kept looking for a fault in renaming, and fixed two real ones. Neither was this. **Renaming the
 * person and claiming the role are different things, and SPEC only had the first.** Typing your own
 * name over a pencilled-in one renames a STAFF row — a name on a card, with no account behind it.
 * The card then says "Kristopher Harold" and your login is still attached to nothing, so SPEC still
 * does not believe you are on your own chart, and every rule that walks down from your role still
 * finds nowhere to start.
 *
 * So he was right every time, and right about a feature rather than a bug. There was no way, from
 * anywhere in the product, to say *that role is me*.
 *
 * ── The rules it keeps ───────────────────────────────────────────────────────────────────────────
 *
 * One person, one role: taking this role closes whatever placement the claimer already held, so
 * claiming can never quietly leave somebody holding two.
 *
 * A pencilled-in name is displaced and SAID so — they have no account, nothing is lost, and typing
 * their name onto another card puts them back.
 *
 * Somebody with their own LOGIN is never displaced by this. That is a move between two real people,
 * with a seat and a scorecard attached, and it belongs to the screen that can ask about both of
 * them rather than to a button that takes one silently.
 *
 * Access is deliberately NOT changed. Kris's rule, 19 September: *"if rights are needed then the
 * admin must approve this"* — so claiming a role gives you the role, never a level of access you
 * did not already have.
 */
export async function claimRole(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');

  const scope = await getScope(user);
  if (!scope.canShapeChart(roleId)) outside(scope, user.access);

  const [role] = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  if (!role) refuse('That role is not in this business.');

  const openRows = await db.select().from(schema.roleAssignments)
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  const held = placementShown(openRows);

  if (held?.userId === user.id) refuse(`You are already in ${role.title}.`);
  if (held?.userId) {
    const [them] = await db.select().from(schema.users)
      .where(and(eq(schema.users.id, held.userId), eq(schema.users.tenantId, user.tenantId)));
    refuse(`${them?.name ?? 'Somebody'} holds ${role.title} with their own SPEC login. Move them from People first, so SPEC can ask where they are going.`);
  }

  const today = new Date().toISOString().slice(0, 10);

  // Whoever was pencilled in comes off this role, and the claimer comes off wherever they were.
  // Placements are closed and never deleted, so the chart can still answer who held what in March.
  await db.update(schema.roleAssignments).set({ toDate: today })
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  await db.update(schema.roleAssignments).set({ toDate: today })
    .where(and(eq(schema.roleAssignments.userId, user.id), isNull(schema.roleAssignments.toDate)));

  await db.insert(schema.roleAssignments).values({
    id: randomUUID(), roleId, userId: user.id, staffId: null, fromDate: today,
  });

  for (const path of ['/org', '/my-page', '/people', '/team', '/setup/business', '/billing']) revalidatePath(path);
  // Claiming a role can change what the claimer is billed as. See the note on syncSubscriptionSeats.
  await syncSubscriptionSeats(user.tenantId);
  redirect(`/org?claimed=${encodeURIComponent(role.title)}`);
}

/**
 * Ask the administrator for rights over a branch you do not sit above.
 *
 * ── Kris's rule, in full ─────────────────────────────────────────────────────────────────────────
 *
 * 19 September: *"first person to start is admin rights - then managers only have rights to their
 * staff - if rights are needed then the admin must approve this"*.
 *
 * The middle clause was already true and needed no storing: SPEC works out what somebody may touch
 * by walking down the chart from their own role. The last clause had nowhere to go. Somebody who
 * needed to cover another supervisor's crew for a fortnight had exactly two options — do without,
 * or be handed an administrator account, which is the whole rule thrown away to solve a fortnight.
 *
 * So the chart asks, and the administrator decides. It goes into the SAME queue as every other
 * approval, because a request that waits in a place nobody looks is a request nobody answers.
 *
 * ── Two things it deliberately does not do ───────────────────────────────────────────────────────
 *
 * It grants nothing on its own. The request is a row saying somebody asked; the rights appear when
 * an administrator approves it, in lib/rights, and not one moment before.
 *
 * And it never asks for an ACCESS LEVEL. Rights over a branch and being an administrator are
 * different things, and a screen that blurs them is how every manager ends up an administrator
 * within a year.
 */
export async function requestRights(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const why = String(formData.get('why') ?? '').trim().slice(0, 500);

  const [role] = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  if (!role) refuse('That role is not in this business.');

  const scope = await getScope(user);
  if (scope.canSee(roleId)) refuse(`You already have ${role.title} and everybody under it.`);

  /*
    One open request per person per branch. Asking twice is the most natural thing in the world when
    nothing has happened yet, and it must not turn the administrator's queue into a pile of the same
    sentence — which is how a queue stops being read at all.
  */
  const waiting = await db.select().from(schema.approvals).where(and(
    eq(schema.approvals.tenantId, user.tenantId),
    eq(schema.approvals.kind, 'rights'),
    eq(schema.approvals.refId, roleId),
    eq(schema.approvals.state, 'waiting'),
  ));
  if (waiting.some(a => a.requestedBy === user.name)) {
    refuse(`You have already asked for ${role.title}. It is with the administrator.`);
  }

  await db.insert(schema.approvals).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    kind: 'rights',
    title: `Rights over ${role.title}`,
    detail: why
      ? `${user.name} is asking to manage ${role.title} and everybody under it. Their reason: ${why}`
      : `${user.name} is asking to manage ${role.title} and everybody under it.`,
    blocks: `${user.name} cannot see or score anybody in that branch until this is decided.`,
    decidedByLevel: 'administrator',
    requestedBy: user.name,
    requestedAt: new Date().toISOString(),
    state: 'waiting',
    refId: roleId,
  });

  revalidatePath('/inbox');
  revalidatePath('/org');
  redirect(`/org?asked=${encodeURIComponent(role.title)}`);
}

/** Make a role vacant: the person leaves, the role and its KPIs stay exactly as they are. */
export async function vacateRole(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const scope = await getScope(user);
  if (!scope.canShapeChart(roleId)) outside(scope, user.access);
  await db.update(schema.roleAssignments).set({ toDate: new Date().toISOString().slice(0, 10) })
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  revalidatePath('/org');
  revalidatePath('/billing');
  // Whoever just left may have had a login — vacant is a team seat, not a leadership one. See the
  // note on syncSubscriptionSeats.
  await syncSubscriptionSeats(user.tenantId);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The KPI editor
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Add a KPI to one pillar of one role, from the chart.
 *
 * ── Why this exists when /setup/kpis already does ───────────────────────────────────────────────
 *
 * Kris, 18 September: *"org chart and entering kpi's is everything to this system - why is it so
 * hard"*, and design 15 answers it by putting the editor ON the chart — right-click a pillar, type
 * a line, done. The Setup screen is a form for doing all sixteen at once; this is for the moment
 * somebody is looking at a role and thinks of one.
 *
 * ── The weights are re-evened here, not left to the form ────────────────────────────────────────
 *
 * A pillar's weights must sum to 1 or a percentage means nothing, and `validateWeights` refuses a
 * save that breaks it. Adding a criterion changes the sum, so the pillar is re-evened in the same
 * write. Doing it any other way is how "add a KPI" quietly broke "save" on the Setup screen in
 * September — the spare row defaulted to 50%, the pillar went to 150%, and everything typed across
 * all four pillars came back empty.
 *
 * `evenWeights` is the same function `saveCriteria` uses. One arithmetic, two screens.
 */
export async function addRoleKpi(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const pillar = String(formData.get('pillar') ?? '') as Pillar;
  const typed = String(formData.get('text') ?? '');

  if (!PILLARS.includes(pillar)) refuse('SPEC did not recognise that pillar.');
  const scope = await getScope(user);
  if (!scope.canShapeChart(roleId)) outside(scope, user.access);

  const [role] = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  if (!role) refuse('That role is not in this business.');

  const onPillar = (await db.select().from(schema.criteria)
    .where(and(eq(schema.criteria.roleId, roleId), eq(schema.criteria.active, true))))
    .filter(c => c.pillar === pillar);

  const added = addKpi(typed, onPillar.map(c => c.text));
  if (!added.ok) refuse(added.reason, roleId);

  await db.insert(schema.criteria).values({
    id: randomUUID(), roleId, pillar, text: added.text,
    // Replaced a line below, once the pillar is counted with this row in it.
    weight: 1, kpi: true, target: null, proposedTarget: null,
    sortOrder: onPillar.length,
  });
  await reweigh(roleId, pillar);

  /*
    ── No redirect. The measure appears where it was typed, and the page does not move ──────────

    Kris, 19 September: *"when i add kpi it takes me back to the org chart"*.

    It did. This used to end `redirect('/org?role=…&kpi=…')`, which is a NAVIGATION — a fresh
    request for a new address, so the browser lands at the top of the page. The Role scorecard sits
    a long way down the chart, so adding a measure scrolled him away from the thing he was doing
    and he had to find his way back for every single KPI. On a screen whose whole job is entering
    sixteen of them, that is not a wrinkle.

    The redirect was there to fix the version of this fault BEFORE it: without one, the panel
    reopened on whichever card it started on. But that only happened BECAUSE of the navigation —
    the address changed, the chart re-mounted, and its "which card is open" state went back to its
    starting value.

    Revalidating and returning is the answer to both. There is no navigation, so nothing re-mounts,
    the panel stays on the role and the page stays where it was; `revalidatePath` re-renders the
    chart in place, so the new measure appears in the list under the box it was typed into. That
    list IS the confirmation, and a better one than a sentence at the top of a page nobody is
    looking at.

    A REFUSAL still redirects — see `refuse`. That is rare, it has to be read, and it carries the
    role so it lands on the right card.
  */
  for (const path of ['/org', '/setup/kpis', '/my-page', '/scoring', `/scorecard/${roleId}`]) revalidatePath(path);
}

/**
 * Take a KPI off a pillar.
 *
 * Marked inactive, never deleted, exactly as an ordinary edit on /setup/kpis does. A month that has
 * already been closed was scored against this criterion, and removing the row would change a number
 * a board has already signed off.
 */
export async function removeRoleKpi(formData: FormData) {
  const user = await editor();
  const criterionId = String(formData.get('criterionId') ?? '');

  const [row] = await db.select({
    id: schema.criteria.id, roleId: schema.criteria.roleId, pillar: schema.criteria.pillar,
  })
    .from(schema.criteria)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.criteria.roleId))
    .where(and(eq(schema.criteria.id, criterionId), eq(schema.roles.tenantId, user.tenantId)));
  if (!row) refuse('That measure is not in this business.');

  const scope = await getScope(user);
  if (!scope.canShapeChart(row.roleId)) outside(scope, user.access);

  await db.update(schema.criteria).set({ active: false }).where(eq(schema.criteria.id, row.id));
  await reweigh(row.roleId, row.pillar as Pillar);

  // In place, for the same reason `addRoleKpi` does not redirect: the measure disappearing from
  // the list is the confirmation, and it is read where the × was pressed.
  for (const path of ['/org', '/setup/kpis', '/my-page', '/scoring', `/scorecard/${row.roleId}`]) revalidatePath(path);
}

/**
 * Share one pillar's weight evenly across whatever is on it now.
 *
 * Called after every add and every remove, because the alternative — leaving the weights alone —
 * produces a pillar summing to something other than 1, which `validateWeights` refuses and which
 * makes every percentage on that pillar meaningless until somebody opens the Setup screen and
 * presses Save.
 *
 * An empty pillar is left alone: there is nothing to weigh, and `evenWeights(0)` is an empty list.
 */
async function reweigh(roleId: string, pillar: Pillar) {
  const rows = (await db.select().from(schema.criteria)
    .where(and(eq(schema.criteria.roleId, roleId), eq(schema.criteria.active, true))))
    .filter(c => c.pillar === pillar)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const shares = evenWeights(rows.length);
  for (let i = 0; i < rows.length; i++) {
    await db.update(schema.criteria).set({ weight: shares[i] }).where(eq(schema.criteria.id, rows[i].id));
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Teams
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Add a team under a role: several people, pooled, with one shared scorecard between them.
 *
 * Design 15's team layer. It is a role with `isTeam` set — see the note on the column — so
 * everything that already knows how to lay out, score and report a role knows how to do it to a
 * team, and nothing had to learn a second kind of node.
 *
 * No training path is installed. `installTraining` gives a ROLE its curriculum, and a team is not a
 * person: the people in it each carry their own training through their own placement, which is the
 * arrangement the training record has had since it was built.
 */
export async function addTeam(formData: FormData) {
  const user = await editor();
  const parentId = String(formData.get('parentId') ?? '');
  const name = teamName(String(formData.get('name') ?? ''));

  const scope = await getScope(user);
  if (!scope.canShapeChart(parentId)) outside(scope, user.access);

  const [parent] = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.id, parentId), eq(schema.roles.tenantId, user.tenantId)));
  if (!parent) refuse('That role is not in this business.');

  const allowed = mayHoldTeam(parent);
  if (!allowed.ok) refuse(allowed.reason);

  const id = randomUUID();
  await db.insert(schema.roles).values({
    id, tenantId: user.tenantId, title: name, stream: parent.stream,
    // Everybody in a team is on a team seat, and `staff` is the level that means exactly that.
    level: 'staff', defaultAccess: 'readonly',
    reportsToRoleId: parentId, isTeam: true, sortOrder: 99,
  });

  /*
    The one team action that DOES navigate, because it has to: the browser cannot know the id of a
    team that did not exist a moment ago. `#chart` is the anchor on the canvas, so it lands on the
    new crew rather than at the top of the page with the thing it just made off screen.
  */
  revalidatePath('/org');
  redirect(`/org?team=${encodeURIComponent(id)}#chart`);
}

/**
 * Put somebody in a team.
 *
 * A staff row and an open assignment — the same two writes as pencilling a name onto any card, and
 * free and silent for the same reason: nobody is emailed and nothing bills until somebody is
 * deliberately invited from People.
 *
 * `role_assignments` has never had a uniqueness constraint on `role_id`, which is what makes a
 * pooled team possible at all without a new table.
 */
export async function addTeamMember(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const typed = String(formData.get('name') ?? '');

  const scope = await getScope(user);
  if (!scope.canShapeChart(roleId)) outside(scope, user.access);

  const [team] = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  if (!team) refuse('That team is not in this business.');
  if (!team.isTeam) refuse('That is a role, not a team. Type the name onto the card instead.');

  const here = await membersOf(roleId, user.tenantId);
  const added = addMember(typed, here.map(m => m.name));
  if (!added.ok) refuse(added.reason);

  /*
    Reuse a name already in the directory rather than creating a second row for the same person —
    two "Dave Morgan"s is how a business ends up with one person's training record split down the
    middle. The same rule, and the same reasoning, as `renamePerson`.
  */
  const existing = (await db.select().from(schema.staff).where(eq(schema.staff.tenantId, user.tenantId)))
    .find(s => s.name.trim().toLowerCase() === added.text.toLowerCase());

  if (existing) {
    const [held] = await db.select().from(schema.roleAssignments)
      .where(and(eq(schema.roleAssignments.staffId, existing.id), isNull(schema.roleAssignments.toDate)));
    if (held) refuse(`${existing.name} already holds another role. Move them from People, so SPEC can ask whether that is a move or a second seat.`);
  }

  const staffId = existing?.id ?? randomUUID();
  if (!existing) {
    await db.insert(schema.staff).values({
      id: staffId, tenantId: user.tenantId, name: added.text, userId: null,
      createdAt: new Date().toISOString(),
    });
  }
  await db.insert(schema.roleAssignments).values({
    id: randomUUID(), roleId, staffId, fromDate: new Date().toISOString().slice(0, 10),
  });

  /*
    No redirect: the team layer is open, and a navigation would close it and drop the page to the
    top. The name appearing in the grid is the confirmation. Same reasoning as `addRoleKpi`.
  */
  revalidatePath('/org');
  revalidatePath('/people');
}

/**
 * Take somebody out of a team.
 *
 * The assignment is CLOSED, not deleted, so the chart can still answer who was in this crew in
 * March — which is the whole reason placements have a `toDate` rather than being removed.
 */
export async function removeTeamMember(formData: FormData) {
  const user = await editor();
  const assignmentId = String(formData.get('assignmentId') ?? '');

  const [row] = await db.select({
    id: schema.roleAssignments.id, roleId: schema.roleAssignments.roleId,
  })
    .from(schema.roleAssignments)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.roleAssignments.roleId))
    .where(and(
      eq(schema.roleAssignments.id, assignmentId),
      eq(schema.roles.tenantId, user.tenantId),
      isNull(schema.roleAssignments.toDate),
    ));
  if (!row) refuse('That placement is not in this business, or has already ended.');

  const scope = await getScope(user);
  if (!scope.canShapeChart(row.roleId)) outside(scope, user.access);

  await db.update(schema.roleAssignments)
    .set({ toDate: new Date().toISOString().slice(0, 10) })
    .where(eq(schema.roleAssignments.id, row.id));

  revalidatePath('/org');
  revalidatePath('/people');
}

/** Everybody currently in a team, with the placement id so one of them can be taken out again. */
async function membersOf(roleId: string, tenantId: string) {
  const open = await db.select().from(schema.roleAssignments)
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  if (!open.length) return [];

  const staff = await db.select().from(schema.staff).where(eq(schema.staff.tenantId, tenantId));
  const users = await db.select().from(schema.users).where(eq(schema.users.tenantId, tenantId));
  const staffName = new Map(staff.map(s => [s.id, s.name]));
  const userName = new Map(users.map(u => [u.id, u.name]));

  return open.map(a => ({
    id: a.id,
    name: (a.userId ? userName.get(a.userId) : null) ?? (a.staffId ? staffName.get(a.staffId) : null) ?? 'Somebody',
    /** True when they have a login, which is what makes the seat billable. */
    hasAccount: Boolean(a.userId),
  }));
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
