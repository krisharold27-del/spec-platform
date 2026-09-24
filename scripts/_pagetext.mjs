import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const BASE='http://localhost:3100', OUT='/tmp/claude-0/pagetext';
mkdirSync(OUT,{recursive:true});
const PAGES=[['my-page','/my-page'],['jobs','/jobs'],['jobs-quotes','/jobs?tab=quotes'],['crm','/crm'],['clients','/clients'],['org','/org'],['people','/people'],['safety','/safety'],['coverage','/coverage'],['tech-day','/tech-day'],['training','/training'],['scoring','/scoring'],['board','/board'],['mirrors','/mirrors'],['connections','/connections'],['setup','/setup'],['billing','/billing'],['settings','/settings'],['landing','/'],['pricing','/pricing'],['meeting','/meeting'],['inbox','/inbox'],['summary','/summary'],['site','/site'],['me','/me']];
const b=await chromium.launch({executablePath:process.env.CHROME_PATH});
const p=await (await b.newContext({viewport:{width:1400,height:1000}})).newPage();
const stamp=Date.now();
await p.goto(`${BASE}/signup`,{waitUntil:'networkidle'});
await p.fill('input[name="name"]','Kris Harold');
await p.fill('input[name="business"]',`Audit ${stamp}`);
await p.fill('input[name="email"]',`audit-${stamp}@journey.test`);
await p.fill('input[name="password"]','a-good-password-123');
await p.check('input[name="consent"]').catch(()=>{});
await p.click('button[type="submit"]');
await p.waitForURL(u=>!u.pathname.startsWith('/signup'),{timeout:25000}).catch(()=>{});
for(const [n,path] of PAGES){
  try{ await p.goto(`${BASE}${path}`,{waitUntil:'networkidle',timeout:25000}); await p.waitForTimeout(500);
    const t=await p.evaluate(()=>document.body.innerText);
    writeFileSync(`${OUT}/${n}.txt`, t);
    console.log(`${n}: ${t.length} chars`);
  }catch(e){ console.log(`${n}: FAILED ${String(e).slice(0,60)}`); }
}
await b.close();
