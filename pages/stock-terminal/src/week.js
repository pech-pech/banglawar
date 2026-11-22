"use strict";
/* week.js [S3]: week-close sheet */
SHEETS.week=function(){
  const R=S.report;if(!R)return{html:""};
  const code=k=>S.W.codes[k];
  const r=pct(R.eq,R.eq0),br=pct(R.bn,R.b0),cum=pct(R.eq,T.startCash),ex=cum-pct(R.bn,T.startCash);
  const prog=Math.max(0,Math.min(1,ex/T.mandate));
  const end=periodEnded();
  const floorRow=S.failed?`<div class="wk-flag bad" role="alert"><b>Floor breached, period ends</b><span class="num">${sg(cum)}% from start</span></div>`
    :cum<=-T.warnPct?`<div class="wk-flag warn"><b>Floor warning</b><span class="num">${sg(cum)}% from start, floor -${T.floorPct}%</span></div>`:"";
  const sigLbl=n=>typeof sigLabel==="function"?sigLabel(n):n;
  const moves=R.rows.map(x=>{
    const up=x.chg>0.005,dn=x.chg<-0.005,cls=up?"up":dn?"down":"dim",arrow=up?"▲":dn?"▼":"■";
    const bx=x.newBoxes?`<span class="wk-bx ${x.dir===1?"x":"o"} num">${x.dir===1?"+":"-"}${x.newBoxes} ${x.dir===1?"X":"O"}</span>`:`<span class="wk-bx dim num">0 boxes</span>`;
    const sig=x.fired?`<span class="wk-sig chip fresh ${/BUY/.test(x.fired)?"buy":"sell"}">${esc(sigLbl(x.fired))}</span>`:`<span class="wk-sig dim">no signal</span>`;
    return `<div class="wk-mv"><div class="wk-l1"><span class="wk-code">${code(x.k)}</span><span class="num">${fmt(closeNow(x.k))}</span></div>
<div class="wk-r1"><span class="num ${cls}">${arrow} ${sg(x.chg)}%</span></div>
<div class="wk-l2">${bx}<span class="num">RSI ${Math.round(x.r0)} › ${Math.round(x.r1)}</span><span class="num">MACD h ${sg2(x.h0)} › ${sg2(x.h1)}</span>${sig}</div></div>`}).join("");
  const sigTxt=c=>c.withSig===true?"with signal":c.withSig===false?"against signal":"no signal";
  const res=[];
  (R.resolved||[]).forEach(c=>{
    const ok=c.res==="right";
    res.push(`<div class="wk-res"><b>${code(c.k)}</b><span>${c.view===1||c.dir===1?"Bullish":"Bearish"} ${ok?"right":"wrong"} <span class="dim">· base ${typeof c.base==="number"?Math.round(c.base*100)+"%":"n/a"} · ${sigTxt(c)}</span></span><span class="wk-tag ${ok?"ok":"wrong"}">${ok?"✓ Right":"✕ Wrong"}</span></div>`)});
  (R.neutrals||[]).forEach(n=>res.push(`<div class="wk-res"><b>${n.s||code(n.k)}</b><span>Neutral</span><span class="wk-tag dim">Not scored</span></div>`));
  (R.open||[]).forEach(c=>{
    let t="";try{const vc=vcount(stockInfo(c.k).cols),g=(c.view||c.dir)===-1?vc.dn:vc.up;if(g)t=` · target ${priceOf(g.tgt).toFixed(0)}`}catch(e){}
    res.push(`<div class="wk-res"><b>${code(c.k)}</b><span>${(c.view||c.dir)===1?"Bullish":"Bearish"} open<span class="dim">${t}</span></span><span class="wk-tag up">Open</span></div>`)});
  let ps="";
  try{const p=periodStats();
    ps=`${p.closed} closed, ${p.right} right, expected ${p.exp.toFixed(1)}, edge ${sg(p.edge)}, <span class="dim">${p.verdict}</span>`}catch(e){ps='<span class="dim">no closed calls yet</span>'}
  const html=`<div class="grab"></div>
<div class="wk-body">
<div class="wk-head"><h1 id="wkTitle">Week ${R.wk} close</h1></div>
<div class="card wk-eq">
  <div class="wk-eqrow"><span class="wk-big num">${fmt(R.eq)}</span><span class="dim num">from ${fmt(R.eq0)}</span><span class="wk-d num ${r>=0?"up":"down"}">${r>=0?"▲":"▼"} ${r>=0?"+":"-"}${fmt(Math.abs(R.eq-R.eq0))} · ${sg(r)}%</span></div>
  <div class="wk-kv"><span class="dim">Benchmark</span><b class="num">${sg(br)}%</b></div>
  <div class="wk-kv"><span class="dim">Excess vs mandate</span><b class="num">${sg(ex)} of +${(+T.mandate).toFixed(1)} pts</b></div>
  <div class="wk-track" role="img" aria-label="Excess ${sg(ex)} of ${T.mandate}"><i style="width:${(prog*100).toFixed(0)}%"></i></div>
  ${floorRow}
</div>
<div class="card"><h2 class="wk-h">Moves this week</h2>${moves}</div>
<div class="card"><h2 class="wk-h">Calls resolved</h2>${res.length?res.join(""):'<div class="dim wk-none">No calls resolved or open</div>'}</div>
<div class="card wk-period"><h2 class="wk-h">Period so far</h2><span class="num">${ps}</span></div>
</div>
<div class="bar wk-bar"><button class="btn outline" id="btnCopy" onclick="copyReport()">Copy report</button><button class="btn primary" id="btnContinue" onclick="${end?"closeSheet();go('review')":"closeSheet()"}">${end?"Period review":"Continue"}</button></div>`;
  return{html}};
