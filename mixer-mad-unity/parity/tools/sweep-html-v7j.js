const { chromium } = require('playwright');
const fs=require('fs');
(async()=>{
  const b=await chromium.launch(); const pg=await b.newPage();
  await pg.addInitScript(()=>{ window.requestAnimationFrame=()=>0; });
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto('file:///home/user/mm-unity/parity/oracle/mixer-mad-v7j.html'); await pg.waitForTimeout(1500);
  const out=await pg.evaluate(()=>{
    const VEH=['mixer','digger','dump','dozer','crane','roller'];
    const POL=[]; for(const f of [0.55,0.8,1.0]) for(const m of ['none','brake','pitch']) POL.push({n:`t${f}-${m}`,f,m});
    for(const d of [0.5,0.7,0.85]) POL.push({n:`duty${d}`,duty:d});
    const res=[]; const CAP=120;
    for(const v of VEH) for(let li=0;li<8;li++) for(const pol of POL){
      mode='classic'; combo=null; vehicle=v; startLevel(li);
      let t=0, crashes=0, cx=[], air=0, maxP=0, lastC=run.crashes, pass=false, ft=null, seenCrash=false;
      while(t<CAP){
        const ph=phys(); const pose=truckPose(); const vx=((P[0].x-P[0].px)+(P[1].x-P[1].px))/2/DT; const ang=pose.ang;
        let g=false,br=false;
        if(state==='drive'){
          if(pol.duty!==undefined){ g=((t%0.6)/0.6)<pol.duty; }
          else { const tg=ph.maxV*pol.f; g=vx<tg; if(pol.m==='brake'&&vx>tg+2.5){g=false;br=true;}
            if(pol.m==='pitch'){ if(ang>0.55) g=false; if(vx>tg+2.5&&ang<0.2){g=false;br=true;} } }
        }
        input.gas=g; input.brake=br;
        const s0=state; tick(DT); t+=DT;
        if(state==='drive'||state==='stopping'){ const gr=!!(P[4].c||P[5].c); if(!gr) air+=DT; maxP=Math.max(maxP,Math.abs(truckPose().ang)); }
        if(run.crashes>lastC){ lastC=run.crashes; crashes++; cx.push(+truckX().toFixed(1)); }
        if(state!=='drive'&&state!=='stopping'&&state!=='crashed'){ pass=true; ft=t; break; }
        if(crashes>=8) break;
      }
      res.push({v,li,pol:pol.n,pass,ft,crashes,cx,air:+air.toFixed(2),maxP:+maxP.toFixed(2),t:+t.toFixed(1)});
    }
    return {res,wx:LEVEL_WX,DT,errs:0};
  });
  fs.writeFileSync('/home/user/mm-unity/parity/sweep-html-v7j.json',JSON.stringify(out));
  console.log(out.res.length, out.DT, errs.slice(0,3));
  await b.close();
})();
