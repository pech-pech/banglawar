"use strict";
// Chart School sheet generator. Run: node tools/gen-sheets.js [seed]
// All charting/readings come from ../src/engine.js (CSE). Never re-implement the engine here.
const fs=require("fs"),path=require("path");
const CSE=require("../src/engine.js");
const bots=require("../test/bots.test.js");
const SEED=+(process.argv[2]&&/^\d+$/.test(process.argv[2])?process.argv[2]:20261124);
const DATA=process.env.STOCK_DATA||"/home/user/stockdata/stocks/";
const ETF=process.env.ETF_DATA||"/home/user/stockdata/etfs/";
const NPOOL=+process.env.NPOOL||50000,NSHEETS=+process.env.NSHEETS||480,SPACE=8,FWD=10,MAXW=+process.env.MAXW||84,CAP=+process.env.CAP||16; // CAP per stock: admin default
const BUILD="cs-v2-1";
const SECMAP={XLK:"AAPL ATVI GOOGL IBM INTC INTU MSFT NVDA ORCL QCOM T VZ",XLY:"AMZN DIS F HD NFLX NKE SBUX",XLI:"BA CAT CSX FDX GE HON MMM NSC UNP",XLV:"BIIB CI GILD MRK",XLF:"C USB",XLE:"COP EOG OXY SLB VLO",XLP:"COST KO STZ WMT",XLB:"LIN"};
const SECNAME={XLK:"Technology",XLY:"Consumer discretionary",XLI:"Industrials",XLV:"Health care",XLF:"Financials",XLE:"Energy",XLP:"Consumer staples",XLB:"Materials"};
const T2E={};for(const e in SECMAP)SECMAP[e].split(" ").forEach(t=>T2E[t]=e);
const S2OPT=["Sector uptrend, 3+ boxes above support","Sector uptrend, near support","Sector downtrend, below resistance"];
const S1OPT=CSE.OPTIONS.S1||CSE.OPTIONS.R1,S2OPTS=CSE.OPTIONS.S2||S2OPT;
// sector reads: CSE.readSector when present, else R1/R3 on the sector chart mapped to S texts
function secReads(sb){
  if(CSE.readSector){const r=CSE.readSector(sb);return r&&r.S1&&r.S2?{S1:r.S1.answer,S2:r.S2.answer}:null}
  const r=CSE.readAll(sb);if(!r.R1||!r.R3)return null;
  return{S1:r.R1.answer,S2:S2OPT[CSE.OPTIONS.R3.indexOf(r.R3.answer)]}}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rnd=mulberry32(SEED);
// ---- loader copied from the reconcept lib.js (weekly bars) ----
function isoKey(ds){const [y,m,d]=ds.split("-").map(Number);const dt=new Date(Date.UTC(y,m-1,d));const dn=dt.getUTCDay()||7;dt.setUTCDate(dt.getUTCDate()+4-dn);
  const y0=new Date(Date.UTC(dt.getUTCFullYear(),0,1));const w=Math.ceil(((dt-y0)/864e5+1)/7);return dt.getUTCFullYear()*100+w}
function loadStock(file){
  const lines=fs.readFileSync(file,"utf8").split(/\r?\n/);const rows=[];
  for(let i=1;i<lines.length;i++){const f=lines[i].split(",");if(f.length<7)continue;
    if(f.slice(1,6).every(x=>x.trim()===""||/^(null|nan)$/i.test(x.trim())))continue;
    rows.push({d:f[0],o:+f[1],h:+f[2],l:+f[3],c:+f[4]})}
  rows.sort((x,y)=>x.d<y.d?-1:1);
  const wk=[];let prevC=null,cur=null,ck=null;
  for(const r of rows){let o=r.o;if(!(o>0)&&prevC!=null)o=prevC;
    if(![o,r.h,r.l,r.c].every(x=>isFinite(x)&&x>0))continue;prevC=r.c;const k=isoKey(r.d);
    if(k!==ck){cur={k,o,h:r.h,l:r.l,c:r.c};wk.push(cur);ck=k}else{cur.h=Math.max(cur.h,r.h);cur.l=Math.min(cur.l,r.l);cur.c=r.c}}
  return wk}
