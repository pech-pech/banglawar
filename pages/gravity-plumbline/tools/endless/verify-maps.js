const fs=require('fs');const M=require('../../tools/levelmaker/mapfmt.js');const V=require('../../tools/endless/verify.js');const C=require('../../tools/endless/chunks.js');
const maps=M.parseReport(fs.readFileSync(process.argv[2],'utf8'));
for(const m of maps){const room=M.withBorder(M.gridToRoom(m.rows,m.name));console.log(m.name,'warn',M.validate(m.rows),'padClean',C.isPadClean(m.rows));
for(const tier of [1,2,3]){const r=V.verifyRoom(room,{tier,seeds:200,maxInputs:+(process.env.MAXINPUTS||8)});console.log('tier',tier,JSON.stringify({solvable:r.solvable,inputs:r.inputs,minWin:r.minWindowTicks,windowOk:r.windowOk,jitter:r.jitterClear,feat:r.features,ms:Math.round(r.ms),route:r.route}));if(!r.solvable)break;}}
