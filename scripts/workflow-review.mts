/*
  The workflow map, written out for Kris to mark up.

  Not the /workflows page — that one is for a business looking at SPEC. This is for the person who
  knows the trade better than the product does, going through it looking for what is wrong and what
  is missing. So it is dense, it is grouped the way he thinks (stream, then sector-independent
  family), and every step says WHO does it, because "SPEC does this one" is the claim most worth
  arguing with.
*/
import { writeFileSync } from 'node:fs';
import {
  WORKFLOWS, FAMILIES, byStream, ownedBy, tally, gaps, tooFar,
  stateOf, doneForYou, type Workflow, type Actor,
} from '../src/lib/workflows';
import { STREAMS, ABOVE, type Owner } from '../src/lib/streams';

const WHO: Record<Actor, string> = {
  spec: 'SPEC', field: 'Site', office: 'Office', leader: 'Leader',
  worker: 'Them', customer: 'Customer',
};

const t = tally();
const steps = WORKFLOWS.reduce((n, w) => n + w.steps.length, 0);
const auto = WORKFLOWS.reduce((n, w) => n + doneForYou(w).auto, 0);

const out: string[] = [];
const say = (s = '') => out.push(s);

say('# Workflow review');
say();
say(`${t.total} workflows · ${t.whole} run end to end · ${t.partial} have a step with no home yet.`);
say(`${steps} steps, ${auto} of them (${Math.round(auto / steps * 100)}%) happen without anybody doing anything.`);
say();
say('**How to mark this up.** Against any workflow, one of four things:');
say();
say('- **WRONG** — that is not how it works in a trade business.');
say('- **MISSING** — a step that has to happen and is not here.');
say('- **NOT OURS** — real, but not something SPEC should do.');
say('- **SHOULD BE AUTOMATIC** — a step marked Office or Site that SPEC could just do.');
say();
say('The last one is the valuable column. Every step SPEC does is a step nobody has to be trained');
say('to remember, and it is the whole difference from what you walked away from.');
say();
say('---');
say();

const order: Owner[] = ['commercial', 'operations', 'growth', 'whole'];
for (const owner of order) {
  const s = STREAMS.find(x => x.key === owner);
  const tal = byStream().find(x => x.owner === owner)!;
  say(`## ${s ? s.label : ABOVE.label}`);
  say();
  if (s) say(`*${s.is}*`);
  else say(`*${ABOVE.is}*`);
  say();
  say(`${tal.total} workflows · ${tal.whole} end to end · ${tal.steps ? Math.round(tal.auto / tal.steps * 100) : 0}% of steps automatic`);
  say();

  for (const f of FAMILIES) {
    const ws = ownedBy(owner).filter(w => w.family === f.key);
    if (ws.length === 0) continue;
    say(`### ${f.label}`);
    say();
    for (const w of ws) {
      const partial = stateOf(w) === 'partial';
      say(`**${w.name}**${partial ? '  ⚠ has a hole' : ''}`);
      say();
      say(`- Starts: ${w.starts}`);
      say(`- Done when: ${w.ends}`);
      for (const st of w.steps) {
        const who = WHO[st.by];
        say(`  ${st.where ? '·' : '✗'} **${who}** — ${st.does}${st.where ? ` *(${st.where})*` : ''}`);
        if (!st.where) say(`      NOT BUILT: ${st.gap}`);
      }
      say();
    }
  }
  say('---');
  say();
}

say('## The holes, gathered');
say();
for (const g of gaps()) say(`- **${g.workflow.name}** — ${g.step.does}`);
say();
say('## Still sends somebody to a second screen');
say();
for (const d of tooFar()) say(`- **${d.workflow.name}** — the ${d.who} visits ${d.places.join(' and ')}`);
say();
say('## What is not here at all');
say();
say('This is the question worth most of your time. The map was written from the outside looking in.');
say('A trade business does things nobody writes down, and those are exactly the ones a system ends');
say('up not doing.');

writeFileSync('docs/WORKFLOW-REVIEW.md', out.join('\n') + '\n');
console.log(`docs/WORKFLOW-REVIEW.md — ${WORKFLOWS.length} workflows, ${steps} steps.`);
