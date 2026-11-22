"use strict";
/* ---------- baseline: no-read bots over locked seeded windows ---------- */
// score = mandate met (excess over benchmark >= T.mandate) and floor never hit. Windows: loadWindow(1e6+w*7919).
function baseline(){
  const n=T.baselineWindows,res={cash:0,rand:0,lock:0,signal:0},i0=T.preWeeks-1,iN=T.preWeeks+T.weeks-1;let src="standin";
  const pc=(a,b)=>(a/b-1)*100;
  for(let w=0;w<n;w++){const W=loadWindow(1e6+w*7919);src=W.src||src;const B=W.bars;
    const bRet=B.reduce((s,b)=>s+b[iN].c/b[i0].c,0)/6*100-100;
    // cash: idle, never hits floor, excess = -bench
    if(0-bRet>=T.mandate)res.cash++;
    // lock: equal-weight copy of benchmark, 0 excess, fails mandate by construction (admin default: 0>=mandate only if mandate<=0)
    if(0>=T.mandate)res.lock++;
    const run=(pick)=>{let cash=T.startCash;const pos=[0,0,0,0,0,0];
      for(let i=i0;i<iN;i++){const eq=cash+pos.reduce((s,q,k)=>s+q*B[k][i].c,0);
        if(eq<=T.startCash*(1-T.floorPct/100))return false;
        pick(i,eq,(k,amt)=>{const px=B[k][i].c;amt=Math.min(amt,cash/(1+T.feePct/100),eq*T.capPct/100-pos[k]*px);
          if(amt>50){pos[k]+=amt/px;cash-=amt*(1+T.feePct/100)}},
          k=>{const px=B[k][i].c;if(pos[k]>0){cash+=pos[k]*px*(1-T.feePct/100);pos[k]=0}})}
      const eqN=cash+pos.reduce((s,q,k)=>s+q*B[k][iN].c,0);
      return pc(eqN,T.startCash)-bRet>=T.mandate};
    const r=mulberry32(w+17);
    if(run((i,eq,buy)=>{if(r()<0.5){const k=r()*6|0;buy(k,eq/6)}}))res.rand++;
    const sigAt=(k,i)=>{const cols=pnf(B[k].slice(0,i+1));const s=pnfSignal(cols);return s&&s.col===cols.length-1?s.name+":"+s.col+":"+(s.buy?1:0):""};
    if(run((i,eq,buy,sell)=>{const sells=[],buys=[];
      for(let k=0;k<6;k++){const now=sigAt(k,i),prev=i>0?sigAt(k,i-1):"";if(now&&now!==prev){if(now.endsWith(":1"))buys.push(k);else sells.push(k)}}
      sells.forEach(sell);buys.forEach(k=>buy(k,eq/6))}))res.signal++}
  const p=x=>Math.round(100*x/n);
  return{n,src,cash:p(res.cash),rand:p(res.rand),lock:p(res.lock),signal:p(res.signal)}}
function baselineHTML(b){
  return `<div class="dim">No-read strategies meet the mandate: idle cash ${b.cash}%, random buys ${b.rand}%, copy benchmark ${b.lock}%; simple P&amp;F signal reader ${b.signal}% of ${b.n} ${b.src==="real"?"real history":"stand-in"} windows.</div>`}
