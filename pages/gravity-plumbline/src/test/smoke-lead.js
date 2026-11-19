const {chromium}=require('playwright');const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..');
const srv=http.createServer((q,r)=>{let f=path.join(root,q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();}else{r.writeHead(200);r.end(d);}});}).listen(0,async()=>{
 const port=srv.address().port;const b=await chromium.launch();
 for(const [w,h] of [[475,638],[344,882]]){
  const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  const errs=[];p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
  await p.goto('http://localhost:'+port+'/index.html');await p.waitForTimeout(1200);
  console.log(w+'x'+h,'errs',JSON.stringify(errs),'PL_TEST',await p.evaluate(()=>typeof window.PL_TEST));
  await p.screenshot({path:'/tmp/pl-lead-'+w+'.png'});
 }
 await b.close();srv.close();});
