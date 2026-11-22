"use strict";
/* Home screen (S1). Contract: CONTRACT-ui2.md */
function dashNoteSeen(){try{return localStorage.getItem("st.note1")==="1"}catch(e){return false}}
function dashNoteDismiss(){try{localStorage.setItem("st.note1","1")}catch(e){}
  const n=document.getElementById("dNote");if(n)n.remove()}
function dashAlerts(){
  const out=[],r=S.report;
  if(!r||S.week===0){
    out.push({ic:"n",g:"•",tx:"Start of period: "+T.weeks+" weeks. Mandate +"+T.mandate+" pts over the benchmark, floor "+fmt(T.startCash*(1-T.floorPct/100))+".",on:""});
    return out}
  r.rows.forEach(w=>{if(!w.fired)return;const k=w.k,i=stockInfo(k),d=i.si?i.si.dir:0;
    out.push({ic:d>0?"b":"s",g:d>0?"▲":"▼",tx:"<b>"+esc(S.W.codes[k])+"</b> "+esc(w.fired.toLowerCase())+" fired",tg:S.pos[k]>0?"held":"",on:"openChart("+k+")"})});
  (r.resolved||[]).forEach(c=>{
    out.push({ic:c.res==="right"?"k":"n",g:c.res==="right"?"✓":"✗",tx:"Call resolved: <b>"+esc(c.s)+"</b> "+(c.view>0?"bullish":"bearish")+", "+c.res,on:'S.tab="journal";go("review")'})});
  const pe=pct(equity(),T.startCash);
  if(pe<=-T.warnPct)out.push({ic:"w",g:"!",tx:S.failed?"Equity is below the floor":"Equity is in the warn zone near the floor",on:""});
  if(!out.length)out.push({ic:"n",g:"•",tx:"Quiet week: no new signals and no calls resolved.",on:""});
  return out}
function dashAlertHTML(a){
  const inner=`<span class="d-ic ${a.ic}" aria-hidden="true">${a.g}</span><span class="d-tx">${a.tx}</span>${a.tg?`<span class="d-tg">${a.tg}</span>`:""}`;
  return a.on?`<button class="d-al" onclick='${a.on}'>${inner}</button>`:`<div class="d-al">${inner}</div>`}
function dashAcct(){
  const eq=equity(),bn=bench(),ret=pct(eq,T.startCash),bret=pct(bn,T.startCash),ex=ret-bret;
  const fl=T.startCash*(1-T.floorPct/100),wn=T.startCash*(1-T.warnPct/100),hi=T.startCash*(1+T.floorPct/100);
  const cl=v=>Math.max(0,Math.min(100,v)),pos=cl((eq-fl)/(hi-fl)*100),wp=cl((wn-fl)/(hi-fl)*100);
  const exp=cl(ex/T.mandate*100),inv=eq-S.cash,bad=eq<=fl;
  return `<section class="card d-acct" aria-label="Account">
  <div class="d-eq"><div><div class="cap">Week ${S.week} of ${T.weeks} · Equity</div><div class="d-big num">${fmt(eq)}</div></div>
   <div class="d-r"><b class="num ${ret>0.05?"up":ret<-0.05?"down":"dim"}">${ret>0.05?"▲":ret<-0.05?"▼":"■"} ${sg(ret)}%</b><span class="dim num">Benchmark ${sg(bret)}%</span></div></div>
  <div class="d-mt d-exc"><div class="d-lab"><span>Excess vs mandate</span><b class="num">${sg(ex)} of +${T.mandate.toFixed(1)} pts</b></div>
   <div class="d-track" role="img" aria-label="Excess ${sg(ex)} of ${T.mandate} points"><div class="d-fill" style="width:${exp}%"></div></div></div>
  <div class="d-mt d-fl"><div class="d-lab"><span>Floor ${fmt(fl)}</span><b class="num${bad?" d-bad":""}">${eq>=fl?fmt(eq-fl)+" above":fmt(fl-eq)+" below"}</b></div>
   <div class="d-track" role="img" aria-label="Equity ${fmt(eq)} between floor ${fmt(fl)} and ${fmt(hi)}"><div class="d-warnz" style="width:${wp}%"></div><div class="d-wt" style="left:${wp}%"></div><div class="d-mk${bad?" bad":""}" style="left:${pos}%"></div></div>
   <div class="d-ends num"><span class="d-wn" style="left:${wp}%">warn ${fmt(wn)}</span><span class="d-hi">${fmt(hi)}</span></div></div>
  <div class="d-cash num"><div>Cash <b>${fmt(S.cash)}</b></div><div>Invested <b>${fmt(inv)}</b></div></div>
 </section>`}
