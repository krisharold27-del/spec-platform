'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { kindOf, stepStateOf } from '@/lib/boards-live';
import { createBoard, commentOnBoard, addKpiToBoard, removeKpiFromBoard, moveStep, addStep, getBoard, reviseBoard, versionsOf } from '@/lib/boards-live-data';
import { getScope } from '@/lib/scope';
import { readTitle } from '@/lib/mirror-rules';
import { refuseTo } from '@/lib/refuse';
import { CLAUDE_MODEL, anthropicHeaders } from '@/lib/claude';
import {
  starter, readDraft, systemPrompt, MIN_ASK,
  revisePrompt, currentAsText, dropped, THIS_REMOVED,
} from '@/lib/mirror-maker';

/**
 * Starting a board, and saying something on one.
 *
 * Open to everybody with a seat, deliberately. A board is the thing a team makes together, and the
 * person who knows the rate is wrong is usually not the person who would be allowed to change it —
 * the same asymmetry the intake box exists for. `assertWritable` still applies, so a visitor looking
 * around writes nothing and a business whose payment failed is read-only.
 */

export async function newBoard(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  /*
    ── A mirror is made to the same rules as an artifact ──────────────────────────────────────────

    Kris, 19 September: *"exactly same as an artifact - bring the same rules claude has for
    generating an artiifact"*.

    The first of those rules is that the title is a NAME and not a name with an explainer stuck on
    the end of it. Almost nobody types it that way — both of SPEC's own worked examples were
    "King of the Mountain — Solar Fix Plan" — so `readTitle` splits rather than refuses, and the
    explainer becomes the line under the name instead of being thrown away.

    What it refuses is the part it cannot decide: a name still too long after the split, and a
    mirror with no line under it at all. Cutting somebody's words to fit would be the quiet kind of
    damage, and writing the line for them would put SPEC's sentence under their name.
  */
  const read = readTitle(String(form.get('title') ?? ''), String(form.get('summary') ?? ''));
  if (read.fault) {
    // Their words go back with them. A form that clears itself on a refusal is a form nobody
    // corrects twice — they retype it differently and the rule teaches nothing.
    const kept = new URLSearchParams({
      needs: read.fault.field,
      said: read.fault.said,
      title: String(form.get('title') ?? ''),
      summary: String(form.get('summary') ?? ''),
      kind: String(form.get('kind') ?? ''),
    });
    redirect(`/mirrors?${kept.toString()}`);
  }

  const id = await createBoard({
    tenantId: user.tenantId,
    title: read.name,
    kind: kindOf(String(form.get('kind') ?? '')),
    summary: read.description,
    createdBy: user.name,
  });
  revalidatePath('/mirrors');
  redirect(`/mirrors?board=${id}`);
}

export async function sayOnBoard(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const boardId = String(form.get('boardId') ?? '');
  const text = String(form.get('text') ?? '').trim();
  if (!boardId || !text) redirect(boardId ? `/mirrors?board=${boardId}` : '/mirrors');

  await commentOnBoard({ tenantId: user.tenantId, boardId, authorName: user.name, text });
  revalidatePath('/mirrors');
  redirect(`/mirrors?board=${boardId}`);
}

/**
 * Put one of the business's KPIs onto a mirror, or take it off again.
 *
 * ── Why a KPI on a mirror is a pointer and not a number ──────────────────────────────────────────
 *
 * Kris, 19 September: mirrors should work *"same as Artifacts in claude"* — live, not a printout —
 * and *"align to key kpi's in the business"*.
 *
 * So this stores the criterion, not its value. Every open reads it again for whatever month is
 * being looked at, which is what makes changing the month on a mirror mean something and what stops
 * a mirror ever disagreeing with the scorecard it is about.
 *
 * ── Who may ─────────────────────────────────────────────────────────────────────────────────────
 *
 * The role has to be inside the viewer's own part of the chart, checked with the same `canSee` the
 * scorecards use. A mirror is a conversation object that people share, and without this it would be
 * a way to publish somebody else's numbers to a room they never agreed to be in.
 */
export async function putKpiOnBoard(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const boardId = String(form.get('boardId') ?? '');
  /*
    One control, two facts.

    The picker is a single select, and a measure is only meaningful with the role it belongs to —
    so the option carries both, joined. Neither is trusted: the action checks the role is in this
    viewer's scope, and the write checks the criterion really belongs to that role in this business.
  */
  const [criterionId = '', roleId = ''] = String(form.get('criterionId') ?? '').split('|');
  const back = `/mirrors?board=${encodeURIComponent(boardId)}`;
  if (!boardId || !criterionId || !roleId) redirect(back);

  const scope = await getScope(user);
  if (!scope.canSee(roleId)) {
    refuseTo(back, 'That measure belongs to a part of the chart you cannot see, so SPEC will not put it on a mirror.');
  }

  const { added } = await addKpiToBoard({ tenantId: user.tenantId, boardId, criterionId, roleId });
  revalidatePath('/mirrors');
  if (!added) refuseTo(back, 'That measure is already on this mirror.');
  redirect(back);
}

