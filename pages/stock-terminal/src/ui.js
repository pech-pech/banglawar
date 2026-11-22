"use strict";
/* ---------- render helpers ---------- */
const fmt=x=>Math.round(x).toLocaleString("en-US");
const sg=x=>(x>=0?"+":"")+x.toFixed(1);
const sg2=x=>(x>=0?"+":"")+x.toFixed(2);
const $=id=>document.getElementById(id);
function pathOf(a,w,h,lo,hi){const d=hi-lo||1;return a.map((v,i)=>(i?"L":"M")+(i*w/(a.length-1||1)).toFixed(1)+" "+(h-(v-lo)/d*h+2).toFixed(1)).join(" ")}
function trapOf(i){ // admin default: trap = latest signal column is flagged by pnfTraps
  if(typeof pnfTraps!=="function"||!i.sig)return null;
  try{const t=pnfTraps(i.cols).find(x=>x.col===i.sig.col);return t?t.kind:null}catch(e){return null}}
function trapChip(i,short){const t=trapOf(i);return t?` <span class="sig trap">${short?"TRAP":t==="bull"?"BULL TRAP":"BEAR TRAP"}</span>`:""}
function chartFit(){ // admin default: 2 chars per P&F column, 6 char axis; line 18px
  const W=Math.min(window.innerWidth,1000),two=window.innerWidth>=640;
  const sp=document.createElement("span");sp.style.cssText="position:absolute;visibility:hidden;white-space:pre;font:inherit";sp.textContent="XXXXXXXXXXXXXXXXXXXX";
  const host=document.querySelector("main pre")||document.body;host.appendChild(sp);
  const cw=sp.getBoundingClientRect().width/20||8.4;host.removeChild(sp);
  const panelW=(two?W*5/9:W)-16-16-2-8;
  const cols=Math.max(6,Math.min(40,Math.floor((panelW-6*cw)/(2*cw))));
  const sb=$("status").offsetHeight||46,bb=$("bar").offsetHeight||72;
  const avail=window.innerHeight-sb-bb-64-(two?60:0)-(two?0:140);
  const rows=Math.max(9,Math.min(two?31:22,Math.floor(avail/18)-2));
  return{cols,rows}}
function statusBar(){
  const eq=equity(),bn=bench(),r=pct(eq,T.startCash),br=pct(bn,T.startCash),ex=r-br,dd=r<=-T.warnPct;
  $("status").innerHTML=`<div class="s1"><span><span class="b">WK ${S.week}/${T.weeks}</span>&nbsp; EQ <span class="num">${fmt(eq)}</span> <span class="${r>=0?"acc":"bad"}">${sg(r)}%</span>${dd?' <span class="warn b">FLOOR WARN</span>':""}</span><span class="dev" onclick="openTweaks()">${tweaked()?"DEV* ":"DEV "}${S.seed}</span></div>
  <div class="s2"><span><span class="dim">BENCH</span> ${sg(br)}%</span><span><span class="dim">EXCESS</span> <span class="${ex>=T.mandate?"acc":""} b">${sg(ex)}</span></span><span><span class="dim">mandate</span> +${(+T.mandate).toFixed(1)}</span></div>`}
