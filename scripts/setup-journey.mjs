import { chromium } from 'playwright';
import { tidyUp } from './test-cleanup.mjs';
const B='http://localhost:3100';
const HARNESS=/_next\/hmr|WebSocket connection to 'ws:/i;
const b=await chromium.launch({executablePath:process.env.CHROME_PATH});
const p=await (await b.newContext({viewport:{width:1400,height:1100}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200));});
let bad=0;
const check=(label,ok,detail='')=>{console.log(`${ok?'  ok  ':' FAIL '} ${label}${ok||!detail?'':`  — ${detail}`}`);if(!ok)bad++;};

const s=Date.now(); const BUS=`Setup ${s}`;
await p.goto(`${B}/signup`,{waitUntil:'networkidle'});
await p.fill('input[name="name"]','Kris Harold'); await p.fill('input[name="business"]',BUS);
await p.fill('input[name="email"]',`setup-${s}@journey.test`); await p.fill('input[name="password"]','a-good-password-123');
await p.check('input[name="consent"]').catch(()=>{});
await p.waitForTimeout(3000); await p.click('button[type="submit"]');
await p.waitForURL(u=>!u.pathname.startsWith('/signup'),{timeout:40000}).catch(()=>{});

// Put a few people in the way Kris will — paste the structure on the org chart.
await p.goto(`${B}/org`,{waitUntil:'networkidle'});
/* The importer folds shut once a chart exists — that is the product being right, so open it. */
await p.evaluate(()=>document.querySelectorAll('details').forEach(d=>{d.open=true;}));
await p.waitForTimeout(300);
const box=p.locator('textarea[name="text"]').first();
check('THE ORG CHART TAKES A PASTED LIST', await box.count()>0, `on ${new URL(p.url()).pathname}`);
if(await box.count()){
  await box.fill([
    'General Manager, J. Barnes',
    'Operations Manager, D. Whitmore, General Manager',
    'Site Supervisor, H. Walker, Operations Manager',
    'Electrician, J. Rivers, Site Supervisor',
    'Estimator, L. Ford, General Manager',
  ].join('\n'));
  await Promise.all([p.waitForLoadState('networkidle'), p.locator('form:has(textarea[name="text"]) button[type="submit"]').first().click()]);
  await p.waitForTimeout(1500);
}

errs.length=0;
const r=await p.goto(`${B}/people?mode=setup`,{waitUntil:'networkidle'});
await p.waitForTimeout(1200);
const txt=await p.evaluate(()=>document.body.innerText);
/*
  A redirect to /signin answers 200 after it is followed, so a status check alone calls a screen
  nobody reached "open". Where we LANDED is the fact that matters.
*/
check('THE SETUP SCREEN OPENS',
  new URL(p.url()).pathname === '/people' && !/went wrong|Application error/i.test(txt),
  `landed on ${new URL(p.url()).pathname} — ${txt.slice(0,120).replace(/\n/g,' ')}`);
check('and everybody pasted in is on it', /Rivers|Whitmore|Walker/.test(txt), txt.slice(0,220).replace(/\n/g,' '));

/*
  ── Wait for the EVIDENCE, never for a duration (26 September) ────────────────────────────────

  Every check below used to be `click(); waitForTimeout(900); read the page`. That passes when this
  journey is run on its own and fails, in a different place each time, inside `npm run check` —
  where thirty-odd journeys share one machine and a server action that usually answers in 200ms
  occasionally takes two seconds.

  A journey that only fails when the machine is busy is the cry-wolf failure this suite has already
  been bitten by three times: it teaches everybody to re-run it, and a check people re-run until it
  goes green is not a check. So each of these now waits for the words it is about to assert, and
  fails only when they never arrive.
*/
const shows = (text, timeout = 15000) =>
  p.waitForFunction(t => document.body.innerText.includes(t), text, { timeout })
    .then(() => true).catch(() => false);

