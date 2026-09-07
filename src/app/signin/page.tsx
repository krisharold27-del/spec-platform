import { Footer } from '@/components/ui';
import { signIn } from './actions';
export default async function SignIn({ searchParams }: { searchParams: Promise<{ unknown?: string; exists?: string; sent?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="label-caps">SPEC</div>
      <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Sign in</h1>
      {sp.unknown && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">No account for that email. Ask your manager to assign you to a role, or <a className="underline" href="/signup">start a business</a>.</p>}
      {sp.exists && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">That email already has a role. Sign in instead.</p>}
      {sp.sent ? (
        <p className="mt-8 rounded-lg border bg-emerald-50 p-4 text-sm text-emerald-900">Check your email — we've sent a sign-in link. Click it to continue.</p>
      ) : (
        <form action={signIn} className="mt-8 space-y-4">
          <label className="block text-sm">Work email<input name="email" type="email" required className="mt-1 w-full rounded border px-3 py-2" /></label>
          <button className="btn-primary w-full py-2.5">Email me a sign-in link</button>
          <p className="text-center text-xs text-ink-light">No password needed — we'll email you a secure link. New here? <a href="/signup" className="underline">Start a business</a></p>
        </form>
      )}
      <Footer />
    </main>
  );
}
