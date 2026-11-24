// Tiny static server for the chart-school folder. Usage: node test/serve.js [port]
// In node: const {start} = require('./serve'); const srv = await start(0); srv.port; srv.close()
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..'); // pages/ so ../_shared/ resolves
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8'
};

function handler(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err && p.endsWith('/version.json')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"build":"__PGS_BUILD__"}'); } // stamped at deploy (tools/stamp_build.py)
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

function start(port) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(port || 0, '127.0.0.1', () => {
      resolve({ port: server.address().port, close: () => new Promise(r => server.close(r)) });
    });
  });
}

module.exports = { start };

if (require.main === module) {
  start(Number(process.argv[2]) || 8077).then(s => console.log('serving ' + ROOT + ' on http://127.0.0.1:' + s.port + '/'));
}
