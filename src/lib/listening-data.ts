import { randomUUID } from 'node:crypto';
import { desc } from 'drizzle-orm';
import { db, schema } from '@/db';
import { CLAUDE_MODEL, anthropicHeaders } from './claude';
import { cleanHeard, dueToListen } from './listening';

const SYSTEM = `You listen, for a small software company, to what tradespeople say in public about job-management software (for example simPRO, ServiceM8, Tradify, Fergus, AroFlo) and about "siteVIP".
Search public forums, review sites and community threads from the last few months.
Group what you find into at most five themes that keep coming up. For each, give what trades are actually saying, the public links it came from, and one small, quick fix a simple job app could make.
Reply with JSON only, no prose: {"themes":[{"theme":"...","heard":"...","sources":["https://..."],"fix":"..."}]}
Only include a theme you found real public sources for.`;

/** Whether this deployment can listen at all — asked here so no screen ever names the key. */
export const listeningOn = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

/**
 * Listen, once a night. Called after the five-minute ping has answered, so a slow search never
 * changes what the ping says about SiteVIP's own health. Does nothing without a key, and nothing if
 * it listened in the last twenty hours — checked against the newest run in the database, so two
 * instances cannot both decide they are first.
 */
export async function listenIfDue(): Promise<void> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return;
  const [last] = await db.select({ runAt: schema.listeningNotes.runAt }).from(schema.listeningNotes)
    .orderBy(desc(schema.listeningNotes.runAt)).limit(1);
  if (!dueToListen(last?.runAt)) return;

  const runAt = new Date().toISOString();
  /* A marker row first, so an instance that starts a moment later sees tonight's run and stands down. */
  const markerId = randomUUID();
  await db.insert(schema.listeningNotes).values({ id: markerId, runAt, theme: '', heard: '', sources: '[]', fix: '', state: 'run' });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: anthropicHeaders(key),
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        system: SYSTEM,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
        messages: [{ role: 'user', content: 'Listen for tonight, then reply with the JSON.' }],
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const said = (body.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('');
    const json = said.slice(said.indexOf('{'), said.lastIndexOf('}') + 1);
    if (!json) return;
    const heard = cleanHeard(JSON.parse(json));
    if (heard.length) {
      await db.insert(schema.listeningNotes).values(heard.map(h => ({
        id: randomUUID(), runAt, theme: h.theme, heard: h.heard, sources: JSON.stringify(h.sources), fix: h.fix, state: 'proposed',
      })));
    }
  } catch {
    /* The marker stays, so a failure waits for tomorrow rather than retrying every five minutes. */
  }
}
