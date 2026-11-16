const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch(); const pg=await b.newPage();
  await pg.addInitScript(()=>{ window.requestAnimationFrame=()=>0; });
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto('file:///home/user/mm-unity/parity/oracle/mixer-mad-v7h.html'); await pg.waitForTimeout(1000);
  const out=await pg.evaluate(()=>{
    const r={};
    r.paused=paused; r.acc=acc; r.skin=combo3.skin; r.hasSPRM=Object.keys(SPRM).length;
    r.geo={};
    for(const v of ['mixer','digger','dump','dozer','crane','roller']){ vehicle=v; const g=vehGeom(v); r.geo[v]=g?{pts:g.pts,r4:g.r4,r5:g.r5,np:g.probes.length,topY:g.topY}:null; }
    r.skinGeo=[]; for(let s=0;s<4;s++){ combo3.skin=s; vehicle='mixer'; const g=vehGeom('mixer'); r.skinGeo.push(JSON.stringify(g.probes)+JSON.stringify(g.pts)); }
    r.skinSame=r.skinGeo.every(x=>x===r.skinGeo[0]); delete r.skinGeo;
    // step count check
    let calls=0; const o=window.step; window.step=function(){calls++; return o();};
    mode='classic'; vehicle='mixer'; startLevel(0); for(let i=0;i<100;i++){ input.gas=true; tick(DT);} r.calls=calls; r.state=state; r.x=truckX();
    r.toyOK=toyOK(); r.FT=!!window.FT;
    return r;
  });
  console.log(JSON.stringify(out).slice(0,3000), errs.slice(0,3));
  await b.close();
})();
