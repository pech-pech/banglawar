'use strict';
// Seed maths for the bake (GEN-SPEC 3.1). Integer maths only: no Math.random, no clock, no sim RNG.
var crypto = require('crypto');

// FNV-1a over the parts joined with '|' (ASCII), then the murmur3 fmix32 finaliser. Returns an unsigned 32-bit int.
function hash32() {
  var s = Array.prototype.join.call(arguments, '|'), h = 0x811c9dc5, i;
  for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
function roomSeed(genVersion, chapter, stage) { return hash32('volley-room', genVersion, chapter, stage); }   // columns are NOT in the seed

// mulberry32 over a uint32 state; int(n) is an integer modulo draw (n small, bias is irrelevant here).
function Prng(seed) {
  var s = seed >>> 0;
  this.next = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  this.int = function (n) { return n <= 1 ? 0 : this.next() % n; };
}
// one small PRNG per purpose: template, shift, swap, pack, spawn, elite
function stream(seed, salt, name) { return new Prng(hash32(seed, salt, name)); }

function canon(o) {   // canonical JSON: sorted keys, no whitespace
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
  return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}';
}
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

module.exports = { hash32: hash32, roomSeed: roomSeed, Prng: Prng, stream: stream, canon: canon, sha256: sha256 };
