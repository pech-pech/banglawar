"use strict";
/* ---------- point and figure (percent box, high/low, N-box reversal) ---------- */
const LB=()=>Math.log(1+T.boxPct/100);
const boxOf=p=>Math.floor(Math.log(p)/LB()+1e-9), boxUp=p=>Math.ceil(Math.log(p)/LB()-1e-9);
const priceOf=b=>Math.exp(b*LB());
function pnf(bars){ // columns [{d:1|-1,lo,hi,wk:{box:barIndex}}]
  const R=T.reversal,cols=[];let c=null;
  bars.forEach((b,i)=>{const hb=boxOf(b.h),lb=boxUp(b.l);
    if(!c){const d=b.c>=b.o?1:-1;c={d,lo:boxUp(b.l),hi:boxOf(b.h),wk:{}};if(c.lo>c.hi)c.lo=c.hi;for(let k=c.lo;k<=c.hi;k++)c.wk[k]=i;cols.push(c);return}
    if(c.d===1){ if(hb>c.hi){for(let k=c.hi+1;k<=hb;k++)c.wk[k]=i;c.hi=hb}
      else if(lb<=c.hi-R){c={d:-1,hi:c.hi-1,lo:lb,wk:{}};for(let k=c.lo;k<=c.hi;k++)c.wk[k]=i;cols.push(c)} }
    else { if(lb<c.lo){for(let k=lb;k<c.lo;k++)c.wk[k]=i;c.lo=lb}
      else if(hb>=c.lo+R){c={d:1,lo:c.lo+1,hi:hb,wk:{}};for(let k=c.lo;k<=c.hi;k++)c.wk[k]=i;cols.push(c)} }
  });return cols}
function pnfSignal(cols){ // last signal + pattern name
  let sig=null;
  for(let i=2;i<cols.length;i++){const c=cols[i],p=cols[i-2],pp=cols[i-4];
    if(c.d===1&&c.hi>p.hi)sig={buy:true,name:(pp&&pp.hi===p.hi)?"TRIPLE-TOP BUY":"DOUBLE-TOP BUY",col:i};
    if(c.d===-1&&c.lo<p.lo)sig={buy:false,name:(pp&&pp.lo===p.lo)?"TRIPLE-BOTTOM SELL":"DOUBLE-BOTTOM SELL",col:i}}
  return sig}
function vcount(cols){ // vertical count from latest X column (up) / O column (down)
  let bx=null,bo=null;for(let i=cols.length-1;i>=0;i--){if(!bx&&cols[i].d===1)bx=cols[i];if(!bo&&cols[i].d===-1)bo=cols[i]}
  return{up:bx?{n:bx.hi-bx.lo+1,base:bx.lo,tgt:bx.lo+(bx.hi-bx.lo+1)*T.reversal}:null,
         dn:bo?{n:bo.hi-bo.lo+1,base:bo.hi,tgt:bo.hi-(bo.hi-bo.lo+1)*T.reversal}:null}}
function pnfTrend(cols){ // Dorsey 45-degree line: {kind,col,box}|null  (box = start box at col)
  const n=cols.length;if(!n)return null;const st=Math.max(0,n-20);
  let oc=-1,xc=-1;
  for(let k=st;k<n;k++){const c=cols[k];
    if(c.d===-1&&(oc<0||c.lo<=cols[oc].lo))oc=k; // lowest O, latest on ties
    if(c.d===1&&(xc<0||c.hi>=cols[xc].hi))xc=k}  // highest X, latest on ties
  if(oc<0)return null;
  const b0=cols[oc].lo-1;let broken=false;
  for(let k=oc+1;k<n;k++)if(cols[k].lo<b0+(k-oc)){broken=true;break}
  if(!broken)return{kind:"support",col:oc,box:b0};
  if(xc<0)return null;
  return{kind:"resist",col:xc,box:cols[xc].hi+1}}
function pnfTraps(cols){ // [{col,kind:"bull"|"bear"}] 1-box breakout, next column reverses
  const out=[];
  for(let i=2;i<cols.length-1;i++){const c=cols[i],p=cols[i-2],nx=cols[i+1];
    if(c.d===1&&c.hi-p.hi===1&&nx.d===-1)out.push({col:i,kind:"bull"});
    else if(c.d===-1&&p.lo-c.lo===1&&nx.d===1)out.push({col:i,kind:"bear"})}
  return out}
