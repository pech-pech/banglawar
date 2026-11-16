// does a V8-style Kahan hypot emulation match Math.hypot bit-for-bit? and how does naive sqrt(x*x+y*y) differ?
function hyp2(a,b){ a=Math.abs(a); b=Math.abs(b); const mx=Math.max(a,b); if(mx===0) return 0; let sum=0, comp=0; for(const v of [a,b]){ const n=v/mx; const s=n*n-comp; const p=sum+s; comp=(p-sum)-s; sum=p; } return Math.sqrt(sum)*mx; }
let bad=0, naive=0, N=2e6; let s=12345; const r=()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; };
for(let i=0;i<N;i++){ const a=(r()-.5)*(r()<.5?0.1:8), b=(r()-.5)*(r()<.5?0.1:8); const h=Math.hypot(a,b); if(h!==hyp2(a,b)) bad++; if(h!==Math.sqrt(a*a+b*b)) naive++; }
console.log({N,emulationMismatch:bad,naiveMismatch:naive, pct:(naive/N*100).toFixed(2)});
