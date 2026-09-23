/**
 * One home: www.sitevipapp.com.
 *
 * 23 September 2026 — Kris consolidated everything onto sitevipapp.com. The old addresses
 * (specbizhq.com, www.specbizhq.com, app.specbizhq.com) stay attached to the deployment and keep
 * answering, but every page request on them is sent, permanently, to the same path on the new home.
 *
 * Why this is done here and not as a Vercel domain redirect:
 *
 *   Stripe (and anything else that calls us machine-to-machine) does NOT follow redirects. A webhook
 *   registered against specbizhq.com that got a 308 would be recorded as a failure and, after a few
 *   days of retries, Stripe would stop sending — a paid customer would never be marked as paying.
 *   So `/api/*` is served in place on the old addresses, and only pages move.
 *
 * Pure: no I/O, so it is tested directly.
 */
export const HOME_HOST = 'www.sitevipapp.com';

/** Addresses that used to be home. Anything on these is redirected. */
const OLD_HOSTS = new Set(['specbizhq.com', 'www.specbizhq.com', 'app.specbizhq.com']);

/** The bare new domain goes to www too, in case the domain setting ever stops doing it. */
const ALSO_TO_HOME = new Set(['sitevipapp.com']);

/**
 * Where this request should go instead, or null to serve it where it is.
 *
 * Paths and query strings are kept exactly, so a bookmark, a sign-in link already sitting in an
 * inbox, or a return trip from a supplier's login all land on the same page at the new home.
 */
export function homeRedirect(host: string | null | undefined, pathname: string, search = ''): string | null {
  if (!host) return null;
  const name = host.replace(/:\d+$/, '').toLowerCase();
  if (!OLD_HOSTS.has(name) && !ALSO_TO_HOME.has(name)) return null;
  // Machines calling us are served in place — see above.
  if (pathname === '/api' || pathname.startsWith('/api/')) return null;
  return `https://${HOME_HOST}${pathname}${search}`;
}
