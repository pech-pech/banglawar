"use strict";
/* Chart screen (S2a). Needs: stockInfo closeNow equity S T layout topBar devBadge fmt esc pfSVG rsiPane macdPane volPane sigChip evNow baseFor liftCls liftTxt pctTxt priceOf sigLabel go openChart openSheet */
function chAvgCost(k){ // admin default: average-cost method over S.orders; null when it cannot be derived
  const code=S.W.codes[k];let q=0,cost=0;
  (S.orders||[]).forEach(o=>{if(o.s!==code)return;
    if(o.side==="BUY"){q+=o.q;cost+=o.q*o.px}
    else if(q>0){const a=cost/q,n=Math.min(q,o.q);q-=n;cost-=a*n}});
  return q>0&&S.pos[k]>0?cost/q:null}
function chEvLine(i){
  let ev=null;try{ev=evNow()}catch(e){}
  const si=i.si||{},pats=(ev&&ev.pat)||{};
  const key=si.name||(si.trap==="bull"?"BULL TRAP":si.trap==="bear"?"BEAR TRAP":null);
  const p=key&&pats[key];
  if(p&&p.seen){
    const label=si.name?sigLabel(si.name):(si.trap==="bull"?"Bull trap":"Bear trap"),dir=p.dir===-1?"bearish":"bullish";
    const cls=liftCls(p);
    return `<b>${esc(label)}:</b> followed through ${pctTxt(p.ft)} of ${p.seen.toLocaleString("en-US")} seen &middot; lift <span class="${cls==="dim"?"":cls}">${liftTxt(p.lift)}</span> vs ${dir} base ${pctTxt(baseFor(p.dir))}`}
  return `Base rate: bullish calls right ${pctTxt(baseFor(1))}, bearish ${pctTxt(baseFor(-1))} (this market)`}
SCREENS.chart=function(){
  const k=S.sel,i=stockInfo(k),code=S.W.codes[k],px=closeNow(k),c=i.c,prev=c[c.length-2]||c[c.length-1];
  const chg=(px/prev-1)*100,view=S.views[k],vc=i.vc||{},tg=(view===-1||(!view&&i.si&&i.si.dir<0))?vc.dn:vc.up; // integrator: no view -> follow signal direction
  let tgt=null;try{if(tg&&tg.tgt!=null)tgt=priceOf(tg.tgt)}catch(e){}
  const lay=layout(),W0=window.innerWidth,H0=window.innerHeight;
  const sheetOn=lay==="wide"&&S.sheet==="order";
  const total=W0-24-(sheetOn?372:0);
  const two=lay==="wide"&&total>=640;
  let pw,paneW,pfH,hr,hm,hv;
  if(lay==="cover"){hr=62;hm=66;hv=34}else if(lay==="tall"){hr=84;hm=92;hv=44}else{hr=50;hm=56;hv=30}
  const chrome=44+(lay==="wide"?52:56)+38+72+24, evH=56;
  if(two){const l=Math.floor((total-10)*0.56);pw=l;paneW=total-10-l;
    pfH=Math.max(160,Math.min(320,H0-chrome-evH))}
  else{pw=paneW=total;pfH=Math.max(160,Math.min(lay==="tall"?380:246,H0-chrome-evH-(hr+40)-(hm+40)-8))}
  const cw=pw-2;paneW=paneW-(two?0:0);
  const cell=lay==="cover"?15:14;
  const held=S.pos[k]>0,ac=held?chAvgCost(k):null;
  const up=chg>=0,sq=(k+5)%6,nx=(k+1)%6;
  const chev=d=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const top=topBar("Chart",`Week ${S.week} of ${T.weeks} · Equity ${fmt(equity())}`,devBadge());
  const head=`<div class="ch-hd">
    <button class="ch-ib" id="btnBack" aria-label="Back to home" onclick="go('home')">${chev("M15 5l-7 7 7 7")}</button>
    <div class="ch-ttl"><div class="ch-l1"><span>${esc(code)}</span><span class="num" id="chPx">${px.toFixed(2)}</span></div>
    <div class="ch-l2 num ${up?"up":"down"}">${up?"&#9650;":"&#9660;"} ${up?"+":""}${chg.toFixed(1)}% <span class="dim">this week</span>${held?` <span class="dim ch-held">&middot; held ${S.pos[k]} sh${ac?` @ ${ac.toFixed(0)}`:""}</span>`:""}</div></div>
    <button class="ch-ib" id="btnPrev" aria-label="Previous instrument ${esc(S.W.codes[sq])}" onclick="openChart(${sq})">${chev("M6 15l6-6 6 6")}<span>${esc(S.W.codes[sq])}</span></button>
    <button class="ch-ib" id="btnNext" aria-label="Next instrument ${esc(S.W.codes[nx])}" onclick="openChart(${nx})">${chev("M6 9l6 6 6-6")}<span>${esc(S.W.codes[nx])}</span></button></div>`;
  const chips=`<div class="ch-chips">${sigChip(i.si)}${held?`<span class="ch-held dim">Held ${S.pos[k]} sh${ac?` @ ${ac.toFixed(0)}`:""}</span>`:""}</div>`;
  const pf=`<div class="card ch-pf" id="pfCard">${pfSVG(i,{w:cw,h:pfH,cell,tgt})}<div class="ch-ev" id="evLine">${chEvLine(i)}</div></div>`;
  const panes=rsiPane(i,{w:paneW,h:hr,id:"rsiCard"})+macdPane(i,{w:paneW,h:hm,id:"macdCard"})+volPane(i,{w:paneW,h:hv,id:"volCard"});
  const main=`${head}${chips}`+(two?`<div class="ch-cols"><div class="ch-col" style="width:${pw}px">${pf}</div><div class="ch-col" style="width:${paneW}px">${panes}</div></div>`
    :`<div class="ch-col">${pf}${panes}</div>`);
  const bar=`<button class="btn outline" id="btnHome" onclick="go('home')">Home</button><button class="btn primary" id="btnTrade" onclick="openSheet('order')">Trade</button>`;
  return{top,main,bar}};
