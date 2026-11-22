"use strict";
/* Order sheet (S2b). SHEETS.order() -> {html}. Classes od-*. */
SHEETS.order=function(){
  const k=S.sel,px=closeNow(k),eq=equity(),buy=S.side===1,q=S.qty;
  const view=S.views[k],code=S.W.codes[k],held=S.pos[k];
  const cost=q*px,fee=cost*T.feePct/100;
  const after=held+(buy?q:-q),capUse=eq>0?after*px/eq*100:0;
  const capOk=!buy||capUse<=T.capPct+1e-6; // admin default: cap only judged on buys
  const floorEq=T.startCash*(1-T.floorPct/100),floorOk=eq>floorEq;
  let si=null;try{si=stockInfo(k).si||null}catch(e){}
  let patLine="";
  if(si&&si.name){
    let p=null;try{p=evNow().pat[si.name]}catch(e){}
    const nm=si.name.replace(/ (BUY|SELL)$/,"");const lbl=nm.charAt(0)+nm.slice(1).toLowerCase();
    if(p)patLine=`<div class="od-line ${liftCls(p)}" id="patLine">${esc(lbl)}: followed through ${pctTxt(p.ft)} of ${Number(p.seen).toLocaleString("en-US")} seen, lift ${liftTxt(p.lift)} vs base</div>`;
  }
  let tgtTxt="No count yet";
  try{const vc=stockInfo(k).vc,t=view===-1?vc.dn:vc.up;
    if(t)tgtTxt=`${priceOf(t.tgt).toFixed(0)} <span class="dim od-sm">(${t.n} boxes × ${T.reversal} ${view===-1?"below":"above"} ${priceOf(t.base).toFixed(0)})</span>`}catch(e){}
  const seg=(id,on,fn,label)=>`<button id="${id}" class="${on?"on":""}" aria-pressed="${on}" onclick="${fn}">${label}${on?" &#10003;":""}</button>`;
  const vb=(id,v,l)=>seg(id,view===v,`setView(${v})`,l);
  const msg=S.lastMsg&&S.lastMsg.indexOf("Rejected")===0?S.lastMsg:"";
  const row=(l,v)=>`<div class="row"><span class="dim">${l}</span><span>${v}</span></div>`;
  const chk=(id,ok,txt,bad)=>`<div class="row od-chk" id="${id}"><span><span class="${ok?"ok":bad}">${ok?"&#10003;":"&#10007;"}</span> ${txt}</span><span class="${ok?"ok":bad}">${ok?"OK":"OVER"}</span></div>`;
  const html=`<div class="od-wrap"><div class="grab"></div>
  <div class="od-body">
  <div class="od-title"><b>Order · ${esc(code)} · held ${held} sh</b></div>
  <div class="od-fr"><span class="od-k">Side</span><div class="seg">${seg("sideBuy",buy,"S.side=1;S.qty=0;render()","Buy")}${seg("sideSell",!buy,"S.side=-1;S.qty=0;render()","Sell")}</div></div>
  <div class="od-fr"><span class="od-k">View</span><div class="seg">${vb("viewBull",1,"Bullish")}${vb("viewBear",-1,"Bearish")}${vb("viewNeut",0,"Neutral")}</div></div>
  <div class="od-line dim" id="baseLine">Base rate: bullish calls right ${pctTxt(baseFor(1))}, bearish ${pctTxt(baseFor(-1))} (this market)</div>
  ${patLine}${view==null?`<div class="od-line dim" id="noViewLine">No view logged for this order</div>`:""}
  <div class="od-fr"><span class="od-k">Qty</span><div class="od-stp"><button class="btn" id="qtyMinus" aria-label="Decrease" onclick="S.qty=Math.max(0,S.qty-step());render()">&minus;</button><span class="od-qty num" id="qtyVal">${q}</span><button class="btn" id="qtyPlus" aria-label="Increase" onclick="S.qty=Math.min(maxQty(),S.qty+step());render()">+</button></div></div>
  <div class="od-fr"><span class="od-k"></span><div class="od-chips"><button id="qty25" onclick="od_pct(.25)">25%</button><button id="qty50" onclick="od_pct(.5)">50%</button><button id="qtyMax" onclick="od_pct(1)">Max</button></div></div>
  <div class="od-est num">
   ${row("Est. price (week close)",px.toFixed(2))}
   ${row(buy?"Est. cost":"Est. proceeds",fmt(cost))}
   ${row("Fee "+T.feePct+"%",fmt(fee))}
   ${row("Position after",after+" sh = "+fmt(after*px))}
   ${chk("capCheck",capOk,`Cap ${capUse.toFixed(1)}% of ${T.capPct}%`,"warn")}
   ${chk("floorCheck",floorOk,`Floor: equity ${fmt(eq)}, floor ${fmt(floorEq)}`,"bad")}
   ${row("Target",tgtTxt)}
  </div>
  </div>
  <div class="bar od-bar"><div class="od-msg warn" id="orderMsg">${esc(msg)}</div><button class="btn outline" id="btnCancel" onclick="closeSheet()">Cancel</button><button class="btn primary" id="btnPlace" onclick="place()">Place order</button></div></div>`;
  return{html}};
function od_pct(f){const m=maxQty();S.qty=m>0?Math.max(1,Math.floor(m*f)):0;render()}
