// FASTEST-route timing-window probe (kept for comparison; window-probe.js probes the LOOSEST route and is the gate).
// Timing-window probe: for each template (unmirrored + mirrored, crusher seed 1) take the search solution and, for each
// input, scan tick shifts -40..+40 (others fixed) via PL.replay; window = count of contiguous winning ticks around 0.
process.env.PROBE='1';
const {search,PL}=require('./shaft-check.js');
const only=process.argv.slice(2);
const wins=(room,log)=>{const r=PL.replay(room,log.slice().sort((a,b)=>a.tick-b.tick));return r.state.won&&!r.state.dead};
function windows(room,log){return log.map((e,i)=>{let lo=0,hi=0;
  for(let d=1;d<=40;d++){const l=log.map((x,j)=>j===i?{...x,tick:x.tick-d}:x);if(e.tick-d>=0&&wins(room,l))lo=d;else break}
  for(let d=1;d<=40;d++){const l=log.map((x,j)=>j===i?{...x,tick:x.tick+d}:x);if(wins(room,l))hi=d;else break}
  return lo+hi+1})}
for(const t of PL.TEMPLATES){if(t.retired||(t.tutorial&&!only.includes(t.id)))continue;if(only.length&&!only.includes(t.id))continue;
 for(const mir of[0,1]){let room=t.make(PL.mulberry32(1*7919+13));if(mir)room=PL.mirrorRoom(room);
  const r=search(room);
  if(!r){console.log(t.id,mir?'M':'U','NOT FOUND');continue}
  const w=windows(room,r.log);
  console.log(t.id,mir?'M':'U',`${(r.t/120).toFixed(2)}s n=${r.n} minWindow=${Math.min(...w)}t(${(Math.min(...w)/120*1000).toFixed(0)}ms) windows=${w.join(',')} log=${r.log.map(e=>e.tick+':'+(e.k==='dive'?'dive':'f'+e.dir)).join(' ')}`)}}
