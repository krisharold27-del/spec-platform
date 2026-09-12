# The SPEC specification — where all of it is

Twenty-nine published artifacts: **fifteen screens** and **fourteen reference
documents**. Together they are the specification. The Claude Design files in
this folder show what screens look like; these say what the product *is* and
what the code has to do.

Indexed here because an artifact lives outside this repository and can be
edited or deleted elsewhere. Nothing below should ever have to be rediscovered.

The index itself comes from **The Build Checklist**, which is the control
document — it tracks which screens are approved and what is deliberately out of
the first build.

<https://claude.ai/code/artifact/c057d049-8a76-436a-b4c3-8b2ca93b5fa6>

## State, as the checklist records it

**All fifteen screens reviewed and approved — 10 September 2026.** The engine
is closed: "a developer can build the scoring engine from that page without
inferring anything or asking you a question."

Two screens were then deliberately reopened:

- **Screen 5 → My Page.** Was the home screen. Now one screen you log into,
  with an ask bar across the top; the separate chat page proposed as screen 16
  is folded in and retired, so there is one home rather than two competing for
  the first press of the morning.
- **Screen 13 → The board pack.** Reopened by the containment decision.
  **Nothing leaves SPEC at all** — no emailed file, no attachment, no link.
  Board members are given seats and read the pack in place. That removes the
  whole protected-file apparatus and changes what the pack has to be.

## The fifteen screens

`A` = `https://claude.ai/code/artifact/`

### Link — guided. SPEC leads, the leader corrects.

| # | Screen | Artifact |
|---|---|---|
| 1 | The why | `A`d41dc5bb-84f9-4bfd-8296-8a05c301085c |
| 2 | Building the business | `A`ceed03bb-6f4b-42c6-9861-9ab5bc29167d |
| 3 | Your first KPIs | `A`26728202-4dc6-48db-9120-287d6d4db03c |
| 4 | Your board and your people | `A`debb8c27-cd2b-489b-a053-3d00cbdabe49 |

### Flow — theirs. The right person in the right job.

| # | Screen | Artifact |
|---|---|---|
| 5 | **My Page** | `A`af9078ac-edbf-42eb-af1c-d8b443ac3bb5 |
| 6 | Org chart | `A`60ce59c3-70c7-4e3c-a297-e70ebedbf0f8 |
| 7 | Adding a seat | `A`945802b9-f78b-41f5-9997-8128d631b492 |
| 8 | One person's KPI board | `A`8e190ec0-2643-4622-8766-7195f2a91f57 |
| 9 | A single KPI | `A`46731b73-e3ba-446b-959c-63ff9e7e669d |
| 10 | Setting a KPI | `A`0cfcd3da-38ce-46ac-821f-3c530d4c2cfa |
| 11 | The turn to green | `A`690cb273-f446-4f6f-a668-f6b71259f439 |

### Grow — the combined output of people in flow.

| # | Screen | Artifact |
|---|---|---|
| 12 | Month-end scoring | `A`fe49ebc4-87bb-4985-aef6-7458ec06902b |
| 13 | **The board pack** | `A`9a1ed93a-7766-4a70-8554-86e77ba49dc9 |
| 14 | The COGS meeting | `A`cc583160-912f-4467-bcad-ddd7613476e0 |
| 15 | The year so far | `A`fb20ca85-7a50-4ca1-b7a7-e5a51cf61d9c |

## The fourteen reference documents

