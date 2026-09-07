import Link from 'next/link';

export const metadata = { title: 'Privacy Policy — SPEC' };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="label-caps">SPEC Business Solutions</div>
      <h1 className="mt-1 font-serif text-3xl font-bold text-ink">Privacy Policy</h1>
      <p className="mt-2 text-sm text-ink-light">Last updated 6 September 2026.</p>

      <div className="prose-sm mt-8 space-y-5 text-sm leading-6 text-ink-light">
        <p>SPEC Business Solutions ("we", "us") handles personal information in line with the Australian Privacy Act 1988 and the Australian Privacy Principles. This policy covers the SPEC app (specbizhq.com and app.specbizhq.com).</p>

        <h2 className="text-base font-semibold text-ink">What we collect</h2>
        <p>When you sign up or are assigned a role: your name, work email, and the business you're part of. When you use SPEC: the org chart, KPIs, targets, scorecard answers, notes, gate figures, and diagnostic answers your business enters. We don't ask for or want anything beyond what running the platform needs — no financial account numbers, no government ID, no data about your own customers or staff beyond what a role needs (name, email, access level).</p>

        <h2 className="text-base font-semibold text-ink">How we use it</h2>
        <p>To run the SPEC platform for your business: showing your scorecards, computing your pillar scores, and generating your monthly board output. We don't use your data to train any AI model, ours or a third party's, and we don't use it for advertising.</p>

        <h2 className="text-base font-semibold text-ink">Per-tenant isolation</h2>
        <p>Every business on SPEC ("tenant") is walled off from every other one at the database level. Your data is never visible to, or mixed with, another business's data. Nothing about your business is shared publicly or used as a case study without your explicit permission.</p>

        <h2 className="text-base font-semibold text-ink">Who we share it with</h2>
        <p>We use a small number of specialist services to run SPEC, each processing only what it needs to do its job:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Supabase</b> — hosts our database and handles sign-in, in Sydney, Australia.</li>
          <li><b>Vercel</b> — hosts the application itself.</li>
          <li><b>Stripe</b> — processes subscription payments; we never see or store your card details.</li>
          <li><b>Resend</b> — sends transactional emails (invites, sign-in links, board-output notifications) on our behalf.</li>
          <li><b>Anthropic (Claude)</b> — generates the plain-language board output from your period's scorecard and gate data. Anthropic processes this data to return the output to us; per Anthropic's own API terms, data sent through their API is not used to train their models.</li>
        </ul>
        <p>None of these providers can see across tenants, and none of them are permitted to use your data for their own purposes. We don't sell personal information to anyone, ever.</p>

        <h2 className="text-base font-semibold text-ink">Cookies</h2>
        <p>We use a single session cookie (set by Supabase Auth) to keep you signed in. No advertising or tracking cookies.</p>

        <h2 className="text-base font-semibold text-ink">How long we keep it</h2>
        <p>For as long as your business has an account. If a subscription lapses, we keep your data (read-only) rather than deleting it, so you can pick back up later. If you want your business's data deleted entirely, contact us (below) and we'll do it, subject to anything we're required to keep for legal or accounting reasons.</p>

        <h2 className="text-base font-semibold text-ink">Your rights</h2>
        <p>You can ask us what personal information we hold about you, correct it, or ask us to delete it, by emailing us below. We'll respond within a reasonable time and won't charge you for a reasonable request.</p>

        <h2 className="text-base font-semibold text-ink">Children</h2>
        <p>SPEC is a business tool, not directed at or intended for children.</p>

        <h2 className="text-base font-semibold text-ink">Changes</h2>
        <p>We may update this policy as the product or our providers change. We'll update the date above when we do.</p>

        <h2 className="text-base font-semibold text-ink">Contact</h2>
        <p>Questions, requests, or a complaint about how we handle your information: <a href="mailto:manager@specbizhq.com" className="underline">manager@specbizhq.com</a>. If you're not satisfied with our response, you can contact the Office of the Australian Information Commissioner (oaic.gov.au).</p>
      </div>

      <p className="mt-10 text-sm"><Link href="/" className="underline">Back to SPEC</Link></p>
    </main>
  );
}
