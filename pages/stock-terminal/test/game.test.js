"use strict";
const assert=require("assert");
const {load}=require("./_load.js");
let fails=0;
function t(name,fn){return Promise.resolve().then(fn).then(()=>console.log("ok   "+name),e=>{fails++;console.log("FAIL "+name+"\n     "+(e&&e.message||e))})}
const EXTRA=["ui.js","pfsvg.js","tweak.js"];
const mk=async()=>{const c=await load({data:true,extra:EXTRA}).init();c.run("localStorage.removeItem('st.journal.v1')");return c};
const J=(c,code)=>JSON.parse(c.run("JSON.stringify("+code+")"));
// play a full period: bullish on even stocks, bearish on odd k==1, neutral on 3; deterministic
function play(c,seed){
  c.run("newPeriod("+seed+")");
  for(let w=0;w<10;w++){
    c.run("S.views=[1,-1,1,0,-1,1]");
    c.run("S.sel=0;S.side=1;S.qty=1;place()");
    c.run("advance()");
  }
  return J(c,"{eq:S.eqHist,calls:S.calls,neutrals:S.neutrals,orders:S.orders,fired:S.fired}");
}
(async()=>{
const c=await mk();

await t("seed determinism: same seed + actions -> same eqHist/calls",async()=>{
  const a=play(c,48213),d=await mk(),b=play(d,48213);
  assert.strictEqual(JSON.stringify(a),JSON.stringify(b));
  assert.strictEqual(a.eq.length,11);
});

await t("call record fields; pat alias == sig||'No signal'; dir alias == view",()=>{
  const r=play(c,48213);
  assert(r.calls.length>0,"no calls");
  for(const cl of r.calls){
    assert(cl.view===1||cl.view===-1);assert.strictEqual(cl.dir,cl.view);
    assert.strictEqual(cl.pat,cl.sig||"No signal");
    assert.strictEqual(cl.id,cl.seed+":"+cl.wk+":"+cl.k);
    assert(cl.sigDir===0||cl.sigDir===1||cl.sigDir===-1);
    if(cl.sigDir===0)assert.strictEqual(cl.withSig,null);else assert.strictEqual(cl.withSig,cl.sigDir===cl.view);
    assert(cl.base>=0&&cl.base<=1,"base "+cl.base);
  }
});

await t("neutral views counted in S.neutrals, not calls",()=>{
  const r=play(c,48213);
  assert.strictEqual(r.neutrals.length,10);
  assert(r.neutrals.every(n=>n.k===3));
  assert(!r.calls.some(cl=>cl.k===3));
});

await t("counter-signal call -> withSig===false",()=>{
  let found=null;
  for(let seed=1;seed<=200&&!found;seed++){
    c.run("newPeriod("+seed+")");
    for(let k=0;k<6;k++){if(c.run("stockInfo("+k+").si.dir")===-1){found={seed,k};break}}
  }
  assert(found,"no stock with a sell signal found in 200 seeds");
  c.run("newPeriod("+found.seed+")");
  c.run("S.views=[null,null,null,null,null,null];S.views["+found.k+"]=1;advance()");
  const cl=J(c,"S.calls.find(x=>x.k==="+found.k+")");
  assert(cl,"call missing");
  assert.strictEqual(cl.sigDir,-1);assert.strictEqual(cl.view,1);assert.strictEqual(cl.withSig,false);
});

await t("sigAge counts columns (age == cols.length-1-col)",()=>{
  let checked=0;
  for(let seed=1;seed<=60;seed++){
    c.run("newPeriod("+seed+")");
    for(let k=0;k<6;k++){
      const si=J(c,"(()=>{const i=stockInfo("+k+");return {si:i.si,n:i.cols.length}})()");
      if(si.si.name){assert.strictEqual(si.si.age,si.n-1-si.si.col);checked++}
      else assert.strictEqual(si.si.dir,0);
    }
  }
  assert(checked>0,"no signals seen");
  // recorded sigAge equals si.age at call time
  c.run("newPeriod(7)");
  const ages=J(c,"[0,1,2,3,4,5].map(k=>stockInfo(k).si.age)");
  c.run("S.views=[1,1,1,1,1,1];advance()");
  const calls=J(c,"S.calls");
  for(const cl of calls){assert.strictEqual(cl.sigAge,ages[cl.k]);}
});

await t("order with no view counted in noCallCount",()=>{
  c.run("newPeriod(48213)");
  assert.strictEqual(c.run("noCallCount()"),0);
  c.run("S.sel=0;S.views[0]=null;S.side=1;S.qty=1;place()");
  assert.strictEqual(c.run("noCallCount()"),1);
  c.run("S.sel=1;setView(1);S.side=1;S.qty=1;place()");
  assert.strictEqual(c.run("noCallCount()"),1);
  assert.strictEqual(c.run("S.orders[1].view"),1);
  // tap same view again clears it
  c.run("S.sel=1;setView(1)");
  assert.strictEqual(c.run("S.views[1]"),null);
});

await t("place success closes sheet; reject keeps it",()=>{
  c.run("newPeriod(48213)");
  c.run("S.sheet='order';S.sel=0;S.side=1;S.qty=1;place()");
  assert.strictEqual(c.run("S.sheet"),null);assert(/^Filled/.test(c.run("S.lastMsg")));
  c.run("S.sheet='order';S.side=-1;S.qty=999999;place()");
  assert.strictEqual(c.run("S.sheet"),"order");assert(/^Rejected/.test(c.run("S.lastMsg")));
});

await t("advance goes home + week sheet; report shape; fired entries",()=>{
  c.run("newPeriod(48213);advance()");
  assert.strictEqual(c.run("S.screen"),"home");assert.strictEqual(c.run("S.sheet"),"week");
  const r=J(c,"S.report");
  assert.strictEqual(r.wk,1);assert.strictEqual(r.rows.length,6);
  for(const k of ["eq0","eq","b0","bn","resolved","neutrals","open"])assert(k in r,k);
  const f=play(c,48213).fired;
  for(const x of f){assert(x.wk>=1&&x.k>=0&&x.k<6&&x.name&&(x.dir===1||x.dir===-1))}
});

await t("reportText baseline never null at weeks 0..10",()=>{
  c.run("newPeriod(48213)");
  for(let w=0;w<=10;w++){
    let rt=c.run("reportText()");if(typeof rt==="string")rt=JSON.parse(rt);
    assert(rt.baseline!==null&&rt.baseline!==undefined,"baseline null at week "+w);
    assert.strictEqual(rt.week,w);
    if(w<10)c.run("S.views=[1,null,-1,null,null,null];advance()");
  }
});

await t("sigChip: stale shows 'cols ago', fresh shows this week, none",()=>{
  const q=s=>c.run("sigChip("+JSON.stringify(s)+")");
  const stale=q({name:"DOUBLE-TOP BUY",dir:1,age:3,fresh:false});
  assert(/3 cols ago/.test(stale),stale);assert(/stale/.test(stale),stale);
  const fresh=q({name:"TRIPLE-TOP BUY",dir:1,age:0,fresh:true});
  assert(/this week/.test(fresh)&&/fresh/.test(fresh),fresh);
  assert(/No signal/.test(q({name:null,dir:0,age:null,fresh:false})));
  assert(/Bull trap\?/.test(q({name:null,dir:0,age:null,fresh:false,trap:"bull"})));
});

await t("journal split rows sum to totals (period + lifetime)",()=>{
  c.run("journalReset()");
  play(c,48213);play(c,777);
  const st=J(c,"journalStats()");
  assert(st.n>0,"journal empty");
  const sum=o=>o.with.closed+o.against.closed+o.none.closed;
  assert.strictEqual(sum(st.split),st.all.closed);
  assert.strictEqual(st.fresh.fresh.closed+st.fresh.stale.closed,st.split.with.closed+st.split.against.closed);
  assert.strictEqual(st.bull.closed+st.bear.closed,st.all.closed);
  const ps=J(c,"splitStats(S.calls.filter(x=>x.res),journalLoad().length)");
  const pa=J(c,"callStats(S.calls,journalLoad().length)");
  assert.strictEqual(sum(ps),pa.closed);
});

console.log(fails?fails+" FAILED":"all passed");process.exit(fails?1:0);
})();
