import Link from 'next/link';

export const metadata = { title: 'Terms of Service — SPEC' };

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="text-sm font-semibold tracking-wide text-slate-500">SPEC BUSINESS SOLUTIONS</div>
      <h1 className="mt-1 text-3xl font-semibold">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated 6 September 2026.</p>

      <div className="prose-sm mt-8 space-y-5 text-sm leading-6 text-slate-700">
        <p>These terms cover your use of SPEC (the app at specbizhq.com and app.specbizhq.com), operated by SPEC Business Solutions ("we", "us"), a business based in Victoria, Australia. By creating a business on SPEC you agree to these terms. If you don't agree, don't use the service.</p>

        <h2 className="text-base font-semibold text-slate-900">What SPEC is</h2>
        <p>SPEC is a self-serve operating system for running a business against four pillars — Safety, People, Earnings, Compliance — with role-based scorecards, KPIs, and a monthly board output generated from your own data. It's a tool your business uses to track and report on itself; it doesn't manage your business for you, and nothing it produces is professional advice (financial, legal, safety, or otherwise).</p>

        <h2 className="text-base font-semibold text-slate-900">Plans and billing</h2>
        <p>A new business starts on a free trial: you can set up your org chart, roles, and KPIs at no cost. Scoring a month and generating a board output require <b>SPEC Basic</b>, A$100 per year (GST treatment as shown at checkout), billed annually in advance via Stripe and renewing automatically until cancelled. You can cancel any time from the Billing link in the app — you keep access until the end of the period you've already paid for, and we never delete your data just because a subscription lapses. A <b>SPEC Program</b> engagement (on-site rollout and training) is a separate consulting arrangement, invoiced outside the app.</p>
        <p>Refunds are handled case by case — contact us (below) if something's gone wrong.</p>

        <h2 className="text-base font-semibold text-slate-900">Your data, your business</h2>
        <p>Everything you enter — org charts, KPIs, scorecards, notes — belongs to your business, not to us. We don't share it with other businesses on the platform, we don't sell it, and we don't use it to train any AI model (ours or anyone else's). See our <Link href="/privacy" className="underline">Privacy Policy</Link> for exactly what we collect and who we share it with to run the service (hosting, payments, email).</p>

        <h2 className="text-base font-semibold text-slate-900">Acceptable use</h2>
        <p>Use SPEC for your own business's genuine operating data. Don't try to break, scrape, or resell the platform; don't use it to store or process anyone else's confidential information without their consent; don't impersonate another business or person.</p>

        <h2 className="text-base font-semibold text-slate-900">No warranty, limited liability</h2>
        <p>SPEC is provided "as is". We work to keep it available and accurate, but we don't guarantee it will be uninterrupted or error-free, and we're not liable for business decisions made on the basis of its output — that judgment stays with you. To the extent the law allows, our liability for any claim is limited to the fees you've paid us in the 12 months before the claim. Nothing here excludes a guarantee that can't be excluded under the Australian Consumer Law.</p>

        <h2 className="text-base font-semibold text-slate-900">Ending the arrangement</h2>
        <p>You can stop using SPEC and cancel at any time. We can suspend or close an account for a clear breach of these terms (for example, misuse of the platform or non-payment), and we'll tell you why if we do.</p>

        <h2 className="text-base font-semibold text-slate-900">Changes</h2>
        <p>We may update these terms as the product changes. We'll change the date above when we do; continuing to use SPEC after an update means you accept the new terms.</p>

        <h2 className="text-base font-semibold text-slate-900">Governing law</h2>
        <p>These terms are governed by the laws of Victoria, Australia.</p>

        <h2 className="text-base font-semibold text-slate-900">Contact</h2>
        <p>Questions about these terms: <a href="mailto:manager@specbizhq.com" className="underline">manager@specbizhq.com</a>.</p>
      </div>

      <p className="mt-10 text-sm"><Link href="/" className="underline">Back to SPEC</Link></p>
    </main>
  );
}
