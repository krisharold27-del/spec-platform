import { signIn } from './actions';
export default async function SignIn({ searchParams }: { searchParams: Promise<{ unknown?: string; exists?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="text-sm font-semibold tracking-wide text-slate-500">SPEC</div>
      <h1 className="mt-1 text-2xl font-semibold">Sign in</h1>
      {sp.unknown && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">No account for that email. Ask your manager to assign you to a role, or <a className="underline" href="/signup">start a business</a>.</p>}
      {sp.exists && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">That email already has a role. Sign in instead.</p>}
      <form action={signIn} className="mt-8 space-y-4">
        <label className="block text-sm">Work email<input name="email" type="email" required className="mt-1 w-full rounded border px-3 py-2" /></label>
        <button className="w-full rounded-lg bg-slate-900 px-5 py-2.5 text-white hover:bg-slate-700">Sign in</button>
        <p className="text-center text-xs text-slate-500">Local demo: email only, no password. Production uses Supabase Auth. New here? <a href="/signup" className="underline">Start a business</a></p>
      </form>
    </main>
  );
}
