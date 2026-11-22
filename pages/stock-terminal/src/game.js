"use strict";
/* ---------- game state ---------- */
let S;
const _rnd=()=>{if(typeof render==="function")render()};
const _top=()=>{if(typeof window!=="undefined"&&window.scrollTo)try{window.scrollTo(0,0)}catch(e){}};
function newPeriod(seed){
  const W=loadWindow(seed);
  S={seed,W,week:0,cash:T.startCash,pos:[0,0,0,0,0,0],views:[null,null,null,null,null,null],calls:[],neutrals:[],orders:[],fired:[],fees:0,
     eqHist:[],benchHist:[],sel:0,screen:"home",sheet:null,tab:"period",side:1,qty:0,minEq:T.startCash,failed:false,report:null,lastMsg:"",base:null};
  const i0=T.preWeeks-1;S.benchSh=W.bars.map(b=>T.startCash/6/b[i0].c);
  S.eqHist.push(T.startCash);S.benchHist.push(T.startCash);
  const mine=S;
  setTimeout(()=>{if(S!==mine)return;try{S.base=baselineCached()}catch(e){S.base=null}_rnd()},30);
  _rnd()}
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
  const si=typeof sigInfo==="function"?sigInfo(cols):(sig?{name:sig.name,buy:!!sig.buy,dir:sig.buy?1:-1,col:sig.col,age:cols.length-1-sig.col,fresh:cols.length-1-sig.col<=1,reversed:false,trap:null}:{name:null,buy:false,dir:0,col:null,age:null,fresh:false,reversed:false,trap:null});
  return{b,c,cols,r,m,ma,sig,si,bull,rsUp,vol:v,vRatio:v[v.length-1]/vAvg,vc:vcount(cols)}}

/* ---------- calls (judged apart from P&L) ---------- */
function resolveCalls(){
  S.calls.forEach(cl=>{if(cl.res)return;const b=vis(cl.k);
    for(let i=cl.at+1;i<b.length;i++){const up=boxOf(b[i].h)>=cl.box+T.reversal,dn=boxUp(b[i].l)<=cl.box-T.reversal;
      if(up||dn){const mv=up&&dn?(b[i].c>=b[i].o?1:-1):(up?1:-1);cl.res=(mv===cl.view)?"right":"wrong";cl.resWk=S.week;
        if(typeof journalAdd==="function")try{journalAdd(cl)}catch(e){}
        break}}})}

/* ---------- actions ---------- */
function setView(v){S.views[S.sel]=(S.views[S.sel]===v)?null:v;S.lastMsg="";_rnd()}
function place(){
  const k=S.sel,px=closeNow(k),q=S.qty;
  const rej=m=>{S.lastMsg="Rejected: "+m;_rnd()};
  if(q<=0){S.lastMsg="Rejected: qty 0";return _rnd()}
  const eq=equity();
  if(S.side===1){const cost=q*px,fee=cost*T.feePct/100;
    if(cost+fee>S.cash+1e-6)return rej("cash "+fmt(S.cash));
    if((S.pos[k]+q)*px>eq*T.capPct/100+1e-6)return rej("over "+T.capPct+"% cap");
    S.cash-=cost+fee;S.fees+=fee;S.pos[k]+=q}
  else{if(q>S.pos[k])return rej("hold "+S.pos[k]);
    const pr=q*px,fee=pr*T.feePct/100;S.pos[k]-=q;S.cash+=pr-fee;S.fees+=fee}
  const v=S.views[k];
  S.orders.push({wk:S.week,s:S.W.codes[k],side:S.side===1?"BUY":"SELL",q,px:+px.toFixed(2),view:(v===1||v===-1||v===0)?v:null});
  S.lastMsg="Filled "+(S.side===1?"BUY ":"SELL ")+q+" "+S.W.codes[k]+" @ "+px.toFixed(2);S.qty=0;S.sheet=null;_rnd()}
