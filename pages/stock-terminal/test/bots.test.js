"use strict";
const assert=require("assert");
const {load}=require("./_load.js");
let fails=0;
function t(name,fn){return Promise.resolve().then(fn).then(()=>console.log("ok   "+name),e=>{fails++;console.log("FAIL "+name+"\n     "+(e&&e.message||e))})}
(async()=>{
const N=24;
for(const real of [true,false]){
  const c=await load({data:real}).init();
  c.run("T.baselineWindows="+N+";T.dataSrc="+(real?1:0));
  const tag=real?"[real] ":"[standin] ";
  let b1,b2;
  await t(tag+"baseline shape: ints 0..100, n==T.baselineWindows, src",()=>{
    b1=c.run("baseline()");
    for(const k of ["cash","rand","lock","signal"]){assert(Number.isInteger(b1[k])&&b1[k]>=0&&b1[k]<=100,k+"="+b1[k])}
    assert.strictEqual(b1.n,N);assert.strictEqual(b1.n,c.run("T.baselineWindows"));
    assert.strictEqual(b1.src,real?"real":"standin");
  });
  await t(tag+"baseline deterministic across runs (and fresh contexts)",()=>{
    b2=c.run("baseline()");assert.strictEqual(JSON.stringify(b2),JSON.stringify(b1));
  });
  await t(tag+"lock bot near 0% (cannot beat benchmark by mandate)",()=>{assert(b1.lock<=2,"lock="+b1.lock)});
  await t(tag+"baselineHTML returns non-empty string",()=>{const h=c.run("baselineHTML(baseline())");assert(typeof h==="string"&&h.length>0)});
  if(real)await t("[real] deterministic in a second fresh context",async()=>{
    const d=await load({data:true}).init();d.run("T.baselineWindows="+N);assert.strictEqual(JSON.stringify(d.run("baseline()")),JSON.stringify(b1))});
}
console.log(fails?fails+" FAILED":"all passed");process.exit(fails?1:0);
})();
