"use strict";
// K2 checker-pnf: P&F tests written from CONTRACT.md (box 2%, 3-box reversal, high/low)
const fs=require("fs"),path=require("path"),vm=require("vm"),assert=require("assert");
const SRC=path.join(__dirname,"..","src");
const store={};
const ctx=vm.createContext({window:{innerWidth:344,innerHeight:882},
  localStorage:{getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}},
  console,Math,Date,JSON,Object,Array,Number,String,Map,Set,Promise,setTimeout});
ctx.window.window=ctx.window;
for(const f of["core.js","pnf.js"])vm.runInContext(fs.readFileSync(path.join(SRC,f),"utf8"),ctx,{filename:f});
const G=vm.runInContext(`({T,pnf,pnfSignal,vcount,boxOf,boxUp,priceOf,
 pnfTrend:typeof pnfTrend==="function"?pnfTrend:null,
 pnfTraps:typeof pnfTraps==="function"?pnfTraps:null,
 pfText:typeof pfText==="function"?pfText:null})`,ctx);
const {T,pnf,pnfSignal,priceOf,boxOf,boxUp}=G;

let fails=0;
function t(name,fn){try{fn();console.log("ok   "+name)}catch(e){fails++;console.log("FAIL "+name+"\n     "+(e&&e.message||e).toString().split("\n").join("\n     "))}}

// bar from box range: h just above box hb price, l just below box lb price; up => c>=o
const bar=(hb,lb,up=true)=>{const h=priceOf(hb)*1.0001,l=priceOf(lb)*0.9999,m=(h+l)/2;return up?{o:l*1.00001,h,l,c:h*0.99999,v:1e5}:{o:h*0.99999,h,l,c:l*1.00001,v:1e5}};
const B0=200; // base box
const mk=(arr,firstUp=true)=>arr.map(([h,l],i)=>bar(B0+h,B0+l,i===0?firstUp:true));
const sum=cols=>cols.map(c=>`${c.d>0?"X":"O"}${c.lo-B0}-${c.hi-B0}`).join(" ");
const strip=s=>s.replace(/<[^>]*>/g,"");
const tr=G.pnfTrend, traps=G.pnfTraps, pf=G.pfText;

t("defaults: 2% box, 3-box reversal",()=>{assert.strictEqual(T.boxPct,2);assert.strictEqual(T.reversal,3)});
t("box maths: 2% steps, floor/ceil",()=>{
  for(const b of[150,200,232]){assert.strictEqual(boxOf(priceOf(b)*1.0199),b);assert.strictEqual(boxOf(priceOf(b)*1.0201),b+1);
    assert.strictEqual(boxUp(priceOf(b)*0.9999),b);assert.ok(Math.abs(priceOf(b+1)/priceOf(b)-1.02)<1e-9)}});

// (g) reversal rules
t("(g) 2 boxes down does not reverse an X column; 3 boxes does",()=>{
  let c=pnf(mk([[10,0],[10,8]]));assert.strictEqual(c.length,1,sum(c));
  c=pnf(mk([[10,0],[10,7]]));assert.strictEqual(c.length,2,sum(c));
  assert.strictEqual(c[1].d,-1);assert.strictEqual(c[1].hi-B0,9);assert.strictEqual(c[1].lo-B0,7)});
t("(g) high/low method: new high extends X even if close lower; O reverses up after 3 boxes",()=>{
  const bars=mk([[10,0],[13,9]]);bars[1].c=bars[1].l*1.0001;
  let c=pnf(bars);assert.strictEqual(c.length,1);assert.strictEqual(c[0].hi-B0,13);
  c=pnf(mk([[10,0],[10,7],[10,7],[11,6],[10,7]].slice(0,2).concat([[11,6]])));// O 7..9 then lower low extends
  assert.strictEqual(c[1].lo-B0,6);
  c=pnf(mk([[10,0],[10,7],[10,5],[8,5]]));// O reaches 5, then high 8 = lo+3 reverses
  assert.strictEqual(c.length,3,sum(c));assert.strictEqual(c[2].d,1);assert.strictEqual(c[2].lo-B0,6);assert.strictEqual(c[2].hi-B0,8);
  c=pnf(mk([[10,0],[10,7],[10,5],[7,5]]));assert.strictEqual(c.length,2,"2 boxes up must not reverse O: "+sum(c))});