export async function takeKpiOffBoard(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const boardId = String(form.get('boardId') ?? '');
  const criterionId = String(form.get('criterionId') ?? '');
  if (!boardId || !criterionId) redirect('/mirrors');

  // Only what the mirror SHOWS is changed. The measure, its target and its history are untouched.
  await removeKpiFromBoard({ tenantId: user.tenantId, boardId, criterionId });
  revalidatePath('/mirrors');
  redirect(`/mirrors?board=${encodeURIComponent(boardId)}`);
}

/**
 * Moving a step on a plan, and adding one.
 *
 * Kris, 19 September: *"so the King of the Mountain mirror must be interactive"*. A plan a team is
 * looking at in a meeting could not be changed in that meeting — the states were on the screen in
 * words and the only way to move one was to edit a row of JSON.
 *
 * Open to anybody with a seat, like commenting, and for the same reason: the person who knows a
 * step is stuck is usually not the person allowed to change anything else about it. `assertWritable`
 * still applies, so a look-around writes nothing and a lapsed business is read-only.
 */
export async function moveStepOnBoard(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const boardId = String(form.get('boardId') ?? '');
  const text = String(form.get('text') ?? '');
  const back = `/mirrors?board=${encodeURIComponent(boardId)}`;
  if (!boardId || !text) redirect('/mirrors');

  await moveStep({
    tenantId: user.tenantId,
    boardId,
    text,
    state: stepStateOf(String(form.get('state') ?? '')),
  });
  revalidatePath('/mirrors');
  redirect(back);
}

export async function addStepToBoard(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const boardId = String(form.get('boardId') ?? '');
  const back = `/mirrors?board=${encodeURIComponent(boardId)}`;
  if (!boardId) redirect('/mirrors');

  const { added } = await addStep({
    tenantId: user.tenantId,
    boardId,
    text: String(form.get('text') ?? ''),
    // Whoever is adding it, unless they name somebody. A step with no owner is how a plan rots.
    owner: String(form.get('owner') ?? '') || user.name,
  });
  revalidatePath('/mirrors');
  if (!added) {
    refuseTo(back, 'That step needs some words, and cannot be one already on this plan.');
  }
  redirect(back);
}

/**
 * Ask for a mirror in plain words, and get a draft back.
 *
 * ── Kris, 26 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"have chat function at the top and then produce the mirrors - artifacts - then the staff have a
 * fabulous resource to help them be succesful."*
 *
 * The rules this works to are in lib/mirror-maker, next to the words the page says, so the promise
 * on screen and the behaviour cannot drift apart. Three of them matter here:
 *
 *   **It drafts, it never publishes.** The mirror lands unpinned with the request kept beside it as
 *   the first comment, so the next person can see what was actually asked for. Anybody reading it
 *   later can tell a drafted one from a written one, which matters when they decide whether to
 *   trust it.
 *
 *   **It never invents a figure.** `readDraft` strips percentages, money and rates out of whatever
 *   comes back, and the system prompt says so too — the strip is the net, not the plan. A mirror
 *   gets PINNED: an invented callback rate on a board is a lie the business will act on.
 *
 *   **No key is not a dead feature.** Without ANTHROPIC_API_KEY it saves `starter()`, which turns
 *   the request into a real first step rather than a confident-looking empty template. Every other
 *   Claude caller in this codebase degrades the same way and for the same reason.
 */
export async function askForMirror(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const ask = String(form.get('ask') ?? '').trim().replace(/\s+/g, ' ');
  if (ask.length < MIN_ASK) redirect(`/mirrors?short=1`);

  let draft = starter(ask);
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: anthropicHeaders(key),
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1200,
          system: systemPrompt(),
          messages: [{ role: 'user', content: ask }],
        }),
      });
      if (res.ok) {
        const body = await res.json() as { content?: { text?: string }[] };
        /* A shape that does not fit falls back to the starter rather than to an error page: a bad
           answer should cost one more press, not somebody's afternoon. */
        draft = readDraft(body.content?.[0]?.text ?? '') ?? draft;
      }
    } catch {
      /* Anthropic having a moment is not this business's problem to look at. The starter is real
         work, so the person gets something either way and nothing says the feature is broken. */
    }
  }

  const id = await createBoard({
    tenantId: user.tenantId,
    title: draft.title,
    kind: draft.kind,
    summary: draft.summary,
    body: draft.body,
    createdBy: user.id,
  });
  for (const step of draft.steps) {
    await addStep({ boardId: id, tenantId: user.tenantId, text: step.text, owner: step.owner });
  }
  /*
    The request, kept on the mirror itself.

    Six weeks later somebody reads a pinned checklist and wants to know where it came from. "Asked
    for by name, in these words, on this date" is the answer, and it lives next to the thing rather
    than in a log nobody opens.
  */
  await commentOnBoard({
    boardId: id,
    tenantId: user.tenantId,
    authorName: user.name ?? 'Somebody',
    text: `Drafted from: "${ask}"`,
  });

  revalidatePath('/mirrors');
  redirect(`/mirrors?board=${id}&drafted=1`);
}

