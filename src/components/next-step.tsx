import Link from 'next/link';

/**
 * "What happens next" — the same callout `<Interview>` already shows on finishing a diagnostic,
 * pulled out so every setup page can end on it rather than a bare "Back to the journey" link.
 *
 * Kris: *"when going through the setup phase it should link nicely to the next step."* A page that
 * saves and stops leaves somebody to go back and re-find the journey themselves; this hands them
 * straight to the next thing, with the one sentence of why it matters, the way the diagnostic
 * already did.
 */
export function NextStepCallout({ step }: { step: { title: string; href: string; why: string } | null }) {
  if (!step) {
    return (
      <div className="callout mt-6 text-left">
        <div className="label-caps">What happens next</div>
        <p className="mt-1 text-sm text-ink-light">
          Every setup step is done. From here the rhythm carries it: weekly SOG meeting, monthly scoring,
          monthly board output.
        </p>
        <Link href="/journey" className="btn-primary mt-3 inline-block">Back to the journey</Link>
      </div>
    );
  }

  return (
    <div className="callout mt-6 text-left">
      <div className="label-caps">What happens next</div>
      <div className="mt-1 text-lg font-medium">{step.title}</div>
      <p className="mt-1 text-sm text-ink-light">{step.why}</p>
      <Link href={step.href} className="btn-primary mt-3 inline-block">Start {step.title.toLowerCase()}</Link>
    </div>
  );
}
