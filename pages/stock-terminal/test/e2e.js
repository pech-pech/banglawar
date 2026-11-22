"use strict";
const {chromium}=require("playwright");
const path=require("path"),fs=require("fs");
const {start}=require("./serve.js");
const VPS=[[344,882],[475,638],[624,912],[704,783],[816,568]];
const SHOTS=path.resolve(__dirname,"..","qa","shots");
fs.mkdirSync(SHOTS,{recursive:true});
const rows=[];
const rec=(vp,name,ok,info)=>rows.push({vp,name,ok:!!ok,info:ok?"":String(info||"")});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(browser,url,w,h){
  const vp=w+"x"+h;
  const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const errs=[];
  page.on("pageerror",e=>errs.push("pageerror: "+e.message));
  page.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text())});
  const shot=n=>page.screenshot({path:path.join(SHOTS,vp+"-"+n+".png")});
  const ALT={"ADVANCE WEEK":"ADVANCE(?: WEEK)?","PLACE ORDER":"PLACE(?: ORDER)?"};
  const btn=t=>page.locator(".bar .btn").filter({hasText:new RegExp("^\\s*"+(ALT[t]||t)+"\\s*$")}).first();
  const step=async(name,fn)=>{try{const r=await fn();rec(vp,name,r===undefined||r===true,r===false?"false":"")}catch(e){rec(vp,name,false,e.message.split("\n")[0])}};
  const btnVis=async()=>page.evaluate(()=>{
    const bad=[];document.querySelectorAll(".bar .btn").forEach(b=>{const r=b.getBoundingClientRect();
      if(r.width<=0||r.height<=0||r.left<0||r.right>innerWidth+0.5||r.top<0||r.bottom>innerHeight+0.5)bad.push(b.textContent.trim()+"@"+[r.left,r.top,r.right,r.bottom].map(Math.round))});
    return bad.length?bad.join(";"):""});
  const noScroll=async()=>page.evaluate(()=>{const s=document.scrollingElement;return s.scrollWidth<=innerWidth?"":"scrollWidth "+s.scrollWidth+" > "+innerWidth});
  await step("load",async()=>{await page.goto(url+"index.html");await page.waitForSelector("tr.rowlink",{timeout:10000});await sleep(300)});
  await step("watch no-hscroll",async()=>{const m=await noScroll();if(m)throw new Error(m)});
  await step("watch bar visible",async()=>{const m=await btnVis();if(m)throw new Error(m)});
  await step("watch shot",async()=>{await shot("watch")});
  await step("charts x6",async()=>{
    for(let k=0;k<6;k++){
      await page.locator("tr.rowlink").nth(k).click();await page.waitForSelector(".panel pre");await sleep(120);
      const r=await page.evaluate(()=>{const pre=document.querySelector(".panel pre"),p=pre.closest(".panel");return{pw:pre.scrollWidth,cw:p.clientWidth,pre:pre.clientWidth}});
      if(r.pw>r.cw+1)throw new Error("row "+k+": pre "+r.pw+" > panel "+r.cw);
      const ns=await noScroll();if(ns)throw new Error("row "+k+": "+ns);
      const bv=await btnVis();if(bv)throw new Error("row "+k+" bar: "+bv);
      if(k===0)await shot("chart");
      await btn("WATCHLIST").click();await page.waitForSelector("tr.rowlink");
    }});
  await step("order BUY",async()=>{
    await page.locator("tr.rowlink").nth(0).click();await page.waitForSelector(".panel pre");
    await page.locator(".fr .btn",{hasText:/^\+$/}).first().click();
    await btn("PLACE ORDER").click();await sleep(150);
    const t=await page.locator(".msg").first().textContent();
    if(/^\s*Rej/.test(t))throw new Error("rejected: "+t);
    const pos=await page.evaluate(()=>S.pos[S.sel]);if(!(pos>0))throw new Error("pos="+pos+" msg="+t)});
  await step("set view",async()=>{await page.locator(".fr .btn",{hasText:"Bullish"}).first().click();
    const v=await page.evaluate(()=>S.views[S.sel]);if(v!==1)throw new Error("view="+v)});
  let gotReport=false,gotReview=false;
  await step("advance x10 to review",async()=>{
    for(let g=0;g<40;g++){
      const txt=await page.locator(".bar .btn").allTextContents().then(a=>a.map(s=>s.trim()));
      if(txt.includes("PERIOD REVIEW")){
        if(!gotReport){gotReport=true;await shot("report")}
        await btn("PERIOD REVIEW").click();gotReview=true;break}
      if(txt.some(x=>/^ADVANCE(?: WEEK)?$/.test(x)))await btn("ADVANCE WEEK").click();
      else if(txt.includes("CHARTS")){if(!gotReport){gotReport=true;await shot("report")}await btn("CHARTS").click()}
      else throw new Error("stuck, bar="+txt.join("|"));
      await sleep(80);
    }
    if(!gotReview)throw new Error("never reached PERIOD REVIEW");
    const wk=await page.evaluate(()=>S.week);if(wk<10)throw new Error("week="+wk)});
  await step("review baseline",async()=>{await sleep(200);
    const t=await page.evaluate(()=>document.body.innerText);
    if(!/baseline/i.test(t))throw new Error("no 'baseline' text in review");
    const m=await noScroll();if(m)throw new Error(m);
    const bv=await btnVis();if(bv)throw new Error(bv);
    await shot("review")});
  await step("settings modal",async()=>{
    await btn("SETTINGS").click().catch(async()=>{await page.evaluate(()=>openTweaks())});
    await page.waitForSelector("#modal.on",{timeout:3000});
    const t=await page.locator("#modal").innerText();if(!/st-slice-1/.test(t))throw new Error("BUILD id missing in Settings");
    await page.locator("#modal .btn",{hasText:/^CLOSE$/}).first().click();
    await page.waitForSelector("#modal.on",{state:"detached"}).catch(()=>{});
    const on=await page.evaluate(()=>document.getElementById("modal").classList.contains("on"));if(on)throw new Error("modal still open")});
  rec(vp,"no page errors",errs.length===0,errs.slice(0,3).join(" || "));
  await ctx.close();
}
(async()=>{
  const srv=await start();
  const browser=await chromium.launch();
  for(const [w,h] of VPS){try{await run(browser,srv.url,w,h)}catch(e){rec(w+"x"+h,"harness",false,e.message)}}
  await browser.close();await srv.close();
  const wN=Math.max(...rows.map(r=>r.name.length));
  for(const r of rows)console.log((r.ok?"PASS ":"FAIL ")+r.vp.padEnd(8)+r.name.padEnd(wN+1)+r.info);
  const f=rows.filter(r=>!r.ok).length;
  console.log(f?`FAILED ${f}/${rows.length}`:`ALL PASS ${rows.length}`);
  process.exit(f?1:0);
})();
