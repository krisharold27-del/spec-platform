import './globals.css';
export const metadata = { title: 'SPEC', description: 'Safety, People, Earnings, Compliance' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en-AU"><body>{children}</body></html>;
}