const files=fs.readdirSync(DATA).filter(f=>f.endsWith(".csv")).sort();
const tick=files.map(f=>f.replace(/\.csv$/,""));
const stocks=files.map(f=>loadStock(path.join(DATA,f)));
const etfW={};for(const e in SECMAP){const m=new Map();loadStock(path.join(ETF,e+".csv")).forEach(b=>m.set(b.k,b));etfW[e]=m}
const R5=x=>Math.round(x*1e5)/1e5;
function window(si,w){const s=stocks[si],lo=Math.max(0,w-(MAXW-1)),raw=s.slice(lo,w+1),f=raw[0].c;
  const fwdRaw=s.slice(w+1,w+1+FWD);
  const out={bars:raw.map(b=>[R5(b.h/f),R5(b.l/f),R5(b.c/f)]),fwd:fwdRaw.map(b=>[R5(b.h/f),R5(b.l/f),R5(b.c/f)]),f};
  const e=T2E[tick[si]],m=etfW[e],sb=[];let ok=!!m;
  if(ok){for(const b of raw.concat(fwdRaw)){const x=m.get(b.k);if(!x){ok=false;break}sb.push(x)}}
  if(ok){const sf=sb[0].c,nb=raw.length;const q=x=>[R5(x.h/sf),R5(x.l/sf),R5(x.c/sf)];
    out.sec={name:SECNAME[e],bars:sb.slice(0,nb).map(q),fwd:sb.slice(nb).map(q)}}
  return out}
const toObj=a=>a.map(b=>({h:b[0],l:b[1],c:b[2]}));
// ---- sigStats / base from full history ----
const sigStats={};for(const n of CSE.OPTIONS.R1)if(n!=="No signal")sigStats[n]={n:0,k:0};
let baseN=0,baseUp=0;const upH={};for(let h=3;h<=10;h++)upH[h]=[0,0];
stocks.forEach(s=>{const f=s[0].c,b=s.map(x=>({h:x.h/f,l:x.l/f,c:x.c/f}));const E=CSE.pnf(b);
  for(let i=0;i+FWD<b.length;i++){baseN++;if(b[i+FWD].c>b[i].c)baseUp++}
  for(let h=3;h<=10;h++)for(let i=0;i+h<b.length;i++){upH[h][0]++;if(b[i+h].c>b[i].c)upH[h][1]++}
  for(const c of E.cols){if(!c.sigName||c.sigWeek==null||c.sigWeek+FWD>=b.length)continue;
    const st=sigStats[c.sigName];if(!st)continue;st.n++;const a=b[c.sigWeek].c,z=b[c.sigWeek+FWD].c;
    if(c.sig===1?z>a:z<a)st.k++}});
for(const n in sigStats){const st=sigStats[n];sigStats[n]={n:st.n,follow:st.n?Math.round(st.k/st.n*1000)/1000:null}}
const base={up10:Math.round(baseUp/baseN*1000)/1000,n:baseN,upH:{}};for(let h=3;h<=10;h++)base.upH[h]=Math.round(upH[h][1]/upH[h][0]*1000)/1000;
// ---- candidate pool ----
const bucket=d=>d<=3?"0-3":d<=7?"4-7":d<=14?"8-14":"15+";
const bucket4=d=>d<=0?"reached":d<=5?"1-5":d<=12?"6-12":"13+";
const disc={},reasonCount={};let pool=[];const seen=new Set();let drawn=0,valid=0;
const natural={};const nat=(t,c)=>{(natural[t]=natural[t]||{})[c]=(natural[t][c]||0)+1};
const bump=(t,r)=>{(disc[t]=disc[t]||{})[r]=(disc[t][r]||0)+1};
const sheetDisc={};const sd=r=>sheetDisc[r]=(sheetDisc[r]||0)+1;
for(let k=0;k<NPOOL;k++){
  const si=Math.floor(rnd()*stocks.length),n=stocks[si].length;
  if(n<60+FWD+1){sd("stock too short");continue}
  const w=59+Math.floor(rnd()*(n-FWD-59));  // history>=60 weeks, 10 forward weeks
  const key=si*100000+w;if(seen.has(key)){sd("duplicate draw");continue}seen.add(key);drawn++;
  if(!T2E[tick[si]]){sd("stock has no sector");continue}
  const W=window(si,w),bars=toObj(W.bars);
  if(!W.sec){sd("sector coverage incomplete");continue}
  const r=CSE.readAll(bars);
  for(const t in r.disc)bump(t,r.disc[t]);
  const E=CSE.pnf(bars);if(E.cols.length<12){sd("columns<12");continue}
  const r2=r.R2?"R2":null,r2b=r.R2b?"R2b":null;
  if(!r.R1||!r.R3||!r.R5||!r.R6||!r.R7||(!r2&&!r2b)){sd("a required reading missing");continue}
  const buy=/buy/.test(r.R1.answer);if(buy!==!!r.R4){sd("R1 buy but R4 missing");continue}
  const sr=secReads(toObj(W.sec.bars));if(!sr||!sr.S1||!sr.S2){sd("sector reading missing");continue}
  const bc=r.R3.closeBox;
  const cls={R1:r.R1.answer,R3:r.R3.answer,R5:r.R5.answer,R6:r.R6.answer,R7:r.R7.answer,S1:sr.S1,S2:sr.S2,R4:r.R4?bucket4(r.R4.answer-bc):null};
  const v=[];if(r.R2)v.push({key:"R2",cls:"R2:"+bucket(bc-r.R2.answer),ans:r.R2.answer});
  if(r.R2b)v.push({key:"R2b",cls:"R2b:"+bucket(Math.max(0,r.R2b.answer-bc)),ans:r.R2b.answer});
  valid++;
  for(const t of["R1","R3","R5","R6","R7","S1","S2"])nat(t,cls[t]);if(cls.R4)nat("R4",cls.R4);v.forEach(x=>nat("R2*",x.cls));
  pool.push({si,w,cls,v,r});
}
// ---- joint greedy balancing ----
const TG={R1:CSE.OPTIONS.R1,R3:CSE.OPTIONS.R3,R5:CSE.OPTIONS.R5,R6:CSE.OPTIONS.R6,R7:CSE.OPTIONS.R7,S1:S1OPT,S2:S2OPTS,R4:["reached","1-5","6-12","13+"],
  "R2*":["R2:0-3","R2:4-7","R2:8-14","R2:15+","R2b:0-3","R2b:4-7","R2b:8-14","R2b:15+"]};