function panes(i){
  const N=26,r=i.r.slice(-N),mh=i.m.h.slice(-N),mm=i.m.m.slice(-N),ms=i.m.sg.slice(-N),v=i.vol.slice(-N);
  const mx=Math.max(...mm.map(Math.abs),...ms.map(Math.abs),...mh.map(Math.abs))||1,z=32;
  const bars=mh.map((x,j)=>{const hgt=Math.abs(x)/mx*28;return`<rect x="${(j*10+1.8).toFixed(1)}" y="${(x>=0?z-hgt:z).toFixed(1)}" width="6.4" height="${hgt.toFixed(1)}" fill="${x>=0?"var(--accent)":"var(--dim)"}"/>`}).join("");
  const line=(a,col)=>`<path fill="none" stroke="${col}" stroke-width="1.6" vector-effect="non-scaling-stroke" d="${a.map((x,j)=>(j?"L":"M")+(j*10+5)+" "+(z-x/mx*28).toFixed(1)).join(" ")}"/>`;
  const vm=Math.max(...v);const vb=v.map((x,j)=>`<rect x="${j*10+1.8}" y="${(20-x/vm*20).toFixed(1)}" width="6.4" height="${(x/vm*20).toFixed(1)}" fill="${j===N-1?"var(--text)":"var(--dim)"}"/>`).join("");
  const dash=y=>`<line x1="0" y1="${y}" x2="260" y2="${y}" stroke="var(--dim)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>`;
  return `<div class="panel pane"><div class="l">RSI<b>14</b></div><div class="cv"><svg viewBox="0 0 260 64" preserveAspectRatio="none">${dash(19.2)}${dash(44.8)}<path fill="none" stroke="var(--text)" stroke-width="1.6" vector-effect="non-scaling-stroke" d="${r.map((x,j)=>(j?"L":"M")+(j*10+5)+" "+(64-x/100*64).toFixed(1)).join(" ")}"/></svg></div><div class="v b">${Math.round(r[r.length-1])}</div></div>
  <div class="panel pane"><div class="l">MACD<b>12,26,9</b></div><div class="cv"><svg viewBox="0 0 260 64" preserveAspectRatio="none"><line x1="0" y1="${z}" x2="260" y2="${z}" stroke="var(--dim)" vector-effect="non-scaling-stroke"/>${bars}${line(ms,"var(--o)")}${line(mm,"var(--x)")}</svg></div><div class="v" style="line-height:16px"><div><i class="x">M</i>${sg2(mm[N-1])}</div><div><i class="o">S</i>${sg2(ms[N-1])}</div><div><i class="acc">H</i>${sg2(mh[N-1])}</div></div></div>
  <div class="panel pane vp"><div class="l">Vol</div><div class="cv"><svg viewBox="0 0 260 20" preserveAspectRatio="none">${vb}</svg></div><div class="v">${i.vRatio.toFixed(1)}x</div></div>`}

