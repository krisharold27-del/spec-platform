/**
 * Which address to send somebody back to.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 *
 * On 16 September the first real test payment worked: Stripe charged the card, the webhook landed,
 * and SPEC marked the business as paying. Then Checkout sent the customer to the wrong website.
 *
 * SPEC answers on more than one address — `www.specbizhq.com` and `app.specbizhq.com` are the same
 * product — but every link back from Stripe was built from APP_URL, a single fixed address. A person
 * who signed up on www was returned to app. A browser keeps its sign-in per address, so the return
 * trip landed them in whatever account app happened to be holding: a different business entirely,
 * shown a "payment received" banner, above a page that still said nothing had been charged.
 *
 * Nothing threw. Stripe was happy, the database was right, and the only thing wrong was the address
 * we chose to send them to.
 *
 * So: send people back to the address they came in on, and fall back to APP_URL when we cannot
 * trust it.
 *
 * ── Why the address is checked rather than believed ──────────────────────────────────────────────
 *
 * The Host header is written by whoever is making the request. Believing it without checking would
 * let somebody hand Stripe a return address pointing at a site they own. Vercel overwrites it with
 * the real one, so in production this is belt and braces — but the fallback is free, and a redirect
 * built from an unchecked header is the shape of a fault that is embarrassing to explain.
 *
 * The rule is deliberately narrow: our own domain, or a machine on this desk. Anything else is not
 * refused — it is quietly answered with APP_URL, which is exactly what the product did before and is
 * never wrong, only sometimes unhelpful.
 */
/**
 * The one configured address, and the answer whenever the address on the request cannot be used.
 *
 * It lives here rather than in lib/stripe because billing is not the only thing that has to build a
 * link back — sign-in emails and seat invitations do too, and none of them should have to load the
 * Stripe library to find out what SPEC is called.
 */
export function appUrl(): string {
  return process.env.APP_URL ?? 'http://localhost:3000';
}

/**
 * The part of an address that identifies us, from APP_URL.
 *
 *   app.specbizhq.com  ->  specbizhq.com    (so www.specbizhq.com is ours)
 *   specbizhq.com      ->  specbizhq.com
 *   app.specbiz.com.au ->  specbiz.com.au   (NOT com.au — see below)
 *
 * Only ever ONE label is dropped. Taking "the last two labels" is the obvious version and it is
 * wrong for Australia: an address ending .com.au would reduce to `com.au`, and every business in
 * the country would then count as us. SPEC is Australian. That version would have shipped.
 */
export function ourDomain(base = appUrl()): string | null {
  let host: string;
  try {
    host = new URL(base).hostname.toLowerCase();
  } catch {
    return null;
  }
  const labels = host.split('.');
  return labels.length > 2 ? labels.slice(1).join('.') : host;
}

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Is this an address SPEC is willing to send a customer back to? */
export function isOurs(host: string | null | undefined, base = appUrl()): boolean {
  if (!host) return false;
  // A header can carry anything. Ports are fine; a path, a space or a second host is not.
  if (!/^[a-z0-9.\-[\]:]+$/i.test(host)) return false;
  const name = host.replace(/:\d+$/, '').toLowerCase();
  if (LOCAL.has(name)) return true;
  const ours = ourDomain(base);
  if (!ours) return false;
  // The leading dot matters. Without it `evilspecbizhq.com` ends with `specbizhq.com` and passes.
  return name === ours || name.endsWith(`.${ours}`);
}

/**
 * The address this request actually arrived on, when we trust it — APP_URL when we do not.
 *
 * `x-forwarded-host` is what Vercel sets; `host` is what a plain Node server sees. Read in that
 * order because behind the proxy the second one is the proxy's own name.
 */
export function originFrom(h: Headers | { get(name: string): string | null }, base = appUrl()): string {
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!isOurs(host, base)) return base;
  const name = host!;
  const forwarded = h.get('x-forwarded-proto')?.split(',')[0]?.trim();
  // A bare hostname with a port is this desk; anything else is served over TLS.
  const proto = forwarded || (LOCAL.has(name.replace(/:\d+$/, '').toLowerCase()) ? 'http' : 'https');
  return `${proto}://${name}`;
}

/**
 * The same thing for a route handler or a server action, which has to await its headers.
 *
 * Some of this code also runs where there is no request at all — a seeding script, a test. There is
 * no address to read there, so it answers APP_URL rather than throwing: a link that goes to the one
 * configured address is the old behaviour, and the old behaviour was only ever unhelpful, never
 * broken.
 */
export async function currentOrigin(): Promise<string> {
  try {
    const { headers } = await import('next/headers');
    return originFrom(await headers());
  } catch {
    return appUrl();
  }
}
