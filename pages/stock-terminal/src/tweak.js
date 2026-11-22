"use strict";
/* ---------- copy report ---------- */
function reportText(){
  const g=(f,d)=>{try{return typeof f==="function"?f():d}catch(e){return d}};
  const eq=g(equity,0),bn=g(bench,0),r=+pct(eq,T.startCash).toFixed(2),b=+pct(bn,T.startCash).toFixed(2);
  const per=S.calls||[];
  const calls=per.map(c=>({s:c.s||(S.W&&S.W.codes?S.W.codes[c.k]:null),wk:c.wk,view:c.view!=null?c.view:c.dir,d:c.dir,sig:c.sig||null,pat:c.pat||null,sigDir:c.sigDir!=null?c.sigDir:null,sigAge:c.sigAge!=null?c.sigAge:null,fresh:c.fresh!=null?c.fresh:null,withSig:c.withSig!=null?c.withSig:null,base:c.base!=null?c.base:null,res:c.res||"open"}));
  const lc=g(()=>journalLoad().length,0);
  const js=g(()=>journalStats(),null)||{};
  const jall=js.all||{};
  const ev=g(()=>evNow(),null)||{};
  const eb=ev.base||{};
  const o={build:BUILD,src:g(dataSource,"?"),seed:S.seed,week:S.week,tweaked:g(tweaked,false),tweaks:T,
    equity:Math.round(eq),ret:r,bench:b,excess:+(r-b).toFixed(2),failed:!!S.failed,fees:Math.round(S.fees||0),
    feePts:+(100*(S.fees||0)/(T.startCash||1)).toFixed(2),orders:S.orders||[],
    noCall:g(noCallCount,0),calls:calls,neutrals:(S.neutrals||[]).length,
    record:g(()=>callStats(per,lc),null),split:g(()=>splitStats(per,lc),null),
    journal:{n:js.n||0,edge:jall.edge!=null?jall.edge:null,verdict:jall.verdict||null},
    ev:{src:ev.src||"none",bull:eb.bull!=null?eb.bull:null,bear:eb.bear!=null?eb.bear:null,n:eb.n||0},
    baseline:S.base||"pending"};
  return JSON.stringify(o)}
function copyReport(){const t=reportText();(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{S.lastMsg="Report copied";render()},()=>{prompt("Copy report",t)})}

/* ---------- tweak menu + presets ---------- */
function presets(){try{return JSON.parse(localStorage.getItem("pfdesk.presets")||"{}")}catch(e){return{}}}
function openTweaks(){const P=presets(),keep=($("tw_pname")||{}).value||"";
  $("modalBody").innerHTML=`<div class="tw-wrap"><div class="tw-hd">Settings · Tweak (testing)</div>
  <div class="tw-sub dim">Build ${BUILD} · data ${dataSource()} · seed ${S.seed}. Apply starts a new period.</div>
  <div class="tw-grid">${Object.keys(DEFAULTS).map(k=>`<label class="tw-f${+T[k]!==DEFAULTS[k]?" chg":""}" for="tw_${k}"><span class="tw-l">${TWEAK_LABELS[k]} <span class="faint">(${DEFAULTS[k]})</span></span><input id="tw_${k}" class="num${+T[k]!==DEFAULTS[k]?" chg":""}" type="number" inputmode="decimal" step="any" value="${T[k]}"></label>`).join("")}
  <label class="tw-f" for="tw_seed"><span class="tw-l">Seed</span><input id="tw_seed" class="num" type="number" inputmode="numeric" value="${S.seed}"></label></div>
  <div class="tw-row"><button class="btn primary" id="twApply" onclick="applyTweaks()">Apply + new period</button><button class="btn" id="twDefaults" onclick="T=Object.assign({},DEFAULTS);openTweaks()">Defaults</button></div>
  <div class="tw-hd tw-h2">Presets</div>
  <div class="tw-row"><input id="tw_pname" class="tw-name" type="text" maxlength="40" placeholder="Preset name" value="${esc(keep)}"><button class="btn" id="twSave" onclick="savePreset()">Save preset</button></div>
  <div class="tw-row"><button class="btn" id="twCopyPreset" onclick="copyPreset()">Copy preset code</button><button class="btn" id="twCopyReport" onclick="copyReport()">Copy report</button></div>
  ${Object.keys(P).map((n,ix)=>`<div class="tw-prow"><span class="tw-pn">${esc(n)}</span><button class="btn" onclick="loadPreset(${ix})">Load</button><button class="btn" onclick="delPreset(${ix})">Delete</button></div>`).join("")}
  <div class="tw-row"><button class="btn outline" id="twClose" onclick="$('modal').classList.remove('on')">Close</button></div></div>`;
  $("modal").classList.add("on")}
function readTweaks(){const o={};Object.keys(DEFAULTS).forEach(k=>{const v=parseFloat($("tw_"+k).value);o[k]=isNaN(v)?DEFAULTS[k]:v});o.weeks=Math.max(1,Math.round(o.weeks));o.preWeeks=Math.max(30,Math.round(o.preWeeks));o.reversal=Math.max(1,Math.round(o.reversal));o.boxPct=Math.max(0.25,o.boxPct);return o}
function applyTweaks(){T=readTweaks();try{localStorage.setItem("pfdesk.tweaks",JSON.stringify(T))}catch(e){}const sd=parseInt($("tw_seed").value)||S.seed;$("modal").classList.remove("on");newPeriod(sd)}
function savePreset(){const n=(($("tw_pname")||{}).value||"").trim();if(!n){const e=$("tw_pname");if(e)e.focus();return}const P=presets();P[n]=readTweaks();try{localStorage.setItem("pfdesk.presets",JSON.stringify(P))}catch(e){}openTweaks()}
function loadPreset(ix){const P=presets(),n=Object.keys(P)[ix];T=Object.assign({},DEFAULTS,P[n]);openTweaks()}
function delPreset(ix){const P=presets(),n=Object.keys(P)[ix];delete P[n];try{localStorage.setItem("pfdesk.presets",JSON.stringify(P))}catch(e){}openTweaks()}
function copyPreset(){const t="PFDESK-PRESET:"+btoa(JSON.stringify(readTweaks()));(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{S.lastMsg="Preset code copied";render()},()=>prompt("Preset code",t))}
