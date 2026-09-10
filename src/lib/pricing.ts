/**
 * Seat prices — decided per region, never converted (BUILD_SPEC §8.1). Pure, no I/O.
 *
 * Every published price reduces to 8. A price never moves because an exchange rate did; a new
 * region gets a round local number chosen to obey the rule and checked before it is published.
 * The business is billed in its own currency, set by where it is.
 */
export type Currency = 'aud' | 'nzd' | 'gbp' | 'eur' | 'usd' | 'cad';

export const SEAT_PRICES: Record<Currency, { seat: number; withTraining: number; symbol: string }> = {
  aud: { seat: 26, withTraining: 44, symbol: 'A$' },
  nzd: { seat: 35, withTraining: 53, symbol: 'NZ$' },
  gbp: { seat: 17, withTraining: 26, symbol: '£' },
  eur: { seat: 26, withTraining: 44, symbol: '€' },
  usd: { seat: 26, withTraining: 44, symbol: 'US$' },
  cad: { seat: 35, withTraining: 53, symbol: 'CA$' },
};

/** SPEC's home market — used when there is no way to tell where a business is. */
export const HOME_CURRENCY: Currency = 'aud';

const EURO_AREA = new Set(['AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES']);

/** From the country a business is in (ISO 3166 alpha-2). Anywhere without its own price pays in US dollars. */
export function currencyForCountry(country: string | null | undefined): Currency {
  const c = (country ?? '').trim().toUpperCase();
  if (!c) return HOME_CURRENCY;
  if (c === 'AU') return 'aud';
  if (c === 'NZ') return 'nzd';
  if (c === 'GB' || c === 'UK') return 'gbp';
  if (c === 'US') return 'usd';
  if (c === 'CA') return 'cad';
  if (EURO_AREA.has(c)) return 'eur';
  return 'usd';
}

/** Repeated digit sum: 26 → 8, 35 → 8, 1,700 → 8. */
export function digitRoot(n: number): number {
  let x = Math.abs(Math.round(n));
  while (x >= 10) x = String(x).split('').reduce((s, d) => s + Number(d), 0);
  return x;
}

export const seatLabel = (currency: Currency) => `${SEAT_PRICES[currency].symbol}${SEAT_PRICES[currency].seat}`;
export const moneyLabel = (currency: Currency, amount: number) => `${SEAT_PRICES[currency].symbol}${amount}`;
