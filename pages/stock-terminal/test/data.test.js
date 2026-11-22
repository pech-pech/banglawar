"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path");
const {load,decode,ROOT}=require("./_load.js");
let fails=0;
function t(name,fn){return Promise.resolve().then(fn).then(()=>console.log("ok   "+name),e=>{fails++;console.log("FAIL "+name+"\n     "+(e&&e.message||e))})}
const CSV="/mnt/project-files/games-design/stock-terminal/data/jacksoncrow-subset/";
function readCsv(f){return fs.readFileSync(f,"utf8").trim().split(/\r?\n/).slice(1).map(l=>l.split(",")).filter(a=>a[0]&&a[4]!==""&&a.slice(1,5).some(x=>x!==""))}
const dayN=s=>Date.UTC(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10))/864e5;
const monday=d=>d-((((d+3)%7)+7)%7); // Monday of the week (safe for pre-1970)
const stocks=fs.readdirSync(CSV+"stocks").filter(f=>f.endsWith(".csv")).map(f=>f.slice(0,-4)).sort();
const etfs=fs.readdirSync(CSV+"etfs").filter(f=>f.endsWith(".csv")).map(f=>f.slice(0,-4)).sort();
const raw=fs.readFileSync(path.join(ROOT,"data","weekly.json"),"utf8");
const J=JSON.parse(raw);
(async()=>{
await t("json has no ticker strings / allowed string tokens only",()=>{
  const toks=raw.match(/"[^"]*"/g)||[];
  const ok=/^(v|nW|series|id|k|f|c|o|h|l|stock|etf|[se]\d\d)$/;
  const bad=toks.filter(x=>!ok.test(x.slice(1,-1)));
  assert.strictEqual(bad.length,0,"unexpected strings: "+bad.slice(0,5));
  for(const tk of stocks.concat(etfs)) if(tk.length>=3) assert(!raw.includes(tk),"ticker "+tk+" in JSON");
  assert.strictEqual(J.v,1);
});
await t("json has no YYYY-MM-DD",()=>{assert(!/\d{4}-\d{2}-\d{2}/.test(raw))});
await t("series counts/ids: s01..s44 stocks then e01,e02",()=>{
  assert.strictEqual(J.series.length,stocks.length+etfs.length);
  J.series.forEach((s,i)=>{const exp=i<stocks.length?"s"+String(i+1).padStart(2,"0"):"e"+String(i-stocks.length+1).padStart(2,"0");
    assert.strictEqual(s.id,exp);assert.strictEqual(s.k,i<stocks.length?"stock":"etf")});
});
const dec=decode(J);
await t("decoded OHLC invariants, finite > 0",()=>{
  for(const s of dec){for(let i=0;i<s.c.length;i++){
    for(const x of [s.o[i],s.h[i],s.l[i],s.c[i]]) assert(isFinite(x)&&x>0,s.id+"@"+i+" nonpositive/nonfinite");
    const e=1e-9;
    assert(s.h[i]>=Math.max(s.o[i],s.c[i])*(1-e),s.id+"@"+i+" h<max(o,c)");
    assert(s.l[i]<=Math.min(s.o[i],s.c[i])*(1+e),s.id+"@"+i+" l>min(o,c)")}}
});
await t("decode of 3 tickers matches CSV weekly closes within 0.1%",()=>{
  // global week 0 = Monday-week of earliest date in any input file
  let min=Infinity;for(const [d,tk] of [["stocks",stocks],["etfs",etfs]])for(const t of tk){const r=readCsv(CSV+d+"/"+t+".csv");if(r.length)min=Math.min(min,dayN(r[0][0]))}
  const w0=monday(min);
  for(const idx of [0,Math.floor(stocks.length/2),stocks.length-1]){
    const tk=stocks[idx],s=dec[idx];const rows=readCsv(CSV+"stocks/"+tk+".csv");
    const wk=new Map();for(const r of rows){const g=(monday(dayN(r[0]))-w0)/7;wk.set(g,+r[4])}
    let n=0,worst=0;
    for(const [g,cl] of wk){const i=g-s.f;if(i<0||i>=s.c.length)continue;const e=Math.abs(s.c[i]/cl-1);worst=Math.max(worst,e);n++}
    assert(n>0.9*wk.size,tk+" only "+n+"/"+wk.size+" weeks overlap (check f / week indexing)");
    assert(worst<=0.001,tk+" worst close err "+(worst*100).toFixed(3)+"%");
  }
});
// loadWindow tests
const A=await load({data:true}).init(),B=await load({data:false}).init();
await t("DATA set after loadData; no-data ctx keeps DATA null without throwing",()=>{
  assert(A.run("DATA!==null"),"DATA null after loadData()");assert(B.run("DATA===null"))});
await t("src real when dataSrc 1, standin when 0, dataSource() agrees",()=>{
  A.run("T.dataSrc=1");const w=A.run("loadWindow(5)");assert.strictEqual(w.src,"real");assert.strictEqual(A.run("dataSource()"),"real");
  A.run("T.dataSrc=0");const x=A.run("loadWindow(5)");assert.strictEqual(x.src,"standin");assert.strictEqual(A.run("dataSource()"),"standin");
  A.run("T.dataSrc=1");
  assert.strictEqual(B.run("loadWindow(5).src"),"standin");
});
const J2=x=>JSON.stringify(x);
await t("loadWindow deterministic; different seeds differ",()=>{
  for(const c of [A,B]){const a=c.run("JSON.stringify(loadWindow(777))"),b=c.run("JSON.stringify(loadWindow(777))"),d=c.run("JSON.stringify(loadWindow(778))");
    assert.strictEqual(a,b);assert.notStrictEqual(a,d)}
});
await t("window shape: 6 codes unique 3 letters, bars n, hidden 30",()=>{
  for(const c of [A,B])for(const seed of [1,48213,1e6+7919,99999]){
    const w=c.run("loadWindow("+seed+")"),n=c.run("T.preWeeks+T.weeks");
    assert.strictEqual(w.codes.length,6);assert.strictEqual(new Set(w.codes).size,6);
    w.codes.forEach(x=>assert(/^[A-Z]{3}$/.test(x),"code "+x));
    assert.strictEqual(w.bars.length,6);w.bars.forEach(b=>assert.strictEqual(b.length,n));
    assert.strictEqual(w.hidden.length,30);w.hidden.forEach(b=>assert.strictEqual(b.length,n));
    const pre=c.run("T.preWeeks");const isReal=w.src==="real";
    if(isReal)for(const b of w.bars){const p=b[pre-1].c;assert(p>=20-1e-6&&p<=200+1e-6,"pre-period last close "+p+" not in 20-200")}
    for(const b of w.bars.concat(w.hidden))for(const x of b){
      for(const k of ["o","h","l","c","v"])assert(isFinite(x[k])&&x[k]>0,"bar "+k+"="+x[k]);
      assert(x.h>=Math.max(x.o,x.c)*(1-1e-9)&&x.l<=Math.min(x.o,x.c)*(1+1e-9),"ohlc order")}}
});
await t("real window bars are rescaled copies of a decoded stock (constant ratio)",()=>{
  const w=A.run("loadWindow(4242)");let matched=0;
  for(const b of w.bars){const r0=b[0].c;
    // find a decoded stock series containing the same shape
    const hit=dec.filter(s=>s.k==="stock").some(s=>{for(let st=0;st+b.length<=s.c.length;st++){
      const k=b[0].c/s.c[st];let ok=true;for(let i=0;i<b.length&&ok;i+=7){if(Math.abs(b[i].c/(s.c[st+i]*k)-1)>0.002)ok=false}
      if(ok)return true}return false});
    if(hit)matched++}
  assert.strictEqual(matched,6,"only "+matched+"/6 window series match decoded real data");
});
console.log(fails?fails+" FAILED":"all passed");process.exit(fails?1:0);
})();
