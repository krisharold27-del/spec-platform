import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { CopyBox } from '@/components/copy-box';
import { pillTone, LIGHT_COLOUR, LIGHT_INK, type Light } from '@/lib/today';
import {
  SEAT_KINDS, seatKindLabel, gapsFor, stopsWork, lapsedLicences, readyToWork,
  billFor, billLine, readiness, finaliseLine, isPersonalEmail, WHY_COMPANY_EMAIL,
  phoneProgress, inviteText, GAP_LABEL, money, type Person, type SeatKind,
} from '@/lib/onboarding';
import { setSeatKind, setSubcontractor, savePersonDetail, addLicence, markInducted, sendSetupLink } from './actions';

function Pill({ light, children }: { light: Light; children: React.ReactNode }) {
  return <span className="pill whitespace-nowrap" style={pillTone(light)}>{children}</span>;
}

/**
 * Set everybody up — the list a business works down once, with its HR admin.
 *
 * ── What this screen is, and why it is not the staff list ────────────────────────────────────────
 *
 * Kris, the weekend before putting JBI in: every person on a row, a tick for what they are, their
 * licences and training and induction captured, and *"finalise payment after everything is set"*.
 *
 * The staff list is for a business that is running. This is for the morning a business starts — and
 * the difference that forces it to be its own screen is the money. Billing reads a person's seat
 * kind off their ACCOUNT, and an account only exists once they are invited. Without a place to
 * record the intent first, a business would have to invite all thirty-eight people, and start
 * paying for them, before it could say which ones were leadership.
 *
 * So: the list is filled in free, the bill is shown as it will be, and nobody is charged until the
 * button at the bottom is pressed.
 *
 * ── Two halves, done by two different people ─────────────────────────────────────────────────────
 *
 * The office puts in what only the office knows — who somebody is, their role, their seat, whether
 * they are a subcontractor. The person puts in what only they have: their licence numbers and the
 * dates they run out, on their phone. Thirty-eight people is well over a hundred fields, and an HR
 * admin typing them from a pile of photocopies produces a register nobody trusts.
 */
