"use strict";
/* ---------- data layer (stand-in seeded market) ---------- */
// load(window) -> {codes, bars:[[{o,h,l,c,v}]], hidden:[[bars]]}. Swap source here for real data.
function genSeries(r,n,mkt,startPrice){
  const vol=(T.volMin+(T.volMax-T.volMin)*r())/100, drift=(r()*2-1)*T.driftSpread/100+0.001, w=T.mktWeight;
  let p=startPrice,bars=[],vb=1e5*(0.5+r()*2);
  for(let i=0;i<n;i++){const ret=drift+vol*(w*mkt[i]+Math.sqrt(1-w*w)*gauss(r));const o=p,c=Math.max(0.5,p*Math.exp(ret));
    const h=Math.max(o,c)*(1+Math.abs(gauss(r))*vol*0.45),l=Math.min(o,c)*(1-Math.abs(gauss(r))*vol*0.45);
    const v=vb*(1+Math.abs(ret)*12)*Math.exp(gauss(r)*0.25);bars.push({o,h,l,c,v});p=c}
  return bars}
function codeFor(r,used){const A="ABCDEFGHJKLMNPRSTUVWXYZ";let c;do{c=A[r()*23|0]+A[r()*23|0]+A[r()*23|0]}while(used.has(c));used.add(c);return c}
function standinWindow(seed){
  const r=mulberry32(seed),n=T.preWeeks+T.weeks,mkt=[];for(let i=0;i<n;i++)mkt.push(gauss(r));
  const used=new Set(),codes=[],bars=[],hidden=[];
  for(let i=0;i<6;i++){codes.push(codeFor(r,used));bars.push(genSeries(r,n,mkt,20+r()*180))}
  for(let i=0;i<30;i++)hidden.push(genSeries(r,n,mkt,20+r()*180));
  return{codes,bars,hidden,src:"standin"}}

/* ---------- real history (data/weekly.json v1) ---------- */
let DATA=null,_covN=-1,_covS=null;
async function loadData(){
  try{
    const res=await fetch("data/weekly.json");if(!res.ok)return;
    const j=await res.json();if(!j||j.v!==1||!Array.isArray(j.series))return;
    const series=[];
    for(const s of j.series){
      const len=s.c.length;let u=0;const bars=new Array(len);
      for(let i=0;i<len;i++){
        u+=s.c[i];const c=Math.exp(u/2000);
        let o=Math.exp((u+s.o[i])/2000),h=Math.exp((u+s.h[i])/2000),l=Math.exp((u+s.l[i])/2000);
        if(!(c>0&&o>0&&h>0&&l>0))throw 0;
        bars[i]={o,h:Math.max(h,o,c),l:Math.min(l,o,c),c,v:Math.exp(s.v[i]/100)-1};
      }
      series.push({id:s.id,k:s.k,f:s.f,bars});
    }
    DATA={nW:j.nW,series};_covN=-1;_covS=null;
  }catch(e){DATA=null}
}
function dataSource(){return(T.dataSrc===1&&DATA)?"real":"standin"}
// per window length n: stock series indices usable per start week + list of start weeks with >=36 covering (cached; admin default)
function _coverage(n){
  if(_covN===n&&_covS)return _covS;
  const cnt=new Int32Array(DATA.nW+2),st=[];
  DATA.series.forEach((s,i)=>{if(s.k!=="stock")return;st.push(i);const a=s.f,b=s.f+s.bars.length-n;if(b>=a){cnt[a]++;cnt[b+1]--}});
  const starts=[];let run=0;
  for(let w=0;w<DATA.nW;w++){run+=cnt[w];if(run>=36)starts.push(w)}
  _covN=n;_covS={starts,st};return _covS}
function _median(a){const b=a.slice().sort((x,y)=>x-y);return b[b.length>>1]}
function realWindow(seed){
  const n=T.preWeeks+T.weeks,cv=_coverage(n);
  if(!cv.starts.length)return null;
  const r=mulberry32(seed),s=cv.starts[r()*cv.starts.length|0];
  const pool=cv.st.filter(i=>{const d=DATA.series[i];return d.f<=s&&s+n<=d.f+d.bars.length});
  for(let i=pool.length-1;i>0;i--){const j=r()*(i+1)|0,t=pool[i];pool[i]=pool[j];pool[j]=t}
  const pick=pool.slice(0,36),out=[];
  for(const idx of pick){
    const d=DATA.series[idx],src=d.bars.slice(s-d.f,s-d.f+n);
    const pf=(20+r()*180)/src[T.preWeeks-1].c,vm=_median(src.map(b=>b.v)),vf=1e5*(0.5+r()*2)/(vm>0?vm:1);
    out.push(src.map(b=>({o:b.o*pf,h:b.h*pf,l:b.l*pf,c:b.c*pf,v:b.v*vf})));
  }
  const used=new Set(),codes=[];for(let i=0;i<6;i++)codes.push(codeFor(r,used));
  const bars=out.slice(0,6),hidden=out.slice(6);
  if(hidden.length<30){const mkt=[];for(let i=0;i<n;i++)mkt.push(gauss(r));
    while(bars.length<6)bars.push(genSeries(r,n,mkt,20+r()*180));
    while(hidden.length<30)hidden.push(genSeries(r,n,mkt,20+r()*180))}
  return{codes,bars,hidden,src:"real"}}
function loadWindow(seed){
  if(dataSource()==="real"){try{const w=realWindow(seed);if(w)return w}catch(e){}}
  return standinWindow(seed)}
