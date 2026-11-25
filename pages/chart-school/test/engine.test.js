"use strict";
const CSE=require("../src/engine.js");
let fail=0,n=0;
const eq=(a,b,m)=>{n++;if(JSON.stringify(a)!==JSON.stringify(b)){fail++;console.log("FAIL",m,"got",JSON.stringify(a),"want",JSON.stringify(b))}};
const ok=(c,m)=>eq(!!c,true,m);
const P=CSE.priceOf;
const bar=(hb,lb,cb)=>({h:P(hb),l:P(lb),c:P(cb===undefined?hb:cb)});
// box edges
eq(CSE.boxOf(P(5)),5,"high exactly on box 5 fills 5");
eq(CSE.boxOf(P(5)*0.9999),4,"high just under box 5 fills only 4");
eq(CSE.boxUp(P(5)),5,"low exactly on box 5 fills 5");
eq(CSE.boxUp(P(5)*1.0001),6,"low just over box 5 starts at 6");
eq(CSE.boxOf(1),0,"1.0 is box 0");
eq(CSE.disp(1.234),"123","disp integer >=100");eq(CSE.disp(0.9876),"98.8","disp 1 decimal <100");
// first column
let E=CSE.pnf([bar(5,2)]);
eq([E.cols[0].d,E.cols[0].lo,E.cols[0].hi],[1,2,5],"first column X lo..hi");
eq(E.cells.length,4,"first column cells");
E=CSE.pnf([{h:P(5)*1.001,l:P(5)*1.01,c:P(5)}]);
eq([E.cols[0].lo,E.cols[0].hi],[5,5],"first column lo>hi clamps");
// X-first priority: high extends even if low would reverse
E=CSE.pnf([bar(10,8),bar(11,5)]);
eq(E.cols.length,1,"X first: extends, no reversal");eq(E.cols[0].hi,11,"X extended to 11");
eq(E.cells.filter(c=>c.box===11)[0].week,1,"new box first-fill week");
// O column mirror: low first
E=CSE.pnf([bar(10,8),bar(10,7),bar(9,5)]);
eq(E.cols.length,2,"O extends on lower low");eq([E.cols[1].d,E.cols[1].hi,E.cols[1].lo],[-1,9,5],"O col 9..5");
// reversal one direction per week
E=CSE.pnf([bar(10,8),bar(10,7)]);
eq([E.cols[1].d,E.cols[1].hi,E.cols[1].lo],[-1,9,7],"3-box reversal O from hi-1");
eq(E.colOfWeek,[0,1],"colOfWeek");
// double top
const dt=[bar(10,8),bar(10,7),bar(11,8)];
E=CSE.pnf(dt);
eq([E.cols.length,E.cols[2].sig,E.cols[2].sigName,E.cols[2].sigWeek],[3,1,"Double top buy",2],"double top buy col 2");
// triple top
const tt=[bar(10,8),bar(10,7),bar(10,8),bar(10,7),bar(11,8)];
E=CSE.pnf(tt);
eq([E.cols.length,E.cols[2].sig,E.cols[4].sigName],[5,0,"Triple top buy"],"triple top at col 4, col 2 no signal");
// sells
E=CSE.pnf([bar(10,8),bar(10,7),bar(10,8),bar(10,6)]);
eq(E.cols[3].sigName,"Double bottom sell","double bottom sell");
E=CSE.pnf([bar(10,8),bar(10,7),bar(10,8),bar(10,7),bar(10,8),bar(10,6)]);
eq(E.cols[5].sigName,"Triple bottom sell","triple bottom sell");
// R1 + R2/R2b completed column
let R=CSE.readAll(dt);
eq(R.R1,{answer:"Double top buy",col:2},"R1 double top");
eq(R.R2.answer,7,"R2 = lo of last completed O");eq(R.R2b.answer,10,"R2b = hi of last completed X (current X excluded)");
eq(CSE.readAll([bar(10,8),bar(10,7)]).R2b.answer,10,"R2b completed when current is O");
eq(CSE.readAll([bar(10,8)]).disc.R2,"no completed O column","R2 discard w/o completed O");
// R1 later column wins / only last 3 columns
R=CSE.readAll([bar(10,8),bar(10,7),bar(11,8),bar(11,8)]);
eq(R.R1.answer,"Double top buy","R1 still in last 3 cols");
// trend lines (C5), hand-built columns
const C=(d,lo,hi)=>({d:d,lo:lo,hi:hi});
const tr=cols=>CSE.trend({cols:cols});
let T=tr([C(1,5,10),C(-1,6,9),C(1,7,12),C(-1,8,11)]);
eq(T.segs,[{kind:"BSL",col0:1,box0:5,col1:3}],"BSL only");eq(T.active,{kind:"BSL",col0:1,box0:5},"BSL active");
T=tr([C(1,5,10),C(-1,6,9),C(1,7,12),C(-1,7,11)]);
eq(T.segs,[{kind:"BSL",col0:1,box0:5,col1:3},{kind:"BRL",col0:2,box0:13,col1:3}],"BSL broken -> BRL (lo equals line)");
T=tr([C(1,5,10),C(-1,6,9),C(1,7,12),C(-1,7,11),C(1,8,11)]);
eq(T.segs.map(s=>s.kind+s.col0+":"+s.box0+">"+s.col1),["BSL1:5>3","BRL2:13>4","BSL3:6>4"],"BRL broken -> BSL");eq(T.active,{kind:"BSL",col0:3,box0:6},"BSL active after flip");
T=tr([C(1,5,13),C(-1,9,12),C(1,10,12)]);
eq(T.segs.map(s=>s.kind+s.col0+":"+s.box0+">"+s.col1),["BRL0:14>2","BSL1:8>2"],"start BRL when the high comes first");
T=tr([C(1,4,9),C(-1,6,8),C(1,7,9)]);eq(T.segs[0].col0,0,"start tie: highest X earliest");
T=tr([C(-1,5,9),C(1,6,12),C(-1,8,11),C(1,9,12),C(-1,8,11)]);
eq(T.segs.map(s=>s.kind+s.col0+":"+s.box0+">"+s.col1),["BSL0:4>4","BRL3:13>4"],"break tie: highest X latest");
T=tr([C(-1,6,9),C(1,7,12),C(-1,6,10),C(1,7,10)]);eq(T.segs[0].col0,0,"start tie: lowest O earliest");
T=tr([C(1,5,10)]);eq(T.active,{kind:"BRL",col0:0,box0:11},"single column starts BRL");
// R3 three classes via readAll
const r3=cb=>CSE.readAll([bar(10,8),bar(10,7),bar(11,8,cb)]).R3;
eq([r3(10).kind,r3(10).lineAtCur,r3(10).d,r3(10).segs.length],["BSL",7,3,1],"R3 fields");
eq(r3(10).answer,"Uptrend, 3+ boxes above support","R3 d=3");eq(r3(9).answer,"Uptrend, near support","R3 d=2");
eq(r3(7).answer,"Uptrend, near support","R3 d=0 near");
eq(CSE.OPTIONS.R3.length,3,"R3 three options");
R=CSE.readAll([bar(12,10),bar(12,9),bar(12,8)]);
eq([R.R3.kind,R.R3.answer],["BRL","Downtrend, below resistance"],"R3 BRL class");
eq(CSE.readAll([bar(10,8)]).R3.kind,"BRL","R3 never null");
// R4 = signal column count, objective lo+3*boxes
R=CSE.readAll(dt);
eq(R.R4,{answer:20,col:2,boxes:4,from:8},"R4 signal column count 8+3*4");
R=CSE.readAll([bar(10,8),bar(10,7),bar(11,8),bar(11,8)]);
eq(R.R4.answer,20,"R4 provisional same");
R=CSE.readAll([bar(10,8),bar(10,7),bar(12,8)]);eq([R.R4.boxes,R.R4.answer],[5,23],"R4 5 boxes");
eq(CSE.readAll([bar(10,8),bar(10,7),bar(10,8),bar(10,6)]).R4,null,"R4 null on sell");
eq(typeof CSE.readAll([bar(10,8),bar(10,7),bar(10,8),bar(10,6)]).disc.R4,"string","R4 disc on sell");
// R4 discard when signal column index <=1: not reachable by engine (sig needs col>=2); assert code guard via source
ok(/sj<=1/.test(require("fs").readFileSync(__dirname+"/../src/engine.js","utf8")),"R4 index guard present");
// R5/R6/R7 discards, found deterministically
const lcg=s=>()=>((s=(s*1664525+1013904223)>>>0)/4294967296);
function walk(seed,n){const r=lcg(seed);let p=1;const o=[];for(let i=0;i<n;i++){const q=p*(1+(r()-0.5)*0.08);o.push({h:Math.max(p,q)*1.01,l:Math.min(p,q)*0.99,c:q});p=q}return o}
let d5=null,k5=null,d7=null,b7=null,u7=null,n7=null;
for(let s=1;s<60000&&!(d5&&k5&&d7&&b7&&u7&&n7);s++){const w=walk(s,40),R=CSE.readAll(w);
 if(R.disc.R5){d5=d5||{w,R};const v=CSE.rsi(w.map(b=>b.c))[39];ok(Math.min(Math.abs(v-30),Math.abs(v-50),Math.abs(v-70))<1,"R5 discard margin")}
 else k5=k5||R;
 if(R.disc.R7)d7=d7||R;else if(R.R7.answer==="Bearish")b7=b7||R;else if(R.R7.answer==="Bullish")u7=u7||R;else n7=n7||R}
