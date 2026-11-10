(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// mulberry32; state in .s so it can be hashed/inspected.
function Rng(seed){
  if (!(this instanceof Rng)) return new Rng(seed);
  this.s = (seed >>> 0) ^ 0x9E3779B9;
  if (this.s === 0) this.s = 1;
}
Rng.prototype.next = function(){
  var t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Rng.prototype.int = function(n){ return Math.floor(this.next() * n); };
Rng.prototype.range = function(a, b){ return a + (b - a) * this.next(); };
V.Rng = Rng;
})();
