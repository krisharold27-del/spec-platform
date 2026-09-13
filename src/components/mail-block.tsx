import { SubmitButton } from './submit-button';
import { MAIL_PROVIDERS } from '@/lib/systems';
import type { MailConnection } from '@/lib/mail';
import { connectMail, disconnectMail } from '@/app/my-page/mail-actions';

/**
 * Mail and the tasks it created.
 *
 * Two things that are really one: mail matching something already on your card, and the task each
 * piece created sitting under it. Never an inbox — the test is that the list ends, and everything
 * that did not match stays where it came from.
 *
 * Unconnected is a first-class state rather than an empty one. Most people will never connect a
 * mailbox, and a section that reads as broken until they do would be worse than not having it.
 */
export function MailBlock({
  connection,
  canWrite,
}: {
  connection: MailConnection | null;
  canWrite: boolean;
}) {
  return (
    <section className="card">
      <h2 className="font-serif text-xl text-ink">Mail and the tasks it created</h2>

      {!connection ? (
        <>
          <p className="mt-1 text-sm text-ink-light">
            Point SPEC at your work email and it shows only the mail that matches something already on
            your card — a KPI, an action, a named job, somebody on your team — with the task each one
            created underneath it. Everything else stays in your mail, untouched.
          </p>
          {/* The mailbox is the person's, so this is theirs to switch on and nobody else's. */}
          <p className="mt-2 text-xs text-ink-light">
            Yours to decide. Your mailbox is not the business's to connect, so no administrator can do
            this for you — and nothing in SPEC needs it.
          </p>
          {canWrite && (
            <form action={connectMail} className="mt-4 flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs text-ink-light">
                Where is your work email?
                <select className="input" name="provider" aria-label="Mail provider" defaultValue="">
                  <option value="" disabled>Pick one</option>
                  {MAIL_PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — {p.note}</option>
                  ))}
                </select>
              </label>
              <SubmitButton className="btn-primary shrink-0" pending="Connecting…">Connect it</SubmitButton>
            </form>
          )}
        </>
      ) : connection.status !== 'live' ? (
        <>
          {/*
            Honest about where this actually is. Nothing reads anybody's mail until their provider's
            own consent screen has been through, and saying "connected" before that would be a lie
            about where somebody's email is going.
          */}
          <p className="mt-1 text-sm text-ink-light">
            {connection.name} is set up and waiting on your sign-in with them. Until you have approved it
            there, SPEC has not read anything.
          </p>
          {canWrite && (
            <form action={disconnectMail} className="mt-3">
              <SubmitButton className="btn" pending="Removing…">Remove it</SubmitButton>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-light">
            {connection.name} is connected. Nothing has matched your card yet — when it does it appears
            here, with the task it created underneath.
          </p>
          <p className="mt-2 text-xs text-ink-light">
            Headlines only. SPEC does not become your inbox.
          </p>
          {canWrite && (
            <form action={disconnectMail} className="mt-3">
              <SubmitButton className="btn" pending="Disconnecting…">Disconnect</SubmitButton>
            </form>
          )}
        </>
      )}
    </section>
  );
}