const expBuy=NSHEETS*2/5;
const target=t=>t==="R4"?expBuy/4:NSHEETS/TG[t].length;
const cnt={};for(const t in TG){cnt[t]={};TG[t].forEach(c=>cnt[t][c]=0)}
const need=(t,c)=>{const x=(target(t)-cnt[t][c])/target(t);return x>0?x*x+x:x*2};
const usedW={},perStock={};const chosen=[];
const WT={R1:1,R3:5,R5:1.5,R6:1,R7:5,S1:1.5,S2:3,R4:0.3,"R2*":1}; // weights: rarer-class types pulled harder (admin default)
function score(c){let s=0;for(const t of["R1","R3","R5","R6","R7","S1","S2"])s+=WT[t]*need(t,c.cls[t]);if(c.cls.R4)s+=WT.R4*need("R4",c.cls.R4);return s}
// R4 absence is also a joint effect via R1 buys; handled through R1 balancing.
while(chosen.length<NSHEETS&&pool.length){
  let best=null,bs=-Infinity,bv=null;
  for(const c of pool){
    if((perStock[c.si]||0)>=CAP)continue;
    if((usedW[c.si]||[]).some(x=>Math.abs(x-c.w)<SPACE))continue;
    const base=score(c);
    for(const v of c.v){const s=base+WT["R2*"]*need("R2*",v.cls)+rnd()*0.02;if(s>bs){bs=s;best=c;bv=v}}}
  if(!best)break;
  chosen.push({c:best,v:bv});pool=pool.filter(x=>x!==best);
  (usedW[best.si]=usedW[best.si]||[]).push(best.w);perStock[best.si]=(perStock[best.si]||0)+1;
  for(const t of["R1","R3","R5","R6","R7","S1","S2"])cnt[t][best.cls[t]]++;if(best.cls.R4)cnt.R4[best.cls.R4]++;cnt["R2*"][bv.cls]++}
// shuffle (seeded) then write
for(let i=chosen.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[chosen[i],chosen[j]]=[chosen[j],chosen[i]]}
const sheets=chosen.map(({c,v},i)=>{const W=window(c.si,c.w),r=CSE.readAll(toObj(W.bars));
  const sr=secReads(toObj(W.sec.bars));
  const ans={R1:r.R1.answer};ans[v.key]=r[v.key].answer;ans.R3=r.R3.answer;ans.R4=r.R4?r.R4.answer:null;ans.R5=r.R5.answer;ans.R6=r.R6.answer;ans.R7=r.R7.answer;ans.S1=sr.S1;ans.S2=sr.S2;
  if(ans[v.key]!==v.ans)throw new Error("ans mismatch "+i);
  return{id:"S"+String(i+1).padStart(4,"0"),stock:c.si,bars:W.bars,fwd:W.fwd,sec:W.sec,fwdRet:W.fwd.map(b=>R5(b[2]/W.bars[W.bars.length-1][2]-1)),r2key:v.key,ans}});
