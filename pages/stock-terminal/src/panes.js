"use strict";
/* panes.js [C2]: indicator panes + small charts. Pure functions returning HTML strings.
   opt.w = SVG width in px (card inner width); opt.h = SVG height in px; opt.id = card id.
   Card height at defaults (344 wide): RSI 100 px, MACD 100 px, volume 86 px. */
const PN_AX=36;               // right axis column width, px
const PN_N=26;                // weeks shown
function pnEsc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function pnF(x){return (Math.round(x*10)/10).toString()}
function pnS(x,d){const v=+x.toFixed(d);return(v>0?"+":"")+v.toFixed(d)}
function pnCom(x){return Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g,",")}
function pnNice(x){if(!(x>0))return 1;const e=Math.pow(10,Math.floor(Math.log10(x))),f=x/e;
  return(f<=1?1:f<=1.5?1.5:f<=2?2:f<=3?3:f<=4?4:f<=5?5:f<=6?6:f<=8?8:10)*e}
function pnDec(step){return step>=10?0:step>=1?1:step>=0.1?2:3}
function pnLast(a,n){a=Array.isArray(a)?a.filter(v=>typeof v==="number"&&isFinite(v)):[];return a.slice(-n)}
function pnPts(a,x,y,off){return a.map((v,j)=>x(j+off).toFixed(1)+","+y(v).toFixed(1)).join(" ")}
function pnPill(pw,W,y,H,txt,fill,ink){
  const h=15,yy=Math.max(h/2,Math.min(H-h/2,y));
  return`<rect x="${pw+3}" y="${(yy-h/2).toFixed(1)}" width="${W-pw-3}" height="${h}" rx="7.5" fill="${fill}"/>`
   +`<text x="${(pw+3+(W-pw-3)/2).toFixed(1)}" y="${yy.toFixed(1)}" text-anchor="middle" dominant-baseline="central" style="fill:${ink};font-weight:700">${pnEsc(txt)}</text>`}
function pnLab(pw,y,t){return`<text x="${pw+6}" y="${y.toFixed(1)}" dominant-baseline="central">${pnEsc(t)}</text>`}
function pnCard(id,head,val,svg,mid,W){
  return`<div class="card pn-card" id="${pnEsc(id)}"><div class="pn-h"><span class="pn-t">${head}</span><span class="pn-v num">${val}</span></div>`
   +`<svg class="pn-svg" width="${W}" height="${svg.h}" viewBox="0 0 ${W} ${svg.h}" role="img" aria-label="${pnEsc(svg.aria)}">${svg.body}</svg>`
   +`<div class="pn-ax num" style="padding-right:${PN_AX}px"><span>${PN_N} wks</span>${mid||""}<span>now</span></div></div>`}