function dashCard(k){
  const i=stockInfo(k),n=i.c.length,last=i.c[n-1],prev=i.c[n-2]||last,ch=pct(last,prev),si=i.si||{};
  const cc=ch>0.05?"up":ch<-0.05?"down":"dim",ca=ch>0.05?"▲":ch<-0.05?"▼":"■";
  const hot=si.fresh&&si.dir?(si.dir>0?" hot buy":" hot sell"):"";
  const r=i.r[i.r.length-1],h=i.m.h[i.m.h.length-1],sh=S.pos[k];
  const nm=i.sig?i.sig.name:"No signal";
  return `<button class="d-card${hot}" id="card-${k}" onclick="openChart(${k})" aria-label="${esc(S.W.codes[k])}, last ${fmt(last)}, ${sg(ch)}%, ${esc(nm)}">
 <span class="d-hd"><span class="d-l1"><b class="d-code">${esc(S.W.codes[k])}</b>${sh>0?`<span class="d-held">${sh} sh</span>`:""}</span><span class="d-l2"><b class="num d-last">${fmt(last)}</b><span class="num d-chg ${cc}">${ca} ${sg(ch)}%</span></span></span>
 <span class="d-ch">${pfMini(i,{w:48,h:66,cell:6})}</span>
 <span class="d-ind"><span class="d-ir"><span class="d-il">RSI</span><b class="num">${Math.round(r)}</b></span><span class="d-sp">${spark(i.r.slice(-11),{w:70,h:14})}</span>
  <span class="d-ir"><span class="d-il">MACD</span><b class="num">${h>=0?"+":"−"}${Math.abs(h).toFixed(2)}</b></span><span class="d-sp">${miniBars(i.m.h.slice(-8),{w:70,h:14})}</span></span>
 <span class="d-sg">${sigChip(i.si)}</span>
</button>`}
SCREENS.home=function(){
  const al=dashAlerts(),max=(typeof layout==="function"&&layout()==="wide")?2:3,shown=al.slice(0,max),more=al.length-shown.length;
  const note=dashNoteSeen()?"":`<div class="card d-note" id="dNote"><span>These stocks mostly rose. A bullish call is right about ${pctTxt(baseFor(1))} of the time with no chart at all. Your record is compared with that.</span><button class="btn" id="noteDismiss" onclick="dashNoteDismiss()">Got it</button></div>`;
  const strip=`<section class="card d-strip" aria-label="This week"><div class="cap">${S.week===0?"Start":"This week"}</div>${shown.map(dashAlertHTML).join("")}${more>0?`<div class="d-al d-more"><span class="d-tx"><b>${more} more</b> this week</span></div>`:""}</section>`;
  const cards=[0,1,2,3,4,5].map(dashCard).join("");
  const main=`${note}<div class="d-home"><div class="d-side">${dashAcct()}${strip}</div><div class="d-grid">${cards}</div></div>
<div class="d-foot dim" id="buildId">Build ${esc(BUILD)} · data ${esc(dataSource())}</div>`;
  const bar=`<button class="btn outline" id="btnJournal" onclick='S.tab="journal";go("review")'>Journal</button>`+
    (periodEnded()?`<button class="btn primary" id="btnReview" onclick='go("review")'>Period review</button>`
      :`<button class="btn primary" id="btnAdvance" onclick="advance()">Advance week</button>`);
  return{top:topBar("Home","Stock Terminal",devBadge()),main,bar}};
