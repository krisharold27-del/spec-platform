/**
 * Turning up and not being able to get in.
 *
 * ── The most common thing that wrecks a day ──────────────────────────────────────────────────────
 *
 * From the workflow map, 24 September: a crew is on the doorstep, nobody is home, and the job
 * cannot start. Every trade business has this happen weekly. Almost none of them count it, because
 * counting it means a phone call to the office and a note somebody types up later — so it becomes
 * an hour that quietly disappears into the day and is never seen again.
 *
 * What it actually costs: the travel there, the travel on, the gap in the run that nothing fills at
 * two hours' notice, and the job still to be done another day. It is close to a full charge-out
 * hour every time, and it is invisible.
 *
 * ── Why it must be one press ─────────────────────────────────────────────────────────────────────
 *
 * The person recording it is standing in a driveway in the rain with a phone in one hand. Anything
 * with more than one decision in it does not get done — and a record that only gets made on quiet
 * days is worse than none, because the number it produces says quiet days have the most no-access.
 *
 * So: one press records it, tells the customer, and puts the job back in the queue to rebook. The
 * reason is offered afterwards and is optional, because the fact it happened is the part that
 * matters and the reason is the part that stops it being pressed.
 *
 * ── The number worth having ──────────────────────────────────────────────────────────────────────
 *
 * Not the total. The total is a fact about the world. The number that changes a decision is WHICH
 * CUSTOMERS do it repeatedly — because that is a conversation, a deposit, or a different booking
 * arrangement, and it is impossible to have without a count.
 */

export interface NoAccess {
  id: string;
  jobId: string;
  jobRef: string;
  client: string;
  at: string;
  who: string;
  /** Optional, always. Asked after the fact is recorded, never before. */
  because: string | null;
}

/** Past this many in the window below, it is a pattern rather than bad luck. */
export const REPEAT_AT = 2;

/** How far back a pattern is read from. A year of history; anything older is a different business. */
export const LOOK_BACK_DAYS = 365;

export interface Repeater {
  client: string;
  times: number;
  lastAt: string;
  says: string;
}

/**
 * Customers who do this more than once.
 *
 * Ranked by how often, because the point is to have a conversation with the worst one — and a list
 * sorted by date puts whoever did it most recently at the top, which is almost never the same
 * person.
 */
export function repeaters(
  rows: readonly NoAccess[],
  at: Date = new Date(),
): Repeater[] {
  const since = at.getTime() - LOOK_BACK_DAYS * 86_400_000;
  const by = new Map<string, NoAccess[]>();
  for (const r of rows) {
    const when = Date.parse(r.at);
    if (!Number.isFinite(when) || when < since) continue;
    const key = r.client.trim();
    if (!key) continue;
    by.set(key, [...(by.get(key) ?? []), r]);
  }
  return [...by]
    .filter(([, rs]) => rs.length >= REPEAT_AT)
    .map(([client, rs]) => {
      const lastAt = rs.map(r => r.at).sort().at(-1)!;
      return {
        client,
        times: rs.length,
        lastAt,
        says: `${rs.length} times in the last year. Worth a different arrangement — a call the day before, a key, or a deposit — rather than another van sent to a locked door.`,
      };
    })
    .sort((a, b) => b.times - a.times);
}

export interface NoAccessCount {
  times: number;
  hours: number | null;
  says: string;
}

/**
 * What it has cost, said in hours unless the business has priced an hour.
 *
 * `hoursEach` is the business's own estimate of what one no-access costs in time — travel there,
 * travel on, and the hole in the run. SPEC does not invent it, for the same reason it invents no
 * lodgement window and no funding amount: a made-up number shown as a cost is a business making
 * decisions on arithmetic somebody else did in their head.
 */
export function noAccessCount(
  rows: readonly NoAccess[],
  hoursEach: number | null,
  at: Date = new Date(),
): NoAccessCount {
  const since = at.getTime() - LOOK_BACK_DAYS * 86_400_000;
  const times = rows.filter(r => {
    const when = Date.parse(r.at);
    return Number.isFinite(when) && when >= since;
  }).length;

  if (times === 0) return { times: 0, hours: null, says: 'Nobody has been locked out this year.' };
  const hours = hoursEach === null ? null : times * hoursEach;
  const base = `${times} ${times === 1 ? 'time' : 'times'} a crew turned up and could not get in this year`;
  return {
    times,
    hours,
    says: hours === null
      ? `${base}. Set what one costs you in hours and SPEC will total it.`
      : `${base} — about ${Math.round(hours)} hours of driving and waiting, paid for and earning nothing.`,
  };
}

/** What the customer is told, which is the half that stops it being an argument later. */
export function toldText(business: string, jobRef: string): string {
  return `We came out to ${jobRef} today and could not get access. No charge for the visit — call us back on a time that suits and we will rebook it. ${business}`;
}
