"use strict";
/* Evidence lab: base rates, call record vs base, journal (lifetime, localStorage). Runs after evcalc.js. */
const JOURNAL_KEY="st.journal.v1";
let _jmem=null;
function _ev(){try{return typeof evNow==="function"?evNow():null}catch(e){return null}}
function baseFor(dir){
  const e=_ev(),b=e&&e.base;
  const v=b?(dir>0?b.bull:b.bear):null;
  return typeof v==="number"&&isFinite(v)?v:0.5; // admin default: 0.5 when no evidence
}
function _closed(calls){return(calls||[]).filter(c=>c&&(c.res==="right"||c.res==="wrong")&&(c.view===1||c.view===-1))}
function callStats(calls,nLife){
  const cl=_closed(calls),n=cl.length;
  let right=0,exp=0,v=0;
  for(const c of cl){
    const b=typeof c.base==="number"?c.base:baseFor(c.view);
    if(c.res==="right")right++;
    exp+=b;v+=b*(1-b);
  }
  const edge=right-exp,sd=Math.sqrt(v),life=typeof nLife==="number"?nLife:n;
  const band=life>=30?[edge-1.96*sd,edge+1.96*sd]:null;
  let verdict="too few to tell";
  if(band)verdict=band[0]>0?"above base":band[1]<0?"below base":"at base";
  return{closed:n,right,exp,edge,sd,band,verdict};
}
function splitStats(calls,nLife){
  const cl=_closed(calls),pick=f=>callStats(cl.filter(f),nLife);
  return{with:pick(c=>c.withSig===true),against:pick(c=>c.withSig===false),none:pick(c=>c.withSig!==true&&c.withSig!==false)};
}
function freshStats(calls,nLife){
  const cl=_closed(calls).filter(c=>c.withSig===true||c.withSig===false);
  return{fresh:callStats(cl.filter(c=>!!c.fresh),nLife),stale:callStats(cl.filter(c=>!c.fresh),nLife)};
}
function liftCls(p){
  if(!p||typeof p.lo!=="number"||typeof p.hi!=="number")return"dim";
  const b=baseFor(p.dir||1),ex=p.lo>b||p.hi<b;
  if(!ex)return"dim";
  return p.lift>0?"ok":p.lift<0?"warn":"dim";
}
function liftTxt(x){
  const r=Math.round((+x||0)*10)/10;
  if(r===0)return"0 pts";
  return(r>0?"+":"-")+Math.abs(r).toFixed(1)+" pts";
}
function pctTxt(p){return Math.round((+p||0)*100)+"%"}
function journalLoad(){
  try{
    const a=JSON.parse(localStorage.getItem(JOURNAL_KEY)||"[]");
    if(Array.isArray(a)){_jmem=a;return a.slice()}
  }catch(e){}
  return _jmem?_jmem.slice():[];
}
function _jsave(a){_jmem=a;try{localStorage.setItem(JOURNAL_KEY,JSON.stringify(a))}catch(e){}}
function journalAdd(call){
  if(!call||call.id==null)return false;
  const a=journalLoad();
  if(a.some(c=>c.id===call.id))return false;
  a.push(call);_jsave(a);return true;
}
function journalReset(){_jmem=[];try{localStorage.removeItem(JOURNAL_KEY)}catch(e){}}
function journalStats(){
  const a=_closed(journalLoad()),n=a.length,byPat={};
  for(const c of a){const k=c.sig||"No signal";(byPat[k]=byPat[k]||[]).push(c)}
  for(const k in byPat)byPat[k]=callStats(byPat[k],n);
  return{n,all:callStats(a,n),bull:callStats(a.filter(c=>c.view===1),n),bear:callStats(a.filter(c=>c.view===-1),n),
    byPat,split:splitStats(a,n),fresh:freshStats(a,n)};
}
