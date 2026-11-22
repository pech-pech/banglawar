"use strict";
// e2e for Stock Terminal UI v2 (ids only). Run: node test/e2e.js
const {chromium}=require("playwright");
const path=require("path"),fs=require("fs");
const {start}=require("./serve.js");
const VPS=[[344,882],[624,912],[816,568]];
const SHOTS=path.resolve(__dirname,"..","qa","shots");
fs.mkdirSync(SHOTS,{recursive:true});
const rows=[];
const rec=(vp,step,ok,info)=>rows.push({vp,step,ok:!!ok,info:String(info||"")});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ORDER_IDS=["sideBuy","sideSell","viewBull","viewBear","viewNeut","qtyMinus","qtyVal","qtyPlus","qty25","qty50","qtyMax","baseLine","noViewLine","capCheck","floorCheck","orderMsg","btnCancel","btnPlace"];
const SNAP="JSON.stringify({e:S.eqHist,c:S.calls.map(c=>[c.s,c.wk,c.view,c.res])})";

async function run(browser,url,w,h){
  const vp=w+"x"+h;
  const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const errs=[];
  page.on("pageerror",e=>errs.push("pageerror: "+e.message));
  page.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text())});
  const shot=n=>page.screenshot({path:path.join(SHOTS,vp+"-"+n+".png")}).catch(()=>{});
  const step=async(name,fn)=>{try{const r=await fn();rec(vp,name,r===undefined||r===true,r===false?"false":"")}catch(e){rec(vp,name,false,e.message.split("\n")[0])}};
  const click=async(id,t)=>{await page.locator("#"+id).click({timeout:t||4000});await sleep(80)};
  const has=id=>page.locator("#"+id).count().then(n=>n>0);
  const noH=async()=>{const m=await page.evaluate(()=>{const s=document.scrollingElement;return s.scrollWidth<=innerWidth?"":"scrollWidth "+s.scrollWidth+" > "+innerWidth});if(m)throw new Error(m)};
  // returns "" when all given ids are fully inside the viewport
  const inView=ids=>page.evaluate(ids=>{const bad=[];for(const id of ids){const e=document.getElementById(id);if(!e){bad.push(id+":missing");continue}
    if(id==="orderMsg"&&!e.textContent.trim())continue; // empty status line is hidden by design
    const r=e.getBoundingClientRect();if(r.width<=0||r.height<=0||r.left<-0.5||r.right>innerWidth+0.5||r.top<-0.5||r.bottom>innerHeight+0.5)bad.push(id+"@"+[r.left,r.top,r.right,r.bottom].map(Math.round))}
    return bad.join(";")},ids);
  const needIn=async ids=>{const m=await inView(ids);if(m)throw new Error(m)};

  // scripted game: from home with fresh period. first=true adds checks+shots.
  async function script(first){
    const chk=(name,fn)=>first?step(name,fn):fn();
    await chk("home",async()=>{await page.waitForSelector("#card-0",{timeout:8000});
      if(await has("noteDismiss"))await click("noteDismiss");
      await noH();
      if(await page.evaluate(()=>S.screen)!=="home")throw new Error("screen!=home");
      const t=await page.evaluate(()=>(document.getElementById("buildId")||{}).textContent||"");
      if(!t.includes("st-ui2-1"))throw new Error("buildId='"+t+"'");
      await shot("home")});
    if(first&&w===816)await step("home 6 cards in viewport",async()=>{
      const m=await page.evaluate(()=>{const bad=[];for(let i=0;i<6;i++){const e=document.getElementById("card-"+i);if(!e){bad.push(i+":missing");continue}const r=e.getBoundingClientRect();
        if(r.top<0||r.bottom>innerHeight+0.5||r.left<0||r.right>innerWidth+0.5)bad.push(i+"@"+[r.top,r.bottom].map(Math.round))}
        return bad.join(";")+(scrollY?" scrollY="+scrollY:"")});
      if(m)throw new Error(m)});
    await chk("chart open",async()=>{await click("card-0");await page.waitForSelector("#pfCard #pf",{timeout:5000});
      if(await page.evaluate(()=>S.screen)!=="chart")throw new Error("screen!=chart");
      await noH();await sleep(150);await shot("chart")});
    if(first&&w===344)await step("chart panes above bar",async()=>{
      const m=await page.evaluate(()=>{const bar=document.getElementById("bar").getBoundingClientRect().top;const bad=[];
        for(const id of ["pfCard","rsiCard","macdCard"]){const e=document.getElementById(id);if(!e){bad.push(id+":missing");continue}const b=e.getBoundingClientRect().bottom;if(b>bar+0.5)bad.push(id+" bottom "+Math.round(b)+" > bar "+Math.round(bar))}
        return bad.join(";")});
      if(m)throw new Error(m)});
    if(first)await step("chart ids",async()=>{for(const id of ["btnBack","btnPrev","btnNext","rsiCard","macdCard","volCard","evLine","btnHome","btnTrade"])if(!await has(id))throw new Error("missing #"+id)});
    await chk("order sheet open",async()=>{await click("btnTrade");await page.waitForSelector("#btnPlace",{state:"visible",timeout:4000});await sleep(300);
      await noH();await shot("order")});
    if(first)await step("order ids in viewport",async()=>{await needIn(ORDER_IDS)});
    if(first&&w===344)await step("btnCancel/btnPlace in viewport",async()=>{await needIn(["btnCancel","btnPlace"])});
    await chk("buy bullish",async()=>{await click("viewBull");await click("qtyPlus");await click("btnPlace");await sleep(150);
      const r=await page.evaluate(()=>({pos:S.pos[S.sel],v:S.views[S.sel],sheet:S.sheet,msg:S.lastMsg}));
      if(r.v!==1)throw new Error("view="+r.v);
      if(!(r.pos>0))throw new Error("pos="+r.pos+" msg="+r.msg);
      if(r.sheet)throw new Error("sheet still "+r.sheet)});
    await chk("sell",async()=>{const p0=await page.evaluate(()=>S.pos[S.sel]);
      await click("btnTrade");await page.waitForSelector("#sideSell",{state:"visible"});await click("sideSell");await click("qtyPlus");await click("btnPlace");await sleep(150);
      const r=await page.evaluate(()=>({pos:S.pos[S.sel],msg:S.lastMsg}));
      if(!(r.pos<p0))throw new Error("pos "+p0+" -> "+r.pos+" msg="+r.msg)});
    await chk("back home",async()=>{if(await page.evaluate(()=>S.sheet))await click("btnCancel");
      await click(await has("btnHome")?"btnHome":"btnBack");await page.waitForSelector("#btnAdvance",{timeout:4000});await noH()});
    await chk("advance x10",async()=>{
      for(let wk=0;wk<10;wk++){
        await click("btnAdvance");await page.waitForSelector("#btnContinue",{state:"visible",timeout:4000});await sleep(150);
        if(first){await noH();if(wk===0){await shot("week");if(!await has("wkTitle"))throw new Error("no #wkTitle");if(!await has("btnCopy"))throw new Error("no #btnCopy in week");
          const m=await inView(["btnContinue"]);if(m)throw new Error(m)}}
        await click("btnContinue");await sleep(100);
      }
      const r=await page.evaluate(()=>({wk:S.week,scr:S.screen,sheet:S.sheet}));
      if(r.wk<10)throw new Error("week="+r.wk);
      if(r.scr!=="review")throw new Error("screen="+r.scr+" sheet="+r.sheet)});
    await chk("review",async()=>{await page.waitForSelector("#tabPeriod",{timeout:4000});await sleep(250);await noH();
      for(const id of ["tabJournal","btnRerun","btnCopy","btnNextPeriod"])if(!await has(id))throw new Error("missing #"+id);
      await needIn(["btnRerun","btnCopy","btnNextPeriod"]);await shot("review")});
    if(first)await step("journal tab",async()=>{await click("tabJournal");await sleep(200);await noH();
      if(!await has("btnResetJournal"))throw new Error("no #btnResetJournal");
      if(await page.evaluate(()=>S.tab)!=="journal")throw new Error("S.tab");
      await shot("journal");await click("tabPeriod")});
    return page.evaluate(SNAP);
  }

  let A=null;
  try{
    await step("load",async()=>{await page.goto(url+"index.html");await page.evaluate(()=>{try{localStorage.clear()}catch(e){}});
      await page.reload();await page.waitForSelector("#card-0",{timeout:10000});await sleep(300)});
    await step("noteDismiss",async()=>{if(await has("noteDismiss"))await click("noteDismiss");await sleep(100)});
    A=await script(true);
    await step("record A",async()=>{const o=JSON.parse(A);if(!o.e.length||!o.c.length)throw new Error("empty eqHist/calls")});
    await step("rerun determinism",async()=>{
      await click("btnRerun");await page.waitForSelector("#card-0",{timeout:5000});
      const B=await script(false);
      if(A!==B)throw new Error("differs A="+A.slice(0,80)+" B="+B.slice(0,80))});
    await step("settings modal",async()=>{
      await page.evaluate(()=>{window.scrollTo(0,0)});
      await click("devBadge");await page.waitForSelector("#modal.on",{timeout:3000});
      const t=await page.locator("#modal").innerText();if(!t.includes("st-ui2-1"))throw new Error("BUILD missing in Settings");
      await page.evaluate(()=>{const m=document.getElementById("modal");const b=[...m.querySelectorAll("button")].find(x=>/close|done|ok/i.test(x.textContent));if(b)b.click();else m.classList.remove("on")});
      await sleep(150)});
  }catch(e){rec(vp,"harness",false,e.message.split("\n")[0])}
  rec(vp,"no page errors",errs.length===0,errs.slice(0,3).join(" || "));
  await ctx.close();
}
(async()=>{
  const srv=await start();
  const browser=await chromium.launch();
  for(const [w,h] of VPS){try{await run(browser,srv.url,w,h)}catch(e){rec(w+"x"+h,"harness",false,e.message)}}
  await browser.close();await srv.close();
  const wN=Math.max(...rows.map(r=>r.step.length));
  console.log("vp".padEnd(9)+"step".padEnd(wN+1)+"ok    info");
  for(const r of rows)console.log(r.vp.padEnd(9)+r.step.padEnd(wN+1)+(r.ok?"PASS  ":"FAIL  ")+r.info);
  const f=rows.filter(r=>!r.ok).length;
  console.log(f?`FAILED ${f}/${rows.length}`:`ALL PASS ${rows.length}`);
  process.exit(f?1:0);
})();
