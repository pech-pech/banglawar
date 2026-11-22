"use strict";
// node tools/sweep.js : baseline over 200 real + 200 stand-in windows -> docs/BASELINE.md
const fs=require("fs"),path=require("path"),vm=require("vm");
const root=path.join(__dirname,"..");
const ctx={localStorage:{getItem(){return null},setItem(){}},window:{innerWidth:344,innerHeight:882},fetch(){throw new Error("no fetch")},console,Math,JSON,Object,Array,Set,Map,Number,String,Date,Promise};
vm.createContext(ctx);
const load=f=>vm.runInContext(fs.readFileSync(path.join(root,"src",f),"utf8")+"\n",ctx,{filename:f});
// top-level const/let are not vm globals: re-export through a tail eval
["core.js","data.js","pnf.js"].forEach(load);
// pct() lives in game.js (not loaded here); bots.js is self-contained
load("bots.js");
const ev=s=>vm.runInContext(s,ctx);
const J=JSON.parse(fs.readFileSync(path.join(root,"data/weekly.json"),"utf8"));
// data.js loadData() decodes; feed it the file through a fetch stub
ctx.fetch=async()=>({ok:true,json:async()=>J,text:async()=>JSON.stringify(J)});
const usedOwn=false;
function run(){return ev("loadData&&loadData()").then(()=>ev("DATA!==null"))}
(async()=>{
  if(!usedOwn){const ok=await run();if(!ok){console.error("DATA not decoded");process.exit(1)}}
  const rows={};
  for(const [name,src] of [["real",1],["stand-in",0]]){ctx.__s=src;ev("T.dataSrc=__s");ev("T.baselineWindows=200");rows[name]=ev("baseline()")}
  const d=(r)=>`| ${r.src==="real"?"real":"stand-in"} | ${r.n} | ${r.cash}% | ${r.rand}% | ${r.lock}% | ${r.signal}% |`;
  const hdr="| data | windows | idle cash | random buys | copy benchmark | P&F signal reader |\n|---|---|---|---|---|---|";
  console.log(hdr+"\n"+d(rows.real)+"\n"+d(rows["stand-in"]));
  const re=rows.real,beats=re.signal>Math.max(re.cash,re.rand,re.lock);
  const read=beats?`On real history the simple P&F signal reader (${re.signal}%) beats the no-read bots (best ${Math.max(re.cash,re.rand,re.lock)}%).\nA reader edge exists; on stand-in data it scores ${rows["stand-in"].signal}%.`
    :`On real history the simple P&F signal reader (${re.signal}%) does not beat the no-read bots (best ${Math.max(re.cash,re.rand,re.lock)}%).\nOn stand-in data it scores ${rows["stand-in"].signal}%.`;
  const md=`# Baseline: no-read strategies vs mandate\n\nDate: 2026-11-22. Build st-slice-1. Defaults: mandate +${ev("T.mandate")} pts over equal-weight watchlist, floor ${ev("T.floorPct")}%, cap ${ev("T.capPct")}%, fee ${ev("T.feePct")}% per side, ${ev("T.weeks")} weeks. Locked windows seeds 1e6+w*7919.\nScore = mandate met and floor not hit. Signal reader: each week close, buy equal slices on a fresh P&F buy, sell all on fresh sell. (admin default: slice = equity/6, "fresh" = signal differs from prior week's.)\n\n${hdr}\n${d(rows.real)}\n${d(rows["stand-in"])}\n\n## Read\n${read}\n`;
  fs.mkdirSync(path.join(root,"docs"),{recursive:true});fs.writeFileSync(path.join(root,"docs/BASELINE.md"),md);
})();