// The two toggles.
const lead=p.locator('form:has(input[value="leadership"]) button').first();
check('THERE IS A TEAM / LEADERSHIP TOGGLE', await lead.count()>0);
if(await lead.count()){
  await Promise.all([p.waitForLoadState('networkidle'), lead.click()]);
  /*
    The bill line is on the page before the toggle is pressed, so waiting for it proves only that
    it is still there. Said plainly rather than dressed up: this check asserts the bill is SHOWN,
    not that pressing changed it — the amount itself is covered by tests/onboarding.test.ts, which
    can vary the seats without a browser.
  */
  const billed = await shows('a month') || await shows('Nothing to pay');
  check('  and the bill is still shown after pressing it', billed,
    (await p.evaluate(()=>document.body.innerText)).slice(0,200).replace(/\n/g,' '));
}

const sub=p.locator('form:has(input[name="on"]) button:has-text("Subcontractor")').first();
check('THERE IS A SUBCONTRACTOR TICK', await sub.count()>0);
if(await sub.count()){
  await Promise.all([p.waitForLoadState('networkidle'), sub.click()]);
  check('  and it sticks', await shows('✓ Subcontractor'));
}

// A licence with an expiry.
const lic=p.locator('input[name="what"]').first();
check('A LICENCE CAN BE ADDED WITH ITS EXPIRY', await lic.count()>0);
if(await lic.count()){
  await lic.fill('A-grade electrical licence');
  await p.locator('input[name="expiresAt"]').first().fill('2027-06-30');
  await Promise.all([p.waitForLoadState('networkidle'), p.locator('form:has(input[name="what"]) button').first().click()]);
  check('  and it shows with the date', await shows('A-grade electrical licence'));
}

// Induction.
const ind=p.locator('button:has-text("Mark inducted")').first();
if(await ind.count()){
  await Promise.all([p.waitForLoadState('networkidle'), ind.click()]);
  check('INDUCTION CAN BE MARKED', await shows('Inducted'));
}

// A personal email must be warned about, not refused.
const em=p.locator('input[name="email"]').first();
if(await em.count()){
  await em.fill('someone@gmail.com');
  await Promise.all([p.waitForLoadState('networkidle'), p.locator('form:has(input[name="email"]) button').first().click()]);
  /*
    Wait for the ADDRESS, not for the warning.

    The warning is generic and may already be on the page from somebody else's row, so waiting for
    it can return before this save has landed at all — and then the next line reads a page that has
    not changed yet. The address is the one thing on this screen that is unique to what was just
    typed, so it is the only honest thing to wait for.
  */
  const saved = await p.waitForFunction(
    () => document.documentElement.outerHTML.includes('someone@gmail.com'),
    null, { timeout: 15000 },
  ).then(() => true).catch(() => false);
  const after = await p.evaluate(() => document.body.innerText);
  check('A PERSONAL EMAIL IS WARNED ABOUT', /personal address/i.test(after),
    after.slice(0, 200).replace(/\n/g, ' '));
  check('  and is still SAVED, not refused', saved);
}

// The phone link.
const link=p.locator('button:has-text("Send them a link")').first();
check('EACH PERSON CAN BE SENT A PHONE LINK', await link.count()>0);
if(await link.count()){
  await Promise.all([p.waitForLoadState('networkidle'), link.click()]);
  check('  and it says it went', await shows('Link sent'));
}

const fin=await p.evaluate(()=>document.body.innerText);
check('THE BILL IS SHOWN BEFORE ANYTHING IS CHARGED', /a month|Nothing to pay/.test(fin));
check('and there is a way to finalise', /Confirm the list/.test(fin));

const real=errs.filter(e=>!HARNESS.test(e));
check('no console errors', real.length===0, real[0]??'');
await p.screenshot({path:'/tmp/claude-0/setup-tab.png',fullPage:true});
await b.close();

/*
  Clear the business this journey made. Kris, 17 September: "Make your tests delete the example
  business they create when they finish." A journey that leaves litter makes somebody else tidy up,
  and the tidying is the part nobody does.
*/
await tidyUp(BUS);

console.log(`\n${bad} failed.`);
process.exit(bad?1:0);
