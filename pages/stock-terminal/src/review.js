"use strict";
/* Period review screen (S4a). Journal tab body comes from journalTabHTML() (journal.js). */
function rvSg(x,d){d=d==null?1:d;const v=+x.toFixed(d);return(v>0?"+":v<0?"−":"")+Math.abs(v).toFixed(d)}
function rvTabs(){
  const p=S.tab!=="journal";
  return `<nav class="rv-tabs" role="tablist"><button id="tabPeriod" role="tab" aria-selected="${p}" class="${p?"on":""}" onclick="S.tab='period';render()">This period</button><button id="tabJournal" role="tab" aria-selected="${!p}" class="${p?"":"on"}" onclick="S.tab='journal';render()">Journal</button></nav>`}
function rvSplitRow(label,s){
  return `<tr><td>${label}</td><td class="num">${s.closed}</td><td class="num">${s.right}</td><td class="num">${s.exp.toFixed(1)}</td><td class="num">${rvSg(s.edge)}</td></tr>`}
function rvSignals(){
  const ev=evNow(),pat=(ev&&ev.pat)||{},g={},order=[];
  (S.fired||[]).forEach(f=>{if(!g[f.name]){g[f.name]=0;order.push(f.name)}g[f.name]++});
  const body=order.length?`<table><thead><tr><th>Pattern</th><th>Fired</th><th>Seen</th><th>Followed</th><th>Lift</th></tr></thead><tbody>${order.map(n=>{
    const p=pat[n],label=typeof sigLabel==="function"?sigLabel(n):n;
    if(!p)return `<tr><td>${esc(label)}</td><td class="num">${g[n]}</td><td class="num dim">-</td><td class="num dim">-</td><td class="num dim">-</td></tr>`;
    return `<tr><td>${esc(label)}</td><td class="num">${g[n]}</td><td class="num">${(+p.seen).toLocaleString("en-US")}</td><td class="num">${pctTxt(p.ft)}</td><td class="num ${liftCls(p)}">${liftTxt(p.lift)}</td></tr>`}).join("")}</tbody></table>
    <p class="rv-note">Followed = followed through. Lift is measured against the base rate (bullish ${pctTxt(ev.base.bull)}, bearish ${pctTxt(ev.base.bear)}).</p>`
    :`<p class="rv-note">No signals fired this period.</p>`;
  return `<section class="card rv-card"><h2>Signals this period</h2><div class="rv-sub">All instruments, whole history</div>${body}</section>`}
function rvBaseline(){
  const b=S.base,ev=evNow(),bull=ev&&ev.base?pctTxt(ev.base.bull):"-";
  let f1;
  if(!b)f1=`<p class="rv-note">Baseline: pending, computing…</p>`;
  else{const best=Math.max(b.cash,b.rand,b.lock);
    f1=`<p class="rv-note">No-read strategies meet the mandate in <b class="num">${best}%</b> of windows.</p><p class="rv-note rv-fine">Idle cash ${b.cash}%, random buys ${b.rand}%, copy benchmark ${b.lock}% (${b.n} ${b.src==="real"?"real":"stand-in"} windows).</p>`}
  return `<section class="card rv-card"><h2>Baseline</h2>${f1}<p class="rv-note">Bullish base rate <b class="num">${bull}</b>.</p></section>`}
