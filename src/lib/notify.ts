/**
 * How loud SPEC is, chosen once.
 *
 * Notification settings usually arrive as a grid of twenty switches nobody reads, and the result is
 * that everything is on, everything is ignored, and the one message that mattered went the same way
 * as the other forty. So there is one choice with three positions, and it is about how much SPEC
 * interrupts, not about which of twenty event types it may mention.
 *
 * **One thing is not adjustable.** A hard gate — somebody hurt, or somebody not clear to work —
 * always goes immediately, at every setting. A business that can turn off being told about an
 * injury has bought the wrong product, and offering the switch at all would imply it was a
 * reasonable thing to want.
 *
 * What SPEC actually sends today is deliberately short, and the screen says so rather than implying
 * a stream of mail that does not exist. This setting governs what is added to it.
 */

export type NotifyLevel = 'quiet' | 'normal' | 'everything';

export const NOTIFY_LEVELS: { id: NotifyLevel; label: string; note: string }[] = [
  {
    id: 'quiet',
    label: 'Quiet',
    note: 'Only what is waiting on you personally, and only when the month is being closed.',
  },
  {
    id: 'normal',
    label: 'Normal',
    note: 'What is waiting on you, plus anything that has gone past its date. The default.',
  },
  {
    id: 'everything',
    label: 'Everything',
    note: 'Every decision made anywhere you can see, as it happens. Most people turn this off again.',
  },
];

export const DEFAULT_NOTIFY: NotifyLevel = 'normal';

/** Never adjustable, at any level. Stated on the screen so nobody goes looking for the switch. */
export const NOTIFY_ALWAYS =
  'Hard gates always notify immediately — somebody hurt, or somebody not clear to work. That one is not adjustable.';

/**
 * What SPEC sends today, in full.
 *
 * Kept beside the setting on purpose. A preferences screen that lists loudness levels for mail the
 * product does not send yet is a promise, and this product has made enough of those; naming the one
 * real message keeps the setting honest as the rest are built.
 */
export const NOTIFY_SENDS_TODAY = [
  'An invitation, when somebody is given a seat.',
];

export const notifyLevelOf = (stored: string | null | undefined): NotifyLevel =>
  NOTIFY_LEVELS.some(l => l.id === stored) ? (stored as NotifyLevel) : DEFAULT_NOTIFY;