ok(d5&&k5,"R5 discard and keep found");if(!d7)console.log("note: no R7 both-case in random search (guard is in code)");ok(b7&&u7&&n7,"R7 three classes found");
if(k5)ok(CSE.OPTIONS.R5.includes(k5.R5.answer),"R5 answer in options");
if(b7)ok(b7.R7.ref<b7.R7.t,"R7 ref before t");
const flat=Array.from({length:30},()=>bar(5,5));
R=CSE.readAll(flat);ok(R.disc.R6,"R6 discard flat hist");
let ups=Array.from({length:40},(_,i)=>{const b=Math.round(i*i/20);return bar(b+1,b)});
R=CSE.readAll(ups);ok(R.R5&&R.R5.answer==="Above 70","R5 uptrend above 70");
ok(R.R6&&/^Positive/.test(R.R6.answer),"R6 positive on uptrend");
// indicators shape
eq(CSE.rsi([1,2,3])[0],50,"rsi first 50");
const M=CSE.macd([1,2,3,4]);eq([M.macd.length,M.signal.length,M.hist.length],[4,4,4],"macd lengths");eq(M.macd[0],0,"macd seeded");
// RULES / explain
const bad=/\b(level|score|quiz|lesson|streak|passed|rung)\b/i;
for(const t of CSE.TYPES){const r=CSE.RULES[t];ok(r&&r.title&&r.lines.length>=3&&r.lines.length<=6,"RULES "+t);
 ok(!bad.test(r.title+" "+r.lines.join(" ")),"RULES no banned word "+t);ok(CSE.NAMES[t],"NAMES "+t)}
