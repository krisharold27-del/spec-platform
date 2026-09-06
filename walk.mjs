// End-to-end walk of the deployment journey as a brand-new business. Screenshots to /tmp/walk-*.png
import { chromium } from 'playwright';
const B = 'http://localhost:3055';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
const shot = (n) => p.screenshot({ path: `/tmp/walk-${n}.png`, fullPage: true });
const log = (...a) => console.log(...a);
const settle = async () => { await p.waitForLoadState('networkidle'); await p.waitForTimeout(700); };

// 1. Four questions
await p.goto(B + '/start', { waitUntil: 'networkidle' }); await shot('01-start');
await p.check('input[name=q_safety][value=no]'); await p.check('input[name=q_people][value=yes]');
await p.check('input[name=q_earnings][value=yes]'); await p.check('input[name=q_compliance][value=no]');
await p.click('button:has-text("See what this means")'); await settle(); await shot('02-signup');
log('signup headline:', await p.textContent('h1'));

// 2. Sign up
await p.fill('input[name=business]', 'Northside Electrical'); await p.fill('input[name=sector]', 'Electrical services');
await p.fill('input[name=name]', 'Dana Ryan'); await p.fill('input[name=email]', 'dana@northside.example');
await p.click('button:has-text("Create my business")'); await settle();
log('after signup url:', p.url()); await shot('03-claude');

// 3. Try to skip registration -> journey should show blocked
await p.goto(B + '/journey', { waitUntil: 'networkidle' }); await shot('04-journey-blocked');
log('blocked count:', await p.locator('text=Blocked').count());

// Register Claude
await p.goto(B + '/setup/claude', { waitUntil: 'networkidle' });
await p.fill('input[name=workspaceName]', 'Northside Electrical'); await p.check('input[name=seatsConfirmed]');
await p.click('button:has-text("Save and continue")'); await settle(); log('after register url:', p.url()); await shot('05-journey-open');

// 4. Expectations: question zero + covenant + a few sections
await p.goto(B + '/setup/expectations', { waitUntil: 'networkidle' });
await p.fill('textarea[name="q:question_zero:qz1"]', 'Our accountant flagged that gross margin dropped from 38% to 31% over two quarters while revenue grew. We are busier and making less.');
await p.click('#question_zero button:has-text("Save")'); await settle();
await p.fill('textarea[name="q:org_diagnostic:od1"]', 'Industrial maintenance for food processors — reliable, fast call-outs.');
await p.fill('textarea[name="q:org_diagnostic:od2"]', 'Three clients over ten years, no lost-time injuries in four.');
await p.fill('textarea[name="q:org_diagnostic:od3"]', 'Hold margin at 38%+ while growing 15%.');
await p.fill('textarea[name="q:org_diagnostic:od4"]', 'Add scheduled maintenance contracts as base load.');
await p.fill('textarea[name="q:org_diagnostic:od5"]', 'Second branch.');
await p.selectOption('select[name="q:org_diagnostic:od6"]', 'same');
await p.fill('textarea[name="q:org_diagnostic:od7"]', 'Scale the maintenance model with supervisors who can run a crew.');
await p.click('#org_diagnostic button:has-text("Save")'); await settle();
await p.check('input[name="q:covenant:accepted"]'); await p.click('#covenant button:has-text("Save")'); await settle();
await shot('06-expectations');

// 5. Roles: add the three COGS heads + supervisor
await p.goto(B + '/setup/roles', { waitUntil: 'networkidle' });
for (let i = 0; i < 3; i++) { await p.click('form:has(input[name=template]) >> nth=0 >> button:has-text("Add")'); await settle(); }
await p.click('form:has(input[name=template][value=supervisor]) button:has-text("Add")'); await settle();
await shot('07-roles');

// 6. KPIs: negotiate ops GP target from placeholder to 40%
await p.goto(B + '/setup/kpis', { waitUntil: 'networkidle' });
const opsHref = await p.getAttribute('a:has-text("Head of Operations")', 'href'); await p.goto(B + opsHref, { waitUntil: 'networkidle' });
const targets = p.locator('input[name$=":target"]'); const n = await targets.count();
for (let i = 0; i < n; i++) { const v = await targets.nth(i).inputValue(); if (v.includes('gp_target')) await targets.nth(i).fill('40% (proposed 42%)'); if (v.includes('utilisation')) await targets.nth(i).fill('85%'); if (v.includes('nps')) await targets.nth(i).fill('80'); }
await p.click('button:has-text("Save Head of Operations KPIs")'); await settle(); await shot('08-kpis');
// try a bad weight
await p.locator('input[name$=":weight"]').first().fill('70'); await p.click('button:has-text("Save Head of Operations KPIs")'); await settle();
log('weight guard message:', (await p.textContent('body')).includes('Not saved') ? 'shown' : 'MISSING'); await shot('09-kpi-guard');

// 7. People
await p.goto(B + '/setup/people', { waitUntil: 'networkidle' });
const people = [['Head of Commercial','Sam Lee','sam@northside.example'],['Head of Operations','Jo Barnes','jo@northside.example'],['Head of Growth','Chris Nguyen','chris@northside.example']];
for (const [role, name, email] of people) {
  const li = p.locator(`li:has-text("${role}")`); await li.locator('input[name=name]').first().fill(name); await li.locator('input[name=email]').first().fill(email);
  await li.locator('button:has-text("Assign and invite")').click(); await settle();
}
await shot('10-people');
await p.goto(B + '/journey', { waitUntil: 'networkidle' }); await shot('11-journey-stage1-done');

// 8. Manager signs in and scores own role
await p.goto(B + '/signout'); await p.click('button:has-text("Sign out")'); await settle();
await p.goto(B + '/signin'); await p.fill('input[name=email]', 'jo@northside.example'); await p.click('button:has-text("Sign in")'); await settle();
await p.goto(B + '/me', { waitUntil: 'networkidle' }); log('manager landed on:', p.url());
const radios = await p.$$('input[type=radio][value=Y]'); for (const r of radios) await r.check();
await p.locator('input[type=radio][value=N]').nth(5).check(); await p.locator('input[name^="note:"]').nth(5).fill('GP 36% — reprice the two loss-making maintenance contracts at renewal in October');
await p.click('button:has-text("Save scorecard")'); await settle(); await shot('12-manager-scored');

// 9. GM: gates, lock, board output
await p.goto(B + '/signout'); await p.click('button:has-text("Sign out")'); await settle();
await p.goto(B + '/signin'); await p.fill('input[name=email]', 'dana@northside.example'); await p.click('button:has-text("Sign in")'); await settle();
await p.goto(B + '/', { waitUntil: 'networkidle' });
await p.fill('input[name=training]', '92'); await p.fill('input[name=ctwReason]', 'Two working-at-heights tickets expired; rebooked for 14 Sept.');
await p.click('button:has-text("Save gates")'); await settle(); await shot('13-exec-gates');
await p.click('button:has-text("and generate board output")'); await settle(); log('board url:', p.url()); await shot('14-board-output');
await p.click('button:has-text("Approve for the board")'); await settle();
await p.goto(B + '/journey', { waitUntil: 'networkidle' }); await shot('15-journey-final');
log('journey done count:', await p.locator('span:has-text("Done")').count());
await b.close();
