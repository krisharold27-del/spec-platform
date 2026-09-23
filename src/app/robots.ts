import type { MetadataRoute } from 'next';
import { HOME_HOST } from '@/lib/home-address';

/**
 * Anything may be read; the sitemap is at the one home.
 *
 * Nothing private is hidden by this file — a page behind sign-in is protected by sign-in, never by
 * asking a crawler politely. `/api` is the one thing excluded, because it is machinery, not a page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: `https://${HOME_HOST}/sitemap.xml`,
    host: `https://${HOME_HOST}`,
  };
}
