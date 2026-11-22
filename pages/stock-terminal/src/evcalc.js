"use strict";
/* ---------- evidence calculator (hit shares of P&F patterns / indicator states vs same-direction base) ---------- */
let EV=null;
const EV_PAT=[["DOUBLE-TOP BUY",1],["TRIPLE-TOP BUY",1],["DOUBLE-BOTTOM SELL",-1],["TRIPLE-BOTTOM SELL",-1],["BULL TRAP",-1],["BEAR TRAP",1]];
const EV_IND=[["RSI >60",1],["RSI <40",-1],["MACD h +",1],["MACD h -",-1],["Above 10wk MA",1],["Below 10wk MA",-1],["RS rising",1],["RS falling",-1]];
function _evR(x,d){const m=Math.pow(10,d);return Math.round(x*m)/m}
function _evWilson(h,n){ // 95% Wilson band
  if(!n)return[0,1];
  const z=1.96,z2=z*z,p=h/n,den=1+z2/n,ce=(p+z2/(2*n))/den,hf=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/den;
  return[Math.max(0,ce-hf),Math.min(1,ce+hf)]}
// list: [bars[]]; start: first counted week index (default 50); offs: optional first global week of each series (for RS alignment; default all 0)
function computeEvidence(list,start,offs){
  start=start==null?50:start;
  const R=T.reversal,S_=list.length;
  const acc={};
  EV_PAT.concat(EV_IND).forEach(a=>{acc[a[0]]={seen:0,n:0,hit:0}});
  let bullR=0,bearR=0;
  // equal-weight 4wk return per global week (RS reference)
  let maxG=0;for(let s=0;s<S_;s++){const f=offs?offs[s]|0:0;maxG=Math.max(maxG,f+list[s].length)}
  const gsum=new Float64Array(maxG+1),gcnt=new Int32Array(maxG+1);
  for(let s=0;s<S_;s++){const b=list[s],f=offs?offs[s]|0:0;
    for(let i=4;i<b.length;i++){gsum[f+i]+=b[i].c/b[i-4].c-1;gcnt[f+i]++}}
  const tally=(name,dir,m)=>{const a=acc[name];a.seen++;if(m!==0){a.n++;if(m===dir)a.hit++}};
  for(let s=0;s<S_;s++){
    const bars=list[s],n=bars.length,f=offs?offs[s]|0:0;
    if(n<=start)continue;
    const hb=new Int32Array(n),lb=new Int32Array(n),cb=new Int32Array(n),cl=new Array(n);
    for(let i=0;i<n;i++){const b=bars[i];hb[i]=boxOf(b.h);lb[i]=boxUp(b.l);cb[i]=boxOf(b.c);cl[i]=b.c}
    // call outcome per week: 1 up first, -1 down first, 0 open (game resolveCalls rule)
    const mv=new Int8Array(n);
    for(let i=start;i<n-1;i++){const box=cb[i],U=box+R,D=box-R;
      for(let j=i+1;j<n;j++){const up=hb[j]>=U,dn=lb[j]<=D;
        if(up||dn){mv[i]=up&&dn?(bars[j].c>=bars[j].o?1:-1):(up?1:-1);break}}}
    const rs=rsi(cl),mc=macd(cl).h,sm=sma(cl,10);
    const CD=[],CLO=[],CHI=[];let fired=false;
    for(let i=0;i<n;i++){
      let created=false,ch=false,trap=-1,sig=-1;
      const m=CD.length;
      if(m===0){const b=bars[i];let lo=lb[i],hi=hb[i];if(lo>hi)lo=hi;CD.push(b.c>=b.o?1:-1);CLO.push(lo);CHI.push(hi);fired=false;created=true}
      else{const k=m-1;
        if(CD[k]===1){
          if(hb[i]>CHI[k]){CHI[k]=hb[i];ch=true}
          else if(lb[i]<=CHI[k]-R){CD.push(-1);CLO.push(lb[i]);CHI.push(CHI[k]-1);fired=false;created=true}
        }else{
          if(lb[i]<CLO[k]){CLO[k]=lb[i];ch=true}
          else if(hb[i]>=CLO[k]+R){CD.push(1);CLO.push(CLO[k]+1);CHI.push(hb[i]);fired=false;created=true}
        }
        if(created&&k>=2){
          if(CD[k]===1&&CHI[k]-CHI[k-2]===1)trap=4;       // BULL TRAP (index in EV_PAT)
          else if(CD[k]===-1&&CLO[k-2]-CLO[k]===1)trap=5; // BEAR TRAP
        }
      }
      if((created||ch)&&!fired){const j=CD.length-1;
        if(j>=2){
          if(CD[j]===1&&CHI[j]>CHI[j-2]){fired=true;sig=(j>=4&&CHI[j-4]===CHI[j-2])?1:0}
          else if(CD[j]===-1&&CLO[j]<CLO[j-2]){fired=true;sig=(j>=4&&CLO[j-4]===CLO[j-2])?3:2}
        }}
      if(i<start)continue;
      const w=mv[i];
      if(w===1)bullR++;else if(w===-1)bearR++;
      if(sig>=0)tally(EV_PAT[sig][0],EV_PAT[sig][1],w);
      if(trap>=0)tally(EV_PAT[trap][0],EV_PAT[trap][1],w);
      const r=rs[i];
      if(r>60)tally("RSI >60",1,w);else if(r<40)tally("RSI <40",-1,w);
      if(mc[i]>0)tally("MACD h +",1,w);else tally("MACD h -",-1,w);
      if(cl[i]>sm[i])tally("Above 10wk MA",1,w);else if(cl[i]<sm[i])tally("Below 10wk MA",-1,w);
      if(i>=4){const g=f+i,mean=gcnt[g]?gsum[g]/gcnt[g]:0,own=cl[i]/cl[i-4]-1;
        if(own>mean)tally("RS rising",1,w);else if(own<mean)tally("RS falling",-1,w)}
    }
  }
  const N=bullR+bearR,bull=N?_evR(bullR/N,4):0.5,bear=_evR(1-bull,4);
  const mk=(name,dir)=>{const a=acc[name],b=dir===1?bull:bear,ft=a.n?a.hit/a.n:b,bd=_evWilson(a.hit,a.n),ftr=_evR(ft,4);
    return{dir,seen:a.seen,ft:ftr,lift:_evR((ftr-b)*100,1),lo:_evR(bd[0],4),hi:_evR(bd[1],4)}};
  const pat={},ind={};
  EV_PAT.forEach(a=>{pat[a[0]]=mk(a[0],a[1])});
  EV_IND.forEach(a=>{ind[a[0]]=mk(a[0],a[1])});
  return{v:1,src:"standin",base:{bull,bear,n:N},pat,ind};
}
let _evKey=null,_evCache=null;
function evNow(){
  try{
    if(typeof DATA!=="undefined"&&DATA&&DATA.ev&&dataSource()==="real")return DATA.ev;
    const key=(typeof S!=="undefined"&&S&&S.W)?String(S.seed)+"|"+T.preWeeks+"|"+dataSource():null;
    if(key&&_evCache&&_evKey===key)return _evCache;
    if(key){
      const list=S.W.bars.concat(S.W.hidden).map(b=>b.slice(0,T.preWeeks));
      const ev=computeEvidence(list,14);ev.src="standin";
      if(ev.base.n>0){_evKey=key;_evCache=ev;EV=ev;return ev}
    }
  }catch(e){}
  return{src:"none",base:{bull:0.5,bear:0.5,n:0},pat:{},ind:{}};
}
