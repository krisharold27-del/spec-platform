import { doSignOut } from '../signin/actions';

/**
 * Kept for anybody who has this address bookmarked, or who is sent here by a link. The nav signs
 * out in one press; this page exists so that URL is never a dead end.
 */
export default function SignOutPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-serif text-2xl text-ink">Sign out of SPEC?</h1>
      <p className="mt-2 text-sm text-ink-light">Nothing is lost — everything is waiting when you come back.</p>
      <form action={doSignOut} className="mt-6 flex flex-wrap gap-3">
        <button className="rounded-full bg-rust px-5 py-2 text-cream hover:bg-rust-600">Sign out</button>
        <a href="/today" className="rounded-full border border-ink/15 px-5 py-2 text-ink hover:border-ink/30">Stay signed in</a>
      </form>
    </main>
  );
}
