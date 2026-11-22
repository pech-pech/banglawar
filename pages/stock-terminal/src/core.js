"use strict";
/* ---------- seeded RNG ---------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function gauss(r){let u=0,v=0;while(!u)u=r();v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}

/* ---------- tweaks ---------- */
const DEFAULTS={startCash:10000,weeks:10,preWeeks:50,mandate:3,floorPct:10,warnPct:7,capPct:50,feePct:0.5,boxPct:2,reversal:3,volMin:2.5,volMax:6,driftSpread:0.6,mktWeight:0.5,baselineWindows:200,dataSrc:1};
const TWEAK_LABELS={startCash:"Start cash",weeks:"Weeks per period",preWeeks:"Pre-history weeks",mandate:"Mandate (pts over bench)",floorPct:"Floor (% down)",warnPct:"Warn (% down)",capPct:"Per-stock cap %",feePct:"Fee % per side",boxPct:"Box size %",reversal:"Reversal boxes",volMin:"Weekly vol min %",volMax:"Weekly vol max %",driftSpread:"Drift spread %/wk",mktWeight:"Market factor weight",baselineWindows:"Baseline windows",dataSrc:"Data (1 real, 0 stand-in)"};
let T=Object.assign({},DEFAULTS);
try{const s=localStorage.getItem("pfdesk.tweaks");if(s)Object.assign(T,JSON.parse(s))}catch(e){}
function tweaked(){return Object.keys(DEFAULTS).some(k=>+T[k]!==DEFAULTS[k])}
/* ---------- indicators ---------- */
function ema(a,n){const k=2/(n+1);let e=a[0],o=[];for(const x of a){e=x*k+e*(1-k);o.push(e)}return o}
function rsi(c,n=14){const o=[50];let ag=0,al=0;for(let i=1;i<c.length;i++){const d=c[i]-c[i-1],g=Math.max(d,0),l=Math.max(-d,0);
  if(i<=n){ag+=g/n;al+=l/n}else{ag=(ag*(n-1)+g)/n;al=(al*(n-1)+l)/n}o.push(al===0?100:100-100/(1+ag/al))}return o}
function macd(c){const f=ema(c,12),s=ema(c,26),m=f.map((x,i)=>x-s[i]),sg=ema(m,9);return{m,sg,h:m.map((x,i)=>x-sg[i])}}
function sma(c,n){return c.map((_,i)=>{const a=c.slice(Math.max(0,i-n+1),i+1);return a.reduce((s,x)=>s+x,0)/a.length})}