function rsiPane(i,opt){
  opt=opt||{};const W=Math.max(120,Math.round(opt.w||296)),H=Math.round(opt.h||54),pw=W-PN_AX;
  const a=pnLast(i&&i.r,PN_N),off=PN_N-a.length,lo=20,hi=80,pad=6;
  const y=v=>pad+(hi-v)/(hi-lo)*(H-2*pad),x=j=>6+j*(pw-12)/(PN_N-1);
  const lastV=a.length?a[a.length-1]:null,ly=lastV==null?-99:y(lastV);
  let s=`<rect x="0" y="${y(70).toFixed(1)}" width="${pw}" height="${(y(30)-y(70)).toFixed(1)}" fill="var(--surface2)" fill-opacity=".55"/>`;
  [70,50,30].forEach(v=>{s+=`<line x1="0" x2="${pw}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--faint)" stroke-dasharray="${v===50?"1 4":"3 3"}"/>`;
    if(Math.abs(y(v)-ly)>=10)s+=pnLab(pw,y(v),v)});
  if(a.length>1)s+=`<polyline points="${pnPts(a,x,y,off)}" fill="none" stroke="var(--text)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
  if(lastV!=null){s+=`<circle cx="${x(PN_N-1).toFixed(1)}" cy="${ly.toFixed(1)}" r="3" fill="var(--text)"/>`+pnPill(pw,W,ly,H,Math.round(lastV),"var(--text)","var(--bg)")}
  return pnCard(opt.id||"rsiCard",`RSI <i>14</i>`,lastV==null?"-":Math.round(lastV),{h:H,body:s,aria:"RSI 14, last "+(lastV==null?"n/a":Math.round(lastV))},"",W)}

function macdPane(i,opt){
  opt=opt||{};const W=Math.max(120,Math.round(opt.w||296)),H=Math.round(opt.h||54),pw=W-PN_AX;
  const m=(i&&i.m)||{},M=pnLast(m.m,PN_N),G=pnLast(m.sg,PN_N),Hh=pnLast(m.h,PN_N),n=Math.min(M.length,G.length,Hh.length);
  const mm=M.slice(-n),gg=G.slice(-n),hh=Hh.slice(-n),off=PN_N-n,pad=7;
  const mx=pnNice(Math.max(1e-6,...mm.map(Math.abs),...gg.map(Math.abs),...hh.map(Math.abs))*1.05);
  const y=v=>pad+(mx-v)/(2*mx)*(H-2*pad),x=j=>6+j*(pw-12)/(PN_N-1),y0=y(0);
  const lastH=n?hh[n-1]:0,dec=pnDec(mx),bw=Math.max(2,(pw-12)/(PN_N-1)*.55);
  // value pill: never sits on the "0" label; nudge it clear on the side of the value's sign
  let py=y(lastH);if(Math.abs(py-y0)<14)py=y0+(lastH>=0?-14:14);
  py=Math.max(7.5,Math.min(H-7.5,py));
  let s="";
  [mx,-mx].forEach(v=>{s+=`<line x1="0" x2="${pw}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--faint)" stroke-dasharray="1 4"/>`;
    if(Math.abs(y(v)-py)>=12)s+=pnLab(pw,y(v),pnS(v,dec))});
  s+=`<line x1="0" x2="${pw}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}" stroke="var(--faint)"/>`+pnLab(pw,y0,"0");
  hh.forEach((v,j)=>{const a=y0,b=y(v);s+=`<rect x="${(x(j+off)-bw/2).toFixed(1)}" y="${Math.min(a,b).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,Math.abs(b-a)).toFixed(1)}" fill="${v>=0?"var(--accent)":"var(--faint)"}" fill-opacity="${v>=0?.55:1}"/>`});
  if(n>1){s+=`<polyline points="${pnPts(gg,x,y,off)}" fill="none" stroke="var(--o)" stroke-width="1.6" stroke-dasharray="4 2.5" stroke-linejoin="round"/>`
    +`<polyline points="${pnPts(mm,x,y,off)}" fill="none" stroke="var(--x)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`}
  s+=pnPill(pw,W,py,H,pnS(lastH,2),"var(--surface2)","var(--text)");
  const lg=n?`<span class="pn-lg num"><span class="pn-k pn-kx">MACD ${pnS(mm[n-1],2)}</span><span class="pn-k pn-ko">Signal ${pnS(gg[n-1],2)}</span></span>`:"";
  return pnCard(opt.id||"macdCard",`MACD <i>12,26,9</i>`,n?pnS(lastH,2):"-",{h:H,body:s,aria:"MACD histogram "+pnS(lastH,2)},lg,W)}

function volPane(i,opt){
  opt=opt||{};const W=Math.max(120,Math.round(opt.w||296)),H=Math.round(opt.h||40),pw=W-PN_AX;
  const a=pnLast(i&&i.vol,PN_N),off=PN_N-a.length,r=i&&isFinite(i.vRatio)?i.vRatio:null,top=5;
  const avg=r&&a.length?a[a.length-1]/r:(a.length?a.reduce((p,c)=>p+c,0)/a.length:1);
  const mx=Math.max(avg*1.6,...a,1e-9)*1.03,y=v=>H-v/mx*(H-top),x=j=>6+j*(pw-12)/(PN_N-1),bw=Math.max(2,(pw-12)/(PN_N-1)*.5);
  let s=a.map((v,j)=>`<rect x="${(x(j+off)-bw/2).toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H-y(v)).toFixed(1)}" fill="${j===a.length-1?"var(--text)":"var(--faint)"}"/>`).join("");
  s+=`<line x1="0" x2="${pw}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}" stroke="var(--dim)" stroke-dasharray="2 3"/>`
   +`<text x="4" y="${Math.max(7,y(avg)-7).toFixed(1)}" dominant-baseline="central" class="pn-halo">1x avg</text>`;
  if(r!=null)s+=pnPill(pw,W,y(a[a.length-1]),H,pnF(r)+"x","var(--text)","var(--bg)");
  return pnCard(opt.id||"volCard","Volume",r==null?"-":pnF(r)+"x <span class=\"dim\">avg</span>",{h:H,body:s,aria:"Volume "+(r==null?"n/a":pnF(r)+" times average")},"",W)}

