import type { Config } from 'tailwindcss';

/**
 * The Organic design system, as Tailwind's theme.
 *
 * This file is the token sheet: every colour, font and radius the app draws with comes from here,
 * so retuning the look is one edit rather than a sweep. Organic is warm and rounded — a cream and
 * sand ground, a terracotta accent, a sage second voice, Caprasimo display over Figtree.
 *
 * Values are literal hex rather than CSS variables on purpose: Tailwind can only compute the
 * opacity modifiers this app leans on (`border-ink/10`, `text-ink-light/70`) from a real colour.
 *
 * Each role carries a 100–900 ramp generated in OKLCH on one shared lightness scale, so the same
 * step of any ramp has the same visual weight. Light steps (100–300) for tinted fills and hovers,
 * 500 as the base, dark steps (700–900) for text on those fills and for pressed states. Reach for a
 * ramp step before an ad-hoc opacity.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * The four pillars. Retuned onto Organic's warm axis — terracotta, sage, ochre, mulberry —
         * so they stay four clearly different things without the cold blue and violet that used to
         * sit oddly on a cream page. All four are close in lightness: none of them shouts.
         */
        safety: '#b2622d',
        people: '#728157',
        earnings: '#a67c1a',
        compliance: '#7d5068',

        /** Terracotta — the accent. `rust` keeps its name so existing markup repaints untouched. */
        rust: {
          DEFAULT: '#c67139',
          dark: '#8c491a',
          light: '#f6a06b',
          100: '#fff2eb', 200: '#ffe1d0', 300: '#ffc6a5', 400: '#f6a06b', 500: '#d67f48',
          600: '#b2622d', 700: '#8c491a', 800: '#643312', 900: '#402310',
        },

        /** Sage — the second accent, a genuine second voice rather than a highlight. */
        sage: {
          DEFAULT: '#7a8a5e',
          100: '#f0fae1', 200: '#e1eecc', 300: '#ccdbb2', 400: '#aebf92', 500: '#8fa073',
          600: '#728157', 700: '#56633f', 800: '#3d472b', 900: '#272e1b',
        },

        /*
          ── The ground, inverted on 24 September ──────────────────────────────────────────────

          It used to run sandy page → darker sandy card → sandy inset, so a card was the darkest
          thing on the screen and everything sat under a wash of colour. Kris: *"the background must
          be white so it looks clean — the sandy colour is annoying to me."*

          It now runs the way the design's own latest pass runs it: a WHITE page, WHITE cards
          separated by a hairline warm ring rather than by a change of fill, and the sandy tone kept
          for things that are RECESSED — a nested block, an unselected pill, the fill behind an
          input. So the relationship inverts: an inset is now darker than the card it sits in,
          where before it dropped back to the page.

          That is why this is two token edits rather than a sweep of three hundred class names.
          Every `bg-cream` in the product is already an inset, a pill or an input fill, and every
          `bg-surface` is already a card. They keep their jobs; only the colours move.

          `cream` also does a second job — `text-cream` is the light ink on a dark or coloured fill,
          48 times over — which is why it stays warm rather than becoming white. White text on rust
          is a different look, and nobody asked for it.
        */
        cream: { DEFAULT: '#f4ede1', border: '#e0d3be' },
        surface: { DEFAULT: '#ffffff', raised: '#faf6f0' },

        ink: {
          DEFAULT: '#201e1d',
          light: '#645c50',
          100: '#f9f4ed', 200: '#eee7db', 300: '#dcd3c4', 400: '#c0b6a5', 500: '#a19786',
          600: '#82796a', 700: '#645c50', 800: '#474238', 900: '#2e2b25',
        },

        /**
         * Traffic lights, for the places SPEC reports a standing rather than a category: the four
         * lights on Today and the team dots beside them. Green and amber sit on the Organic axis;
         * `pending` is deliberately a warm neutral, never red — not-measured-yet is not doing-badly.
         */
        light: { green: '#4f7a3f', amber: '#c67139', red: '#a63b26', pending: '#8c8681' },
      },
      fontFamily: {
        /** `serif` is the display face throughout the app; the name predates Caprasimo. */
        serif: ['var(--font-heading)', 'Georgia', 'Cambria', 'serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      /** Over-round: containers at --radius-lg, small controls go pill via `rounded-full`. */
      borderRadius: { sm: '8px', DEFAULT: '16px', md: '16px', lg: '28px', xl: '32px' },
      boxShadow: {
        sm: '0 1px 2px color-mix(in srgb, #2e2b25 14%, transparent)',
        DEFAULT: '0 3px 10px color-mix(in srgb, #2e2b25 16%, transparent)',
        md: '0 3px 10px color-mix(in srgb, #2e2b25 16%, transparent)',
        lg: '0 12px 32px color-mix(in srgb, #2e2b25 22%, transparent)',
      },
    },
  },
  plugins: [],
} satisfies Config;