export function SetupTab({ people, roles, today, currency, canPay, subscribed, business, appUrl }: {
  people: (Person & { chartSeat: SeatKind; setupToken: string | null })[];
  roles: { id: string; title: string }[];
  today: string;
  currency: 'aud' | 'nzd' | 'gbp' | 'eur' | 'usd' | 'cad';
  /** Whether this person may confirm the bill — administration only. */
  canPay: boolean;
  subscribed: boolean;
  /** The business's own name, for the message that goes with the link. */
  business: string;
  /** Where SPEC lives, so the link is one somebody can actually paste into a text. */
  appUrl: string;
}) {
  const withSeats = people.map(p => ({
    ...p,
    seat: (p.seatKind === 'leadership' || p.seatKind === 'team' ? p.seatKind : p.chartSeat) as SeatKind,
  }));
  const bill = billFor(withSeats.map(p => ({ seatKind: p.seat })), currency);
  const r = readiness(people, today);

  return (
    <div className="grid gap-6">
      <section className="card mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">Set everybody up</h2>
          <span className="text-sm text-ink-light">Nobody is charged until you confirm</span>
        </div>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-light">
          Put everyone in, tick what each person is, and send them a link to add their own licences
          on their phone. The bill below is what it <em>will</em> be — nothing is charged until you
          press the button at the bottom.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'On the list', value: String(r.people), note: `${bill.leadership} leadership · ${bill.team} team`, light: 'pending' as Light },
            { label: 'Ready to work', value: `${r.ready} of ${r.people}`, note: 'licence and induction in', light: (r.cannotBeBooked ? 'amber' : 'green') as Light },
            { label: 'No company email', value: String(r.missingEmail + r.personalEmail), note: r.personalEmail ? `${r.personalEmail} on a personal address` : 'the email is the login', light: ((r.missingEmail + r.personalEmail) ? 'amber' : 'green') as Light },
            { label: 'Monthly, when confirmed', value: money(bill.monthlyCents, bill.symbol), note: 'first seat free', light: 'pending' as Light },
          ].map(t => (
            <div key={t.label} className="card-inset">
              <span className="label-caps">{t.label}</span>
              <p className="mt-1 font-serif text-2xl" style={{ color: LIGHT_INK[t.light] }}>{t.value}</p>
              <p className="mt-1 text-xs text-ink-light">{t.note}</p>
            </div>
          ))}
        </div>

        {(r.missingEmail > 0 || r.personalEmail > 0) && (
          <p className="mt-4 rounded-2xl px-4 py-3 text-sm text-ink" style={{ background: `color-mix(in srgb, ${LIGHT_COLOUR.amber} 12%, transparent)` }}>
            <b>Give everybody a company email.</b> {WHY_COMPANY_EMAIL}
          </p>
        )}
      </section>

      {/* One row per person. Everything about them, in one place, on one line where it fits. */}
      {withSeats.length === 0 ? (
        <section className="card">
          <p className="text-sm text-ink">
            Nobody on the list yet. The quickest way in is to paste your structure on the{' '}
            <Link href="/org" className="text-rust underline">org chart</Link> — a name and a role
            per line and everybody appears here.
          </p>
        </section>
      ) : (
        <div className="grid gap-3">
          {withSeats.map(p => {
            const gaps = gapsFor(p);
            const blocked = stopsWork(p);
            const lapsed = lapsedLicences(p, today);
            const ready = readyToWork(p, today);
            const phone = phoneProgress(p);
            return (
              <section key={p.id} className="card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="grid gap-0.5">
                    <strong className="text-base text-ink">{p.name}</strong>
                    <span className="text-xs text-ink-light">
                      {p.roleTitle ?? 'No role yet'}
                      {p.isSubcontractor ? ' · Subcontractor' : ''}
                      {p.invited ? ' · invited' : ''}
                    </span>
                  </div>
                  <Pill light={ready ? 'green' : blocked.length || lapsed.length ? 'red' : 'amber'}>
                    {ready ? 'Ready to work'
                      : lapsed.length ? `${lapsed[0]} has lapsed`
                        : blocked.length ? GAP_LABEL[blocked[0]]
                          : `${gaps.length} still to do`}
                  </Pill>
                </div>

                {/* The two ticks. Team or leadership decides the bill; the subbie tick decides what they see. */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {SEAT_KINDS.map(k => (
                    <form key={k.key} action={setSeatKind}>
                      <input type="hidden" name="staffId" value={p.id} />
                      <input type="hidden" name="seatKind" value={k.key} />
                      <SubmitButton
                        className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-semibold ${
                          p.seat === k.key ? 'bg-ink text-white' : 'bg-cream text-ink hover:bg-surface'
                        }`}
                        pending="…"
                      >
                        {k.label}
                      </SubmitButton>
                    </form>
                  ))}
                  <form action={setSubcontractor}>
                    <input type="hidden" name="staffId" value={p.id} />
                    <input type="hidden" name="on" value={p.isSubcontractor ? '0' : '1'} />
                    <SubmitButton
                      className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-semibold ${
                        p.isSubcontractor ? 'bg-ink text-white' : 'bg-cream text-ink hover:bg-surface'
                      }`}
                      pending="…"
                    >
                      {p.isSubcontractor ? '✓ Subcontractor' : 'Subcontractor'}
                    </SubmitButton>
                  </form>
                  <span className="ml-auto text-xs text-ink-light">
                    {seatKindLabel(p.seat)}
                    {p.seatKind ? '' : ' — from the chart, until you say otherwise'}
                  </span>
                </div>

                {/* Their email, which is how they sign in. */}
                <form action={savePersonDetail} className="mt-3 grid gap-2 sm:grid-cols-[2fr_1.2fr_auto]">
                  <input type="hidden" name="staffId" value={p.id} />
                  <input
                    className="input"
                    name="email"
                    type="email"
                    defaultValue={p.email ?? ''}
                    placeholder="Company email — this is their login"
                    aria-label={`Company email for ${p.name}`}
                  />
                  <select className="input" name="roleId" defaultValue="" aria-label={`Role for ${p.name}`}>
                    <option value="">{p.roleTitle ?? 'Give them a role'}</option>
                    {roles.map(role => <option key={role.id} value={role.id}>{role.title}</option>)}
                  </select>
                  <SubmitButton className="btn-secondary shrink-0" pending="Saving…">Save</SubmitButton>
                </form>
                {isPersonalEmail(p.email) && (
                  <p className="mt-1.5 text-xs" style={{ color: LIGHT_INK.amber }}>
                    That is a personal address. The email is the login — on a personal one the
                    account goes with them when they leave.
                  </p>
                )}

                {/* Licences and induction — the two that decide whether somebody can be sent out. */}
                <div className="mt-3 grid gap-2">
                  {p.licences.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {p.licences.map(l => {
                        const gone = Boolean(l.expiresAt && l.expiresAt < today);
                        return (
                          <Pill key={l.what} light={gone ? 'red' : 'green'}>
                            {l.what}{l.expiresAt ? ` · ${gone ? 'lapsed' : 'to'} ${l.expiresAt}` : ''}
                          </Pill>
                        );
                      })}
                    </div>
                  )}
                  <form action={addLicence} className="grid gap-2 sm:grid-cols-[1.6fr_1fr_auto]">
                    <input type="hidden" name="staffId" value={p.id} />
                    <input className="input" name="what" maxLength={120} placeholder="Licence or ticket — e.g. A-grade, White Card" aria-label={`Add a licence for ${p.name}`} />
                    <input className="input" name="expiresAt" type="date" aria-label={`When it runs out for ${p.name}`} />
                    <SubmitButton className="btn-secondary shrink-0" pending="Adding…">Add</SubmitButton>
                  </form>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {p.inductedAt ? (
                    <Pill light="green">Inducted {p.inductedAt}</Pill>
                  ) : (
                    <form action={markInducted}>
                      <input type="hidden" name="staffId" value={p.id} />
                      <SubmitButton className="btn-secondary text-sm" pending="…">Mark inducted</SubmitButton>
                    </form>
                  )}
                  <span className="text-xs text-ink-light">
                    Training {p.trainingNeeded ? `${p.trainingDone} of ${p.trainingNeeded}` : 'not set for this role yet'}
                  </span>

                  {/*
                    The link they open on their phone. The office does not type somebody's licence
                    numbers off a photocopy — the certificate is in their wallet.
                  */}
                  <form action={sendSetupLink} className="ml-auto">
                    <input type="hidden" name="staffId" value={p.id} />
                    <SubmitButton className="btn-secondary shrink-0 text-sm" pending="…">
                      {p.setupToken ? 'Send the link again' : 'Send them a link'}
                    </SubmitButton>
                  </form>
                </div>
                {/*
                  Shown whenever a link exists, INCLUDING when there is nothing left for them to do.

                  It used to hang off `phone.next`, so pressing "Send them a link" for somebody who
                  had already finished confirmed nothing — the admin pressed a button and the page
                  looked identical. Working down thirty-eight people that reads as a broken button,
                  and the link gets sent three more times.
                */}
                {p.setupToken && (
                  <div className="mt-1.5 grid gap-2">
                    <p className="text-xs text-ink-light">
                      Link sent · {phone.next
                        ? `${phone.done} of ${phone.of} done on their phone · next: ${phone.next}`
                        : 'everything we asked them for is in. Nothing left for them to do.'}
                    </p>
                    {/*
                      The message itself, ready to go, in a box that selects on one press.

                      SPEC does not send the text. Kris's businesses send these from the phone that
                      is already in the admin's hand and already has everybody's number in it, and
                      building an SMS gateway to save a paste would add a cost, a signup and a thing
                      that can be down — to replace something that already works.

                      What it MUST not do is make somebody build the link themselves. An admin who
                      has to assemble a URL out of a token gets one wrong somewhere in thirty-eight,
                      and the person on the other end of that one just never finishes.
                    */}
                    <CopyBox
                      label="Send them this"
                      value={inviteText(business, p.name ?? 'there', `${appUrl.replace(/\/+$/, '')}/join/${p.setupToken}`)}
                    />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/*
        ── Finalise ────────────────────────────────────────────────────────────────────────────

        The last thing on the page, after the list, because that is the order it is done in. It does
        NOT wait for every certificate: licences, inductions and training arrive over weeks, and a
        business that cannot start until every one is scanned never starts. What it waits for is
        everybody having a role — without that the seat kinds are guesses and the bill is wrong.
      */}
      {withSeats.length > 0 && (
        <section className="card">
          <h2 className="font-serif text-xl text-ink">Finalise</h2>
          <p className="mt-2 text-sm font-semibold text-ink">{billLine(bill)}</p>
          <p className="mt-1 max-w-[70ch] text-sm text-ink-light">{finaliseLine(r, bill)}</p>

          {subscribed ? (
            <p className="mt-3 rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
              Already set up and paying. Changing somebody&rsquo;s seat here moves the next bill —
              nothing is charged twice.
            </p>
          ) : canPay ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link
                href="/billing"
                aria-disabled={!r.canFinalise}
                className={`btn-primary min-h-[48px] text-base ${r.canFinalise ? '' : 'pointer-events-none opacity-50'}`}
              >
                Confirm the list and pay
              </Link>
              <span className="text-xs text-ink-light">
                Takes you to the payment page. You can come back and change anybody afterwards.
              </span>
            </div>
          ) : (
            <p className="mt-3 rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
              Whoever administers this business confirms the bill. You can fill the list in.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