function spark(arr,o){
  o=o||{};const W=o.w||56,H=o.h||18,a=pnLast(arr,PN_N);if(a.length<2)return`<svg class="pn-mini" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"></svg>`;
  const lo=Math.min(...a),hi=Math.max(...a),sp=hi-lo||1,x=j=>2+j*(W-4)/(a.length-1),y=v=>H-2-(v-lo)/sp*(H-4);
  return`<svg class="pn-mini" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pnPts(a,x,y,0)}" fill="none" stroke="var(--dim)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`
   +`<circle cx="${x(a.length-1).toFixed(1)}" cy="${y(a[a.length-1]).toFixed(1)}" r="2" fill="var(--text)"/></svg>`}

function miniBars(arr,o){
  o=o||{};const W=o.w||56,H=o.h||18,a=pnLast(arr,12);if(!a.length)return`<svg class="pn-mini" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"></svg>`;
  const mx=Math.max(1e-9,...a.map(Math.abs)),mid=H/2,slot=W/a.length,bw=Math.max(1.5,slot*.6);
  let s=`<line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="var(--faint)"/>`;
  a.forEach((v,j)=>{const h=Math.max(1,Math.abs(v)/mx*(mid-1));s+=`<rect x="${(j*slot+(slot-bw)/2).toFixed(1)}" y="${(v>=0?mid-h:mid).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${v>=0?"var(--x)":"var(--o)"}"/>`});
  return`<svg class="pn-mini" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${s}</svg>`}

