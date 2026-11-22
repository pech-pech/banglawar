"use strict";
// K1: vm loader. load({data:true|false}) -> {run, ctx, decode, root}
const fs=require("fs"),path=require("path"),vm=require("vm");
const ROOT=path.resolve(__dirname,"..");
const ORDER=["core.js","data.js","pnf.js","evcalc.js","evidence.js","game.js","bots.js"];
const OPTIONAL=new Set(["evcalc.js","evidence.js"]); // may be absent while makers land; extras are always optional
function decode(j){ // independent decoder per CONTRACT v1 -> [{id,k,f,o,h,l,c,v}] prices
  return j.series.map(s=>{
    const n=s.c.length,o=[],h=[],l=[],c=[],v=[];let u=0;
    for(let i=0;i<n;i++){u+=s.c[i];const cu=u;
      c.push(Math.exp(cu/2000));o.push(Math.exp((cu+s.o[i])/2000));
      h.push(Math.exp((cu+s.h[i])/2000));l.push(Math.exp((cu+s.l[i])/2000));
      v.push(Math.max(0,Math.exp(s.v[i]/100)-1))}
    return{id:s.id,k:s.k,f:s.f,o,h,l,c,v}});
}
function load(opt){
  opt=opt||{};const want=opt.data!==false;
  const store={};
  const jsonPath=path.join(ROOT,"data","weekly.json");
  const rawText=want?fs.readFileSync(jsonPath,"utf8"):null;
  const ls={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
  const noop=()=>{};
  const el=()=>new Proxy(function(){},{get:(t,p)=>p==="style"?{}:p==="classList"?{add:noop,remove:noop,toggle:noop,contains:()=>false}:el(),apply:()=>el(),set:()=>true});
  const sandbox={console,Math,JSON,Object,Array,Number,String,Set,Map,Promise,Date,Error,isFinite,parseFloat,parseInt,
    localStorage:ls,
    document:{getElementById:()=>el(),querySelector:()=>el(),querySelectorAll:()=>[],createElement:()=>el(),addEventListener:noop,body:el(),documentElement:el()},
    fetch:async()=>{if(!want)throw new Error("no data");return{ok:true,status:200,json:async()=>JSON.parse(rawText),text:async()=>rawText}},
    setTimeout,clearTimeout,performance:{now:()=>0},
    render:noop,BUILD:"test",navigator:{}};
  sandbox.window=sandbox;sandbox.self=sandbox;sandbox.innerWidth=400;sandbox.innerHeight=800;sandbox.addEventListener=noop;sandbox.scrollTo=noop;
  const ctx=vm.createContext(sandbox);
  const extra=Array.isArray(opt.extra)?opt.extra:[];
  for(const f of ORDER.concat(extra)){
    const p=path.join(ROOT,"src",f);
    if(!fs.existsSync(p)){
      if(OPTIONAL.has(f)||extra.includes(f)){console.warn("warn: skipping missing src/"+f);continue}
      throw new Error("missing src/"+f)}
    try{vm.runInContext(fs.readFileSync(p,"utf8"),ctx,{filename:f})}
    catch(e){if(f==="game.js"){console.warn("warn: game.js failed to load in vm: "+e.message)}else throw e}
  }
  const run=code=>vm.runInContext(code,ctx);
  const api={ctx,run,decode,root:ROOT,rawText,
    async init(){if(want){await run("loadData()")}return api}};
  return api;
}
module.exports={load,decode,ROOT};
