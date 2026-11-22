"use strict";
/* ---------- drawn point-and-figure (SVG) ---------- */
let _pfUid=0;
const _pfn=v=>+(+v).toFixed(1);
function _pfPrice(p,dp){ // fixed precision, thousands comma
  const s=p.toFixed(dp);if(p<1000)return s;
  const a=s.split(".");a[0]=a[0].replace(/\B(?=(\d{3})+(?!\d))/g,",");return a.join(".")}
function _pfDp(p){return p<10?2:p<100?1:0}
// choose which columns/rows to show: last K columns whose box range fits, compress factor f
function _pfFit(all,maxC,rows){
  const L=all.length;if(!L)return null;
  let f=1;const last=all[L-1],n=last.hi-last.lo+1;
  while(Math.floor((n-1)/f)+1>rows)f++;
  const run=f=>{let K=0,lo=Infinity,hi=-Infinity;
    for(let k=L-1;k>=0&&K<maxC;k--){const l=Math.min(lo,all[k].lo),h=Math.max(hi,all[k].hi);
      if(Math.floor((h-l)/f)+1>rows)break;lo=l;hi=h;K++}
    return{K,lo,hi}};
  let r=run(f);
  // admin default: too few columns fit -> compress up to 1:3 so the chart keeps context
  const want=Math.min(maxC,L,5);
  while(r.K<want&&f<3){f++;r=run(f)}
  const K=r.K,lo=r.lo,hi=r.hi,used=Math.floor((hi-lo)/f)+1,free=Math.max(0,rows-used);
  return{f,K,off:L-K,lo,hi,used,above:Math.ceil(free/2),below:Math.floor(free/2)}}
function _pfXO(c,x,y,cs,isNew,mini){
  const ins=mini?1:3,sw=mini?1.2:1.8,col=c.d===1?"var(--x)":"var(--o)";let s="";
  if(isNew)s+=`<rect x="${_pfn(x+.5)}" y="${_pfn(y+.5)}" width="${cs-1}" height="${cs-1}" fill="${col}" fill-opacity=".22" stroke="${col}" stroke-width="1"/>`;
  if(c.d===1)s+=`<path d="M${_pfn(x+ins)} ${_pfn(y+ins)}L${_pfn(x+cs-ins)} ${_pfn(y+cs-ins)}M${_pfn(x+cs-ins)} ${_pfn(y+ins)}L${_pfn(x+ins)} ${_pfn(y+cs-ins)}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" fill="none"/>`;
  else s+=`<circle cx="${_pfn(x+cs/2)}" cy="${_pfn(y+cs/2)}" r="${_pfn((cs-2*ins)/2)}" stroke="${col}" stroke-width="${sw}" fill="none"/>`;
  return s}
// grid + columns; returns svg fragments. g={x0,y0,cs,rows,K,off,f,topBox,all,lastBar}
function _pfBody(g,mini){
  const{x0,y0,cs,rows,K,off,f,topBox,all,lastBar}=g,first=g.first||0,gw=K*cs,gh=rows*cs;let s="",gp="";
  for(let r=0;r<=rows;r++)gp+=`M${x0} ${_pfn(y0+r*cs)}H${x0+gw}`;
  for(let c=0;c<=K;c++)gp+=`M${_pfn(x0+c*cs)} ${y0}V${y0+gh}`;
  s+=`<path d="${gp}" stroke="var(--grid)" stroke-width="1" fill="none"/>`;
  for(let j=0;j<K;j++){const c=all[off+j];if(!c||off+j<first)continue;
    const r0=Math.floor((topBox-c.hi)/f),r1=Math.floor((topBox-c.lo)/f);
    for(let r=Math.max(0,r0);r<=Math.min(rows-1,r1);r++){
      let nw=false;const bt=topBox-r*f;
      for(let b=bt-f+1;b<=bt;b++)if(b>=c.lo&&b<=c.hi&&c.wk[b]===lastBar)nw=true;
      s+=_pfXO(c,x0+j*cs,y0+r*cs,cs,nw,mini)}}
  return s}

