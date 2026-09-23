import './globals.css';
import { Caprasimo, Figtree } from 'next/font/google';
import { HOME_HOST } from '@/lib/home-address';

/**
 * Organic's two voices: Caprasimo as the display face over Figtree for everything else. Loaded
 * through next/font so they are self-hosted and there is no render-blocking request to Google.
 * The CSS variables are what tailwind.config.ts's `serif` and `sans` families point at.
 */
const heading = Caprasimo({ subsets: ['latin'], weight: '400', variable: '--font-heading', display: 'swap' });
const body = Figtree({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-body', display: 'swap' });

export const metadata = {
  /*
    Every canonical and social address resolves against the one home, www.sitevipapp.com — never
    against whichever host happened to serve the request. The old addresses redirect there anyway
    (lib/home-address), and a canonical pointing at one of them would tell a search engine the
    opposite. Pages set their own `alternates.canonical` relative to this.
  */
  metadataBase: new URL(`https://${HOME_HOST}`),
  title: 'SPEC',
  description: 'Safety, People, Earnings, Compliance',
  // Installable, so it opens like an application rather than living in a tab among thirty tabs.
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'SPEC', statusBarStyle: 'default' as const },
};

export const viewport = { themeColor: '#1c1a19' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${heading.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
