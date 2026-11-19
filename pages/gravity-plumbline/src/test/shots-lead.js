const {chromium}=require('playwright');const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..');
const srv=http.createServer((q,r)=>{let f=path.join(root,q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();}else{r.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream'});r.end(d);}});}).listen(0,async()=>{
 const port=srv.address().port;const b=await chromium.launch();
 for(const [w,h] of [[475,638],[344,882]]){
  const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto('http://localhost:'+port+'/index.html');await p.waitForTimeout(500);
  await p.screenshot({path:`/tmp/pl-menu-${w}.png`});
  for(const [mode,seed,room] of [['tutorial',1,1],['tutorial',1,2],['tutorial',1,3],['shaft',7,4]]){
    await p.evaluate(([m,s,r])=>{PL_TEST.startMode(m,s);PL_TEST.room(r)},[mode,seed,room]);await p.waitForTimeout(900);
    await p.screenshot({path:`/tmp/pl-${mode}-${room}-${w}.png`});}
  console.log(w,'errs',JSON.stringify(errs));
 }
 await b.close();srv.close();});
