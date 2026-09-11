import './globals.css';
import { Caprasimo, Figtree } from 'next/font/google';

/**
 * Organic's two voices: Caprasimo as the display face over Figtree for everything else. Loaded
 * through next/font so they are self-hosted and there is no render-blocking request to Google.
 * The CSS variables are what tailwind.config.ts's `serif` and `sans` families point at.
 */
const heading = Caprasimo({ subsets: ['latin'], weight: '400', variable: '--font-heading', display: 'swap' });
const body = Figtree({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-body', display: 'swap' });

export const metadata = { title: 'SPEC', description: 'Safety, People, Earnings, Compliance' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${heading.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
