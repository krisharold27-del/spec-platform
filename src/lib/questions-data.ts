/**
 * Every route this application actually has.
 *
 * Read from the filesystem rather than from a list somebody maintains — the whole point of the
 * questions page is that it reports what is there rather than what a document says is there, and a
 * hand-kept list of routes would put the same fiction one layer down.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Walk `src/app` and collect every folder that has a page.
 *
 * Dynamic segments (`[token]`) are kept as their literal folder name and also as their parent, so
 * `/customer/[token]` makes `/customer` resolvable — which is right, because the design names the
 * customer page and the fact that it needs a token is not the owner's question.
 */
export function routesInApp(root = join(process.cwd(), 'src/app')): Set<string> {
  const found = new Set<string>();

  const walk = (dir: string, path: string) => {
    if (existsSync(join(dir, 'page.tsx')) || existsSync(join(dir, 'page.ts'))) {
      found.add(path === '' ? '/' : path);
    }
    let entries: string[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
    } catch {
      return;
    }
    for (const name of entries) {
      /* Route groups in brackets that are not dynamic segments do not appear in the address. */
      if (name.startsWith('@') || name === 'api') continue;
      const isDynamic = name.startsWith('[');
      const next = isDynamic ? path : `${path}/${name}`;
      walk(join(dir, name), next);
      if (isDynamic) found.add(path === '' ? '/' : path);
    }
  };

  walk(root, '');
  return found;
}