function advance(){
  if(S.week>=T.weeks||S.failed)return;
  const idx=[0,1,2,3,4,5];
  const before=idx.map(k=>{const i=stockInfo(k);return{c:i.c[i.c.length-1],r:i.r[i.r.length-1],h:i.m.h[i.m.h.length-1],sig:i.sig?i.sig.name+":"+i.sig.col:""}});
  S.views.forEach((v,k)=>{
    if(v===0){S.neutrals.push({k,s:S.W.codes[k],wk:S.week});return}
    if(v===1||v===-1){const st=stockInfo(k),si=st.si,sig=si.name||null,box=boxOf(closeNow(k));
      const withSig=si.dir===0?null:si.dir===v;
      let base=0.5;if(typeof baseFor==="function")try{base=baseFor(v)}catch(e){}
      S.calls.push({id:S.seed+":"+S.week+":"+k,seed:S.seed,k,s:S.W.codes[k],wk:S.week,at:vis(k).length-1,box,view:v,dir:v,
        sig,pat:sig||"No signal",sigDir:si.dir,sigAge:si.age==null?null:si.age,fresh:!!si.fresh,withSig,
        rsi:Math.round(st.r[st.r.length-1]),mh:st.m.h[st.m.h.length-1]>0?"MACD h +":"MACD h -",base})}});
  const wkNeutrals=S.neutrals.filter(n=>n.wk===S.week);
  S.views=[null,null,null,null,null,null];
  const eq0=equity(),b0=bench();
  S.week++;resolveCalls();
  const eq=equity(),bn=bench();S.eqHist.push(eq);S.benchHist.push(bn);S.minEq=Math.min(S.minEq,eq);
  const rows=idx.map(k=>{const i=stockInfo(k),c=i.c[i.c.length-1],last=i.cols[i.cols.length-1];
    const newBoxes=Object.values(last.wk).filter(w=>w===i.b.length-1).length;
    const now=i.sig?i.sig.name+":"+i.sig.col:"",fired=now&&now!==before[k].sig?i.sig.name:"";
    if(fired)S.fired.push({wk:S.week,k,s:S.W.codes[k],name:fired,dir:i.sig.buy?1:-1});
    return{k,chg:pct(c,before[k].c),newBoxes,dir:last.d,fired,r0:before[k].r,r1:i.r[i.r.length-1],h0:before[k].h,h1:i.m.h[i.m.h.length-1]}});
  const resolved=S.calls.filter(c=>c.resWk===S.week);
  if(pct(eq,T.startCash)<=-T.floorPct)S.failed=true;
  S.report={wk:S.week,eq0,eq,b0,bn,rows,resolved,neutrals:wkNeutrals,open:S.calls.filter(c=>!c.res),end:periodEnded()};
  S.screen="home";S.sheet="week";S.lastMsg="";_rnd();_top()}
function step(){return Math.max(1,Math.round(equity()*0.05/closeNow(S.sel)))}
function maxQty(){const px=closeNow(S.sel);if(S.side===-1)return S.pos[S.sel];const eq=equity();
  return Math.max(0,Math.floor(Math.min(S.cash/(px*(1+T.feePct/100)),eq*T.capPct/100/px-S.pos[S.sel])))}

/* ---------- navigation ---------- */
function openChart(k){S.sel=k;S.screen="chart";S.sheet=null;S.qty=0;S.lastMsg="";_rnd();_top()}
function go(screen){const ch=S.screen!==screen;S.screen=screen;S.sheet=null;S.lastMsg="";_rnd();if(ch)_top()}
function openSheet(name){S.sheet=name;if(name==="order"){S.qty=0;S.side=1}S.lastMsg="";_rnd()}
function closeSheet(){S.sheet=null;_rnd()}
function periodEnded(){return !!S.failed||S.week>=T.weeks}
function noCallCount(){return S.orders.filter(o=>o.view==null).length}
function periodStats(){
  if(typeof callStats!=="function")return null;
  const n=typeof journalLoad==="function"?journalLoad().length:undefined;
  return callStats(S.calls,n)}