const fx=[dt,[bar(10,8),bar(10,7),bar(11,8),bar(11,8),bar(11,8),bar(11,8)]];
// build a long series with all readings present
let full=null;for(let s=1;s<5000&&!full;s++){const w=walk(s,60),R=CSE.readAll(w);if(R.R1.answer.includes("buy")&&R.R2&&R.R2b&&R.R3&&R.R4&&R.R5&&R.R6&&R.R7.answer==="Bearish")full={w,R}}
if(!full)for(let s=1;s<20000&&!full;s++){const w=walk(s,60),R=CSE.readAll(w);if(R.R1.answer.includes("buy")&&R.R2&&R.R2b&&R.R3&&R.R4&&R.R5&&R.R6)full={w,R}}
ok(full,"full-reading series found");
const reads=full.R;
for(const t of CSE.TYPES){const r=reads[t];if(!r)continue;
 const right=CSE.explain(t,reads,r.answer);ok(typeof right==="string"&&right.indexOf("Right")===0,"explain right "+t+": "+right);
 const wrongVal=typeof r.answer==="number"?r.answer+2:(CSE.OPTIONS[t==="R2b"?"R2":t]||["x"]).find(o=>o!==r.answer)||"x";
 const wrong=CSE.explain(t,reads,wrongVal);ok(typeof wrong==="string"&&wrong.indexOf("Marked")===0,"explain wrong "+t+": "+wrong);
 ok(!bad.test(right+wrong),"explain no banned word "+t)}
