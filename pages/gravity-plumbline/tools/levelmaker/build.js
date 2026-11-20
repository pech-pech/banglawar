#!/usr/bin/env node
// Builds a single self-contained level maker page: index.html with
// <script src="mapfmt.js"></script> replaced by the inline contents of mapfmt.js.
// Usage: node build.js [outPath]
'use strict';
var fs = require('fs');
var path = require('path');

var here = __dirname;
var DEFAULT_OUT = '/mnt/project-files/games-design/plumbline/2026-11-20-endless/level-maker/starfall-level-maker.html';
var out = process.argv[2] || DEFAULT_OUT;

var html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
var lib = fs.readFileSync(path.join(here, 'mapfmt.js'), 'utf8');

var TAG = '<script src="mapfmt.js"></script>';
var parts = html.split(TAG);
if (parts.length !== 2) {
  throw new Error('expected exactly one ' + TAG + ' in index.html, found ' + (parts.length - 1));
}
// Guard against the inlined code closing the enclosing script element early.
var safeLib = lib.split('</script').join('<\\/script');

var built = parts[0] + '<script>\n' + safeLib + '\n</script>' + parts[1];

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, built, 'utf8');
console.log('wrote ' + out + ' (' + Buffer.byteLength(built, 'utf8') + ' bytes)');
