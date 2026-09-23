import type { MetadataRoute } from 'next';
import { HOME_HOST } from '@/lib/home-address';

/**
 * The pages a stranger can reach, at the one home.
 *
 * `/` is siteVIP, the trades edition; `/spec` is SPEC's own front door. Everything else a stranger
 * can see hangs off one of those two.
 */
const PUBLIC_PATHS = ['/', '/spec', '/how', '/sectors', '/pricing', '/signup', '/signin', '/terms', '/privacy'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map(path => ({
    url: `https://${HOME_HOST}${path === '/' ? '' : path}`,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : path === '/spec' ? 0.9 : 0.6,
  }));
}