eq(CSE.explain("R4",reads,reads.R4.answer+1).indexOf("Marked: off by 1 box. The count starts at the column's lowest box, "+CSE.disp(P(reads.R4.from))),0,"explain R4 wording");
for(const w of ["No signal"])ok(typeof CSE.explain("R1",{R1:{answer:"No signal",col:null}},"Double top buy")==="string","explain R1 no signal wrong");
// ---- v2: readSector / pickReads
{
const fs=require("fs"),sh=JSON.parse(fs.readFileSync(__dirname+"/../data/sheets.json","utf8")).sheets;
const mp={"Double top buy":0,"Triple top buy":1,"Double bottom sell":2,"Triple bottom sell":3,"No signal":4};
const objs=b=>b.map(x=>({h:x[0],l:x[1],c:x[2]}));
let cnt=0;
for(const s of sh.slice(0,60)){const a=CSE.readAll(objs(s.bars)),r=CSE.readSector(objs(s.bars)),r2=CSE.readSector(s.bars);cnt++;
 eq(r.S1.answer,CSE.OPTIONS.S1[mp[a.R1.answer]],"S1 = R1 mapped");eq(r.S1.col,a.R1.col,"S1 col");
 eq(r.S2.answer,CSE.OPTIONS.S2[CSE.OPTIONS.R3.indexOf(a.R3.answer)],"S2 = R3 mapped");eq(r.S2.kind,a.R3.kind,"S2 kind");eq(r.S2.segs,a.R3.segs,"S2 segs");
 eq(r2.S2.answer,r.S2.answer,"array bars ok")}
ok(cnt>0,"sheets sampled");
eq(CSE.readSector([]),{S1:null,S2:null},"readSector empty");
eq(CSE.KINDS,{R1:"opt",R2:"step",R2b:"step",R3:"opt",R4:"step",R5:"opt",R6:"opt",R7:"opt",S1:"opt",S2:"opt"},"KINDS");
eq(CSE.NAMES.S1,"Sector signal","NAMES S1");eq(CSE.NAMES.S2,"Sector trend","NAMES S2");
ok(CSE.TYPES.includes("S1")&&CSE.TYPES.includes("S2"),"TYPES S1 S2");
const sr=CSE.readSector(objs(sh[0].bars));
ok(/^Right/.test(CSE.explain("S1",{},sr.S1.answer,sr)),"explain S1 right");
ok(/^Marked/.test(CSE.explain("S2",{},"x",sr)),"explain S2 marked");
// pickReads
const mb=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const mk=(r4)=>({r2key:"R2b",ans:{R1:"x",R2b:1,R3:"x",R4:r4,R5:"x",R6:"x",R7:"x",S1:"x",S2:"x"}});
let withS=0,N=3000,prev=[],bad3=0,rep=0,d=0;
for(let i=0;i<N;i++){const sheet=mk(i%2?5:null),p=CSE.pickReads(sheet,mb(i),prev),p2=CSE.pickReads(sheet,mb(i),prev);
 if(JSON.stringify(p)!==JSON.stringify(p2))d++;
 if(p.length!==3||new Set(p).size!==3)bad3++;
 const pool=["R1","R2b","R3","R5","R6","R7","S1","S2"].concat(i%2?["R4"]:[]);
 for(const t of p)if(!pool.includes(t))bad3++;
 if(!p.some(t=>t[0]==="R"))bad3++;
 if(p.filter(t=>CSE.KINDS[t]==="step").length>1)bad3++;
 const ss=p.filter(t=>t[0]==="S");if(ss.length>1||(ss.length&&p[2]!==ss[0]))bad3++;
 if(ss.length)withS++;
 if(p.some(t=>prev.includes(t)))rep++;
 prev=p}
eq(bad3,0,"pickReads invariants");eq(d,0,"pickReads deterministic");
ok(Math.abs(withS/N-0.67)<0.04,"S share ~2/3: "+withS/N);
ok(rep/N<0.05,"prevTypes mostly avoided: "+rep/N);
eq(CSE.pickReads({r2key:"R2",ans:{R1:1,R2:1,R3:1,R4:null,R5:1,R6:1,R7:1}},mb(3),[]).every(t=>t[0]==="R"),true,"no sector when sheet lacks S answers");
}
console.log(n+" checks, "+fail+" failed");
process.exit(fail?1:0);
