"use strict";
// Journal tab (lifetime call record). Owner S4b.
let _jnTimer=null,_jnArmed=false;

function jnRows(list){
  // list: [[label, statsObj, bold?]]
  const body=list.map(([lab,s,b])=>{
    s=s||{closed:0,right:0,exp:0,edge:0};
    const e=s.closed?sg2(s.edge,1):"-";
    const L=b?"<b>"+esc(lab)+"</b>":esc(lab);
    return `<tr><td>${L}</td><td class="num">${s.closed}</td><td class="num">${s.closed?s.right:"-"}</td><td class="num">${s.closed?s.exp.toFixed(1):"-"}</td><td class="num">${e}</td></tr>`;
  }).join("");
  return body;
}
function jnTable(first,list){
  return `<table class="jn-t"><thead><tr><th>${esc(first)}</th><th>Closed</th><th>Right</th><th>Exp</th><th>Edge</th></tr></thead><tbody>${jnRows(list)}</tbody></table>`;
}
function jnSg(x){ // signed one decimal with real minus
  const v=Math.round(x*10)/10;
  return (v>0?"+":v<0?"−":"")+Math.abs(v).toFixed(1);
}

function journalTabHTML(){
  let J=null;
  try{J=journalStats();}catch(e){J=null;}
  if(!J||!J.n){
    return `<div class="card jn-card"><h2 class="jn-h">Lifetime call record</h2>
      <p class="jn-note">No closed calls yet. Set Bullish or Bearish on a stock, then advance weeks. Each call that resolves is saved here and compared with the base rate.</p></div>`+
      jnNote()+jnReset();
  }
  const A=J.all, wide=(typeof window!=="undefined"&&window.innerWidth>=600);
  const w=Math.max(240,Math.min((typeof window!=="undefined"?window.innerWidth:344)-48,520));
  const h=Math.min(150,Math.round(w*0.4));
  let chart="",vtxt;
  if(A.band){
    chart=intervalChart(A.edge,A.band[0],A.band[1],A.verdict,{w,h});
    vtxt=`<span class="jn-verdict">${esc(A.verdict)}</span><span class="dim jn-bandtxt">Band ${jnSg(A.band[0])} to ${jnSg(A.band[1])} calls${A.verdict==="at base"?" includes 0 (base)":""}.</span>`;
  }else{
    const need=Math.max(0,30-J.n);
    vtxt=`<span class="jn-verdict">too few to tell (n=${J.n})</span><span class="dim jn-bandtxt">${need} more closed call${need===1?"":"s"} needed to reach 30 before a band is shown.</span>`;
  }
  const head=`<div class="card jn-card"><h2 class="jn-h">Lifetime call record</h2>
    <div class="jn-hl">${A.right} right of ${A.closed} closed<small>expected from base ${A.exp.toFixed(1)} &middot; edge ${jnSg(A.edge)}</small></div>
    ${chart?`<div class="jn-chart">${chart}</div>`:""}
    <div class="jn-vrow">${vtxt}</div></div>`;
  const dir=`<div class="card jn-card"><h2 class="jn-h">By direction</h2>${jnTable("Call",[["▲ Bullish",J.bull],["▼ Bearish",J.bear],["All calls",A,1]])}</div>`;
  const names=Object.keys(J.byPat||{}).sort((a,b)=>J.byPat[b].closed-J.byPat[a].closed);
  const pat=`<div class="card jn-card"><h2 class="jn-h">By pattern called on</h2>${jnTable("Pattern",names.map(n=>[sigLabel(n==="No signal"?null:n),J.byPat[n]]).concat([["All",A,1]]))}</div>`;
  const fr=`<div class="card jn-card"><h2 class="jn-h">Fresh vs stale signal</h2>${jnTable("Signal",[["Fresh (age 0-1)",J.fresh.fresh],["Stale (2+ cols)",J.fresh.stale]])}
    <p class="jn-sub">Calls made with a chart signal showing.</p></div>`;
  const sp=`<div class="card jn-card"><h2 class="jn-h">With vs against signal</h2>${jnTable("Call",[["With signal",J.split.with],["Against signal",J.split.against],["No signal",J.split.none]])}</div>`;
  return `<div class="jn-grid">${head}${dir}${pat}${fr}${sp}${jnNote()}</div>`+jnReset();
}
function jnNote(){
  let y="most";try{y=pctTxt(baseFor(1));}catch(e){} // integrator: computed, never hard-coded
  return `<div class="card jn-card"><h2 class="jn-h">How to read this</h2><p class="jn-note">These stocks mostly rose. A bullish call is right about ${y} of the time with no chart at all. Your record is compared with that.</p></div>`;
}
function jnReset(){
  return `<div class="jn-reset"><button class="btn sm outline" id="btnResetJournal" onclick="jnResetTap()">Reset journal</button></div>`;
}
function jnResetTap(){
  const b=document.getElementById("btnResetJournal");
  if(!_jnArmed){
    _jnArmed=true;
    if(b)b.textContent="Tap again to reset";
    clearTimeout(_jnTimer);
    _jnTimer=setTimeout(()=>{_jnArmed=false;const c=document.getElementById("btnResetJournal");if(c)c.textContent="Reset journal";},3000);
    return;
  }
  clearTimeout(_jnTimer);_jnArmed=false;
  journalReset();
  render();
}
