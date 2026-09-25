# Decisions log

Record every correction or choice made while building. Newest at the bottom.

- 2026-09-25 — Angus Shield started as a full financial system (ledger, invoicing, bills, bank feeds, GST/BAS) for trade businesses, under the SPEC Business Solutions banner. Separate private repo, same stack as SPEC. SiteVIP reads it by category like any other financial system and never requires it. Stripe product `Angus Shield` exists in the live account with no prices; pricing is undecided.
- 2026-09-25 — Version-one scope is the whole job: payroll with STP, direct ATO lodgement, and bank feeds are all in. Kris: *"is it simple if its missing a function?"* A missing function sends the owner to a second system. Consequence: ATO Digital Service Provider onboarding and bank feed access start before the code, because they take the longest. Regions ship complete or not at all; Australia first (proposed).
- 2026-09-25 — Domain: **angusshield.com**, bought on Vercel under the SPEC Business Solutions team, is Angus Shield's main domain. The Vercel project `angus-shield` sits under the same team, as all SPEC Business Solutions products do.
