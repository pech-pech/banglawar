"use strict";
const fs=require("fs"),vm=require("vm"),path=require("path");
const root=path.join(__dirname,"..","src");
const store={};
const ctx={console,Math,JSON,localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}}};
vm.createContext(ctx);
vm.runInContext("var EVSTUB={v:1,src:'standin',base:{bull:0.64,bear:0.36,n:100}};function evNow(){return EVSTUB}",ctx);
for(const f of["core.js","evidence.js"])vm.runInContext(fs.readFileSync(path.join(root,f),"utf8"),ctx,{filename:f});
const R=e=>vm.runInContext(e,ctx);
let fails=0;
const ok=(c,m)=>{if(!c){fails++;console.log("FAIL "+m)}};
const near=(a,b,m)=>ok(Math.abs(a-b)<1e-9,m+" ("+a+" vs "+b+")");
const mk=(i,view,res,o)=>Object.assign({id:"s:"+i,view,res,withSig:null,fresh:false,sig:null},o||{});

ok(R("baseFor(1)")===0.64&&R("baseFor(-1)")===0.36,"base read from evNow stub");
R("EVSTUB.base={bull:0.7,bear:0.3,n:1}");near(R("baseFor(1)"),0.7,"base follows evNow");near(R("baseFor(-1)"),0.3,"bear follows");
R("EVSTUB.base={bull:0.64,bear:0.36,n:100}");

ctx.c1=[mk(1,1,"right"),mk(2,1,"wrong"),mk(3,-1,"right"),mk(4,-1,"wrong"),mk(5,1,"right",{base:0.5}),mk(6,0,undefined),mk(7,1,undefined)];
let s=R("callStats(c1)");
ok(s.closed===5&&s.right===3,"closed/right, neutral+open excluded");
near(s.exp,0.64+0.64+0.36+0.36+0.5,"exp sum (call.base wins)");
near(s.edge,3-s.exp,"edge");
near(s.sd,Math.sqrt(2*.64*.36+2*.36*.64+.25),"sd");
ok(s.band===null&&s.verdict==="too few to tell","no band under 30");
s=R("callStats(c1,29)");ok(s.band===null&&s.verdict==="too few to tell","29 -> too few");
s=R("callStats(c1,30)");ok(s.band&&Math.abs(s.band[1]-s.band[0]-2*1.96*s.sd)<1e-9,"band at 30");
ok(s.verdict==="at base","at base");
const many=[];for(let i=0;i<40;i++)many.push(mk(i,1,"right"));
ok(R("callStats(c2=null)")&&true,"null calls ok");
ctx.m1=many;s=R("callStats(m1)");ok(s.verdict==="above base"&&s.band[0]>0,"above base (40 closed, nLife default=closed)");
ctx.m2=many.map(c=>Object.assign({},c,{res:"wrong"}));s=R("callStats(m2)");ok(s.verdict==="below base","below base");
ok(R("callStats([],50)").closed===0,"empty");

ctx.c3=[mk(1,1,"right",{withSig:true,fresh:true}),mk(2,1,"wrong",{withSig:true}),mk(3,-1,"right",{withSig:false,fresh:true}),mk(4,1,"wrong",{withSig:false}),mk(5,1,"right"),mk(6,-1,"wrong",{withSig:null})];
const sp=R("splitStats(c3)"),t=R("callStats(c3)");
ok(sp.with.closed===2&&sp.against.closed===2&&sp.none.closed===2,"split counts");
near(sp.with.closed+sp.against.closed+sp.none.closed,t.closed,"split closed sum");
near(sp.with.right+sp.against.right+sp.none.right,t.right,"split right sum");
near(sp.with.exp+sp.against.exp+sp.none.exp,t.exp,"split exp sum");
const fr=R("freshStats(c3)");
ok(fr.fresh.closed===2&&fr.stale.closed===2,"freshStats only calls with sig");

R("journalReset()");ok(R("journalLoad()").length===0,"journal empty");
ok(R("journalAdd({id:'a',view:1,res:'right',sig:'TRIPLE-TOP BUY',withSig:true,fresh:true})")===true,"add");
ok(R("journalAdd({id:'a',view:1,res:'wrong'})")===false,"dedupe");
R("journalAdd({id:'b',view:-1,res:'wrong'})");
ok(R("journalLoad()").length===2&&store["st.journal.v1"],"persisted under key");
let js=R("journalStats()");
ok(js.n===2&&js.all.closed===2&&js.bull.closed===1&&js.bear.closed===1,"journalStats counts");
ok(js.byPat["TRIPLE-TOP BUY"].closed===1&&js.byPat["No signal"].closed===1,"byPat");
ok(js.split.with.closed===1&&js.split.none.closed===1&&js.fresh.fresh.closed===1,"journal split/fresh");
ok(js.all.verdict==="too few to tell","journal verdict few");
R("journalReset()");ok(R("journalStats()").n===0&&!store["st.journal.v1"],"reset");
store["st.journal.v1"]="{bad";ok(R("journalLoad()").length===0,"corrupt storage tolerated");

// liftCls: base bull .64 -> excludes if lo>.64 or hi<.64
ok(R("liftCls({dir:1,lo:.5,hi:.7,lift:1})")==="dim","band includes base -> dim");
ok(R("liftCls({dir:1,lo:.66,hi:.75,lift:4})")==="ok","excludes + positive -> ok");
ok(R("liftCls({dir:1,lo:.5,hi:.6,lift:-8})")==="warn","excludes + negative -> warn");
ok(R("liftCls({dir:-1,lo:.4,hi:.5,lift:6})")==="ok","bear dir uses bear base .36");
ok(R("liftCls({dir:1,lo:.66,hi:.75,lift:0})")==="dim","excludes but lift 0 -> dim");
ok(R("liftCls(null)")==="dim","null dim");

ok(R("liftTxt(3)")==="+3.0 pts"&&R("liftTxt(-1)")==="-1.0 pts"&&R("liftTxt(0)")==="0 pts"&&R("liftTxt(0.04)")==="0 pts","liftTxt");
ok(R("pctTxt(0.642)")==="64%"&&R("pctTxt(0.358)")==="36%","pctTxt");

// no evNow -> 0.5
const c2={localStorage:ctx.localStorage};vm.createContext(c2);
vm.runInContext(fs.readFileSync(path.join(root,"evidence.js"),"utf8"),c2);
ok(vm.runInContext("baseFor(1)",c2)===0.5,"no evNow -> 0.5");
if(fails){console.log(fails+" failed");process.exit(1)}
console.log("evidence.test.js ok");
