import { WORKFLOWS, FAMILIES, tally, tallyLine, gaps, tooFar, doneForYou, inFamily, stateOf } from '../src/lib/workflows';
const t = tally();
console.log(tallyLine(t));
console.log();
for (const f of FAMILIES) {
  const ws = inFamily(f.key);
  const whole = ws.filter(w => stateOf(w) === 'whole').length;
  console.log(`${f.label.padEnd(28)} ${String(ws.length).padStart(2)} workflows · ${whole} end to end`);
}
const steps = WORKFLOWS.reduce((n, w) => n + w.steps.length, 0);
const auto = WORKFLOWS.reduce((n, w) => n + doneForYou(w).auto, 0);
console.log(`\n${steps} steps in all · ${auto} of them (${Math.round(auto/steps*100)}%) happen without anybody doing anything.`);

console.log('\n── SENDS SOMEBODY SOMEWHERE ELSE ──');
const far = tooFar();
if (!far.length) console.log('  none.');
for (const f of far) console.log(`  ${f.workflow.name}  —  the ${f.who} has to visit ${f.places.join(' AND ')}`);

console.log('\n── STEPS WITH NO HOME ──');
for (const g of gaps()) console.log(`  ${g.workflow.name}: ${g.step.does}`);

const { unreachable, movesNothing, movedBy } = await import('../src/lib/workflows');
const { FRAMEWORK } = await import('../src/lib/power-meter');
console.log('\n── POWER METER ──');
console.log(`  ${FRAMEWORK.length} measures on the meter.`);
const dead = unreachable();
console.log(dead.length ? `  NO WORKFLOW MOVES: ${dead.join(', ')}` : '  Every measure has at least one workflow behind it.');
const idle = movesNothing();
console.log(idle.length ? `  MOVES NOTHING: ${idle.map(w => w.name).join(', ')}` : '  Every workflow moves at least one measure.');
const busiest = [...FRAMEWORK].map(s => ({ s, n: movedBy(s.id).length })).sort((a,b)=>b.n-a.n);
console.log(`  Most workflows behind it: ${busiest[0].s.name} (${busiest[0].n}) · fewest: ${busiest[busiest.length-1].s.name} (${busiest[busiest.length-1].n})`);

const { byStream, ownedBy, emptyStreams } = await import('../src/lib/workflows');
const { STREAMS, ABOVE, ownerLabel } = await import('../src/lib/streams');
console.log('\n── THE THREE STREAMS ──');
for (const t of byStream()) {
  const pct = t.steps ? Math.round(t.auto / t.steps * 100) : 0;
  console.log(`  ${ownerLabel(t.owner).padEnd(20)} ${String(t.total).padStart(2)} workflows · ${t.whole} end to end · ${pct}% of steps happen on their own`);
}
const empty = emptyStreams();
console.log(empty.length ? `  EMPTY STREAM: ${empty.join(', ')}` : '  No stream is empty.');
