'use strict';
// Loads pages/squad-duel/js/*.js (classic IIFE scripts) into Node: they all attach to globalThis.SD.
// Usage: const { load } = require('./load.js'); const r = load(); // r.missing, r.errors
const fs = require('fs');
const path = require('path');

const JS_DIR = path.resolve(__dirname, '../../pages/squad-duel/js');
// CONTRACT-BUILD section 0 order (UI files are not loaded: Node has no DOM).
const ORDER = ['rng', 'data', 'odds', 'club-ai', 'fx-nodes', 'fx-players', 'engine', 'progress', 'gacha'];

function load() {
  globalThis.SD = globalThis.SD || {};
  const missing = [], errors = [], loaded = [];
  for (const f of ORDER) {
    const p = path.join(JS_DIR, f + '.js');
    if (!fs.existsSync(p)) { missing.push(f + '.js'); continue; }
    try { require(p); loaded.push(f + '.js'); } catch (e) { errors.push({ file: f + '.js', error: String(e && e.stack || e) }); }
  }
  return { SD: globalThis.SD, JS_DIR, ORDER, missing, errors, loaded };
}

module.exports = { load, JS_DIR, ORDER };

if (require.main === module) {
  const r = load();
  console.log('loaded:', r.loaded.join(' ') || '(none)');
  if (r.missing.length) console.log('missing:', r.missing.join(' '));
  for (const e of r.errors) console.log('ERROR', e.file, e.error);
  console.log('SD keys:', Object.keys(r.SD).join(' '));
  process.exitCode = r.missing.length || r.errors.length ? 1 : 0;
}
