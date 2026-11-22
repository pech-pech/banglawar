"use strict";
// node tools/evidence.js : computes EV on real stock series, writes `ev` into data/weekly.json (all else unchanged)
const fs=require("fs"),path=require("path"),vm=require("vm");
const ROOT=path.resolve(__dirname,"..");
const jsonPath=path.join(ROOT,"data","weekly.json");
const raw=fs.readFileSync(jsonPath,"utf8");
const store={};
const sandbox={console,Math,JSON,Object,Array,Number,String,Set,Map,Promise,Date,Error,isFinite,parseFloat,parseInt,Int32Array,Int8Array,Float64Array,
  localStorage:{getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}},
  fetch:async()=>({ok:true,status:200,json:async()=>JSON.parse(raw)}),setTimeout,clearTimeout};
sandbox.window=sandbox;sandbox.self=sandbox;
const ctx=vm.createContext(sandbox);
for(const f of ["core.js","data.js","pnf.js","evcalc.js"])vm.runInContext(fs.readFileSync(path.join(ROOT,"src",f),"utf8"),ctx,{filename:f});
const run=c=>vm.runInContext(c,ctx);
(async()=>{
  await run("loadData()");
  if(!run("!!DATA"))throw new Error("data failed to load");
  const t0=Date.now();
  const ev=run(`(function(){const st=DATA.series.filter(s=>s.k==="stock");
    const e=computeEvidence(st.map(s=>s.bars),50,st.map(s=>s.f));e.src="real";e.series=st.length;return e})()`);
  delete ev.series;
  console.log("computed in "+(Date.now()-t0)+" ms");
  const j=JSON.parse(raw);delete j.ev;
  if(JSON.stringify(j)!==raw.replace(/,"ev":\{.*\}\}$/,"}"))console.warn("warn: re-serialised JSON differs from original apart from ev");
  j.ev=ev;
  fs.writeFileSync(jsonPath,JSON.stringify(j));
  const pc=x=>(x*100).toFixed(1)+"%";
  console.log("BASE bull "+pc(ev.base.bull)+"  bear "+pc(ev.base.bear)+"  n "+ev.base.n);
  const row=(k,p)=>console.log(k.padEnd(20)+String(p.seen).padStart(6)+"  "+pc(p.ft).padStart(6)+"  ["+pc(p.lo)+" - "+pc(p.hi)+"]  lift "+(p.lift>=0?"+":"")+p.lift+" pts  dir "+p.dir);
  console.log("--- patterns");Object.keys(ev.pat).forEach(k=>row(k,ev.pat[k]));
  console.log("--- indicators");Object.keys(ev.ind).forEach(k=>row(k,ev.ind[k]));
})().catch(e=>{console.error(e);process.exit(1)});
