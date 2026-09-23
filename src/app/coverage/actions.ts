'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/guard';
import { assertWritable } from '@/lib/plan';
import { setCoverage } from '@/lib/coverage-data';
import { AREAS, CAPABILITIES, capabilitiesIn, isRunner, type AreaKey } from '@/lib/coverage';

/**
 * The one write on Coverage: who runs a capability, or a whole area.
 *
 * The same gate as Jobs and Safety — a manager, in a business that can be written to. Anybody else
 * sees the map read-only. Everything from the form is checked against `lib/coverage` before it is
 * written; an unknown capability or area changes nothing.
 */
export async function chooseRunner(formData: FormData) {
  const user = await requireManager();
  await assertWritable(user.tenantId);

  const runner = String(formData.get('runner') ?? '');
  const area = String(formData.get('area') ?? '');
  const capability = String(formData.get('capability') ?? '');
  if (!isRunner(runner)) redirect('/coverage');

  const keys = AREAS.some(a => a.key === area)
    ? capabilitiesIn(area as AreaKey).map(c => c.key)
    : CAPABILITIES.some(c => c.key === capability) ? [capability] : [];
  if (keys.length) await setCoverage(user.tenantId, keys, runner, user.name);

  for (const path of ['/coverage', '/jobs', '/safety', '/people', '/crm', '/my-page']) revalidatePath(path);
  redirect(area ? `/coverage#${area}` : capability ? `/coverage#cap-${capability}` : '/coverage');
}