/**
 * Change a mirror by saying what to change — the going back and forth that makes it an artifact.
 *
 * Kris, 26 September: mirrors are to be *"exactly the same as artifacts"*. An artifact is argued
 * into shape, not written once. The rules are in lib/mirror-maker; two things happen here that the
 * drafting action does not need:
 *
 *   **The whole current mirror goes with the request.** Asked to "make it shorter" with nothing
 *   attached, a model writes a new one from nothing and the business loses what it had written.
 *
 *   **What disappeared is named, before anybody accepts it.** A rewrite regenerates the list, and a
 *   step can fail to come back with nothing having decided to remove it — the new version reads
 *   perfectly. `boardVersions` means it can be undone; `dropped()` means somebody is TOLD. A
 *   backstop nobody knows they need is not much use at four on a Friday.
 */
export async function reviseMirror(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const boardId = String(form.get('boardId') ?? '');
  const ask = String(form.get('ask') ?? '').trim().replace(/\s+/g, ' ');
  if (!boardId) redirect('/mirrors');
  if (ask.length < MIN_ASK) redirect(`/mirrors?board=${boardId}&short=1`);

  const board = await getBoard(user.tenantId, boardId);
  if (!board) redirect('/mirrors');

  const was = board.steps.map(s => ({ text: s.text, owner: s.owner }));
  let next: { title: string; summary: string; body: string; steps: { text: string; owner: string; state: 'todo' }[] } | null = null;

  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: anthropicHeaders(key),
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1400,
          system: revisePrompt(),
          messages: [{ role: 'user', content: currentAsText({ title: board.title, summary: board.summary, body: board.body, steps: was }, ask) }],
        }),
      });
      if (res.ok) {
        const body = await res.json() as { content?: { text?: string }[] };
        next = readDraft(body.content?.[0]?.text ?? '');
      }
    } catch {
      /* Anthropic having a moment must not look like this business's fault, and must not half-apply
         a change. Nothing moves and the mirror is exactly as it was. */
    }
  }

  if (!next) redirect(`/mirrors?board=${boardId}&nochange=1`);

  await reviseBoard({
    tenantId: user.tenantId,
    boardId,
    title: next.title,
    summary: next.summary,
    body: next.body,
    steps: next.steps,
    askedFor: ask,
    changedBy: user.id,
  });

  /*
    The request and what it cost, on the mirror itself. Somebody reading it in six weeks can see
    what was asked for and what went — next to the thing, not in a log nobody opens.
  */
  const gone = dropped(was, next.steps);
  await commentOnBoard({
    boardId,
    tenantId: user.tenantId,
    authorName: user.name ?? 'Somebody',
    text: gone.length
      ? `Changed: "${ask}". ${THIS_REMOVED} ${gone.join('; ')}`
      : `Changed: "${ask}".`,
  });

  revalidatePath('/mirrors');
  redirect(`/mirrors?board=${boardId}${gone.length ? `&removed=${gone.length}` : '&changed=1'}`);
}

/**
 * Put a mirror back to what it was before the last change.
 *
 * The undo the version table exists for. It does not delete the version it is undoing — it writes
 * the current state as a version of its own and then restores. Going back is itself a change, and
 * a history that quietly drops the branch nobody liked is a history you cannot trust on the day it
 * matters.
 */
export async function undoLastChange(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const boardId = String(form.get('boardId') ?? '');
  if (!boardId) redirect('/mirrors');

  const [previous] = await versionsOf(user.tenantId, boardId);
  if (!previous) redirect(`/mirrors?board=${boardId}`);

  await reviseBoard({
    tenantId: user.tenantId,
    boardId,
    title: previous.title,
    summary: previous.summary,
    body: previous.body,
    steps: JSON.parse(previous.steps || '[]'),
    askedFor: 'Put back to how it was before the last change',
    changedBy: user.id,
  });

  revalidatePath('/mirrors');
  redirect(`/mirrors?board=${boardId}&undone=1`);
}
