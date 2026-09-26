import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  /*
    Understand the work (Design 20) sends job photos and plans to a server action. Photos are shrunk
    in the browser first (about 300 KB each); 4 MB stays under Vercel's 4.5 MB request ceiling with
    room for a set of photos and one plan.
  */
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
};
export default config;
