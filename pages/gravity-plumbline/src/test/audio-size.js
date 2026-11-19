// node src/test/audio-size.js - fails (exit 1) if audio.js + music-data.js + music.js together exceed 80 KB raw or 30 KB gzipped.
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const FILES = ['audio.js', 'music-data.js', 'music.js'], RAW = 80 * 1024, GZ = 30 * 1024;
let raw = 0, gz = 0;
const all = [];
for (const f of FILES) {
  const b = fs.readFileSync(path.join(__dirname, '../parts', f)); raw += b.length; all.push(b);
  const z = zlib.gzipSync(b).length; gz += z; console.log(f.padEnd(14), String(b.length).padStart(7), 'B raw', String(z).padStart(7), 'B gzip');
}
console.log('TOTAL'.padEnd(14), String(raw).padStart(7), 'B raw (limit ' + RAW + ')', String(gz).padStart(7), 'B gzip (limit ' + GZ + ')');
if (raw > RAW || gz > GZ) { console.error('audio-size FAIL'); process.exit(1); }
console.log('audio-size OK');