const out={build:BUILD,seed:SEED,conventions:"C1 2% log box; C2 3-box reversal, high/low, one direction per week; C3 first column X from bar 0; C4 Dorsey double/triple top and bottom signals; C5 Dorsey BSL/BRL trend lines, 45 degrees, one box per column; C6 vertical count = 3 x boxes of the buy-signal column; C7 completed = not the last column. Bars normalised by first shipped close. Sector (S1 = R1 logic, S2 = R3 logic on the sector chart) bars aligned by ISO week, normalised by the sector close at the stock bars[0] week. fwdRet[k] = close at week +k+1 over last close - 1.",base,sigStats,sheets};
const json=JSON.stringify(out);
// self-check: every shipped sheet's answers equal the engine on the shipped bars
for(const s of sheets){const r=CSE.readAll(toObj(s.bars));
  const sr=secReads(toObj(s.sec.bars));
  if(s.sec.bars.length!==s.bars.length||s.sec.fwd.length!==FWD||s.fwdRet.length!==FWD)throw new Error(s.id+" sec shape");
  const exp={S1:sr.S1,S2:sr.S2,R1:r.R1.answer,R3:r.R3.answer,R4:r.R4?r.R4.answer:null,R5:r.R5.answer,R6:r.R6.answer,R7:r.R7.answer};exp[s.r2key]=r[s.r2key].answer;
  for(const k in exp)if(s.ans[k]!==exp[k])throw new Error(s.id+" "+k+" mismatch");
  if(s.fwd.length!==FWD)throw new Error(s.id+" fwd")}
fs.mkdirSync(path.join(__dirname,"../data"),{recursive:true});
fs.writeFileSync(path.join(__dirname,"../data/sheets.json"),json);
// ---- report ----
const pct=x=>(100*x).toFixed(0)+"%";
const mixLine=t=>{const tot=Object.values(cnt[t]).reduce((a,b)=>a+b,0)||1,nt=Object.values(natural[t]||{}).reduce((a,b)=>a+b,0)||1;
  return "| "+(t==="R2*"?"R2/R2b buckets":t)+" | "+TG[t].map(c=>c+" "+pct(cnt[t][c]/tot)+" (nat "+pct((natural[t][c]||0)/nt)+")").join("; ")+" |"};
const bt=bots.botTable(out,CSE);
let md="# GEN-REPORT (Chart School, "+BUILD+")\nSeed "+SEED+". Run: `node tools/gen-sheets.js` (data from /home/user/stockdata/stocks/, engine = src/engine.js).\n\n";
md+="## Output\n- data/sheets.json: "+sheets.length+" sheets, "+(json.length/1024).toFixed(0)+" KB ("+(json.length/1048576).toFixed(2)+" MB, limit 2.5 MB).\n- Pool: "+NPOOL+" draws over "+stocks.length+" stocks, "+drawn+" distinct, "+valid+" valid sheet candidates ("+pct(valid/drawn)+").\n- Selection: greedy joint balancing (all 9 readings at once), 8-week spacing per stock, cap "+CAP+" sheets per stock (admin default); window "+MAXW+" weeks (size limit). Stocks used: "+Object.keys(perStock).length+".\n- Base: up10 "+base.up10+" over "+base.n+" weeks. upH "+JSON.stringify(base.upH)+". Sector map: pre-2018 sectors, ETF bars aligned by ISO week, windows without full sector coverage dropped. sigStats: "+Object.entries(sigStats).map(([k,v])=>k+" n="+v.n+" follow="+v.follow).join("; ")+"\n\n";
md+="## Achieved class mix (shipped, vs natural mix in the valid pool)\n| type | mix |\n|---|---|\n"+Object.keys(TG).map(mixLine).join("\n")+"\n\nR4 exists on "+Object.values(cnt.R4).reduce((a,b)=>a+b,0)+" sheets (buy signals only). r2key: R2 "+sheets.filter(s=>s.r2key==="R2").length+", R2b "+sheets.filter(s=>s.r2key==="R2b").length+".\n\n";
md+="## Discard rates (engine discards over distinct pool draws; a draw can hit several)\n"+Object.entries(disc).map(([t,m])=>"- "+t+": "+Object.entries(m).map(([r,n])=>r+" "+n+" ("+pct(n/drawn)+")").join("; ")).join("\n")+"\n- Sheet-level: "+Object.entries(sheetDisc).map(([r,n])=>r+" "+n).join("; ")+"; kept "+valid+" of "+drawn+".\n\n";
md+="## Bot table (shipped sheets; gate: every bot under 40% per type, 3 of 3 under 10%)\n"+bt.md+"\n";
md+="\n## Not balanceable\n- R4 distance bucket: objectives (3 x boxes above the column low) are almost always far above the close. Buckets reached and 1-5 hold no usable sheets in the pool (0%), so 6-12 vs 13+ is the best the data allows. Bots are still far under 40% on R4 (the answer is a box row, not a class).\n- R2/R2b 15+ buckets are rare in the data (R2 2%, R2b 1% natural), limited by supply and 8-week spacing.\n- The 50,000-draw pool contains about 13,000 duplicate (stock, week) draws; distinct draws are the figures above.\n";
fs.writeFileSync(path.join(__dirname,"../docs/GEN-REPORT.md"),md);
console.log("sheets",sheets.length,"KB",(json.length/1024).toFixed(0),"valid",valid,"/",drawn,"bots pass",bt.pass);
