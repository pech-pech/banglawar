"use strict";
/* ---------- game state ---------- */
let S;
function newPeriod(seed){
  const W=loadWindow(seed);
  S={seed,W,week:0,cash:T.startCash,pos:[0,0,0,0,0,0],views:[null,null,null,null,null,null],calls:[],orders:[],fees:0,
     eqHist:[],benchHist:[],sel:0,screen:"watch",side:1,qty:0,minEq:T.startCash,failed:false,report:null,lastMsg:"",base:null};
  const i0=T.preWeeks-1;S.benchSh=W.bars.map(b=>T.startCash/6/b[i0].c);
  S.eqHist.push(T.startCash);S.benchHist.push(T.startCash);
  render()}
const vis=k=>S.W.bars[k].slice(0,T.preWeeks+S.week);
const closeNow=k=>{const b=vis(k);return b[b.length-1].c};
function equity(){return S.cash+S.pos.reduce((s,q,k)=>s+q*closeNow(k),0)}
function bench(){return S.benchSh.reduce((s,q,k)=>s+q*closeNow(k),0)}
function pct(a,b){return (a/b-1)*100}
function stockInfo(k){
  const b=vis(k),c=b.map(x=>x.c),cols=pnf(b),r=rsi(c),m=macd(c),ma=sma(c,10),sig=pnfSignal(cols);
  const all=S.W.hidden.map(h=>h.slice(0,T.preWeeks+S.week)).concat([0,1,2,3,4,5].map(vis)).map(x=>pnfSignal(pnf(x)));
  const bull=Math.round(100*all.filter(s=>s&&s.buy).length/all.length);
  const eqIdx=[0,1,2,3,4,5].map(j=>vis(j).map(x=>x.c)),idx=c.map((_,i)=>eqIdx.reduce((s,a)=>s+a[i]/a[0],0)/6);
  const rs=c.map((x,i)=>x/c[0]/idx[i]),rsUp=rs[rs.length-1]>=rs[rs.length-5];
  const v=b.map(x=>x.v),vAvg=v.slice(-11,-1).reduce((s,x)=>s+x,0)/10;
  return{b,c,cols,r,m,ma,sig,bull,rsUp,vol:v,vRatio:v[v.length-1]/vAvg,vc:vcount(cols)}}

/* ---------- calls (judged apart from P&L) ---------- */
function resolveCalls(){
  S.calls.forEach(cl=>{if(cl.res)return;const b=vis(cl.k);
    for(let i=cl.at+1;i<b.length;i++){const up=boxOf(b[i].h)>=cl.box+T.reversal,dn=boxUp(b[i].l)<=cl.box-T.reversal;
      if(up||dn){const mv=up&&dn?(b[i].c>=b[i].o?1:-1):(up?1:-1);cl.res=(mv===cl.dir)?"right":"wrong";cl.resWk=S.week;break}}})}

/* ---------- actions ---------- */
function setView(v){S.views[S.sel]=v;S.lastMsg="";render()}
function place(){
  const k=S.sel,px=closeNow(k),q=S.qty;if(q<=0){S.lastMsg="Qty 0";return render()}
  const eq=equity();
  if(S.side===1){const cost=q*px,fee=cost*T.feePct/100;
    if(cost+fee>S.cash+1e-6){S.lastMsg="Rejected: cash "+fmt(S.cash);return render()}
    if((S.pos[k]+q)*px>eq*T.capPct/100+1e-6){S.lastMsg="Rejected: over "+T.capPct+"% cap";return render()}
    S.cash-=cost+fee;S.fees+=fee;S.pos[k]+=q}
  else{if(q>S.pos[k]){S.lastMsg="Rejected: hold "+S.pos[k];return render()}
    const pr=q*px,fee=pr*T.feePct/100;S.pos[k]-=q;S.cash+=pr-fee;S.fees+=fee}
  S.orders.push({wk:S.week,s:S.W.codes[k],side:S.side===1?"BUY":"SELL",q,px:+px.toFixed(2),view:S.views[k]});
  S.lastMsg="Filled "+(S.side===1?"BUY ":"SELL ")+q+" "+S.W.codes[k]+" @ "+px.toFixed(2);S.qty=0;render()}
function advance(){
  if(S.week>=T.weeks||S.failed)return;
  const before=[0,1,2,3,4,5].map(k=>{const i=stockInfo(k);return{c:i.c[i.c.length-1],r:i.r[i.r.length-1],h:i.m.h[i.m.h.length-1],sig:i.sig?i.sig.name+":"+i.sig.col:""}});
  S.views.forEach((v,k)=>{if(v===1||v===-1){const st=stockInfo(k);
    S.calls.push({k,dir:v,wk:S.week,at:vis(k).length-1,box:boxOf(closeNow(k)),pat:st.sig?st.sig.name:"No signal",rsi:Math.round(st.r[st.r.length-1]),mh:st.m.h[st.m.h.length-1]>0?"MACD h +":"MACD h -"})}});
  S.views=[null,null,null,null,null,null];
  const eq0=equity(),b0=bench();
  S.week++;resolveCalls();
  const eq=equity(),bn=bench();S.eqHist.push(eq);S.benchHist.push(bn);S.minEq=Math.min(S.minEq,eq);
  const rows=[0,1,2,3,4,5].map(k=>{const i=stockInfo(k),c=i.c[i.c.length-1],last=i.cols[i.cols.length-1];
    const newBoxes=Object.values(last.wk).filter(w=>w===i.b.length-1).length;
    const now=i.sig?i.sig.name+":"+i.sig.col:"",fired=now&&now!==before[k].sig?i.sig.name:"";
    return{k,chg:pct(c,before[k].c),newBoxes,dir:last.d,fired,r0:before[k].r,r1:i.r[i.r.length-1],h0:before[k].h,h1:i.m.h[i.m.h.length-1]}});
  const resolved=S.calls.filter(c=>c.resWk===S.week);
  if(pct(eq,T.startCash)<=-T.floorPct)S.failed=true;
  S.report={wk:S.week,eq0,eq,b0,bn,rows,resolved};S.screen="report";S.lastMsg="";render();window.scrollTo(0,0)}
function step(){return Math.max(1,Math.round(equity()*0.05/closeNow(S.sel)))}
function maxQty(){const px=closeNow(S.sel);if(S.side===-1)return S.pos[S.sel];const eq=equity();
  return Math.max(0,Math.floor(Math.min(S.cash/(px*(1+T.feePct/100)),eq*T.capPct/100/px-S.pos[S.sel])))}
function openChart(k){S.sel=k;S.screen="chart";S.qty=0;S.lastMsg="";render();window.scrollTo(0,0)}
