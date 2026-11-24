"use strict";
// Chart School engine (global CSE; module.exports in node). Single source of the charting conventions C1-C7.
// Ported from gen-items.js (floor/ceil, first column, R2/R2b, R5-R7 identical); R3 is 3-way, R4 follows C6.
var CSE=(function(){
var LB=Math.log(1.02),REV=3;
function boxOf(p){return Math.floor(Math.log(p)/LB+1e-9)}
function boxUp(p){return Math.ceil(Math.log(p)/LB-1e-9)}
function priceOf(b){return Math.exp(b*LB)}
function disp(p){var v=p*100;return v>=100?String(Math.round(v)):v.toFixed(1)}
var dp=function(b){return disp(priceOf(b))};
var OPTIONS={
 R1:["Double top buy","Triple top buy","Double bottom sell","Triple bottom sell","No signal"],
 R3:["Above by 3+ boxes","Within 2 boxes above","On or below"],
 R5:["Above 70","50 to 70","30 to 50","Below 30"],
 R6:["Positive rising","Positive falling","Negative rising","Negative falling"],
 R7:["Bearish","Bullish","None"]};
var TYPES=["R1","R2","R2b","R3","R4","R5","R6","R7"];
var NAMES={R1:"Signal",R2:"Support / resistance",R2b:"Support / resistance",R3:"Trend line",R4:"Vertical count",R5:"RSI",R6:"MACD",R7:"Divergence"};

function pnf(bars){
 var cols=[],colOfWeek=[],cells=[],c=null;
 function fill(col,a,b,wk){for(var x=a;x<=b;x++)cells.push({col:col,box:x,week:wk})}
 for(var i=0;i<bars.length;i++){
  var x=bars[i],hb=boxOf(x.h),lb=boxUp(x.l);
  if(!c){c={d:1,lo:lb,hi:hb,start:i,end:i,sig:0,sigName:null,sigWeek:null};if(c.lo>c.hi)c.lo=c.hi;cols.push(c);fill(0,c.lo,c.hi,i)}
  else if(c.d===1){ // X column: high first (Dorsey order)
   if(hb>c.hi){fill(cols.length-1,c.hi+1,hb,i);c.hi=hb}
   else if(lb<=c.hi-REV){c={d:-1,hi:c.hi-1,lo:lb,start:i,end:i,sig:0,sigName:null,sigWeek:null};cols.push(c);fill(cols.length-1,c.lo,c.hi,i)}
  }else{
   if(lb<c.lo){fill(cols.length-1,lb,c.lo-1,i);c.lo=lb}
   else if(hb>=c.lo+REV){c={d:1,lo:c.lo+1,hi:hb,start:i,end:i,sig:0,sigName:null,sigWeek:null};cols.push(c);fill(cols.length-1,c.lo,c.hi,i)}
  }
  var j=cols.length-1;c.end=i;
  if(j>=2&&!c.sig){var p=cols[j-2],pp=cols[j-4];
   if(c.d===1&&c.hi>p.hi){c.sig=1;c.sigWeek=i;c.sigName=(pp&&pp.hi===p.hi)?"Triple top buy":"Double top buy"}
   else if(c.d===-1&&c.lo<p.lo){c.sig=-1;c.sigWeek=i;c.sigName=(pp&&pp.lo===p.lo)?"Triple bottom sell":"Double bottom sell"}}
  colOfWeek.push(j);
 }
 return{cols:cols,colOfWeek:colOfWeek,cells:cells};
}
function ema(a,n){var k=2/(n+1),e=a[0],o=[];for(var i=0;i<a.length;i++){e=a[i]*k+e*(1-k);o.push(e)}return o}
function rsi(c,n){n=n||14;var o=[50],ag=0,al=0;for(var i=1;i<c.length;i++){var d=c[i]-c[i-1],g=Math.max(d,0),l=Math.max(-d,0);
 if(i<=n){ag+=g/n;al+=l/n}else{ag=(ag*(n-1)+g)/n;al=(al*(n-1)+l)/n}o.push(al===0?100:100-100/(1+ag/al))}return o}
function macd(c){var f=ema(c,12),s=ema(c,26),m=f.map(function(x,i){return x-s[i]}),sg=ema(m,9);return{macd:m,signal:sg,hist:m.map(function(x,i){return x-sg[i]})}}

function readAll(bars){
 var out={R1:null,R2:null,R2b:null,R3:null,R4:null,R5:null,R6:null,R7:null,disc:{}};
 var n=bars.length,E=pnf(bars),cols=E.cols,J=cols.length-1,cl=bars.map(function(b){return b.c});
 var bc=boxOf(bars[n-1].c);
 // R1: last 3 columns incl. current, later column wins
 var sig="No signal",sj=null;
 for(var j=Math.max(0,J-2);j<=J;j++){if(cols[j].sig){sig=cols[j].sigName;sj=j}}
 out.R1={answer:sig,col:sj};
 // R2 / R2b: most recent completed O / X column
 var oi=-1,xi=-1;
 for(j=J-1;j>=0&&(oi<0||xi<0);j--){if(cols[j].d===-1&&oi<0)oi=j;if(cols[j].d===1&&xi<0)xi=j}
 if(oi>=0)out.R2={answer:cols[oi].lo,col:oi};else out.disc.R2="no completed O column";
 if(xi>=0)out.R2b={answer:cols[xi].hi,col:xi};else out.disc.R2b="no completed X column";
 // R3: Bullish Support Line, 3-way
 var base=Math.max(0,cols.length-30),best=null,bj=-1;
 for(j=base;j<cols.length;j++){if(cols[j].d===-1&&(best===null||cols[j].lo<best)){best=cols[j].lo;bj=j}}
 if(bj<0)out.disc.R3="no O column in last 30";
 else{var line=best-1+(J-bj),d=bc-line;
  out.R3={answer:d>=3?OPTIONS.R3[0]:d>=1?OPTIONS.R3[1]:OPTIONS.R3[2],anchorCol:bj,anchorLo:best,lineAtCur:line,closeBox:bc,d:d}}
 // R4 (C6): count the buy SIGNAL column
 if(sig.indexOf("buy")>=0){
  if(sj<=1)out.disc.R4="signal column index <= 1";
  else{var sc=cols[sj],cnt=sc.hi-sc.lo+1;out.R4={answer:sc.lo+3*cnt,col:sj,boxes:cnt,from:sc.lo}}
 }else out.disc.R4="R1 not a buy";
 // R5
 var rs=rsi(cl),r=rs[n-1],m=Math.min(Math.abs(r-70),Math.abs(r-50),Math.abs(r-30));
 if(m<1)out.disc.R5="within 1.0 of 30/50/70";
 else out.R5={answer:r>70?OPTIONS.R5[0]:r>50?OPTIONS.R5[1]:r>30?OPTIONS.R5[2]:OPTIONS.R5[3],value:r};
 // R6
 var h=macd(cl).hist,h0=h[n-1],h1=n>1?h[n-2]:h[n-1],bx=priceOf(bc+1)-priceOf(bc);
 if(Math.abs(h0)<0.02*bx)out.disc.R6="|hist| < 0.02 box";
 else if(Math.abs(h0-h1)<0.005*bx)out.disc.R6="|hist change| < 0.005 box";
 else out.R6={answer:(h0>0?"Positive":"Negative")+(h0>h1?" rising":" falling"),hist:h0,prev:h1};
 // R7
 var bear=null,bull=null;
 for(var q=0;q<2;q++){var t=n-1-q;if(t<12)continue;var hp=-1,lp=-1;
  for(var k=t-12;k<t;k++){if(hp<0||cl[k]>=cl[hp])hp=k;if(lp<0||cl[k]<=cl[lp])lp=k}
  if(bear===null&&cl[t]>cl[hp]&&rs[t]<rs[hp])bear={t:t,ref:hp};
  if(bull===null&&cl[t]<cl[lp]&&rs[t]>rs[lp])bull={t:t,ref:lp}}
 if(bear&&bull)out.disc.R7="bearish and bullish both";
 else out.R7=bear?{answer:"Bearish",t:bear.t,ref:bear.ref}:bull?{answer:"Bullish",t:bull.t,ref:bull.ref}:{answer:"None",t:null,ref:null};
 return out;
}

var RULES={
 R1:{title:"Signal",lines:[
  "Each box is 2%, and a column turns after a 3-box reversal, using the weekly high and low.",
  "A buy signal is an X column that rises at least 1 box above the top of the X column two columns back.",
  "It is a triple top buy when the X column four back has the same top as the one two back. Otherwise it is a double top buy.",
  "A sell signal is the mirror: an O column that falls at least 1 box below the bottom of the O column two back.",
  "Look at the last 3 columns, including the current one. The latest signal wins. If none fired, the reading is No signal."]},
 R2:{title:"Support",lines:[
  "Find the most recent completed O column. A completed column is any column except the current, last one.",
  "Its lowest box is the support box.",
  "Each box is 2%. Pick the row of that lowest box."]},
 R2b:{title:"Resistance",lines:[
  "Find the most recent completed X column. A completed column is any column except the current, last one.",
  "Its highest box is the resistance box.",
  "Each box is 2%. Pick the row of that highest box."]},
 R3:{title:"Trend line",lines:[
  "Look at the last 30 columns and find the lowest O box. If two O columns share it, take the earliest one.",
  "The support line starts 1 box under that box and rises 1 box for every column after it, at 45 degrees.",
  "Read the line at the current column, then count boxes from the line up to the last close.",
  "3 or more boxes up is Above by 3+ boxes. 1 or 2 boxes up is Within 2 boxes above. On the line or under it is On or below."]},
 R4:{title:"Vertical count",lines:[
  "Find the buy signal column. Count its boxes, low to high.",
  "Multiply by 3. Add that many boxes above the column's lowest box.",
  "Each box is 2%, so the objective is counted in boxes, not in price points.",
  "If the signal column is still the current column, the count is provisional until it ends."]},
 R5:{title:"RSI",lines:[
  "RSI uses 14 weekly closes with Wilder smoothing. The first value is set to 50.",
  "Read the last value on the pane header against the lines at 30, 50 and 70.",
  "Above 70, 50 to 70, 30 to 50, or Below 30.",
  "Sheets are not drawn when the value sits within 1.0 of a line."]},
 R6:{title:"MACD",lines:[
  "MACD is the 12-week average minus the 26-week average of closes. The signal line is a 9-week average of that.",
  "The histogram is MACD minus the signal line.",
  "Positive or Negative is the sign of the histogram this week.",
  "Rising or falling compares it with last week. Sheets are not drawn when either is almost flat."]},
 R7:{title:"Divergence",lines:[
  "Compare this week, or last week, with the 12 closes before it.",
  "Bearish: the close is above all 12 prior closes, but RSI is lower than RSI at the highest prior close.",
  "Bullish: the close is below all 12 prior closes, but RSI is higher than RSI at the lowest prior close.",
  "If neither holds, the reading is None."]}
};

function plural(n,w){return n+" "+w+(n===1?"":"es")}
function bandRsi(v){return v>70?"above 70":v>50?"between 50 and 70":v>30?"between 30 and 50":"below 30"}
function explain(type,reads,given){
 var r=reads&&reads[type];if(!r)return "No engine reading for this sheet.";
 var ok=given===r.answer,pre=ok?"Right: ":"Marked: ",e;
 if(type==="R1"){
  if(r.answer==="No signal")e=ok?"no signal fired in the last 3 columns.":"no signal fired in the last 3 columns, you marked "+given+".";
  else e=ok?r.answer+" in column "+(r.col+1)+".":"the engine reading is "+r.answer+" in column "+(r.col+1)+", you marked "+given+".";
  return pre+e}
 if(type==="R2"||type==="R2b"){
  var what=type==="R2"?"The most recent completed O column ends at its lowest box, ":"The most recent completed X column ends at its highest box, ";
  if(ok)return "Right: "+what.replace("ends at","has").replace(", ","")+" "+dp(r.answer)+".";
  var df=Math.abs(given-r.answer);return "Marked: off by "+plural(df,"box")+". "+what+dp(r.answer)+"."}
 if(type==="R3"){var R=reads.R3;
  var t=R.d>=1?plural(R.d,"box")+" above the line":"on or below the line";
  return pre+"the close is "+t+" (line at "+dp(R.lineAtCur)+", close at "+dp(R.closeBox)+")"+(ok?".":", the engine reading is "+r.answer+".")}
 if(type==="R4"){
  if(ok)return "Right: "+r.boxes+" boxes x 3 = "+(3*r.boxes)+" boxes above the column's lowest box, "+dp(r.from)+", gives "+dp(r.answer)+".";
  var d4=Math.abs(given-r.answer);return "Marked: off by "+plural(d4,"box")+". The count starts at the column's lowest box, "+dp(r.from)+". "+r.boxes+" boxes x 3 = "+(3*r.boxes)+", so the objective is "+dp(r.answer)+"."}
 if(type==="R5"){var v=Math.round(r.value);
  return ok?"Right: RSI "+v+" sits "+bandRsi(r.value)+".":"Marked: RSI is "+v+", which sits "+bandRsi(r.value)+"."}
 if(type==="R6"){var hs=r.hist>0?"above":"below";
  return pre+"the histogram is "+hs+" zero and "+(r.hist>r.prev?"rose":"fell")+" since last week"+(ok?".":", so the engine reading is "+r.answer+".")}
 if(type==="R7"){
  var why=r.answer==="Bearish"?"the close made a new high over the prior 12 weeks while RSI stayed lower than at the earlier high.":r.answer==="Bullish"?"the close made a new low over the prior 12 weeks while RSI stayed higher than at the earlier low.":"the close and RSI do not disagree over the prior 12 weeks.";
  return ok?"Right: "+r.answer+". "+why.charAt(0).toUpperCase()+why.slice(1):"Marked: the engine reading is "+r.answer+"; "+why}
 return pre+"engine reading "+String(r.answer)+"."
}

return{boxOf:boxOf,boxUp:boxUp,priceOf:priceOf,disp:disp,pnf:pnf,rsi:rsi,macd:macd,readAll:readAll,OPTIONS:OPTIONS,TYPES:TYPES,NAMES:NAMES,RULES:RULES,explain:explain};
})();
if(typeof module!=="undefined"&&module.exports)module.exports=CSE;