function rvPeriodHTML(){
  const lay=layout(),eq=equity(),r=pct(eq,T.startCash),br=pct(bench(),T.startCash),ex=r-br;
  const met=!S.failed&&ex>=T.mandate,dd=Math.min(0,pct(S.minEq,T.startCash));
  const floorEq=T.startCash*(1-T.floorPct/100);
  const fees=S.fees||0,feePts=fees/T.startCash*100,exPre=ex+feePts;
  const st=periodStats(),sp=splitStats(S.calls,journalLoad().length),nn=noCallCount();
  const verdict=st.verdict||"too few to tell";
  const band=st.band?`, band ${rvSg(st.band[0])} to ${rvSg(st.band[1])} calls`:"";
  const res=S.failed?`<span class="v num rv-bad">✖ floor breached</span>`:met?`<span class="v num ok">✓ met</span>`:`<span class="v num warn">not met</span>`;
  const w=lay==="cover"?320:lay==="tall"?560:400,h=lay==="cover"?190:lay==="tall"?240:230;
  const perf=`<section class="card rv-card"><h2>Performance</h2>
    <div class="row"><span class="l dim">Return</span><span class="v num">${rvSg(r)}%</span></div>
    <div class="row"><span class="l dim">Benchmark</span><span class="v num">${rvSg(br)}%</span></div>
    <div class="row"><span class="l dim">Excess vs benchmark</span><span class="v num">${rvSg(ex)} pts</span></div>
    <div class="row"><span class="l dim">Mandate +${(+T.mandate).toFixed(1)} pts</span>${res}</div>
    <div class="row"><span class="l dim">Max drawdown</span><span class="v num${S.failed?" rv-bad":""}">${rvSg(dd)}%</span></div>
    <div class="row"><span class="l dim">Orders</span><span class="v num">${S.orders.length}</span></div>
    <div class="row"><span class="l dim">End equity</span><span class="v num">${fmt(eq)}</span></div></section>`;
  const chart=`<section class="card rv-card"><h2>Equity vs benchmark, % since start</h2><div class="rv-chart">${eqChart(S.eqHist,S.benchHist,floorEq,{w,h})}</div>
    <div class="rv-fee"><span class="cap">Fee drag</span><div class="num rv-feeL">Fees ${fmt(fees)} = ${feePts.toFixed(1)} pts of start equity</div><div class="num rv-feeL">Excess before fees ${rvSg(exPre)} pts</div></div></section>`;
  const rec=`<section class="card rv-card"><h2>Call record vs base</h2>
    <div class="rv-hl">${st.right} right of ${st.closed} closed</div>
    <div class="rv-sub">Expected from base rate alone: ${st.exp.toFixed(1)}. Edge ${rvSg(st.edge)} calls (n=${st.closed}, ${verdict}${band})</div>
    <table><thead><tr><th>Calls</th><th>Closed</th><th>Right</th><th>Exp</th><th>Edge</th></tr></thead><tbody>${rvSplitRow("With signal",sp.with)}${rvSplitRow("Against signal",sp.against)}${rvSplitRow("No signal",sp.none)}</tbody></table>
    <div class="row"><span class="l dim">Neutral views (not scored)</span><span class="v num">${S.neutrals.length}</span></div>
    <div class="row"><span class="l dim">Orders without a call</span><span class="v num">${nn}</span></div></section>`;
  return `<div class="rv-grid">${perf}${chart}${rec}${rvSignals()}${rvBaseline()}</div>`}
SCREENS.review=function(){
  const ended=periodEnded(),jn=S.tab==="journal";
  const top=topBar("Period review","Weeks 1 to "+S.week+(ended?" · end of period":" · so far"),devBadge());
  const main=rvTabs()+(jn?`<div class="rv-pane">${journalTabHTML()}</div>`:`<div class="rv-pane">${rvPeriodHTML()}</div>`);
  const bar=ended
    ?`<button class="btn outline" id="btnRerun" onclick="newPeriod(S.seed)"><span class="rv-l">Rerun window</span><span class="rv-s">Rerun</span></button><button class="btn outline" id="btnCopy" onclick="copyReport()">Copy report</button><button class="btn primary" id="btnNextPeriod" onclick="newPeriod((Math.random()*90000|0)+10000)">Next period</button>`
    :`<button class="btn primary" id="btnHome" onclick="go('home')">Home</button><button class="btn outline" id="btnCopy" onclick="copyReport()">Copy report</button>`;
  return{top,main,bar}};
