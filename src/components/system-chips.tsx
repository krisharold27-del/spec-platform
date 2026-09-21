'use client';

import { COMMON_SYSTEMS } from '@/lib/systems';

/**
 * A starting point, not a dropdown.
 *
 * Same mechanic as `ExampleChips`: it fills the name field and does nothing else — no submit, no
 * category chosen on somebody's behalf. `fileUnder`/`guessCategory` still decide what the system is
 * FOR once it is typed, exactly as if the person had typed it themselves. A business running
 * something not listed here just types it — the box was always the real answer, this is a shortcut
 * to it for the systems people ask for most.
 */
export function SystemChips({ target }: { target: string }) {
  function use(name: string) {
    const box = document.getElementById(target) as HTMLInputElement | null;
    if (!box) return;
    box.value = name;
    box.focus();
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {COMMON_SYSTEMS.map(name => (
        <button key={name} type="button" className="chip" onClick={() => use(name)}>{name}</button>
      ))}
    </div>
  );
}
