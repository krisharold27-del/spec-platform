'use client';

import { useState } from 'react';
import { SubmitButton } from '@/components/submit-button';
import { setCurriculum } from '@/app/training/actions';
import type { TrainingModule } from '@/lib/training';
import { PILLAR_META } from '@/lib/pillars';

/**
 * Choosing what a role has to complete.
 *
 * The path belongs to the ROLE. Whoever holds it inherits it, and a role may require training with
 * nobody in it — so this screen never mentions a person.
 *
 * Core modules are shown ticked and fixed. They are what every role starts with, and a business
 * that can remove them can end up with somebody scoring a month having never been told how scoring
 * works.
 */
export function CurriculumEditor({ catalogue, roles }: {
  catalogue: TrainingModule[];
  roles: { roleId: string; title: string; moduleIds: string[] }[];
}) {
  const [open, setOpen] = useState(roles[0]?.roleId ?? '');
  const role = roles.find(r => r.roleId === open) ?? roles[0];
  if (!role) return null;

  const assigned = new Set(role.moduleIds);

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        {roles.map(r => (
          <button
            key={r.roleId}
            type="button"
            onClick={() => setOpen(r.roleId)}
            aria-pressed={r.roleId === role.roleId}
            className={`rounded-full px-4 py-2 text-sm transition-colors ${
              r.roleId === role.roleId ? 'bg-rust text-cream' : 'bg-surface text-ink hover:bg-cream'
            }`}
          >
            {r.title}
            <span className="ml-2 text-xs opacity-70">{r.moduleIds.length}</span>
          </button>
        ))}
      </div>

      <form key={role.roleId} action={setCurriculum} className="mt-4">
        <input type="hidden" name="roleId" value={role.roleId} />
        <ul className="grid gap-2">
          {catalogue.map(m => {
            const on = assigned.has(m.id) || m.core;
            return (
              <li key={m.id}>
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors ${on ? 'bg-cream' : 'bg-surface hover:bg-cream'}`}>
                  <input
                    type="checkbox"
                    name="moduleId"
                    value={m.id}
                    defaultChecked={on}
                    disabled={m.core}
                    className="mt-1 accent-rust"
                  />
                  {/* A disabled checkbox posts nothing, so a core module rides along in its own field. */}
                  {m.core && <input type="hidden" name="moduleId" value={m.id} />}
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="font-serif text-base text-ink">{m.title}</span>
                      <span className="label-caps">
                        {m.pillar === 'all' ? 'Every pillar' : PILLAR_META[m.pillar].name}
                      </span>
                      {m.core && <span className="pill pill-neutral">Core</span>}
                    </span>
                    <span className="mt-1 block text-xs text-ink-light">{m.summary}</span>
                    <span className="mt-0.5 block text-xs text-ink-light">
                      {m.minutes} min{m.core && ' · every role starts here, and it cannot be removed'}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <SubmitButton className="btn-primary mt-4 justify-self-start" pending="Saving…">
          Save the path for {role.title}
        </SubmitButton>
      </form>
    </>
  );
}
