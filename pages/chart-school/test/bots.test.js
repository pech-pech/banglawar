"use strict";
// Bot gate. Node: `node test/bots.test.js` (exit 1 on fail). Also exports botTable(sheetsObj, CSE) for tools/gen-sheets.js.
const fs=require("fs"),path=require("path");
const OPT={R1:["Double top buy","Triple top buy","Double bottom sell","Triple bottom sell","No signal"],R3:["Uptrend, 3+ boxes above support","Uptrend, near support","Downtrend, below resistance"],
 R5:["Above 70","50 to 70","30 to 50","Below 30"],R6:["Positive rising","Positive falling","Negative rising","Negative falling"],R7:["Bearish","Bullish","None"]};
const LIM=0.4;
const mode=a=>{const m={};a.forEach(x=>m[x]=(m[x]||0)+1);return Object.keys(m).sort((x,y)=>m[y]-m[x])[0]};
function botTable(data,CSE){
  const O=(CSE&&CSE.OPTIONS)||OPT,sheets=data.sheets,rows=[];
  const info=sheets.map(s=>{const bars=s.bars.map(b=>({h:b[0],l:b[1],c:b[2]})),E=CSE.pnf(bars),cols=E.cols;
    const w30=cols.slice(Math.max(0,cols.length-30)),lo=Math.min(...w30.map(c=>c.lo)),hi=Math.max(...w30.map(c=>c.hi)),bc=CSE.boxOf(bars[bars.length-1].c);
    return{s,lo,hi,bc}});
  // per type: list of {ok:{random(prob),common(0/1),first(0/1),...}} per sheet
  const bots={};const per=info.map(()=>({}));
  const optType=t=>{const A=info.map(i=>i.s.ans[t]);const mc=mode(A),opts=O[t];
    info.forEach((i,k)=>{per[k][t]={random:1/opts.length,common:+(i.s.ans[t]===mc),first:+(i.s.ans[t]===opts[0])}});
    rows.push({type:t,n:A.length,random:1/opts.length,common:A.filter(x=>x===mc).length/A.length,first:A.filter(x=>x===opts[0]).length/A.length,note:"most common = "+mc+"; first = "+opts[0]})};
  const stepType=(label,keys,rel,rowsOf,startExtra)=>{
    const L=info.filter(i=>keys.includes(i.kind));
    return L};
  // steppers
  info.forEach(i=>{const s=i.s;i.R2k=s.r2key;i.R2a=s.ans[s.r2key];i.rel2=s.r2key==="R2"?i.bc-i.R2a:i.R2a-i.bc;i.rows2=i.hi-i.lo+1;
    i.R4a=s.ans.R4;if(i.R4a!=null){i.rel4=i.R4a-i.bc;i.rows4=i.hi+40-i.lo+1}});
  const stepGroup=(name,pick)=>{ // pick(i) -> {rel,rows,low,high,ans} or null
    const L=info.map((i,k)=>({k,p:pick(i)})).filter(x=>x.p);
    const keyed=x=>x.p.rel;const mo=+mode(L.map(keyed));
    const low=x=>x.p.ans===x.p.lo,high=x=>x.p.ans===x.p.hi;
    L.forEach(x=>{per[x.k][name]={random:1/x.p.rows,common:+(x.p.rel===mo),first:Math.max(+low(x),+high(x))}});
    rows.push({type:name,n:L.length,random:L.reduce((a,x)=>a+1/x.p.rows,0)/L.length,common:L.filter(x=>x.p.rel===mo).length/L.length,
      first:Math.max(L.filter(low).length,L.filter(high).length)/L.length,
      note:"most common offset = "+mo+" boxes from close; lowest "+pct(L.filter(low).length/L.length)+", highest "+pct(L.filter(high).length/L.length)})};
  ["R1","R3","R5","R6","R7"].forEach(optType);
  // R2 pooled "Support / resistance" (offset signed by key: R2 below close, R2b above close, bot knows the key)
  const g2=i=>({rel:i.rel2,rows:i.rows2,lo:i.lo,hi:i.hi,ans:i.R2a,key:i.R2k});
  const L2=info.map((i,k)=>({k,p:g2(i)}));
  const mo={R2:+mode(L2.filter(x=>x.p.key==="R2").map(x=>x.p.rel)),R2b:+mode(L2.filter(x=>x.p.key==="R2b").map(x=>x.p.rel))};
  L2.forEach(x=>{const p=x.p;per[x.k]["R2*"]={random:1/p.rows,common:+(p.rel===mo[p.key]),first:p.key==="R2"?+(p.ans===p.lo):+(p.ans===p.hi)}});
  const q2=L2;rows.push({type:"R2/R2b pooled",n:q2.length,random:q2.reduce((a,x)=>a+1/x.p.rows,0)/q2.length,
    common:q2.filter(x=>x.p.rel===mo[x.p.key]).length/q2.length,first:q2.filter(x=>x.p.key==="R2"?x.p.ans===x.p.lo:x.p.ans===x.p.hi).length/q2.length,
    note:"most common offset: R2 "+mo.R2+", R2b "+mo.R2b+"; first = lowest row for R2, highest row for R2b"});
  for(const key of["R2","R2b"]){const L=q2.filter(x=>x.p.key===key);if(!L.length)continue;
    rows.push({type:key,n:L.length,random:L.reduce((a,x)=>a+1/x.p.rows,0)/L.length,common:L.filter(x=>x.p.rel===mo[key]).length/L.length,
      first:L.filter(x=>key==="R2"?x.p.ans===x.p.lo:x.p.ans===x.p.hi).length/L.length,note:"offset "+mo[key]})}
  stepGroup("R4",i=>i.R4a==null?null:{rel:i.rel4,rows:i.rows4,lo:i.lo,hi:i.hi+40,ans:i.R4a});
  // 6+ of 7 readings per sheet (Poisson-binomial for random bot; exact for the deterministic bots)
  const pAtLeast6=ps=>{let d=[1];for(const p of ps){const n=new Array(d.length+1).fill(0);d.forEach((v,k)=>{n[k]+=v*(1-p);n[k+1]+=v*p});d=n}return d.slice(6).reduce((a,b)=>a+b,0)};
  const six={random:0,common:0,first:0};
  per.forEach(o=>{const ts=Object.keys(o);six.random+=pAtLeast6(ts.map(t=>o[t].random));
    six.common+=+(ts.reduce((a,t)=>a+o[t].common,0)>=6);six.first+=+(ts.reduce((a,t)=>a+o[t].first,0)>=6)});
  for(const b in six)six[b]/=sheets.length;
  const gated=rows.filter(r=>r.type!=="R2"&&r.type!=="R2b"); // pooled row gates; R2/R2b separately reported
  const fails=[];
  rows.forEach(r=>["random","common","first"].forEach(b=>{if(r[b]>=LIM)fails.push(r.type+" "+b+" "+pct(r[b]))}));
  for(const b in six)if(six[b]>=0.01)fails.push("6+ of 7 "+b+" "+(six[b]*100).toFixed(2)+"%");
  let md="| type | n | random | most common | first / lowest-highest | note |\n|---|---|---|---|---|---|\n"+rows.map(r=>"| "+r.type+" | "+r.n+" | "+pct(r.random)+" | "+pct(r.common)+" | "+pct(r.first)+" | "+r.note+" |").join("\n");
  md+="\n\nSheets where a bot gets 6+ of 7 readings right: random "+(six.random*100).toFixed(3)+"%, most-common "+(six.common*100).toFixed(2)+"%, first-option "+(six.first*100).toFixed(2)+"% (limit 1%).\n";
  md+=fails.length?"\n**Verdict: FAIL.** Bots at or over 40% (or 6+ of 7 at/over 1%): "+fails.join("; ")+"\n":"\n**Verdict: PASS.** Every bot under 40% on every type; 6+ of 7 under 1%.\n";
  return{rows,six,fails,pass:!fails.length,md}}
const pct=x=>(100*x).toFixed(1)+"%";
module.exports={botTable};
if(require.main===module){
  const CSE=require("../src/engine.js");
  const data=JSON.parse(fs.readFileSync(path.join(__dirname,"../data/sheets.json"),"utf8"));
  const t=botTable(data,CSE);console.log(t.md);
  if(!t.pass){console.error("bots gate FAILED");process.exit(1)}
  console.log("bots gate ok")}
