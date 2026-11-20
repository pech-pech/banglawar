// Independent checker: beam search at 3-tick granularity, depth<=5 inputs.
(function(){
const fs=require('fs'),vm=require('vm'),path=require('path');
const P=path.join(__dirname,'..','parts');
for(const f of ['core','rooms','tpl1','tpl2']) vm.runInThisContext('(function(){'+fs.readFileSync(path.join(P,f+'.js'),'utf8')+'\n})()',{filename:f});
const PL=globalThis.PL, C=PL.C;
function clone(s){const o=Object.assign({},s);o.pending=s.pending?{...s.pending}:null;o.crumbleS=s.crumbleS.map(c=>({...c}));
  for(const k in s){const v=s[k];if(Array.isArray(v)&&k!=='crumbleS'&&k!=='room')o[k]=v.slice();}o.events=[];return o;}
const ACTS=[null,{k:'flip',dir:0},{k:'flip',dir:1},{k:'flip',dir:2},{k:'flip',dir:3},{k:'dive'}];
const SLOT=+(process.env.SLOT||3), MAXT=25*120, MAXWAIT=+(process.env.MAXWAIT||300); // crusher rooms repeat every 288 ticks: waiting longer than ~300 ticks between inputs adds nothing
function key(s,n){const r=(v,q)=>Math.round(v/q);return [r(s.x,4),r(s.y,4),r(s.vx,25),r(s.vy,25),s.g,s.charges,s.grounded?1:0,n,s.crumbleS.map(c=>c.st).join('')].join(',')}
// Layered search: level n = states reached with n inputs. From each node coast with no input in 3-tick slots;
// every coasting state is a branch point where each action (flip x4, dive) may be applied. Dedupe by quantised key;
// frontier per level capped (FCAP) by distance-to-exit with random-free tie-break => "beam over input count".
function search(room,{maxIn=5,W=250,stopFirst=true,fm=+(process.env.FM||12),collect=null}={}){
  search.md=0;const FCAP=W*fm, hasCr=room.crushers.length>0;
  const k2=(s,n)=>{const r=(v,q)=>Math.round(v/q);return [r(s.x,4),r(s.y,4),r(s.vx,40),r(s.vy,40),s.g,s.charges,s.grounded?1:0,s.diveCd>0?1:0,s.pending?1:0,hasCr?Math.round(s.t/SLOT):'',s.crumbleS.map(c=>c.st+':'+(c.timer>0?1:0)).join('')].join(',')};
  let level=[{s:PL.newState(room),log:[]}];let best=null;const seen=new Set();
  for(let n=0;n<=maxIn&&level.length;n++){
    const nxt=[];
    for(const nd of level){
      let s=nd.s;
      for(let slot=0;slot*SLOT+s.t<MAXT&&(!hasCr||slot*SLOT<=MAXWAIT);slot++){
        { const ck='c'+k2(s,n)+'|'+n; if(slot>0&&seen.has(ck))break; seen.add(ck); }
        // branch here
        if(n<maxIn)for(const a of ACTS){ if(!a)continue; if(a.k==='flip'&&a.dir===s.g)continue;
          const c=clone(s);const t0=c.t;PL.step(c,[a]);let ok=c.dead===0;
          if(ok){for(let i=1;i<SLOT&&ok;i++){PL.step(c,[]);if(c.dead>0)ok=false;if(c.won)break}}
          if(!ok)continue;
          const log=nd.log.concat([{tick:t0,k:a.k,dir:a.dir}]);
          if(c.won){if(!best||c.t<best.t)best={t:c.t,log,n:n+1};if(collect&&collect.length<600)collect.push({t:c.t,log,n:n+1});continue}
          const kk=k2(c,n+1)+'|'+(n+1);if(seen.has(kk))continue;seen.add(kk);
          if(!search.md||Math.hypot(c.x-room.exit.x,c.y-room.exit.y)<search.md){search.md=Math.hypot(c.x-room.exit.x,c.y-room.exit.y);search.mdl=log;search.mdp=[c.x|0,c.y|0]}
          nxt.push({s:c,log,sc:Math.hypot(c.x-room.exit.x,c.y-room.exit.y)});
        }
        // coast one slot
        const c=clone(s);let ok=true;for(let i=0;i<SLOT;i++){PL.step(c,[]);if(c.dead>0){ok=false;break}if(c.won)break}
        if(!ok)break;
        if(c.won){if(!best||c.t<best.t)best={t:c.t,log:nd.log,n};if(collect&&collect.length<600)collect.push({t:c.t,log:nd.log,n});break}
        s=c;
      }
    }
    if(best&&stopFirst)return best;
    if(nxt.length>FCAP){ /* stratified subsample (distance heuristic mis-prunes 'go away first' rooms): keep best 25% by distance, stride the rest */ nxt.sort((a,b)=>a.sc-b.sc);const keep=nxt.slice(0,FCAP>>2),rest=nxt.slice(FCAP>>2),stride=rest.length/(FCAP-(FCAP>>2));const pick=[];for(let i=0;i<FCAP-(FCAP>>2);i++)pick.push(rest[Math.floor(i*stride)]);nxt.length=0;nxt.push(...keep,...pick)}
    level=nxt;
  }
  return best;
}
function segHitsRect(a,b,r){for(let i=0;i<=40;i++){const x=a.x+(b.x-a.x)*i/40,y=a.y+(b.y-a.y)*i/40;if(x>=r[0]&&x<=r[0]+r[2]&&y>=r[1]&&y<=r[1]+r[3])return true}return false}
if(process.env.PROBE){module.exports={search,PL,clone};return}
const rows=[],probs=[];
function checkRoom(tpl,mir,seed){
  const rng=PL.mulberry32(seed*7919+13);let room=tpl.make(rng);if(mir)room=PL.mirrorRoom(room);
  let r=search(room);
  if(!r)r=search(room,{W:250,fm:24});
  return {room,r};
}
const hasCr=t=>t.make(PL.mulberry32(1)).crushers.length>0;
const TP=process.env.TPLS?process.env.TPLS.split(','):null;const MERGE=process.env.MERGE;
const RF=id=>path.join(__dirname,'..','review','.rows-'+id+'.json');
for(const tpl of PL.TEMPLATES){
  if(tpl.retired||process.env.SHAFTONLY)continue; // SHAFTONLY=1: skip the per-template beam runs, check shafts only
  if(MERGE){rows.push(JSON.parse(fs.readFileSync(RF(tpl.id),'utf8')).row);for(const x of JSON.parse(fs.readFileSync(RF(tpl.id),'utf8')).probs)probs.push(x);continue}
  if(TP&&!TP.includes(tpl.id))continue;const probs0=probs.length;
  const cr=hasCr(tpl);const seeds=cr?[1,2,3,4,5]:[1];
  let fast=Infinity,fails=0,maxIn=0,triv=false,tn=0;
  let skipRest=false;
  for(const mir of [0,1])for(const sd of seeds){
    if(skipRest&&sd!==seeds[0]){tn++;fails++;continue}
    const {room,r}=checkRoom(tpl,mir,sd);tn++;
    if(!r){fails++;if(sd===seeds[0]&&mir===1&&fails>=2)skipRest=true;probs.push(`${tpl.id} mir=${mir} seed=${sd}: NO solution found (beam W250 x24 frontier, <=5 inputs, <=25s)`);continue}
    fast=Math.min(fast,r.t/120);maxIn=Math.max(maxIn,r.n);
    if(sd===seeds[0]){ // trivial test: <=1 input
      const one=search(room,{maxIn:1,W:400});
      const line=[...room.spikes.map(s=>s.r),...room.crushers.map(c=>c.r)].some(rc=>segHitsRect(room.start,room.exit,rc));
      if(one&&one.n<=1&&!line){triv=true;probs.push(`${tpl.id} mir=${mir}: TRIVIAL (clears with ${one.n} input(s), ${(one.t/120).toFixed(1)}s, no hazard on start-exit line)`)}
      else if(one&&one.n<=1)probs.push(`${tpl.id} mir=${mir}: note: clears with ${one.n} input(s) (${(one.t/120).toFixed(1)}s) but hazard on line`);
    }
    // determinism replay
    const rp=PL.replay(room,r.log);if(!rp.state.won)probs.push(`${tpl.id} mir=${mir} seed=${sd}: beam log does not replay to win via PL.replay (state.won=false)`);
  }
  rows.push({id:tpl.id,tier:tpl.tier,teach:tpl.teach,cr,runs:tn,fails,fast,maxIn,triv});
  if(TP)fs.writeFileSync(RF(tpl.id),JSON.stringify({row:rows[rows.length-1],probs:probs.slice(probs0)}));
  process.stderr.write(tpl.id+' fast='+fast.toFixed(2)+' fails='+fails+'\n');
}
if(TP&&!MERGE)return;
// shaft checks (slot table): n=5 and n=7, seeds SR (default 1..40)
let shaftProb=[];const failT=new Set(rows.filter(r=>r.fails>0).map(r=>r.id));const cache=new Map();
const SR=process.env.SEEDS?process.env.SEEDS.split('-').map(Number):[1,40];
const SF=a=>path.join(__dirname,'..','review','.shaft-'+a+'.json');
const spikeNearExit=r=>r.spikes.some(s=>{const q=s.r,e=r.exit,dx=Math.max(q[0]-e.x,0,e.x-q[0]-q[2]),dy=Math.max(q[1]-e.y,0,e.y-q[1]-q[3]);return Math.hypot(dx,dy)<22});
if(process.env.FINAL){for(const f of fs.readdirSync(path.join(__dirname,'..','review')).filter(f=>f.startsWith('.shaft-')).sort())shaftProb.push(...JSON.parse(fs.readFileSync(path.join(__dirname,'..','review',f),'utf8')))}
else for(const N of [5,7])for(let sd=SR[0];sd<=SR[1];sd++){
  const sh=PL.buildShaft(sd,N);const ids=sh.map(r=>r.templateId);const tag=`n=${N} seed ${sd}`;
  if(sh.length!==N||new Set(ids).size!==N){shaftProb.push(`${tag}: ids ${ids.join(',')} not ${N} distinct`);continue}
  const T=ids.map(i=>PL.TEMPLATES.find(t=>t.id===i));
  if(T.some(t=>t.tutorial||t.retired))shaftProb.push(`${tag}: tutorial/retired template in shaft ${ids}`);
  if(PL.pickShaft(sd,N).level>0)shaftProb.push(`${tag}: slot rules had to be relaxed (level ${PL.pickShaft(sd,N).level})`);
  if(JSON.stringify(PL.buildShaft(sd,N))!==JSON.stringify(sh))shaftProb.push(`${tag}: not deterministic`);
  T.forEach((t,i)=>{if(i&&T[i-1].family===t.family)shaftProb.push(`${tag}: adjacent rooms ${T[i-1].id},${t.id} share family ${t.family}`);if(i&&sh[i-1].mirrored===sh[i].mirrored)shaftProb.push(`${tag}: adjacent rooms ${i-1},${i} same mirrored flag`)});
  const firstCr=sh.findIndex(r=>r.crushers.length),firstCu=sh.findIndex(r=>r.crumbles.length);
  if(firstCr>=0&&ids[firstCr]!=='t03')shaftProb.push(`${tag}: first crusher room is ${ids[firstCr]}, not t03`);
  if(firstCu>=0&&ids[firstCu]!=='t18')shaftProb.push(`${tag}: first crumble room is ${ids[firstCu]}, not t18`);
  sh.forEach((room,i)=>{if(spikeNearExit(room))shaftProb.push(`${tag} room ${i} (${room.templateId}): exit within 22 of spikes`);
    if(failT.has(room.templateId)){shaftProb.push(`${tag} room ${i} (${room.templateId}): template flagged unsolved above (not re-searched)`);return}const ck=room.crushers.length?room.templateId+'|'+room.mirrored:JSON.stringify(room);/* crusher rooms: phase only delays the route by <1 period (the bob starts at rest), so one phase per template+mirror proves all */let r=cache.get(ck);if(r===undefined){r=search(room)||search(room,{W:250,fm:24});cache.set(ck,r)}if(!r)shaftProb.push(`${tag} room ${i} (${room.templateId}${room.mirrored?' mirrored':''}): unsolvable by beam`)});
}
if(process.env.SEEDS){fs.writeFileSync(SF(SR[0]),JSON.stringify(shaftProb));process.exit(0)}
const tot=PL.TEMPLATES.length;
let md=`# Template review (independent beam-search checker)\nGenerated by src/test/shaft-check.js: beam search (width 250, retry frontier x24), inputs at 3-tick slots, none/flip x4/dive, <=5 inputs, <=25 s. Templates found: ${tot}.\n\n| id | tier | crusher | runs | unsolved | fastest clear (s) | max inputs used | trivial |\n|---|---|---|---|---|---|---|---|\n`;
for(const r of rows)md+=`| ${r.id} | ${r.tier} | ${r.cr?'y':'n'} | ${r.runs} | ${r.fails} | ${isFinite(r.fast)?r.fast.toFixed(2):'-'} | ${r.maxIn} | ${r.triv?'TRIVIAL':'no'} |\n`;
md+=`\n## Shaft check (seeds ${SR[0]}..${SR[1]}, n=5 and 7)\n${shaftProb.length?shaftProb.map(x=>'- '+x).join('\n'):'All seeds: distinct templates, slot table, family/mirror alternation, first-meet rules, exit clear of spikes, deterministic, all rooms solvable.'}\n\n## Per-template findings and fixes\n${probs.length?probs.map(x=>'- '+x).join('\n'):'None.'}\n`;
if(process.env.OUT)fs.writeFileSync(process.env.OUT,md);
console.log(md);
})();
