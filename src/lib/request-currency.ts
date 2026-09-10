/**
 * The currency for the business in front of us, from where the request comes from. Server-only.
 *
 * Until the tenant carries its own region (BUILD_SPEC §1.1 `tenants.region`), the country the
 * hosting platform detects is the best available answer to "where is the business" — it is the
 * same signal checkout uses, so the price a leader reads is the price they are charged.
 */
import { headers } from 'next/headers';
import { currencyForCountry, type Currency } from './pricing';

export async function requestCurrency(): Promise<Currency> {
  return currencyForCountry((await headers()).get('x-vercel-ip-country'));
}