function eqChart(eh,bh,floorEq,o){
  o=o||{};const W=Math.max(200,Math.round(o.w||296)),H=Math.round(o.h||190);
  eh=pnLast(eh,999);bh=pnLast(bh,999);const n=Math.max(eh.length,bh.length,2);
  const L=44,R=50,t=10,b=H-28,pw=W-L-R;
  const all=eh.concat(bh,[floorEq]),vmin=Math.min(...all),vmax=Math.max(...all),span=(vmax-vmin)||1;
  const step=pnNice(span/3.5),lo=Math.floor((vmin-span*.04)/step)*step,hi=Math.ceil((vmax+span*.06)/step)*step;
  const y=v=>b-(v-lo)/(hi-lo)*(b-t),x=j=>L+j*pw/(n-1);
  let s="";
  const kept=[y(floorEq)];
  for(let v=lo;v<=hi+1e-9;v+=step){const yv=y(v);if(kept.some(k=>Math.abs(yv-k)<12))continue;kept.push(yv);
    s+=`<line x1="${L}" x2="${L+pw}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--grid)"/><text x="${L-6}" y="${y(v).toFixed(1)}" text-anchor="end" dominant-baseline="central">${pnCom(v)}</text>`}
  const fy=y(floorEq);
  s+=`<line x1="${L}" x2="${L+pw}" y1="${fy.toFixed(1)}" y2="${fy.toFixed(1)}" stroke="var(--o)" stroke-width="1.4"/>`
   +`<text x="${L-6}" y="${fy.toFixed(1)}" text-anchor="end" dominant-baseline="central" style="fill:var(--o)">${pnCom(floorEq)}</text>`
   +`<text x="${L+4}" y="${(fy-7).toFixed(1)}" style="fill:var(--o)">floor ${pnCom(floorEq)}</text>`;
  const step2=n>8?2:1;for(let j=0;j<n;j+=step2)s+=`<text x="${x(j).toFixed(1)}" y="${H-6}" text-anchor="middle">${j===0?"wk 0":j}</text>`;
  if((n-1)%step2)s+=`<text x="${x(n-1).toFixed(1)}" y="${H-6}" text-anchor="middle">${n-1}</text>`;
  const pl=a=>a.map((v,j)=>(j?"L":"M")+x(j).toFixed(1)+" "+y(v).toFixed(1)).join("");
  if(bh.length>1)s+=`<path d="${pl(bh)}" fill="none" stroke="var(--dim)" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round"/>`;
  if(eh.length>1)s+=`<path d="${pl(eh)}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const s0=eh[0]||bh[0]||1,pc=v=>pnS((v/s0-1)*100,1)+"%";
  let ey=eh.length?y(eh[eh.length-1]):-99,by=bh.length?y(bh[bh.length-1]):-99;
  let ety=ey,bty=by;if(Math.abs(ety-bty)<13){const mid=(ety+bty)/2,d=ety<=bty?-1:1;ety=mid+d*7;bty=mid-d*7}
  if(eh.length)s+=`<circle cx="${x(eh.length-1).toFixed(1)}" cy="${ey.toFixed(1)}" r="3.5" fill="var(--accent)"/><text x="${(x(eh.length-1)+8).toFixed(1)}" y="${ety.toFixed(1)}" dominant-baseline="central" style="fill:var(--accent);font-weight:700">${pc(eh[eh.length-1])}</text>`;
  if(bh.length)s+=`<circle cx="${x(bh.length-1).toFixed(1)}" cy="${by.toFixed(1)}" r="3" fill="var(--bg)" stroke="var(--dim)" stroke-width="1.6"/><text x="${(x(bh.length-1)+8).toFixed(1)}" y="${bty.toFixed(1)}" dominant-baseline="central" style="font-weight:700">${pc(bh[bh.length-1])}</text>`;
  const lg=`<div class="pn-lgd"><span class="pn-k pn-ka">Equity</span><span class="pn-k pn-kd">Benchmark</span><span class="pn-k pn-ko2">Floor</span></div>`;
  return`<div class="pn-eq">${lg}<svg class="pn-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Equity ${eh.length?pc(eh[eh.length-1]):""} vs benchmark ${bh.length?pc(bh[bh.length-1]):""}, floor ${pnCom(floorEq)}">${s}</svg></div>`}

function intervalChart(edge,lo,hi,verdict,o){
  o=o||{};const W=Math.max(200,Math.round(o.w||296)),H=Math.round(o.h||112),m=14,hasB=lo!=null&&hi!=null;
  const mxv=Math.max(5,Math.abs(edge||0),hasB?Math.abs(lo):0,hasB?Math.abs(hi):0)*1.12,R=pnNice(mxv)<mxv?pnNice(mxv*1.01):pnNice(mxv);
  const X=c=>W/2+(W/2-m)*c/R,ay=H*.58,by=H*.36;
  const sg=v=>pnS(v,1);
  let s=`<line x1="${X(-R)}" x2="${X(R)}" y1="${ay}" y2="${ay}" stroke="var(--line)"/>`;
  [-R,-R/2,0,R/2,R].forEach((c,k)=>{s+=`<line x1="${X(c).toFixed(1)}" x2="${X(c).toFixed(1)}" y1="${ay}" y2="${ay+5}" stroke="var(--faint)"/><text x="${X(c).toFixed(1)}" y="${ay+16}" text-anchor="${k===0?"start":k===4?"end":"middle"}">${c>0?"+":""}${pnF(c)}</text>`});
  s+=`<line x1="${X(0)}" x2="${X(0)}" y1="${by-12}" y2="${ay}" stroke="var(--text)" stroke-width="1.4" stroke-dasharray="3 3"/>`
   +`<text x="${X(0)-4}" y="9" text-anchor="end" style="fill:var(--text);font-weight:700">base</text>`;
  if(hasB){s+=`<rect x="${X(lo).toFixed(1)}" y="${by-7}" width="${Math.max(2,X(hi)-X(lo)).toFixed(1)}" height="14" rx="7" fill="var(--x)" fill-opacity=".3" stroke="var(--x)" stroke-width="1.4"/>`
    +`<text x="${X(lo).toFixed(1)}" y="${by-14}" text-anchor="middle">${sg(lo)}</text><text x="${X(hi).toFixed(1)}" y="${by-14}" text-anchor="middle">${sg(hi)}</text>`}
  const ex=Math.max(X(-R),Math.min(X(R),X(edge||0)));
  s+=`<circle cx="${ex.toFixed(1)}" cy="${by}" r="7" fill="var(--text)" stroke="var(--bg)" stroke-width="2"/>`;
  s+=`<text x="${W/2}" y="${H-3}" text-anchor="middle" style="fill:var(--text);font-weight:700">edge ${sg(edge||0)} calls · ${pnEsc(verdict||"")}</text>`;
  return`<svg class="pn-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Edge ${sg(edge||0)} calls${hasB?", band "+sg(lo)+" to "+sg(hi):""}: ${pnEsc(verdict||"")}">${s}</svg>`}