function pfText(i,opt){
  opt=opt||{};const all=i.cols,lastBar=i.b.length-1;
  const inH=typeof window!=="undefined"?window.innerHeight:800;
  const maxC=Math.max(1,opt.cols||15),rows=Math.max(3,opt.rows||(inH<700?13:17));
  // most recent K<=maxC columns whose full box range fits in rows (admin default: min 1 column)
  let K=0,lo=Infinity,hi=-Infinity;
  for(let k=all.length-1;k>=0&&K<maxC;k--){const l=Math.min(lo,all[k].lo),h=Math.max(hi,all[k].hi);
    if(h-l+1>rows)break;lo=l;hi=h;K++}
  let f=1;
  if(K===0){const c=all[all.length-1];K=1;lo=c.lo;hi=c.hi;f=Math.ceil((hi-lo+1)/rows)} // compress: every f-th box
  const off=all.length-K,show=all.slice(off);
  const tr=pnfTrend(all),traps=pnfTraps(all).filter(t=>t.col>=off);
  let out="",r=0;const dp=priceOf(hi)<100?1:0; // one label precision per chart
  for(let b=hi;b>=lo;b-=f,r++){
    const p=priceOf(b),lab=((f>1?r%2===0:b%2===0)?p.toFixed(dp):"").padStart(5);let line=lab+"|";
    show.forEach((c,j)=>{const g=off+j;let ch=" ";
      if(b>=c.lo&&b<=c.hi){const s=c.d===1?"X":"O";
        ch=c.wk[b]===lastBar?`<span class="new">${s}</span>`:`<span class="${c.d===1?"x":"o"}">${s}</span>`}
      else if(tr&&g>=tr.col){const lb=tr.kind==="support"?tr.box+(g-tr.col):tr.box-(g-tr.col);
        if(lb===b||(f>1&&lb<b&&lb>b-f))ch='<span class="tl">+</span>'}
      line+=" "+ch});
    out+=line+"\n"}
  out+=(f>1?("1:"+f).padStart(5):"     ")+"+"+"-".repeat(show.length*2);
  if(traps.length){let row="      ";
    show.forEach((c,j)=>{const t=traps.find(x=>x.col===off+j);row+=t?(t.kind==="bull"?"BT":"bt"):"  "});
    out+="\n"+row;
    const W=6+show.length*2,fit=t=>t.slice(0,W).padEnd(W),k1="BT bull trap  bt bear trap",k2="BT=bull trap bt=bear trap";
    if(W>=k1.length)out+="\n"+fit(k1);else if(W>=k2.length)out+="\n"+fit(k2);
    else out+="\n"+fit("BT=bull trap")+"\n"+fit("bt=bear trap")}
  return out}
/* ---------- signal info (UI v2) ---------- */
function sigInfo(cols){ // {name|null,buy,dir,col,age,fresh,reversed,trap}
  const none={name:null,buy:false,dir:0,col:null,age:null,fresh:false,reversed:false,trap:null};
  if(!cols||!cols.length)return none;
  const s=pnfSignal(cols);if(!s)return none;
  const n=cols.length,age=n-1-s.col,ref=cols[s.col-2];let reversed=false;
  for(let j=s.col+1;j<n;j++){const c=cols[j];
    if(s.buy&&c.d===-1&&ref&&c.lo<=ref.hi)reversed=true;
    if(!s.buy&&c.d===1&&ref&&c.hi>=ref.lo)reversed=true}
  const t=pnfTraps(cols).find(x=>x.col===s.col),trap=t?t.kind:null;
  return{name:s.name,buy:s.buy,dir:s.buy?1:-1,col:s.col,age,fresh:age<=1&&!reversed,reversed,trap}}
function sigLabel(name){
  if(!name)return"No signal";
  const t=String(name).toLowerCase().replace(/-/g," ");return t.charAt(0).toUpperCase()+t.slice(1)}
