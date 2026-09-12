'use client';

/**
 * Two ways of saying the same problem.
 *
 * The box asks for something a person has been carrying for months, and the hardest part is the
 * first sentence: people either write a title ("staff turnover") or apologise for not writing it
 * properly. An example fixes that — but ONE example teaches the wrong lesson, because it looks like
 * a format to copy.
 *
 * So there are two, and they are deliberately the same problem told completely differently: one in
 * the flat words somebody uses when they have given up on it, one in the frustrated words they use
 * at the pub. Pressing both in turn shows the thing worth knowing before they type anything — that
 * SPEC is reading what happened, not matching the words they chose.
 *
 * It fills the box and does not submit. Nobody's first act on the page should be sending something
 * they did not write.
 */

const EXAMPLES = [
  'Our best apprentice just quit and it&rsquo;s the second one this year.',
  'We keep losing the good young blokes about eighteen months in — the third one now, and every time it lands back on the same two supervisors.',
];

const say = (s: string) => s.replace(/&rsquo;/g, '’');

export function ExampleChips({ target }: { target: string }) {
  function use(which: number) {
    const box = document.getElementById(target) as HTMLTextAreaElement | null;
    if (!box) return;
    box.value = say(EXAMPLES[which]);
    box.focus();
    // Fires so anything watching the field (validation, a character count) sees the change — a
    // value set from script does not raise one on its own.
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="chip" onClick={() => use(0)}>Try the example</button>
      <button type="button" className="chip" onClick={() => use(1)}>Try it rephrased</button>
    </div>
  );
}
