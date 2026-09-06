/** Renders the board output's markdown (either the deterministic template or Claude's rewrite of
 * it — both are generated server-side from our own prompt, never from arbitrary user input) to HTML. */
import { marked } from 'marked';

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}
