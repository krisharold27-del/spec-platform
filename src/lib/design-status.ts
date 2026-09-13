import generated from '@/generated/design-status.json';

/**
 * The design-alignment answer, frozen into the build.
 *
 * Typed here rather than inferred from the JSON, and that is not tidiness. TypeScript reads the
 * FILE as it happens to be right now — so with no gaps in it, `gaps` infers as `never[]` and the
 * cockpit stops compiling the moment it tries to name one. The shape has to be declared, because
 * the data is the thing that changes.
 *
 * Written by scripts/design-status at build time. See that file for why it is a snapshot rather
 * than a live reading.
 */
export interface DesignStatus {
  /** When it was worked out — the build, never the page load. */
  at: string;
  /** Could the checks run at all? False means not measured, which is not the same as fine. */
  ran: boolean;
  phrases: { found: number; total: number; pct: number } | null;
  screens: number | null;
  /** Screens the designs link to that were never sent. Usually a rename rather than a loss. */
  missingScreens: number;
  gaps: { screen: string; missing: number }[];
}

export const designStatus = generated as DesignStatus;