/* ---------- screens ---------- */
function render(){
  statusBar();const m=$("main"),bar=$("bar");
  if(S.screen==="watch"){
    m.innerHTML=`<div class="panel"><div class="hd">Watchlist · masked · ${S.W.src==="real"?"real weekly history":"stand-in data"}</div><table><tr><th>Sym</th><th>Last</th><th>Wk%</th><th>P&amp;F</th><th>RSI</th><th>MACD h</th><th>Pos</th></tr>
    ${[0,1,2,3,4,5].map(k=>{const i=stockInfo(k),c=i.c,last=i.cols[i.cols.length-1],chg=pct(c[c.length-1],c[c.length-2]),h=i.m.h[i.m.h.length-1];
      return`<tr class="rowlink" onclick="openChart(${k})"><td class="b">${S.W.codes[k]}</td><td>${c[c.length-1].toFixed(2)}</td><td class="${chg>=0?"acc":"bad"}">${sg(chg)}</td><td><span class="${last.d===1?"x":"o"}">${last.d===1?"X":"O"}</span> ${i.sig?`<span class="sig ${i.sig.buy?"":"s"}">${i.sig.buy?"BUY":"SELL"}</span>`:""}${trapChip(i,1)}</td><td>${Math.round(i.r[i.r.length-1])}</td><td class="${h>=0?"acc":"dim"}">${sg2(h)}</td><td>${S.pos[k]||"-"}</td></tr>`}).join("")}</table></div>
    <div class="panel"><div class="tbl"><div><span class="dim">Cash</span><span class="vv">${fmt(S.cash)}</span></div><div><span class="dim">Fees paid</span><span class="vv">${fmt(S.fees)}</span></div><div><span class="dim">Floor</span><span class="vv">${fmt(T.startCash*(1-T.floorPct/100))} (warn ${fmt(T.startCash*(1-T.warnPct/100))})</span></div></div></div>
    <div class="msg dim">Tap a row to open chart. Orders fill at week close. Build ${BUILD}.</div>`;
    bar.innerHTML=`<div class="btn" onclick="openTweaks()">SETTINGS</div><div class="btn" onclick="copyReport()">COPY</div><div class="btn go" onclick="advance()">ADVANCE</div>`}
  else if(S.screen==="chart"){
    const k=S.sel,i=stockInfo(k),px=closeNow(k),eq=equity(),vc=i.vc,last=i.cols[i.cols.length-1];
    const view=S.views[k],tgt=view===-1?vc.dn:vc.up;
    const cost=S.qty*px,fee=cost*T.feePct/100,after=S.pos[k]+(S.side===1?S.qty:-S.qty),capUse=after*px/eq*100;
    m.innerHTML=`<div class="main2"><div>
    <div class="tick"><div class="btn" onclick="openChart(${(k+5)%6})">&lt;</div><span class="tc"><span class="b">${S.W.codes[k]} ${px.toFixed(2)}</span> <span class="${last.d===1?"x":"o"} b">${last.d===1?"X":"O"}-col</span>${i.sig?` <span class="sig ${i.sig.buy?"":"s"}">${i.sig.name}</span>`:""}${trapChip(i)}</span><div class="btn" onclick="openChart(${(k+1)%6})">&gt;</div></div>
    <div class="panel"><pre id="pf">${pfText(i,chartFit())}</pre><div class="ind1"><span>${i.rsUp?'<span class="acc">&#9650;</span> RS up':'<span class="bad">&#9660;</span> RS down'}</span><span>Bull% <b>${i.bull}</b></span><span>${px>=i.ma[i.ma.length-1]?'<span class="acc">&#9650;</span> &gt;':'<span class="bad">&#9660;</span> &lt;'}10wk MA <b>${i.ma[i.ma.length-1].toFixed(1)}</b></span><span>box ${T.boxPct}% · ${T.reversal}-box rev</span></div></div>
    ${panes(i)}</div><div>
    <div class="panel"><div class="oh"><span class="hd">Order ticket</span><span class="b">${S.W.codes[k]} <span class="dim">held ${S.pos[k]} sh</span></span></div>
    <div class="fr"><span class="k dim">Side</span><div class="seg"><div class="btn ${S.side===1?"sel":""}" onclick="S.side=1;S.qty=0;render()">${S.side===1?"&#10003; ":""}BUY</div><div class="btn ${S.side===-1?"sel":""}" onclick="S.side=-1;S.qty=0;render()">${S.side===-1?"&#10003; ":""}SELL</div></div></div>
    <div class="fr"><span class="k dim">View</span><div class="seg">${[[1,"Bullish"],[-1,"Bearish"],[0,"Neutral"]].map(([v,l])=>`<div class="btn ${view===v?"sel":""}" onclick="setView(${v})">${view===v?"&#10003; ":""}${l}</div>`).join("")}</div></div>
    <div class="fr"><span class="k dim">Qty</span><div class="btn" onclick="S.qty=Math.max(0,S.qty-step());render()">&minus;</div><span class="qty">${S.qty}</span><div class="btn" onclick="S.qty+=step();render()">+</div><div class="btn" onclick="S.qty=maxQty();render()">MAX</div></div>
    <div class="tbl">
    <div><span>Est. price (week close)</span><span class="vv">${px.toFixed(2)}</span></div>
    <div><span>Est. ${S.side===1?"cost":"proceeds"}</span><span class="vv">${fmt(cost)}</span></div>
    <div><span>Fee ${T.feePct}%</span><span class="vv">${fmt(fee)}</span></div>
    <div><span>Position after</span><span class="vv">${after} sh = ${fmt(after*px)}</span></div>
    <div><span>Limit check</span><span class="vv ${capUse>T.capPct?"bad":""}">${capUse.toFixed(1)}% of ${T.capPct}% cap ${capUse>T.capPct?"OVER":"OK"}</span></div>
    <div><span>Risk check</span><span class="vv">eq ${fmt(eq)} / floor ${fmt(T.startCash*(1-T.floorPct/100))}</span></div></div>
    <div class="dim" style="margin-top:4px">${tgt?`Target ${priceOf(tgt.tgt).toFixed(1)} (vertical count: ${tgt.n} boxes x ${T.reversal} ${view===-1?"below":"above"} ${priceOf(tgt.base).toFixed(1)})`:"Target: no count yet"}</div>
    </div><div class="msg ${S.lastMsg.startsWith("Rej")?"bad":"acc"}">${S.lastMsg}</div></div></div>`;
    bar.innerHTML=`<div class="btn" onclick="S.screen='watch';S.lastMsg='';render()">WATCHLIST</div><div class="btn go" onclick="place()">PLACE</div><div class="btn" onclick="advance()">ADVANCE</div>`}
  else if(S.screen==="report"){
    const R=S.report,r=pct(R.eq,R.eq0),br=pct(R.bn,R.b0);
    m.innerHTML=`<div class="panel"><div class="hd">Week ${R.wk} close statement</div><div class="tbl">
    <div><span>Equity</span><span class="vv">${fmt(R.eq0)} &gt; ${fmt(R.eq)} (${sg(r)}%)</span></div><div><span>Benchmark wk</span><span class="vv">${sg(br)}%</span></div>
    ${S.failed?`<div><span class="bad b">Floor breached</span><span class="vv bad">period ends, mandate failed</span></div>`:pct(R.eq,T.startCash)<=-T.warnPct?`<div><span class="warn">Floor warning</span><span class="vv warn">${sg(pct(R.eq,T.startCash))}% from start</span></div>`:""}</div></div>
    <div class="panel"><div class="hd">Tape</div><table><tr><th>Sym</th><th>Wk%</th><th>Boxes</th><th>RSI</th><th>MACD h</th></tr>
    ${R.rows.map(x=>`<tr><td class="b">${S.W.codes[x.k]}</td><td class="${x.chg>=0?"acc":"bad"}">${sg(x.chg)}</td><td>${x.newBoxes?`+${x.newBoxes} <span class="${x.dir===1?"x":"o"}">${x.dir===1?"X":"O"}</span>`:"-"}</td><td>${Math.round(x.r0)}&gt;${Math.round(x.r1)}</td><td>${sg2(x.h0)}&gt;${sg2(x.h1)}</td></tr>${x.fired?`<tr><td></td><td colspan="4" style="text-align:left"><span class="sig ${x.fired.includes("BUY")?"":"s"}">${x.fired}</span> fired</td></tr>`:""}`).join("")}</table></div>
    <div class="panel"><div class="hd">Calls resolved this week</div>${R.resolved.length?R.resolved.map(c=>`<div>${S.W.codes[c.k]} ${c.dir===1?"Bullish":"Bearish"} (wk ${c.wk}, ${c.pat}) <span class="${c.res==="right"?"acc":"bad"} b">${c.res}</span></div>`).join(""):'<div class="dim">none</div>'}<div class="dim" style="margin-top:4px">Call right = ${T.reversal} boxes the called way before ${T.reversal} against.</div></div>`;
    const end=S.failed||S.week>=T.weeks;
    bar.innerHTML=end?`<div class="btn go" onclick="S.screen='review';render();window.scrollTo(0,0)">PERIOD REVIEW</div>`:`<div class="btn" onclick="S.screen='watch';render()">WATCHLIST</div><div class="btn go" onclick="openChart(S.sel)">CHARTS</div>`}
  else if(S.screen==="review"){
    if(!S.base)S.base=baseline();
    const eq=equity(),r=pct(eq,T.startCash),br=pct(bench(),T.startCash),ex=r-br,met=!S.failed&&ex>=T.mandate;
    const cl=S.calls,right=cl.filter(c=>c.res==="right").length,wrong=cl.filter(c=>c.res==="wrong").length,open=cl.length-right-wrong,n=right+wrong;
    const by=key=>{const g={};cl.filter(c=>c.res).forEach(c=>{const kk=key(c);g[kk]=g[kk]||[0,0];g[kk][1]++;if(c.res==="right")g[kk][0]++});return g};
    const tbl=g=>Object.entries(g).map(([kk,[a,b]])=>`<div><span>${kk}</span><span class="vv">${a} of ${b}</span></div>`).join("")||'<div class="dim">none resolved</div>';
    const eh=S.eqHist,bh=S.benchHist,lo=Math.min(...eh,...bh),hi=Math.max(...eh,...bh);
    m.innerHTML=`<div class="panel"><div class="hd">Period review · ${S.week} weeks</div><div class="tbl">
    <div><span>Return</span><span class="vv">${sg(r)}%</span></div><div><span>Benchmark (equal-weight watchlist)</span><span class="vv">${sg(br)}%</span></div>
    <div><span>Excess</span><span class="vv b">${sg(ex)} pts (mandate +${(+T.mandate).toFixed(1)})</span></div>
    <div><span>Result</span><span class="vv ${met?"acc":"bad"}">${S.failed?"Floor breached, mandate failed":met?"Mandate met":"Mandate not met"}</span></div>
    <div><span>Max drawdown</span><span class="vv">${(()=>{const d=Math.min(0,pct(S.minEq,T.startCash));return d<0?sg(d):"0.0"})()}%</span></div><div><span>Orders / fees</span><span class="vv">${S.orders.length} / ${fmt(S.fees)}</span></div></div>
    <svg viewBox="0 0 260 60" preserveAspectRatio="none" style="width:100%;height:60px;margin-top:6px"><path fill="none" stroke="var(--dim)" stroke-width="1.6" stroke-dasharray="5 4" vector-effect="non-scaling-stroke" d="${pathOf(bh,260,56,lo,hi)}"/><path fill="none" stroke="var(--accent)" stroke-width="1.8" vector-effect="non-scaling-stroke" d="${pathOf(eh,260,56,lo,hi)}"/></svg>
    <div class="leg"><span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--accent)" stroke-width="2.4"/></svg> equity, solid</span><span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--dim)" stroke-width="2" stroke-dasharray="5 4"/></svg> benchmark, dashed</span></div></div>
    <div class="panel"><div class="hd">Call record</div><div>${right} right / ${wrong} wrong / ${open} open · hit rate ${n?Math.round(100*right/n)+"%":"-"} (n=${n}${n<20?", small sample":""})</div>
    <div class="hd" style="margin-top:6px">By pattern</div><div class="tbl">${tbl(by(c=>c.pat))}</div>
    <div class="hd" style="margin-top:6px">By indicator</div><div class="tbl">${tbl(by(c=>(c.rsi>60?"RSI >60":c.rsi<40?"RSI <40":"RSI 40-60")))}${tbl(by(c=>c.mh))}</div></div>
    <div class="panel"><div class="hd">Baseline</div>${typeof baselineHTML==="function"?baselineHTML(S.base):`<div>No-read strategies meet the mandate: idle cash ${S.base.cash}%, random buys ${S.base.rand}% of ${S.base.n} stand-in windows.</div>`}</div>`;
    bar.innerHTML=`<div class="btn" onclick="newPeriod(S.seed)">RERUN</div><div class="btn" onclick="copyReport()">COPY</div><div class="btn go" onclick="newPeriod((Math.random()*90000|0)+10000)">NEXT</div>`}
}
