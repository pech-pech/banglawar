"use strict";
// E2: evidence calculator tests (own vm loader; does not depend on evidence.js or game.js)
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const ROOT=path.resolve(__dirname,"..");
const rawText=fs.readFileSync(path.join(ROOT,"data","weekly.json"),"utf8");
const store={};
const sb={console,Math,JSON,Object,Array,Number,String,Set,Map,Promise,Date,Error,isFinite,parseFloat,parseInt,Int32Array,Int8Array,Float64Array,
  localStorage:{getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}},
  fetch:async()=>({ok:true,status:200,json:async()=>JSON.parse(rawText)}),setTimeout,clearTimeout};
sb.window=sb;sb.self=sb;
const ctx=vm.createContext(sb);
for(const f of ["core.js","data.js","pnf.js","evcalc.js"])vm.runInContext(fs.readFileSync(path.join(ROOT,"src",f),"utf8"),ctx,{filename:f});
const run=c=>vm.runInContext(c,ctx);
let fails=0;
function t(name,fn){try{fn();console.log("ok   "+name)}catch(e){fails++;console.log("FAIL "+name+"\n     "+(e&&e.message||e))}}
const PAT=["DOUBLE-TOP BUY","TRIPLE-TOP BUY","DOUBLE-BOTTOM SELL","TRIPLE-BOTTOM SELL","BULL TRAP","BEAR TRAP"];
const IND=["RSI >60","RSI <40","MACD h +","MACD h -","Above 10wk MA","Below 10wk MA","RS rising","RS falling"];
function shape(ev,label){
  assert(Math.abs(ev.base.bull+ev.base.bear-1)<1e-9,label+" base sum");
  assert(ev.base.n>0,label+" base n");
  for(const k of PAT)assert(ev.pat[k],label+" missing pat "+k);
  for(const k of IND)assert(ev.ind[k],label+" missing ind "+k);
  for(const grp of [ev.pat,ev.ind])for(const k in grp){const p=grp[k],b=p.dir===1?ev.base.bull:ev.base.bear;
    assert(p.ft>=0&&p.ft<=1&&p.lo>=0&&p.hi<=1&&p.lo<=p.ft+1e-9&&p.ft<=p.hi+1e-9,label+" "+k+" ft/band range");
    assert(Math.abs(p.lift-(p.ft-b)*100)<=0.06,label+" "+k+" lift "+p.lift+" vs "+((p.ft-b)*100));
    assert(p.seen>=0)}
  assert.strictEqual(ev.pat["BULL TRAP"].dir,-1);assert.strictEqual(ev.pat["BEAR TRAP"].dir,1);
}
(async()=>{
  await run("loadData()");
  t("data.js keeps DATA.ev",()=>{assert(run("DATA&&DATA.ev"));assert.strictEqual(run("DATA.ev.src"),"real")});
  t("DATA.ev shape: base sums to 1, 6 pat + 8 ind, ft in 0..1, lift=(ft-base)*100",()=>shape(run("DATA.ev"),"real"));
  t("computeEvidence on stand-in windows: same shape",()=>{
    const ev=run(`(function(){T.dataSrc=0;const w=loadWindow(777);const e=computeEvidence(w.bars.concat(w.hidden),14);T.dataSrc=1;return e})()`);
    shape(ev,"standin");
  });
  t("computeEvidence on real stock set is fast and reproduces DATA.ev",()=>{
    const t0=Date.now();
    const ev=run(`(function(){const st=DATA.series.filter(s=>s.k==="stock");return computeEvidence(st.map(s=>s.bars),50,st.map(s=>s.f))})()`);
    assert(Date.now()-t0<5000,"too slow "+(Date.now()-t0));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ev.base)),JSON.parse(JSON.stringify(run("DATA.ev.base"))));
  });
  t("evNow uses DATA.ev when real, computes+caches stand-in otherwise, never throws",()=>{
    assert.strictEqual(run("evNow()===DATA.ev"),true);
    const r=run(`(function(){T.dataSrc=0;globalThis.S={seed:5,W:loadWindow(5)};const a=evNow(),b=evNow();T.dataSrc=1;const real=evNow()===DATA.ev;delete globalThis.S;return{same:a===b,src:a.src,sum:a.base.bull+a.base.bear,real}})()`);
    assert(r.same&&r.src==="standin"&&Math.abs(r.sum-1)<1e-9&&r.real);
    const none=run(`(function(){const d=DATA;T.dataSrc=0;const x=evNow();T.dataSrc=1;return x})()`);
    assert(none.base&&Math.abs(none.base.bull+none.base.bear-1)<1e-9);
  });
  // bots: always-bullish and coin-flip should show ~0 edge vs evNow base over 200 windows
  function botEdge(mode){
    return run(`(function(){const mode=${JSON.stringify(mode)},ev=evNow(),base=ev.base,R=T.reversal;
      let closed=0,right=0,exp=0;
      for(let w=0;w<200;w++){const W=loadWindow(1e6+w*7919),rr=mulberry32(w+17),all=W.bars;
        for(let k=0;k<6;k++){const b=all[k],n=b.length;
          for(let wk=0;wk<T.weeks;wk++){const at=T.preWeeks-1+wk,view=mode==="bull"?1:(rr()<0.5?1:-1),box=boxOf(b[at].c);
            for(let i=at+1;i<n;i++){const up=boxOf(b[i].h)>=box+R,dn=boxUp(b[i].l)<=box-R;
              if(up||dn){const mv=up&&dn?(b[i].c>=b[i].o?1:-1):(up?1:-1);closed++;if(mv===view)right++;exp+=view===1?base.bull:base.bear;break}}}}}
      return{closed,right,exp}})()`);
  }
  for(const mode of ["bull","coin"]){
    t("always-"+(mode==="bull"?"bullish":"coin-flip")+" bot edge ~0 over 200 windows",()=>{
      const r=botEdge(mode),e=(r.right-r.exp)/r.closed;
      console.log("     closed "+r.closed+" right "+r.right+" exp "+r.exp.toFixed(1)+" edge/closed "+e.toFixed(4));
      assert(r.closed>5000);assert(Math.abs(e)<0.03,"edge "+e);
    });
  }
  console.log(fails?fails+" FAILED":"all passed");process.exit(fails?1:0);
})();