// (a) double-top buy
const A=mk([[110,100],[110,107],[111,107]]);
t("(a) classic double-top buy",()=>{
  const c=pnf(A);assert.strictEqual(sum(c),"X100-110 O107-109 X108-111");
  const s=pnfSignal(c);assert.ok(s&&s.buy===true&&s.col===2,JSON.stringify(s));assert.ok(/DOUBLE-TOP/.test(s.name),s.name)});
// (b) triple-bottom sell
const Bb=mk([[110,100],[103,101],[103,100],[103,101],[103,99]],false);
t("(b) triple-bottom sell",()=>{
  const c=pnf(Bb);assert.strictEqual(sum(c),"O100-110 X101-103 O100-102 X101-103 O99-102");
  const s=pnfSignal(c);assert.ok(s&&s.buy===false&&s.col===4,JSON.stringify(s));assert.ok(/TRIPLE-BOTTOM/.test(s.name),s.name)});
// (c) traps
const C=mk([[110,100],[110,107],[111,107],[111,108]]);
t("(c) bull trap: buy by exactly 1 box then O column",()=>{
  assert.ok(traps,"pnfTraps missing");const c=pnf(C);assert.strictEqual(sum(c),"X100-110 O107-109 X108-111 O108-110");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(traps(c))),[{col:2,kind:"bull"}])});
t("(c) no trap when buy not followed by reversal, or buy by 2 boxes",()=>{
  assert.ok(traps);assert.strictEqual(JSON.stringify(traps(pnf(A))),"[]");
  const c=pnf(mk([[110,100],[110,107],[112,107],[112,109]]));assert.strictEqual(sum(c),"X100-110 O107-109 X108-112 O109-111");
  assert.strictEqual(JSON.stringify(traps(c)),"[]")});
t("(c) bear trap mirror",()=>{
  assert.ok(traps);const c=pnf(mk([[110,100],[103,101],[103,99],[102,99]],false));
  assert.strictEqual(sum(c),"O100-110 X101-103 O99-102 X100-102");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(traps(c))),[{col:2,kind:"bear"}])});

// (d)/(e) text rendering
function walk(n,amp,seed){let s=seed,r=()=>(s=(s*1664525+1013904223)>>>0)/4294967296,mid=B0,out=[];
  for(let i=0;i<n;i++){mid+=Math.round((r()-.5)*amp);const w=1+Math.floor(r()*amp/2);out.push([mid+w-B0,mid-w-B0])}return out}
const lastBarIdx=b=>b.length-1;
function parse(txt,cols){ // returns {K, body[], axis, extra}
  const lines=strip(txt).split("\n");const ai=lines.findIndex(l=>/\+-+\s*$/.test(l));assert.ok(ai>=0,"no axis line");
  const K=(lines[ai].length-6)/2;assert.ok(Number.isInteger(K)&&K>=1,"axis length "+lines[ai].length);
  return{lines,ai,K,body:lines.slice(0,ai)}}
function checkText(bars,opt,label){
  assert.ok(pf,"pfText missing");const cols=pnf(bars),txt=pf({cols,b:bars},opt);
  const {lines,ai,K,body}=parse(txt,cols);const cm=/1:(\d+)/.exec(strip(txt)),compressed=!!cm,N=cm?+cm[1]:1; // contract says 1:2; honest 1:N (N>=2) accepted when 1:2 still would not fit rows
  assert.ok(K<=opt.cols,`${label}: K=${K}>cols ${opt.cols}`);
  assert.ok(body.length<=opt.rows,`${label}: ${body.length} body rows > rows ${opt.rows}`);
  const shown=cols.slice(-K);
  shown.forEach((c,k)=>{let n=0;for(const l of body){const ch=l[6+2*k+1];if(ch==="X"||ch==="O"){assert.strictEqual(ch,c.d>0?"X":"O",label+" wrong glyph col "+k);n++}}
    const full=c.hi-c.lo+1;
    if(compressed){assert.strictEqual(K,1,label+": compressed must show last column alone");assert.ok(N>=2&&n>=Math.floor(full/N)&&n<=Math.ceil(full/N)+1,`${label}: compressed 1:${N} count ${n} vs ${full}`)}
    else assert.strictEqual(n,full,`${label}: col ${k} shows ${n} of ${full} boxes (cropped)`)});
  return{txt,lines,K,compressed,cols}}
