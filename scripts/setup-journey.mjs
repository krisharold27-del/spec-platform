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

// The two toggles.
const lead=p.locator('form:has(input[value="leadership"]) button').first();
check('THERE IS A TEAM / LEADERSHIP TOGGLE', await lead.count()>0);
if(await lead.count()){
  await Promise.all([p.waitForLoadState('networkidle'), lead.click()]);
  await p.waitForTimeout(900);
  const after=await p.evaluate(()=>document.body.innerText);
  check('  and pressing it changes the bill', /a month|Nothing to pay/.test(after), after.slice(0,200).replace(/\n/g,' '));
}

const sub=p.locator('form:has(input[name="on"]) button:has-text("Subcontractor")').first();
check('THERE IS A SUBCONTRACTOR TICK', await sub.count()>0);
if(await sub.count()){
  await Promise.all([p.waitForLoadState('networkidle'), sub.click()]);
  await p.waitForTimeout(900);
  check('  and it sticks', /✓ Subcontractor/.test(await p.evaluate(()=>document.body.innerText)));
}

// A licence with an expiry.
const lic=p.locator('input[name="what"]').first();
check('A LICENCE CAN BE ADDED WITH ITS EXPIRY', await lic.count()>0);
if(await lic.count()){
  await lic.fill('A-grade electrical licence');
  await p.locator('input[name="expiresAt"]').first().fill('2027-06-30');
  await Promise.all([p.waitForLoadState('networkidle'), p.locator('form:has(input[name="what"]) button').first().click()]);
  await p.waitForTimeout(900);
  check('  and it shows with the date', /A-grade electrical licence/.test(await p.evaluate(()=>document.body.innerText)));
}

// Induction.
const ind=p.locator('button:has-text("Mark inducted")').first();
if(await ind.count()){
  await Promise.all([p.waitForLoadState('networkidle'), ind.click()]);
  await p.waitForTimeout(900);
  check('INDUCTION CAN BE MARKED', /Inducted/.test(await p.evaluate(()=>document.body.innerText)));
}

// A personal email must be warned about, not refused.
const em=p.locator('input[name="email"]').first();
if(await em.count()){
  await em.fill('someone@gmail.com');
  await Promise.all([p.waitForLoadState('networkidle'), p.locator('form:has(input[name="email"]) button').first().click()]);
  await p.waitForTimeout(900);
  const after=await p.evaluate(()=>document.body.innerText);
  check('A PERSONAL EMAIL IS WARNED ABOUT', /personal address/i.test(after), after.slice(0,200).replace(/\n/g,' '));
  check('  and is still SAVED, not refused', /someone@gmail.com/.test(await p.content()));
}

// The phone link.
const link=p.locator('button:has-text("Send them a link")').first();
check('EACH PERSON CAN BE SENT A PHONE LINK', await link.count()>0);
if(await link.count()){
  await Promise.all([p.waitForLoadState('networkidle'), link.click()]);
  await p.waitForTimeout(900);
  check('  and it says it went', /Link sent/.test(await p.evaluate(()=>document.body.innerText)));
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
