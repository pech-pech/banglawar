"use strict";
/* ---------- copy report ---------- */
function reportText(){const eq=equity();return JSON.stringify({build:BUILD,src:dataSource(),seed:S.seed,week:S.week,tweaked:tweaked(),tweaks:T,equity:Math.round(eq),ret:+pct(eq,T.startCash).toFixed(2),bench:+pct(bench(),T.startCash).toFixed(2),failed:S.failed,fees:Math.round(S.fees),orders:S.orders,calls:S.calls.map(c=>({s:S.W.codes[c.k],d:c.dir,wk:c.wk,pat:c.pat,res:c.res||"open"})),baseline:S.base})}
function copyReport(){const t=reportText();(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{S.lastMsg="Report copied";render()},()=>{prompt("Copy report",t)})}

/* ---------- tweak menu + presets ---------- */
function presets(){try{return JSON.parse(localStorage.getItem("pfdesk.presets")||"{}")}catch(e){return{}}}
const esc=s=>String(s).replace(/[&<>"']/g,c=>"&#"+c.charCodeAt(0)+";");
function openTweaks(){const P=presets();
  $("modalBody").innerHTML=`<div class="hd">Settings · Tweak (testing)</div><div class="dim" style="margin:4px 0">Build ${BUILD} · data ${dataSource()} · seed ${S.seed}. Apply starts a new period.</div>
  <div class="tw">${Object.keys(DEFAULTS).map(k=>`<label for="tw_${k}">${TWEAK_LABELS[k]} <span class="dim">(${DEFAULTS[k]})</span></label><input id="tw_${k}" type="number" step="any" value="${T[k]}" class="${+T[k]!==DEFAULTS[k]?"chg":""}">`).join("")}
  <label for="tw_seed">Seed</label><input id="tw_seed" type="number" value="${S.seed}"></div>
  <div class="row"><div class="btn go" onclick="applyTweaks()">APPLY + NEW PERIOD</div><div class="btn" onclick="T=Object.assign({},DEFAULTS);openTweaks()">DEFAULTS</div></div>
  <div class="hd" style="margin-top:8px">Presets</div>
  <div class="row"><div class="btn" onclick="savePreset()">SAVE PRESET</div><div class="btn" onclick="copyPreset()">COPY PRESET CODE</div><div class="btn" onclick="copyReport()">COPY REPORT</div></div>
  ${Object.keys(P).map((n,ix)=>`<div class="row"><span style="flex:2;align-self:center">${esc(n)}</span><div class="btn" onclick="loadPreset(${ix})">LOAD</div><div class="btn" onclick="delPreset(${ix})">DELETE</div></div>`).join("")}
  <div class="row"><div class="btn" onclick="$('modal').classList.remove('on')">CLOSE</div></div>`;
  $("modal").classList.add("on")}
function readTweaks(){const o={};Object.keys(DEFAULTS).forEach(k=>{const v=parseFloat($("tw_"+k).value);o[k]=isNaN(v)?DEFAULTS[k]:v});o.weeks=Math.max(1,Math.round(o.weeks));o.preWeeks=Math.max(30,Math.round(o.preWeeks));o.reversal=Math.max(1,Math.round(o.reversal));o.boxPct=Math.max(0.25,o.boxPct);return o}
function applyTweaks(){T=readTweaks();try{localStorage.setItem("pfdesk.tweaks",JSON.stringify(T))}catch(e){}const sd=parseInt($("tw_seed").value)||S.seed;$("modal").classList.remove("on");newPeriod(sd)}
function savePreset(){const n=prompt("Preset name");if(!n)return;const P=presets();P[n]=readTweaks();try{localStorage.setItem("pfdesk.presets",JSON.stringify(P))}catch(e){}openTweaks()}
function loadPreset(ix){const P=presets(),n=Object.keys(P)[ix];T=Object.assign({},DEFAULTS,P[n]);openTweaks()}
function delPreset(ix){const P=presets(),n=Object.keys(P)[ix];delete P[n];try{localStorage.setItem("pfdesk.presets",JSON.stringify(P))}catch(e){}openTweaks()}
function copyPreset(){const t="PFDESK-PRESET:"+btoa(JSON.stringify(readTweaks()));(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).catch(()=>prompt("Preset code",t))}
