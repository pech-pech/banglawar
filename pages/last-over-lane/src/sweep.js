const fs=require('fs');const src=fs.readFileSync(process.argv[2],'utf8');
const core=src.split('// CORE-START')[1].replace(/^[^\n]*/,'').split('// CORE-END')[0];
const LOL=new Function('module',core+';return LOL;')({});
function gauss(r){let u=0,v=0;while(!u)u=r();v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function play(seed,policy,sd,perfectMs){const m=LOL.newMatch(seed),r=LOL.rng(seed*7+3);
 while(!m.done){const d=m.balls[m.i],f=LOL.fieldFor(m);const c=policy(d,f,m,r);
  const off=c.leave?null:gauss(r)*sd;LOL.step(m,{intent:c.intent,sector:c.leave?null:c.sector,offsetMs:off},{perfectMs});}
 return m;}
const open=f=>LOL.SECTORS.filter(s=>!f.guard[s]&&s!=='loft')[0]||(f.guard.loft?'straight':'loft');
const P={
 idle:()=>({leave:true}),
 naive:(d,f,m,r)=>({intent:['block','rotate','drive','slog'][r()*4|0],sector:LOL.SECTORS[r()*4|0]}),
 rote:(d,f)=>({intent:'drive',sector:'straight'}),
 skilled:(d,f,m)=>{if(d==='swing')return{leave:true};const o=open(f);const need=TARGET-m.runs,left=12-m.i;
   if(f.guard[o])return{intent:'rotate',sector:'leg'};
   return{intent:d==='slower'?'rotate':(o==='loft'||need/left>2.2?'drive':'drive'),sector:o};},
};
const N=400;
if(process.argv[3]==='grid'){let best=null;const out=[];
 for(const sec of LOL.SECTORS)for(const it of ['block','rotate','drive','slog']){let w=0;for(let sd=1;sd<=N;sd++){w+=play(sd,()=>({intent:it,sector:sec}),55,60).won;}
  out.push([sec,it,100*w/N]);}
 out.sort((a,b)=>b[2]-a[2]);console.log('rote grid (sd55, 60ms, '+N+' seeds), top 6:');out.slice(0,6).forEach(r=>console.log('  '+r[1]+' -> '+r[0]+': '+r[2].toFixed(1)+'%'));process.exit(0);}const TARGET=LOL.MATCH.target;
for(const pm of [60,40])for(const [name,sd] of [['idle',0],['naive',90],['rote',55],['skilled',55],['skilled',40],['skilled',70]]){
 let w=0,runs=0;for(let s=1;s<=N;s++){const m=play(s,P[name],sd,pm);w+=m.won;runs+=m.runs;}
 console.log(`perfect ${pm}ms  ${name.padEnd(8)} sd${sd}: win ${(100*w/N).toFixed(1)}%  avg runs ${(runs/N).toFixed(1)}  (${N} seeds)`);}