function pfSVG(i,opt){
  opt=opt||{};const w=Math.max(120,Math.round(opt.w||320)),h=Math.max(100,Math.round(opt.h||280));
  const cs=opt.cell||(w<600?15:14),axisW=46,axH=18,chipH=22;
  const all=(i&&i.cols)||[],si=(i&&i.si)||sigInfo(all);
  const uid="pf"+(++_pfUid);
  const px=i&&i.c&&i.c.length?i.c[i.c.length-1]:(i&&i.b&&i.b.length?i.b[i.b.length-1].c:null);
  const lastBar=i&&i.b?i.b.length-1:-1;
  const tgt=opt.tgt>0?+opt.tgt:null;
  const aria=`Point and figure chart, ${all.length} columns`;
  const head=`<svg id="pf" xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${aria}" font-family="var(--sans)" style="display:block;font-variant-numeric:tabular-nums">`;
  if(!all.length)return head+`<text x="${w/2}" y="${h/2}" text-anchor="middle" font-size="11" fill="var(--dim)">No data</text></svg>`;
  const maxC=Math.max(1,Math.floor((w-axisW)/cs));
  const layout=(top,bot)=>{const rows=Math.max(3,Math.floor((h-top-axH-bot)/cs));return{rows,top,bot,fit:_pfFit(all,maxC,Math.max(1,rows-2))}};
  const onScale=(L)=>{ // is target inside the visible rows?
    if(tgt==null)return null;const f=L.fit,topBox=f.hi+f.above*f.f,u=Math.log(tgt)/LB();
    const y=(topBox+1-u)/f.f;return y>=0&&y<=L.rows?true:(y<0?"up":"down")};
  let L=layout(2,0),os=onScale(L);
  if(os==="up")L=layout(chipH+2,0);else if(os==="down")L=layout(2,chipH);
  os=onScale(L);
  const F=L.fit,f=F.f,rows=L.rows,K=F.K,off0=F.off,off=all.length-maxC,topBox=F.hi+F.above*f; // integrator: right-align columns to the axis
  const x0=0,y0=L.top,gw=maxC*cs,gh=rows*cs,K0=K;
  const g={x0,y0,cs,rows,K:maxC,off,first:off0,f,topBox,all,lastBar};
  let s=head;
  s+=`<defs><clipPath id="${uid}c"><rect x="${x0}" y="${y0}" width="${gw}" height="${gh}"/></clipPath></defs>`;
  s+=_pfBody(g,false);
  const yOfU=u=>y0+(topBox+1-u)/f*cs;
  const rowOf=b=>Math.floor((topBox-b)/f);
  const halo=`stroke="var(--surface)" stroke-width="3" paint-order="stroke" stroke-linejoin="round"`;
  // trend line (only through empty cells)
  const tr=pnfTrend(all);
  if(tr&&tr.col+0<all.length){
    const sup=tr.kind==="support";let d="",cnt=0,lastPt=null;
    for(let gi=Math.max(tr.col,off0);gi<all.length;gi++){
      const c=all[gi],b=sup?tr.box+(gi-tr.col):tr.box-(gi-tr.col),j=gi-off;
      const r=rowOf(b);if(r<0||r>=rows)continue;
      if(b>=c.lo&&b<=c.hi)continue; // occupied
      if(f>1){const bt=topBox-r*f;if(!(c.hi<bt-f+1||c.lo>bt))continue}
      const xl=x0+j*cs,xr=xl+cs,yb=yOfU(b),yt=yOfU(b+1);
      d+=sup?`M${_pfn(xl)} ${_pfn(yb)}L${_pfn(xr)} ${_pfn(yt)}`:`M${_pfn(xl)} ${_pfn(yt)}L${_pfn(xr)} ${_pfn(yb)}`;
      cnt++;lastPt={x:(xl+xr)/2,y:(yb+yt)/2}}
    if(d){
      s+=`<g clip-path="url(#${uid}c)"><path d="${d}" fill="none" stroke="${sup?"var(--accent)":"var(--o)"}" stroke-width="1.5" stroke-linecap="round"${sup?"":' stroke-dasharray="4 3"'}/></g>`;
      if(cnt>=4&&lastPt&&f===1){
        const nx=0.707,ny=sup?0.707:-0.707;
        // label sits on the empty side of the line, a few cells before the end
        const bx=lastPt.x-cs*0.5+nx*9,by=lastPt.y+(sup?cs*0.5:-cs*0.5)+ny*9;
        s+=`<text transform="translate(${_pfn(bx)} ${_pfn(by)}) rotate(${sup?-45:45})" text-anchor="end" font-size="11" fill="${sup?"var(--accent)":"var(--o)"}" ${halo}>${sup?"support":"resistance"}</text>`}}}
  const lbx=[]; // placed label boxes {x1,x2,y1,y2} for collision avoidance
  const lhit=(a,b)=>a.x1<b.x2&&b.x1<a.x2&&a.y1<b.y2&&b.y1<a.y2;
  // target
  if(tgt!=null){
    const tp=_pfPrice(tgt,_pfDp(tgt)),txt="Target "+tp;
    if(os===true){const y=_pfn(yOfU(Math.log(tgt)/LB()));
      s+=`<path d="M${x0} ${y}H${x0+gw}" stroke="var(--dim)" stroke-width="1.2" stroke-dasharray="5 4" fill="none"/>`;
      const ty=Math.max(y0+11,Math.min(y0+gh-3,+y-3));
      lbx.push({x1:x0+gw-3-txt.length*6.2,x2:x0+gw-3,y1:ty-10,y2:ty+3});
      s+=`<text x="${x0+gw-3}" y="${ty}" text-anchor="end" font-size="11" fill="var(--dim)" ${halo}>${txt}</text>`}
    else{const up=os==="up",cw=txt.length*6.2+30,cx=x0+gw-cw+axisW-6,cy=up?1:y0+gh+axH+1;
      const cxx=Math.max(2,Math.min(w-cw-2,cx));
      s+=`<rect x="${_pfn(cxx)}" y="${cy}" width="${_pfn(cw)}" height="${chipH-4}" rx="${(chipH-4)/2}" fill="var(--surface2)" stroke="var(--dim)" stroke-dasharray="3 2"/>`;
      s+=`<text x="${_pfn(cxx+cw/2)}" y="${cy+(chipH-4)/2+4}" text-anchor="middle" font-size="11" fill="var(--dim)">${txt} ${up?"▲":"▼"}</text>`}}
  // signal triangle
  const sigLbl=(t,cx,ty,j,col)=>{const wd=t.length*6.6+2;let st=j<2,y=ty+4,b;
    const mk=()=>({x1:st?cx+8:cx-8-wd,x2:st?cx+8+wd:cx-8,y1:y-10,y2:y+3});
    b=mk();
    if(lbx.some(o=>lhit(b,o))){st=!st;b=mk()} // try opposite side of the triangle
    for(const dy of [0,-12,12,-24,24]){if(!lbx.some(o=>lhit(b,o)))break;y=ty+4+dy;b=mk()}
    lbx.push(b);
    return `<text x="${_pfn(st?cx+8:cx-8)}" y="${_pfn(y)}" text-anchor="${st?"start":"end"}" font-size="11" font-weight="600" fill="${col}" ${halo}>${t}</text>`};
  if(si&&si.name&&si.col!=null&&si.col>=off0){
    const c=all[si.col],j=si.col-off,cx=x0+(j+.5)*cs,col=si.buy?"var(--x)":"var(--o)";
    if(si.buy){const r=rowOf(c.hi)-1;if(r>=0){const ty=y0+r*cs+cs/2;
      s+=`<path d="M${_pfn(cx)} ${_pfn(ty-5)}L${_pfn(cx+5)} ${_pfn(ty+4)}L${_pfn(cx-5)} ${_pfn(ty+4)}Z" fill="${col}"/>`;
      s+=sigLbl("Buy",cx,ty,j,col)}}
    else{const r=rowOf(c.lo)+1;if(r<rows){const ty=y0+r*cs+cs/2;
      s+=`<path d="M${_pfn(cx)} ${_pfn(ty+5)}L${_pfn(cx+5)} ${_pfn(ty-4)}L${_pfn(cx-5)} ${_pfn(ty-4)}Z" fill="${col}"/>`;
      s+=sigLbl("Sell",cx,ty,j,col)}}}
  // trap labels
  pnfTraps(all).forEach(t=>{if(t.col<off0)return;const c=all[t.col],j=t.col-off;
    const r=rowOf(c.lo)+1,y=Math.min(y0+gh-2,y0+(r+1)*cs-3),cx=Math.max(x0+10,Math.min(x0+gw-10,x0+(j+.5)*cs));
    s+=`<text x="${_pfn(cx)}" y="${_pfn(y)}" text-anchor="middle" font-size="10" font-weight="600" fill="var(--warn)" ${halo}>trap</text>`});
  // right price axis
  const dp=_pfDp(priceOf(topBox)),pdp=px!=null&&px<100?2:0,ax=x0+gw;
  let py=null;if(px!=null)py=Math.max(y0+7,Math.min(y0+gh-7,yOfU(Math.log(px)/LB())));
  const aa=[];
  for(let r=0;r<rows;r++){const b=topBox-r*f,on=f===1?(((b%2)+2)%2===0):(r%2===0);if(!on)continue;
    const cy=y0+(r+.5)*cs;if(py!=null&&Math.abs(cy-py)<11)continue;
    aa.push(`<text x="${ax+6}" y="${_pfn(cy+4)}" font-size="11" fill="var(--dim)">${_pfPrice(priceOf(b),dp)}</text>`)}
  s+=aa.join("");
  if(py!=null){const pw=w-ax-4,pt=_pfPrice(px,pdp);
    s+=`<path d="M${ax} ${_pfn(py)}h3" stroke="var(--text)" stroke-width="1"/><rect x="${ax+3}" y="${_pfn(py-8)}" width="${pw}" height="16" rx="4" fill="var(--text)"/><text x="${_pfn(ax+3+pw/2)}" y="${_pfn(py+4)}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--bg)">${pt}</text>`}
  // column axis
  const yb=y0+gh;
  let tk=`M${x0} ${yb}H${ax}`,lb="";
  for(let j=0;j<maxC;j++){const n=off+j+1;if(n<1||n%5!==0||j<2)continue;const cx=_pfn(x0+(j+1)*cs-cs/2);
    tk+=`M${cx} ${yb}v4`;lb+=`<text x="${cx}" y="${yb+15}" text-anchor="middle" font-size="11" fill="var(--dim)">${n}</text>`}
  s+=`<path d="${tk}" stroke="var(--line)" stroke-width="1" fill="none"/>`;
  s+=`<text x="${x0+2}" y="${yb+15}" font-size="11" fill="var(--dim)">col</text>`+lb;
  if(f>1)s+=`<text x="${ax+6}" y="${yb+15}" font-size="11" fill="var(--warn)">1:${f}</text>`;
  return s+"</svg>"}

