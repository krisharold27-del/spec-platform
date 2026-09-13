import type { MetadataRoute } from 'next';

/**
 * Makes SPEC installable, so somebody arriving at work opens it like any other application.
 *
 * `start_url` is Today rather than the front door: the person installing this has already signed
 * up, and landing them on a marketing page every morning would be a small daily insult. Somebody
 * not signed in is sent to sign-in by the page itself, which is the right order — the app opens
 * where the work is, and authentication is only mentioned when it is actually needed.
 *
 * `display: standalone` drops the browser chrome, which matters more than it sounds: a tab among
 * thirty tabs gets lost, and an icon on the dock gets opened.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SPEC — Safety, People, Earnings, Compliance',
    short_name: 'SPEC',
    description: 'Your whole business on one page.',
    start_url: '/my-page',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f5ead8',
    theme_color: '#1c1a19',
    icons: [
      { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/mascot.png', sizes: '960x960', type: 'image/png', purpose: 'any' },
    ],
  };
}
