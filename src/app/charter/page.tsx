import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById } from '@/lib/queries';
import { getCharter } from '@/lib/charter-data';
import { VERDICT_LABEL, MIN_MONTHS_TO_JUDGE, MAX_STRETCH, FULL_HISTORY_MONTHS } from '@/lib/targets';
import { LIGHT_COLOUR, pillTone } from '@/lib/today';
import { PILLAR_META } from '@/lib/pillars';

export const dynamic = 'force-dynamic';

/**
 * The Board Charter.
 *
 * Four commitments, one per pillar, that do not change between businesses and are not open to
 * negotiation. Everything else in SPEC is agreed in a room; this is the part that is signed.
 *
 * Drawn as commitments rather than as scores, on purpose. No percentages, no pillar arithmetic, no
 * green figure in large type — each line is held, broken, or not measured, because that is the only
 * shape these four questions have. A commitment that can be 94% is not a commitment.
 */
const HELD_COLOUR = {
  held: LIGHT_COLOUR.green,
  broken: LIGHT_COLOUR.red,
  unmeasured: LIGHT_COLOUR.pending,
} as const;

const HELD_LABEL = { held: 'Held', broken: 'Breached', unmeasured: 'Not measured' } as const;

export default async function Charter() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const { lines, period, earnings } = await getCharter(user);

  return (
    <Shell
      title="The Board Charter"
      subtitle={`${tenant.name} · the four commitments underneath every scorecard${period ? ` · ${period}` : ''}`}
    >
      <section className="callout">
        <p className="max-w-3xl font-serif text-xl leading-snug text-ink">
          Everything else in SPEC is negotiated. These four are not.
        </p>
        <p className="mt-3 max-w-3xl text-sm text-ink-light">
          Each one is carried by a hard gate — pass or fail, reported beside the score and never averaged
          into it. A commitment that three good measures sitting next to it can dilute is not a
          commitment, and a business that hurt somebody has not had a 94% month.
        </p>
      </section>

      <div className="mt-6 grid gap-4">
        {lines.map(({ commitment, held, reading, line }) => {
          const meta = PILLAR_META[commitment.pillar];
          return (
            <section
              key={commitment.pillar}
              className="card"
              style={{ borderTopColor: HELD_COLOUR[held], borderTopWidth: 4 }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="label-caps">{meta.letter} · {meta.name}</span>
                  <span className="pill" style={{ background: `color-mix(in srgb, ${HELD_COLOUR[held]} 14%, transparent)`, color: HELD_COLOUR[held] }}>
                    {HELD_LABEL[held]}
                  </span>
                </div>
                <span className="label-caps">
                  {commitment.basis === 'absolute' ? 'Not negotiable' : 'Set from your own record'}
                </span>
              </div>

              <p className="mt-3 max-w-3xl font-serif text-xl leading-snug text-ink">{commitment.says}</p>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="label-caps">What is counted</dt>
                  <dd className="mt-1 text-ink-light">{commitment.measured}</dd>
                </div>
                <div>
                  <dt className="label-caps">Why it is not up for discussion</dt>
                  <dd className="mt-1 text-ink-light">{commitment.because}</dd>
                </div>
              </dl>

              <p className="mt-4 text-sm text-ink">
                {reading && <span className="font-mono text-[13.5px]">{reading} · </span>}
                {line}
              </p>

              {/*
                The one commitment SPEC cannot supply a figure for. The percentage a business needs
                in order to be profitable is a fact about its own costs, so it is read out of its own
                closed months — and where there are not enough of them yet, SPEC says so rather than
                proposing a number it has no basis for.

                A commitment can also be HELD on a target that should never have been agreed, and
                that is the harder failure to see: the gate passes, the card reads green, and
                nothing is improving. So an unsound target is marked amber inside this block even
                while the line above it says held. Both statements are true, and the tension
                between them is the point of the page.
              */}
              {commitment.basis === 'earned' && (
                <div
                  className="mt-4 rounded-lg bg-cream p-4"
                  style={
                    earnings.soundness && (earnings.soundness.verdict === 'too_easy' || earnings.soundness.verdict === 'out_of_reach')
                      ? { borderLeft: `4px solid ${LIGHT_COLOUR.amber}` }
                      : undefined
                  }
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="label-caps">Your own record</span>
                    {earnings.soundness && (
                      <span
                        className="pill"
                        style={
                          earnings.soundness.verdict === 'too_easy' || earnings.soundness.verdict === 'out_of_reach'
                            ? pillTone('amber')
                            : undefined
                        }
                      >
                        {VERDICT_LABEL[earnings.soundness.verdict]}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-baseline gap-6">
                    <div>
                      <div className="font-serif text-3xl text-ink">
                        {earnings.actual === null ? '—' : `${earnings.actual}%`}
                      </div>
                      <div className="text-xs text-ink-light">
                        across {earnings.months} closed {earnings.months === 1 ? 'month' : 'months'}
                      </div>
                    </div>
                    <div>
                      <div className="font-serif text-3xl text-ink">
                        {earnings.target === null ? '—' : `${earnings.target}%`}
                      </div>
                      <div className="text-xs text-ink-light">agreed target</div>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-ink-light">
                    {earnings.soundness
                      ? earnings.soundness.line
                      : `Nothing has closed against gross profit yet. It takes ${MIN_MONTHS_TO_JUDGE} closed months before this business’s own record can propose the figure, and SPEC will not put one up before then.`}
                  </p>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <section className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="font-serif text-xl text-ink">How the earned figure is set</h2>
          <p className="mt-2 text-sm text-ink-light">
            A target is agreed in a room and then never checked against anything. SPEC checks it against
            the business&rsquo;s own closed months: the middle month of the last {FULL_HISTORY_MONTHS},
            not the average, so one shutdown or one enormous job does not reset what everybody is held to.
          </p>
          <ul className="mt-4 grid gap-2 text-sm text-ink-light">
            <li><span className="text-ink">At or below that figure</span> — met by carrying on exactly as before. It is not measuring anything.</li>
            <li><span className="text-ink">Up to a fifth above it</span> — a stretch the business can be held to.</li>
            <li><span className="text-ink">Further than that</span> — it will be missed every month, and a measure that is always red stops being read.</li>
          </ul>
          <p className="mt-4 text-xs text-ink-light">
            The fifth ({Math.round(MAX_STRETCH * 100)}%) and the {MIN_MONTHS_TO_JUDGE}-month minimum are
            judgements, not laws. They are written down here so you can argue with them.
          </p>
        </div>

        <div className="rounded-lg bg-sage-100 p-4">
          <h2 className="font-serif text-xl text-ink">Why a badly set target costs more than no target</h2>
          <p className="mt-2 text-sm text-ink">
            A target nobody can miss adds a green light to every month while nothing improves. A target
            nobody can meet produces a red light that stops being read — and once one measure is being
            ignored, the rest of the card is read the same way.
          </p>
          <p className="mt-3 text-sm text-ink-light">
            Both make the dip deeper and longer than the discovery time alone ever would. What that looks
            like in this business is measured on the J curve.
          </p>
          <Link href="/curve" className="mt-4 inline-block text-sm text-rust-700 hover:underline">
            What is holding your dip open →
          </Link>
        </div>
      </section>

      <p className="mt-8 max-w-2xl text-xs text-ink-light">
        The charter is the same in every business. Nothing on this page was set by SPEC for you except the
        four commitments themselves — every figure is your own record.
      </p>
    </Shell>
  );
}
