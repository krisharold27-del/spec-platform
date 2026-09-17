import Link from 'next/link';
import { Footer } from '@/components/ui';
import { HELP, findAnswers, type Answer } from '@/lib/help';

/**
 * Help — the questions people ask, answered.
 *
 * ── Signed out on purpose ────────────────────────────────────────────────────────────────────────
 *
 * This page requires no account, and that is the single most important thing about it. The person
 * who most needs help is the one who cannot get in: put the answers behind the sign-in and the four
 * questions about signing in become unreachable by exactly the people asking them.
 *
 * It also means nothing here may be specific to one business. Every answer is about how SPEC works,
 * never about what is in anybody's data.
 *
 * ── Why it is one page and not a search box ──────────────────────────────────────────────────────
 *
 * There is a search, because somebody who knows their question wants to type it. But everything is
 * on the page underneath, open, so somebody who does NOT know how to phrase it can read down the
 * headings and find themselves. A search box with nothing beneath it answers only the people who
 * already knew what to call the thing.
 */

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Help — SPEC',
  description: 'The questions people ask about SPEC, and a straight answer to each one.',
};

function AnswerBlock({ a }: { a: Answer }) {
  return (
    <div className="border-t border-ink/10 py-5">
      <h3 className="font-serif text-lg text-ink">{a.ask}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-light">{a.say}</p>
      {a.go && (
        <p className="mt-3 text-sm">
          <Link href={a.go.href} className="font-semibold text-rust hover:underline">
            {a.go.label} →
          </Link>
          {a.press && (
            <span className="text-ink-light">
              {'  '}then press <span className="font-semibold text-ink">{a.press}</span>
            </span>
          )}
        </p>
      )}
      {a.cannot && (
        <p className="mt-2 text-xs uppercase tracking-wide text-ink-light/70">
          There is no button for this, and that is deliberate
        </p>
      )}
    </div>
  );
}

export default async function Help({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const query = (sp.q ?? '').slice(0, 120);
  const found = query ? findAnswers(query) : [];

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="label-caps">SPEC</div>
      <h1 className="mt-1 font-serif text-3xl text-ink">Help</h1>
      <p className="mt-3 text-ink-light">
        The questions people actually ask. If yours is not here, write to us and a real person answers.
      </p>

      <form action="/help" className="mt-6 flex gap-2">
        <input
          name="q"
          defaultValue={query}
          maxLength={120}
          placeholder="What are you stuck on?"
          aria-label="What are you stuck on?"
          className="w-full rounded border px-3 py-2.5"
        />
        <button type="submit" className="shrink-0 rounded-md bg-rust px-4 py-2.5 text-sm font-semibold text-cream hover:bg-rust-600">
          Search
        </button>
      </form>

      {query && (
        <section className="mt-8">
          <h2 className="label-caps">
            {found.length ? `${found.length} answer${found.length === 1 ? '' : 's'} for “${query}”` : `Nothing matched “${query}”`}
          </h2>
          {found.length ? (
            found.map(a => <AnswerBlock key={a.ask} a={a} />)
          ) : (
            /*
              A search that finds nothing is the moment somebody gives up. So it never ends there:
              everything is still below, and the way to reach a person is right here.
            */
            <p className="mt-3 text-sm text-ink-light">
              Read down the headings below — it may be worded differently. Or{' '}
              <a href="mailto:manager@specbizhq.com?subject=SPEC%20help" className="font-semibold text-rust hover:underline">
                write to us
              </a>{' '}
              and say what you were trying to do.
            </p>
          )}
        </section>
      )}

      {HELP.map(group => (
        <section key={group.title} className="mt-12">
          <h2 className="font-serif text-xl text-ink">{group.title}</h2>
          <p className="mt-1 text-sm text-ink-light/80">{group.note}</p>
          <div className="mt-4">
            {group.answers.map(a => <AnswerBlock key={a.ask} a={a} />)}
          </div>
        </section>
      ))}

      <section className="mt-12 rounded-lg bg-cream p-5">
        <h2 className="font-serif text-lg text-ink">Still stuck</h2>
        <p className="mt-2 text-sm text-ink-light">
          Write to{' '}
          <a href="mailto:manager@specbizhq.com?subject=SPEC%20help" className="font-semibold text-rust hover:underline">
            manager@specbizhq.com
          </a>{' '}
          and say what you were trying to do and what happened instead. If a page gave you a reference
          number, send that too — it points straight at what went wrong.
        </p>
      </section>

      <p className="mt-10 text-sm">
        <Link href="/signin" className="text-rust hover:underline">Sign in</Link>
        <span className="text-ink-light/50"> · </span>
        <Link href="/status" className="text-rust hover:underline">Check whether SPEC is working</Link>
      </p>

      <Footer />
    </main>
  );
}
