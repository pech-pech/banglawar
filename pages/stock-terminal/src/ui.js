"use strict";
/* ---------- render helpers ---------- */
const fmt=x=>Math.round(x).toLocaleString("en-US");
const sg=x=>(x>=0?"+":"")+x.toFixed(1);
const sg2=x=>(x>=0?"+":"")+x.toFixed(2);
const $=id=>document.getElementById(id);
function pathOf(a,w,h,lo,hi){const d=hi-lo||1;return a.map((v,i)=>(i?"L":"M")+(i*w/(a.length-1||1)).toFixed(1)+" "+(h-(v-lo)/d*h+2).toFixed(1)).join(" ")}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

const SCREENS={}, SHEETS={};

function devBadge(){
  const t=(typeof tweaked==="function"&&tweaked())?"DEV* ":"DEV ";
  return `<button class="dev num" id="devBadge" onclick="openTweaks()">${t}${esc(typeof S!=="undefined"?S.seed:"")}</button>`}
function topBar(title,sub,right){
  return `<div class="top"><h1>${esc(title)}</h1>${sub?`<span class="sub">${esc(sub)}</span>`:""}<span class="top-r">${right||""}${/id="devBadge"/.test(right||"")?"":devBadge()}</span></div>`}
function layout(){
  const w=window.innerWidth,h=window.innerHeight;
  if(w<600)return"cover";
  if(w>=760&&w>h)return"wide";
  return"tall"}

let _lastToast=null,_toastT=0;
function showToast(){
  const t=$("toast");if(!t)return;
  const m=S.lastMsg;
  if(m===_lastToast)return;
  _lastToast=m;
  if(!m){t.classList.remove("on");return}
  t.textContent=m;t.classList.add("on");
  clearTimeout(_toastT);_toastT=setTimeout(()=>t.classList.remove("on"),2500)}

function fallback(kind,name){return`<div class="card dim">${kind} "${esc(name)}" is not available.</div>`}
function render(){
  if(typeof S==="undefined"||!S)return;
  const b=document.body;
  b.dataset.layout=layout();
  let sc=null,sh=null;
  try{const f=SCREENS[S.screen];sc=f?f():{top:topBar("Stock Terminal"),main:fallback("Screen",S.screen),bar:""}}
  catch(e){sc={top:topBar("Stock Terminal"),main:`<div class="card warn">Screen error: ${esc(e&&e.message)}</div>`,bar:""}}
  $("top").innerHTML=sc.top||"";$("main").innerHTML=sc.main||"";$("bar").innerHTML=sc.bar||"";
  const names=["order","week"];
  names.forEach(n=>b.classList.remove("sheet-"+n));
  if(S.sheet){
    try{const f=SHEETS[S.sheet];sh=f?f():{html:fallback("Sheet",S.sheet)}}
    catch(e){sh={html:`<div class="card warn">Sheet error: ${esc(e&&e.message)}</div>`}}
    const sheetEl=$("sheet"),prev=sheetEl.scrollTop;
    sheetEl.innerHTML=sh.html||"";sheetEl.scrollTop=prev;
    b.classList.add("sheet-on","sheet-"+S.sheet)}
  else{b.classList.remove("sheet-on");$("sheet").innerHTML=""}
  showToast()}
