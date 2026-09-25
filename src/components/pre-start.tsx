import { CHECKS, WHY_IT_LOCKS, type PreStart } from '@/lib/prestart';

/**
 * The pre-start, on a phone, before anything else.
 *
 * Four questions, two taps each, and it is deliberately the whole screen rather than a card above
 * the jobs. A gate drawn next to the thing it gates is a gate people scroll past — and this one has
 * to be done before the first job rather than at eleven o'clock from the seat of a moving vehicle.
 *
 * Sized for one hand: the touch targets are the full width of the column, because this is filled in
 * standing next to a ute at six in the morning, often in gloves.
 */
export function PreStartForm({
  preStart,
  action,
  day,
}: {
  preStart: PreStart | null;
  action: (fd: FormData) => Promise<void>;
  day: string;
}) {
  const marks = preStart?.marks ?? {};

  return (
    <div className="mx-auto grid max-w-md gap-5 px-4 py-6" data-prestart>
      <header className="grid gap-1">
        <span className="label-caps">Before the first job</span>
        <h1 className="font-serif text-3xl text-ink">Pre-start</h1>
        <p className="text-sm text-ink-light">
          Four things. Under a minute. Your jobs come up as soon as it is done.
        </p>
      </header>

      <form action={action} className="grid gap-4">
        <input type="hidden" name="day" value={day} />

        {CHECKS.map(c => (
          <fieldset key={c.key} className="grid gap-2 rounded-xl border border-sand-300 bg-white p-4" data-prestart-check={c.key}>
            <legend className="sr-only">{c.label}</legend>
            <div className="grid gap-0.5">
              <span className="font-serif text-lg text-ink">{c.label}</span>
              <span className="text-sm text-ink-light">{c.look}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/*
                Radios rather than a single tick box. A tick box has one unambiguous state and one
                that means either "no" or "I have not got to it yet" — and on a safety check those
                two must never look the same.
              */}
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-sand-300 px-3 py-3 text-sm font-semibold text-ink has-[:checked]:border-fern-600 has-[:checked]:bg-fern-50">
                <input type="radio" name={c.key} value="ok" defaultChecked={marks[c.key] === 'ok'} className="accent-fern-600" required />
                OK
              </label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-sand-300 px-3 py-3 text-sm font-semibold text-ink has-[:checked]:border-rust has-[:checked]:bg-rust-50">
                <input type="radio" name={c.key} value="not_ok" defaultChecked={marks[c.key] === 'not_ok'} className="accent-rust" />
                Not OK
              </label>
            </div>
          </fieldset>
        ))}

        <label className="grid gap-1.5">
          <span className="font-serif text-lg text-ink">Anything not OK?</span>
          <span className="text-sm text-ink-light">
            One line is enough. It goes on your supervisor's screen straight away, and they can usually sort it without ringing you.
          </span>
          <textarea
            name="note"
            rows={3}
            defaultValue={preStart?.note ?? ''}
            placeholder="Front left tyre is down to the wear bars."
            className="rounded-lg border border-sand-300 p-3 text-base text-ink"
          />
        </label>

        <button className="rounded-full bg-ink px-5 py-4 text-base font-semibold text-white">
          Done — open my day
        </button>
      </form>

      <p className="text-xs text-ink-light">{WHY_IT_LOCKS}</p>
    </div>
  );
}

/**
 * What a person sees when they have marked a fault and are waiting on a supervisor.
 *
 * Not a refusal screen. They did the right thing, they are still on the clock, and the message says
 * both — because if declaring a flat tyre felt like being punished, the next flat tyre would not
 * get declared and the check would become a button people press to make the screen go away.
 */
export function PreStartHeld({ says }: { says: string }) {
  return (
    <div className="mx-auto grid max-w-md gap-4 px-4 py-10" data-prestart-held>
      <span className="label-caps">Pre-start done</span>
      <h1 className="font-serif text-3xl text-ink">Hold on a moment</h1>
      <p className="text-base text-ink">{says}</p>
      <p className="text-sm text-ink-light">
        You did the right thing marking it. You are on the clock, and nothing here is on you.
      </p>
    </div>
  );
}