function pfMini(i,opt){
  opt=opt||{};const w=Math.max(30,Math.round(opt.w||60)),h=Math.max(20,Math.round(opt.h||40)),cs=opt.cell||6;
  const all=(i&&i.cols)||[],lastBar=i&&i.b?i.b.length-1:-1;
  const head=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Mini point and figure chart" style="display:block">`;
  if(!all.length)return head+"</svg>";
  const rows=Math.max(2,Math.floor(h/cs)),maxC=Math.max(1,Math.min(8,Math.floor(w/cs)));
  const F=_pfFit(all,maxC,rows),f=F.f,topBox=F.hi+F.above*f;
  const x0=Math.floor((w-F.K*cs)/2),y0=Math.floor((h-rows*cs)/2);
  return head+_pfBody({x0,y0,cs,rows,K:F.K,off:F.off,f,topBox,all,lastBar},true)+"</svg>"}

function sigChip(si){
  si=si||{name:null};
  const lab=si.name?sigLabel(si.name):"",age=si.age==null?0:si.age;
  let h;
  if(!si.name)h=`<span class="chip stale">No signal</span>`;
  else if(si.fresh)h=`<span class="chip fresh ${si.buy?"buy":"sell"}">${lab} · ${age<=0?"this week":"last col"}</span>`;
  else h=`<span class="chip stale">${lab} · ${age} col${age===1?"":"s"} ago</span>`;
  if(si.trap)h+=` <span class="chip pf-trap">${si.trap==="bull"?"Bull":"Bear"} trap?</span>`;
  return h}
