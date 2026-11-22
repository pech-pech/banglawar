"use strict";
const http=require("http"),fs=require("fs"),path=require("path");
const ROOT=path.resolve(__dirname,"..");
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png",".svg":"image/svg+xml"};
function start(){return new Promise(res=>{
  const srv=http.createServer((q,r)=>{
    let p=decodeURIComponent(q.url.split("?")[0]);if(p.endsWith("/"))p+="index.html";
    const f=path.join(ROOT,p);
    if(!f.startsWith(ROOT)){r.writeHead(403);return r.end()}
    fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);return r.end("nf")}
      r.writeHead(200,{"Content-Type":MIME[path.extname(f)]||"application/octet-stream","Cache-Control":"no-store"});r.end(b)})});
  srv.listen(0,"127.0.0.1",()=>res({port:srv.address().port,url:"http://127.0.0.1:"+srv.address().port+"/",close:()=>new Promise(x=>srv.close(x))}));
})}
module.exports={start};
if(require.main===module)start().then(s=>console.log(s.url));
