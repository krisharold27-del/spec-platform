# Core components — must always be findable

Kris, 25 September: *"I can't find the org chart."* It is THE key component of SiteVIP, it worked
at `/org`, and nothing led to it: the September tidy-up of the menu had tucked it "under People",
which in practice meant nowhere.

## LINK, FLOW, GROW — the three the product is built on

Kris, 26 September: *"there are three absolutely critical aspects to this system - links (org
chart) - kpi boards (flow) and mirrors to support (growth) - where the fuck are they - im
furious."*

| | What it is | Menu label | Route |
|---|---|---|---|
| **LINK** | The org chart. Who does what, and who reports to whom. | Org chart | `/org` |
| **FLOW** | The KPI boards, and closing the month on them. | Scoring | `/scoring` |
| **GROW** | Mirrors — the artifacts a team pins and runs projects through. | Mirrors | `/mirrors` |

**How two of the three went missing, twice, in three days.** On 24 September the menu was shortened
from fourteen items to seven, and Scoring and Mirrors were moved "under Board" — reachable, in the
sense that a thing in a drawer is reachable. On 25 September Kris could not find the org chart, and
LINK was restored with its own item and a test to hold it there. FLOW and GROW were not, and neither
was ever added to the table below — so this check went green every single run while guarding a list
that was missing two thirds of the point.

That is the failure this file is now written against: not a component being deleted, which is loud,
but a component being *quietly demoted* while the check that guards it passes. A check aimed at the
wrong list buys silence, and silence is worse than no check.

**The rule:** never remove or hide a core component. Every one is in the main menu, and every new
feature must be reachable from the menu or from a clearly linked page. A shorter menu is never
worth a component somebody cannot find.

**Enforced two ways:**

- **`tests/core-components.test.ts`** reads the table below. It fails if any component:
  - is missing from the main menu (`navDoors` in `src/lib/doors.ts`) under its label and route;
  - has a route with no page;
  - loses a label or route from this file.
  
  It also fails if CLAUDE.md stops pointing here.
- **`scripts/core-components-journey.mjs`**, run in CI, signs up a real business in a browser. It
  presses each component's menu item and fails if the page errors, or if the item is missing from
  the menu on a phone.

To add a core component, add a row here and give it a menu item. To take one away, Kris decides,
and this file changes first.

| Component | Menu label | Route |
|---|---|---|
| My Page | My page | /my-page |
| Org chart | Org chart | /org |
| Scoring — the KPI boards | Scoring | /scoring |
| Mirrors | Mirrors | /mirrors |
| Virtual GM + Virtual Admin | Virtual GM | /virtual-gm |
| Jobs | Jobs | /jobs |
| CRM | CRM | /crm |
| People | People | /people |
| Financials | Financials | /financials |
| Safety | Safety | /safety |
| Compliance | Compliance | /compliance |
| Board | Board | /board |
| COGS meeting | COGS meeting | /meeting |
| Make it simple report | COGS meeting | /meeting |
| Setup | Setup | /setup |
| Connections | Connections | /connections |

**Notes:**

- **The org chart is second in the menu, right after My page.** It is also linked by an "Open the
  org chart" card at the top of My Page, People, Virtual GM and Setup (`OrgChartDoor` in
  `src/components/org-chart-door.tsx`).
- **The Make it simple report** is the first item of the weekly COGS meeting, so its menu item is
  COGS meeting. The test checks that `/meeting` still draws it.
- **All pages** (`/pages`, the last menu item) lists every page in SPEC, grouped. It is not a core
  component itself; it is the promise that nothing else is lost either.