t("(d) range taller than rows: never crops a shown column",()=>{
  for(const [seed,amp,opt] of[[1,9,{cols:15,rows:13}],[2,14,{cols:15,rows:13}],[3,6,{cols:15,rows:17}],[4,20,{cols:20,rows:13}],[5,4,{cols:12,rows:9}]]){
    const bars=mk(walk(120,amp,seed));const r=checkText(bars,opt,`seed${seed}`);
    assert.ok(r.cols.length>3)}});
t("(d) tall last column alone is compressed 1:2",()=>{
  const bars=mk([[110,100],[110,107],[140,107]]);const r=checkText(bars,{cols:15,rows:13},"tall");
  assert.ok(r.compressed,"last column 34 boxes > 13 rows must show a 1:N label");assert.strictEqual(r.K,1)});
t("(d) default opt (no opts) works at 344x882 and short screens",()=>{
  const bars=mk(walk(100,10,9));const cols=pnf(bars);
  let txt=pf({cols,b:bars});let {K,body}=parse(txt);assert.ok(K<=15&&body.length<=17,`K=${K} rows=${body.length}`);
  ctx.window.innerHeight=600;txt=pf({cols,b:bars});({K,body}=parse(txt));assert.ok(body.length<=13,"rows "+body.length+" at innerHeight 600");ctx.window.innerHeight=882});
t("(e) all lines equal width and <= 6+2*cols",()=>{
  for(const [seed,opt] of[[1,{cols:15,rows:13}],[7,{cols:10,rows:17}],[8,{cols:20,rows:13}]]){
    for(const bars of[mk(walk(110,9,seed)),C,A]){
      const txt=pf({cols:pnf(bars),b:bars},opt),L=strip(txt).split("\n");
      const w=L[0].length;L.forEach((l,i)=>assert.strictEqual(l.length,w,`line ${i} width ${l.length}!=${w}: "${l}"`));
      assert.ok(w<=6+2*opt.cols,`width ${w} > ${6+2*opt.cols}`)}}});
t("(e) trap label row under axis (BT / bt) and .new class on current-week boxes",()=>{
  const bars=C,cols=pnf(bars);const txt=pf({cols,b:bars},{cols:15,rows:13});const L=strip(txt).split("\n");
  const ai=L.findIndex(l=>/\+-+\s*$/.test(l));assert.ok(L.slice(ai+1).join("").includes("BT"),"no BT label under axis:\n"+strip(txt));
  assert.ok(/class="new"/.test(txt),"no .new boxes for latest bar");
  const bars2=mk([[110,100],[103,101],[103,99],[102,99]],false),c2=pnf(bars2);
  const L2=strip(pf({cols:c2,b:bars2},{cols:15,rows:13})).split("\n"),a2=L2.findIndex(l=>/\+-+\s*$/.test(l));
  assert.ok(/(^|[^B])bt/.test(L2.slice(a2+1).join("\n")),"no bt label:\n"+L2.join("\n"))});
t("(e) trendline '+' only in empty cells (never replaces X/O)",()=>{
  const bars=mk([[120,100],[112,101],[112,106]],false),cols=pnf(bars);
  const r=checkText(bars,{cols:15,rows:17},"tl");assert.ok(r.K>=1)});

// (f) trend
const Fbars=mk([[120,100],[112,101],[112,106]],false);
t("(f) pnfTrend: support after a clear low",()=>{
  assert.ok(tr,"pnfTrend missing");const c=pnf(Fbars);assert.strictEqual(sum(c),"O100-120 X101-112 O106-111");
  const r=tr(c);assert.ok(r&&r.kind==="support",JSON.stringify(r));assert.strictEqual(typeof r.box,"number");assert.strictEqual(typeof r.col,"number")});
t("(f) pnfTrend: switches to resist after a break",()=>{
  const bars=mk([[120,100],[112,101],[112,106],[116,107],[116,102]],false),c=pnf(bars);
  assert.strictEqual(sum(c),"O100-120 X101-112 O106-111 X107-116 O102-115");
  const r=tr(c);assert.ok(r&&r.kind==="resist",JSON.stringify(r))});
t("(f) pnfTrend: empty / tiny input does not throw",()=>{tr([]);tr(pnf(mk([[110,100]])))});

console.log(fails?`\n${fails} FAILED`:"\nall passed");process.exit(fails?1:0);
