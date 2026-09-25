'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { assertWritable } from '@/lib/plan';
import { getScope } from '@/lib/scope';
import { refuseTo } from '@/lib/refuse';
import { readLedgerFile, mergeFigures } from '@/lib/financials';

const MAX_BYTES = 2_000_000;

/**
 * An exported report from the business's own accounting system, saved as CSV. One or two
 * files (a Profit and Loss and a Balance Sheet); only the figures are kept, never the file.
 *
 * The books are an administrator's to put in, the same people who connect the accounting system.
 */
export async function uploadLedgerFile(formData: FormData) {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  if (!(await getScope(user)).canAdminister) {
    refuseTo('/financials', 'Putting the books in is for an administrator of this business.');
  }

  const files = formData.getAll('file').filter((f): f is File => typeof f === 'object' && f !== null && 'text' in f && f.size > 0);
  if (!files.length) refuseTo('/financials', 'Choose the file you exported from your accounting system.');
  if (files.some(f => f.size > MAX_BYTES)) refuseTo('/financials', 'That file is bigger than a report should be. Export the Profit and Loss or Balance Sheet on its own.');

  const reads = await Promise.all(files.slice(0, 3).map(async f => readLedgerFile(await f.text())));
  const figures = mergeFigures(...reads.map(r => r.figures));
  if (!reads.some(r => r.found.length)) {
    refuseTo('/financials', 'SPEC could not find cash, profit, GST, wages or what is owed in that file. Export the Profit and Loss or Balance Sheet from your accounting system and save it as CSV.');
  }

  await db.insert(schema.ledgerUploads).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    fileName: files.map(f => f.name).join(', ').slice(0, 200),
    figures: JSON.stringify(figures),
    uploadedBy: user.name,
    createdAt: new Date().toISOString(),
  });
  revalidatePath('/financials');
  redirect('/financials?read=1');
}
