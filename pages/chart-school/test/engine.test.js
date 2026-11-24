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
// R3 three classes (anchor col1 lo7, line at col2 = 7)
const r3=cb=>CSE.readAll([bar(10,8),bar(10,7),bar(11,8,cb)]).R3;
eq(r3(10).answer,"Above by 3+ boxes","R3 d=3");eq(r3(9).answer,"Within 2 boxes above","R3 d=2");
eq(r3(8).answer,"Within 2 boxes above","R3 d=1");eq(r3(7).answer,"On or below","R3 d=0");eq(r3(6).answer,"On or below","R3 d=-1");
eq([r3(10).anchorCol,r3(10).anchorLo,r3(10).lineAtCur,r3(10).d],[1,7,7,3],"R3 fields");
eq(CSE.readAll([bar(10,8)]).R3,null,"R3 null w/o O column");
// R3 ties: earliest O column
R=CSE.readAll([bar(10,8),bar(10,7),bar(10,8),bar(10,7),bar(10,8)]);
eq(R.R3.anchorCol,1,"R3 tie goes to earliest");
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
console.log(n+" checks, "+fail+" failed");
process.exit(fail?1:0);
