'use client';
import { useState } from 'react';
import { PILLAR_META } from '@/lib/pillars';

/**
 * The front door's problem box.
 *
 * The whole landing page is this: a stranger types one ongoing problem, watches SPEC work out what
 * is actually underneath it, and is asked whether they would like it fixed. Nothing is claimed
 * before it is demonstrated — by the time they see a price they have already been told something
 * true about their own business.
 *
 * The flow is deliberately a conversation rather than a form. Each answer decides the next
 * question, and every branch ends somewhere honest, including the two that end without a customer.
 */

type Stage = 'asking' | 'read' | 'declined' | 'naming' | 'leader' | 'allocate' | 'handoff' | 'done';

interface Letter { letter: string; name: string; certainty: string }

interface Read {
  letters: Letter[];
  errorLine: string;
  solutionLine: string;
  fix: string[];
  noOwner: boolean;
  spent: boolean;
}

export function ProblemBox() {
  const [stage, setStage] = useState<Stage>('asking');
  const [problem, setProblem] = useState('');
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<Read | null>(null);
  const [failed, setFailed] = useState('');
  const [business, setBusiness] = useState('');

  async function read(event: React.FormEvent) {
    event.preventDefault();
    if (problem.trim().length < 8) return;
    setReading(true);
    setFailed('');
    try {
      const res = await fetch('/api/enquiry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ problem }),
      });
      if (!res.ok) throw new Error('no');
      setResult((await res.json()) as Read);
      setStage('read');
    } catch {
      // Never a dead end. Somebody who has just typed out something that has bothered them for
      // months must not be handed an error — the way in still works without the reading.
      setFailed('That did not go through. You can still set the business up and log it inside.');
    } finally {
      setReading(false);
    }
  }

  /** Carried into sign-up so the problem is waiting in their page, exactly as promised. */
  const signUpHref = `/signup?business=${encodeURIComponent(business)}&problem=${encodeURIComponent(problem)}`;

  /*
    The asking sits on dark; everything after it sits on light.

    Straight from the design, and the reason is worth keeping: the page has spent two screens being
    airy and confident, and then asks somebody to type out the thing that has been bothering them
    for months. The ground going dark marks that as a different kind of moment — quieter, and
    theirs. The answer then comes back into the light, which is the shape of the promise being made.
  */
  if (stage === 'asking') {
    return (
      <section className="w-full px-6 py-14 sm:py-20" style={{ background: '#3a3a38' }}>
        <form onSubmit={read} className="mx-auto max-w-[760px] text-center">
          <h2 className="font-serif text-[clamp(1.875rem,4vw,2.75rem)] leading-tight" style={{ color: '#f0eee8' }}>
            Got problems? We&rsquo;ll fix them.
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed" style={{ color: '#c3bfb4' }}>
            Tell us about one — as long as it&rsquo;s{' '}
            <strong className="font-extrabold" style={{ color: '#f0a35c' }}>ongoing</strong>. Not a
            one-off, and not a busy week: the thing that keeps coming back.
          </p>
          <textarea
            className="mt-7 min-h-24 w-full rounded-[20px] p-[18px_20px] text-base"
            style={{ border: '1px solid #55524c', background: '#2c2c2a', color: '#f0eee8' }}
            value={problem}
            onChange={e => setProblem(e.target.value)}
            required
            minLength={8}
            maxLength={2000}
            aria-label="What keeps happening?"
            placeholder="e.g. our best apprentice just quit and it's the second one this year"
          />
          <button type="submit" className="btn-primary mt-4" disabled={reading}>
            {reading ? 'Reading it…' : 'What is really going on?'}
          </button>
          {failed && <p className="mt-4 text-sm" style={{ color: '#e08a6a' }}>{failed}</p>}
        </form>
      </section>
    );
  }

  return (
    <section className="card mx-auto my-14 max-w-2xl">

      {stage === 'read' && result && (
        <div>
          <h2 className="font-serif text-2xl text-ink">What&rsquo;s really going on</h2>

          {/* The causal chain, as letters. Colour is the score everywhere in SPEC, so the letters
              carry the meaning here too, and a half-strength one is the reading being careful. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {result.letters.map(l => (
              <span
                key={l.letter}
                className="badge-letter"
                title={`${l.name}${l.certainty === 'possible' ? ' — possible' : ''}`}
                style={{ opacity: l.certainty === 'possible' ? 0.5 : 1 }}
              >
                {l.letter}
              </span>
            ))}
            <span className="text-sm text-ink-light">
              {result.letters.map(l => l.name).join(' → ')}
            </span>
          </div>

          <p className="mt-4 text-base text-ink">{result.errorLine}</p>

          {result.noOwner ? (
            <p className="mt-4 text-base text-ink">{result.solutionLine}</p>
          ) : (
            <>
              <p className="mt-4 font-serif text-lg text-ink">
                The fix — {result.fix.join(', then ')}. Every time.
              </p>
              <p className="mt-2 text-base text-ink-light">{result.solutionLine}</p>
            </>
          )}

          <p className="mt-5 text-sm text-ink-light">
            You&rsquo;re already working flat out — this is exactly what SPEC does, every day, to point
            that effort at the right thing.
          </p>

          <h3 className="mt-6 font-serif text-lg text-ink">
            Would you like to solve some problems in your business?
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => setStage('naming')}>Yes</button>
            <button type="button" className="btn" onClick={() => setStage('declined')}>No</button>
          </div>
        </div>
      )}

      {/* A no is a real answer and gets a real reply. Nobody is argued with on the way out. */}
      {stage === 'declined' && (
        <div>
          <h2 className="font-serif text-2xl text-ink">No problem.</h2>
          <p className="mt-2 text-base text-ink-light">
            The box is here whenever one becomes worth solving. Thanks for telling us about this one.
          </p>
        </div>
      )}

      {stage === 'naming' && (
        <form onSubmit={e => { e.preventDefault(); if (business.trim()) setStage('leader'); }}>
          <h2 className="font-serif text-2xl text-ink">Can you give me your business name?</h2>
          <p className="mt-2 text-base text-ink-light">
            Your page is waiting, with this problem already sitting in the middle of it.
          </p>
          <input
            className="input mt-4 w-full"
            value={business}
            onChange={e => setBusiness(e.target.value)}
            required
            maxLength={120}
            aria-label="Business name"
            placeholder="Business name"
          />
          <button type="submit" className="btn-primary mt-3">Continue</button>
          <p className="mt-3 text-sm text-ink-light">
            Takes about two minutes to set the business up, then this problem is waiting in your page.
          </p>
        </form>
      )}

      {stage === 'leader' && (
        <div>
          <h2 className="font-serif text-2xl text-ink">
            Who is the leader of these solutions — is it you?
          </h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <a className="btn-primary text-center" href={signUpHref}>Yes, it&rsquo;s me</a>
            <button type="button" className="btn" onClick={() => setStage('allocate')}>
              No, allocate someone
            </button>
            {/*
              The third answer is the important one. Somebody admitting this is too hard is the most
              honest thing on the page, and the worst possible response is a sign-up form.
            */}
            <button type="button" className="btn" onClick={() => setStage('handoff')}>
              I can&rsquo;t do this, it&rsquo;s too hard
            </button>
          </div>
        </div>
      )}

      {stage === 'allocate' && (
        <form onSubmit={e => { e.preventDefault(); setStage('done'); }}>
          <h2 className="font-serif text-2xl text-ink">Fine — allocate a person to run this.</h2>
          <p className="mt-2 text-sm text-ink-light">Who is it?</p>
          <div className="mt-4 grid gap-2">
            <input className="input" name="name" required placeholder="Their name" aria-label="Their name" />
            <input className="input" name="title" required placeholder="Their title" aria-label="Their title" />
            <input className="input" name="email" type="email" required placeholder="Their email" aria-label="Their email" />
          </div>
          <button type="submit" className="btn-primary mt-3">Continue</button>
        </form>
      )}

      {stage === 'handoff' && (
        <div>
          <h2 className="font-serif text-2xl text-ink">No problem.</h2>
          <p className="mt-2 text-base text-ink-light">
            A SPEC specialist will talk you through it — no self-service required.
          </p>
          <a
            className="btn-primary mt-4 inline-block"
            href={`mailto:manager@specbizhq.com?subject=${encodeURIComponent('Talk to SPEC')}&body=${encodeURIComponent(problem)}`}
          >
            Talk to SPEC
          </a>
        </div>
      )}

      {stage === 'done' && (
        <div>
          <h2 className="font-serif text-2xl text-ink">Good. Let&rsquo;s set it up.</h2>
          <p className="mt-2 text-base text-ink-light">
            They will be invited once the business is set up — nobody is emailed before you say so.
          </p>
          <a className="btn-primary mt-4 inline-block" href={signUpHref}>Set up {business || 'the business'}</a>
        </div>
      )}

      {/* The four letters are the product, so they are on the page from the first moment. */}
      <p className="mt-6 border-t border-ink/10 pt-4 text-xs text-ink-light">
        Every problem lands in one or more of{' '}
        {(['safety', 'people', 'earnings', 'compliance'] as const).map((p, i) => (
          <span key={p}>
            {i > 0 ? ', ' : ''}
            <strong className="text-ink">{PILLAR_META[p].name}</strong>
          </span>
        ))}
        . One yes is enough to need a system.
      </p>
    </section>
  );
}