| Document | What it settles | Artifact |
|---|---|---|
| **The rules** | The scoring engine — statuses, pillar maths, roll-ups, the 90% rule, incentives, meters, periods, connections, emails, billing | `A`4aee63b5-44c5-427b-be33-b3fb2900578a |
| From stranger to believer | The argument behind screen 1; why the model is never named at the customer | `A`7fe18b9e-9a38-4d7e-a065-2b2c5976c9f5 |
| The shape of the system | One door, depth-only navigation, the support layer, the CTS decision test | `A`8199c983-2c31-4645-88c4-25750da33a0e |
| Where the learning comes from | The content layer — MindFit, MindFitter, the training add-on | `A`a3fe06fa-98f3-4bf3-96b8-de73c2d29b9f |
| What stays inside | Containment — no shareable links, approved sensitive connections, protected packs | `A`4274023e-90e5-4476-a0f2-77bc3bb001ba |
| The improvement loop | The layer between SPEC and Claude; no access to customer data | `A`41437ab7-612e-41bd-94ed-2761a862febf |
| The rhythm | Five meeting beats, templates, notes-to-KPIs, and that COGS is the only place a KPI can change | `A`f4ca2e72-ed9e-4075-915e-9b7012575b32 |
| The first ninety days | Purpose, Process, Content, Strategic — three blocks of thirty days | `A`e3698ec3-c694-42a3-b3bb-ac63dd1a5427 |
| Learning on the job | No courses. Capability in four-minute snippets, triggered by the person's card | `A`394da853-6895-4d41-8e30-d844655092a1 |
| The hire | SPEC is bought as a hire, not as software. The ten build rules | `A`2b41da22-47f1-4d81-8456-3bcb69f59c24 |
| The way in | Four doors into one product, twelve buying reasons, the no-names rule | `A`a59212b7-66b9-490c-9622-a5a0de35c6fb |
| The frontline supervisor | Eighteen modules in five blocks | `A`321b658d-99dc-4d96-9b2e-b089aaa64522 |
| Building on Claude | The API layer, white-labelling, the two-layer model, unit economics | `A`6c473635-2997-4459-aa19-ed096b7e7e24 |
| Every problem, and what happens to it | Twenty-two problems, five root causes, and the four SPEC does not touch | `A`f988202e-fa47-431f-90c8-1c984bf98852 |

## Deliberately not in the first build

Real needs, and not what a senior leadership team and a board require to run a
month. Each arrives when the thing it depends on is actually happening.

- **Staff logins and the phone** — staff are *scored* in the first build; they
  do not log in yet
- **Introducing SPEC to the team** — a conversation before it is a screen
- **Disagreeing with a score** — needed before staff have accounts, not before
  leaders do
- **The incentive statement** — a person seeing their own money
- **Recruiting an open role** — already inside the org chart
- **Connecting a system** — by category, never by vendor

## The eight problems every screen is checked against

A leader arriving already has problems; a system like this creates more in ways
that look like features.

| The problem it could create | What the screen has to do |
|---|---|
| Setting it up is a project | SPEC proposes everything and the leader edits. Never a blank form. |
| A new monthly obligation, forever | Scoring in minutes. Only genuine judgement calls reach the leader. |
| Month one delivers thirty failures at once | Nothing unscored is ever red. Pending is grey. |
| A score creates a conversation they must now have | Never hand over a verdict alone. A Not met comes with what to say. |
| Money attached to numbers nobody trusts yet | The first period runs without incentives attached. |
| Connecting systems needs IT | Manual works completely and permanently. |
| An open role ageing in public | Show what the gap costs below it — an explanation, not an accusation. |
| **It makes the buyer the most visible person in the business** | **The month is theirs until they lock it.** Nothing reaches the board unread. |

> The last row is the one to keep in view. The person who buys SPEC is the
> person it makes most legible to their board. Every other product problem is an
> inconvenience; that one is a reason not to start at all — and it is felt
> privately, so nobody will ever say it out loud.

## One seat, or fifty

The full system has to work for exactly one person — not a trial version, all of
it. Nothing requires a second user; no screen asks where everyone is; people
exist without logins; adding people later changes nothing; one person pays for
one person and gets everything.

Settled consequence: a person given an account in month four does **not** see
scores recorded about them before they arrived. Their card starts clean. The
owner can open earlier history deliberately — a decision, not a default.
