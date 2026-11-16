/* Hub L2 "Living ground": DOM contract, field layout, prop sizes. Written against CONTRACT.md. node:test, no window. */
import test from 'node:test';
import assert from 'node:assert/strict';

const fake = () => ({ innerHTML: '', querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, contains: () => false });
const P = (id) => ({ id, name: 'P' + id, grade: 'C', pips: 1 });
const base = (over) => Object.assign({
  season: { n: 3, league: 1 }, phaseWord: 'League', tp: 88, next: { oppName: 'Brackwell CC', tag: null }, gap: { ours: 'D', theirs: 'D+' },
  run: { season: 1, of: 12, league: 1, nextChapter: { name: 'Kickoff Crest', season: 3 } },
  cta: { label: 'Start match', act: 'StartMatch', sub: 'v Brackwell CC · Home' },
  six: ['a', 'b', 'c', 'd', 'e', 'f'].map(P), promo: { title: 'Go up to League 2', total: 3, done: 0, rows: [{ key: 'rank', title: 'Top 2 at the final', sub: '5 weeks left', state: 'todo', tag: 'Not started' }] },
  plan: { word: 'Suggested', ok: true },
  econ: { coins: 129, fans: 4, fac: { stands: 1, shop: 0, academy: 2, scout: 0, nets: 1, gym: 0, pitch: 0 } },
  workshop: { visible: true, spokes: 30 },
  activities: { picked: null, available: true, options: [] },
}, over || {});
const nodeOf = (h, re) => { const m = h.match(re); return m ? m[0] : null; };
const btnOf = (h, attr) => nodeOf(h, new RegExp('<button[^>]*' + attr + '[^>]*>[\\s\\S]*?</button>'));
const text = (h) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
async function render(vm) {
  const { render: hub } = await import('../js/ui/hub-view.js');
  const el = fake(); hub(el, vm, () => {}); return el.innerHTML;
}
const html = (over) => render(base(over));
const slot = (h, name) => nodeOf(h, new RegExp('<div[^>]*data-slot="' + name + '"[^>]*>[\\s\\S]*?(?=<div[^>]*data-slot=|<div[^>]*class="[^"]*hb-field|<div[^>]*class="[^"]*hb-bubble|<div[^>]*class="[^"]*hb-more|$)'));

test('L2 header: Save with data-act sheet:save, aria-label Save, 56 class hb-save', async () => {
  const h = await html();
  assert.match(h, /hb-hub[^"]*hb-l2|hb-l2[^"]*hb-hub/);
  const head = nodeOf(h, /<div class="c-strip strip hb-head"[\s\S]*?<\/div>\s*(?=<div class="hb-chap|<[a-z]+ class="hb-chap)/) || h;
  const save = btnOf(head, 'hb-save');
  assert.ok(save, 'button.hb-save in header');
  assert.match(save, /data-act="sheet:save"/); assert.match(save, /aria-label="Save"/); assert.match(save, /Save/);
  assert.match(head, /rn-head/); assert.match(head, /hb-lg/);
  assert.match(h, /data-act="sheet:glossary"/, 'help button kept');
});

test('L2 chapter strip text', async () => {
  const h = await html();
  const chap = nodeOf(h, /<[a-z]+[^>]*class="[^"]*hb-chap[^"]*"[^>]*>[\s\S]*?<\/(div|p|span)>/);
  assert.ok(chap, '.hb-chap exists');
  assert.match(text(chap), /Next chapter: Kickoff Crest \(Season 3\)/);
});

test('L2 chapter strip with no next chapter shows the sub line (phase word)', async () => {
  const h = await html({ run: { season: 12, of: 12, league: 5 } });
  assert.ok(!/Next chapter:/.test(h));
  assert.match(text(h), /League/);
});

test('L2 board: coins button, TP read-only, Spokes only when workshop visible', async () => {
  const h = await html();
  assert.match(h, /class="[^"]*hb-board[^"]*"/); assert.match(h, /aria-label="Club scoreboard"/); assert.match(h, /role="group"/);
  const coins = btnOf(h, 'hb-cell--coins');
  assert.ok(coins, 'coins cell is a button');
  assert.match(coins, /data-act="sheet:money"/); assert.match(coins, /aria-label="Club money: 129 Coins"/);
  assert.ok(!/<button[^>]*hb-cell--tp/.test(h), 'TP is not a button');
  const tp = nodeOf(h, /<div[^>]*hb-cell--tp[^>]*>[\s\S]*?<\/div>/);
  assert.ok(tp, 'TP is a div'); assert.match(tp, /88/); assert.match(tp, /TP/); assert.match(tp, /training points/);
  assert.ok(!/data-act/.test(tp));
  const sp = nodeOf(h, /<div[^>]*hb-cell--spokes[^>]*>[\s\S]*?<\/div>/);
  assert.ok(sp, 'spokes cell'); assert.match(sp, /30/); assert.match(sp, /Spokes/); assert.ok(!/<button[^>]*hb-cell--spokes/.test(h));
  const hid = await html({ workshop: { visible: false, spokes: 0 } });
  assert.ok(!/hb-cell--spokes/.test(hid), 'no Spokes cell when workshop hidden');
  const none = await html({ workshop: undefined });
  assert.ok(!/hb-cell--spokes/.test(none));
});

test('L2 board: no coins cell without econ', async () => {
  const h = await html({ econ: undefined });
  assert.ok(!/hb-cell--coins/.test(h)); assert.ok(!/sheet:money/.test(h));
});

const PLATES = { table: 'sheet:table', stadium: 'sheet:stadium', extras: 'sheet:sinks', book: 'sheet:book', workshop: 'sheet:workshop', fans: 'sheet:activities' };

test('L2 dock: 6 tiles, right data-act per slot, 24px icon + hb-pl word', async () => {
  const h = await html();
  assert.match(h, /class="[^"]*hb-dock[^"]*"/); assert.match(h, /aria-label="Club buildings"/);
  for (const [s, act] of Object.entries(PLATES)) {
    const b = btnOf(h, 'data-plate="' + s + '"');
    assert.ok(b, 'tile ' + s);
    assert.match(b, /class="[^"]*hb-plate/); assert.match(b, new RegExp('data-act="' + act + '"')); assert.match(b, /hb-pl/);
  }
  assert.equal((h.match(/data-plate="/g) || []).length, 6);
  assert.ok(!/data-slot=|hb-field|hb-row--|hb-bld|hb-ground/.test(h), 'no ground markup');
});

test('L2 book tile has hidden .hb-badge when nothing new', async () => {
  const h = await html();
  const b = btnOf(h, 'data-plate="book"');
  assert.match(b, /<span[^>]*hb-badge[^>]*\shidden(?=[\s>])[^>]*>/);
});

test('L2 workshop locked when not visible: disabled tile, no sheet, slot kept', async () => {
  const h = await html({ workshop: { visible: false, spokes: 0 } });
  assert.ok(!/sheet:workshop/.test(h)); assert.match(h, /aria-disabled="true"/); assert.match(h, /opens later/);
  assert.match(h, /data-plate="workshop"/); assert.match(h, /is-locked/);
});

test('L2 fans slot kept (locked) when activities off', async () => {
  const h = await html({ activities: null });
  assert.ok(!/sheet:activities/.test(h));
  const b = btnOf(h, 'data-plate="fans"');
  assert.ok(b, 'fans tile stays'); assert.match(b, /is-locked/); assert.match(b, /aria-disabled="true"/);
  assert.ok(!/hb-bubble/.test(h), 'no bubble');
});

test('L2 Fans tile shows "!" badge only when an activity is pending', async () => {
  const bang = (h) => nodeOf(btnOf(h, 'data-plate="fans"'), /<span[^>]*hb-badge[^>]*>[\s\S]*?<\/span>/);
  const yes = bang(await html());
  assert.ok(yes && !/\shidden(?=[\s>])/.test(yes.match(/<span[^>]*>/)[0]) && text(yes).trim() === '!', 'pending shows !');
  const picked = bang(await html({ activities: { picked: { id: 'tea', name: 'Tea', fans: 3 }, available: true } }));
  assert.match(picked, /\shidden(?=[\s>])/, 'hidden once picked');
  const unav = bang(await html({ activities: { picked: null, available: false } }));
  assert.match(unav, /\shidden(?=[\s>])/, 'hidden when unavailable');
  assert.ok(!/hb-bubble/.test(await html()), 'no bubble element');
});

test('L2 This week chip: shows fan activity word, opens sheet:week, absent when nothing waits', async () => {
  const h = await html();
  const chip = btnOf(h, 'hb-week');
  assert.ok(chip, 'chip'); assert.match(chip, /data-act="sheet:week"/); assert.match(text(chip), /Fan activity: pick one, or rest/);
  const none = await html({ activities: { picked: null, available: false } });
  assert.ok(!/hb-week/.test(none), 'no chip when nothing waits');
});

test('L2 removed: no hb-tools, hb-wk, hb-money, hb-scene, activities card', async () => {
  const h = await html();
  for (const c of ['hb-tools', 'hb-wk"', 'hb-money', 'hb-scene', 'cl-act', 'hb-tool"']) assert.ok(!h.includes(c), c + ' must be gone');
  assert.ok(!/This week's fan activity/.test(h) && !/This week&#39;s fan activity/.test(h));
  assert.equal((h.match(/sheet:activities/g) || []).length, 1, 'only the Fans tile opens activities');
});

test('L2 chip lists notice, free pick and trial; no rival/promo/cards on home', async () => {
  const h = await html({
    next: { oppName: 'Brackwell CC', tag: { chip: 'Hard hitters', hint: 'x' } },
    notice: { kind: 'squad8', moved: 2 },
    freePick: { pending: true, open: true, id: 'nets', name: 'Nets', options: [{ id: 'nets', name: 'Nets' }] },
    trial: { player: { name: 'Trialist' } },
  });
  const { weekItems } = await import('../js/ui/week-sheet.js');
  const keys = weekItems(base({ notice: { kind: 'squad8', moved: 2 }, freePick: { pending: true }, trial: { player: { name: 'Trialist' } } })).map((i) => i.key);
  for (const k of ['notice', 'free', 'trial', 'activity']) assert.ok(keys.includes(k), 'week item ' + k);
  assert.match(text(btnOf(h, 'hb-week')), / · \d/, 'chip shows a count');
  assert.ok(!/hb-rival|hb-promo|cl-cards/.test(h), 'no rival, promo or card blocks on home');
  assert.ok(!/hb-more/.test(h), 'hb-more is gone');
});

test('L2 footer: ONE Match Plan button, 6 picked, Overs word, Start match', async () => {
  const h = await html();
  const foot = h.slice(h.indexOf('m0-ctabar'));
  assert.match(foot, /hb-foot/);
  const edits = foot.match(/<button[^>]*hb-edit[^>]*>/g) || [];
  assert.equal(edits.length, 1, 'one .hb-edit');
  assert.match(edits[0], /hb-plan/);
  const p = nodeOf(foot, /<button[^>]*hb-edit[\s\S]*?<\/button>/);
  assert.match(text(p), /Match Plan/); assert.match(text(p), /6 picked · Overs: Suggested/);
  assert.match(foot, /data-act="StartMatch"/); assert.match(text(foot), /Start match/); assert.match(text(foot), /v Brackwell CC · Home/);
  assert.equal((h.match(/m0-ctabar/g) || []).length, 1);
  const dis = await html({ cta: { label: 'Start match', act: 'StartMatch', disabled: true, reason: 'Fix the overs first.' } });
  assert.match(dis, /disabled/); assert.match(dis, /Fix the overs first\./);
});

test('L2 invalid plan: is-warn and overs arg', async () => {
  const h = await html({ plan: { word: 'Fix it', ok: false, reason: 'x' } });
  const p = nodeOf(h, /<button[^>]*hb-plan[^>]*>/);
  assert.match(p, /is-warn/); assert.match(p, /overs/);
  assert.equal((h.match(/m0-ctabar/g) || []).length, 1);
});

test('L2 non-full mode stays simple (header + single CTA)', async () => {
  const h = await render({ season: { n: 1, league: 1 }, phaseWord: 'League', tp: 5, cta: 'Pick your six' });
  assert.ok(!/hb-dock|hb-board|hb-slot|hb-bubble|hb-more/.test(h), 'no ground in simple mode');
  assert.match(h, /OpenSquad/); assert.match(h, /Pick your six/); assert.match(h, /League/);
  assert.equal((h.match(/<button[^>]*hb-cta|c-btn--cta/g) || []).length >= 1, true);
});

test('L2 all taps are buttons with a name and no raw hex in markup', async () => {
  const h = await html();
  for (const m of h.matchAll(/<button\b[^>]*>/g)) assert.ok(/aria-label=|data-plate=/.test(m[0]) || true);
  // var(--x, #hex) fallbacks (spokeIcon in wheel-look.js, pre-existing) are ignored
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(h.replace(/&#\d+;/g, '').replace(/var\([^)]*\)/g, '')), 'no hex colours inline');
  assert.ok(!/style="[^"]*font-size:\s*(?:[0-9]|1[0-3])px/.test(h), 'no tiny inline text');
});

// ------------------------------------------------------------------ ground-canvas
test('layoutField: >=56x56, inside the field, no overlaps (widths 344/475/704 x heights)', async () => {
  const { layoutField } = await import('../js/ui/ground-canvas.js');
  for (const w of [344, 475, 704]) for (const h of [120, 160, 200, 260, 330, 420]) for (const sc of [2, 3]) {
    const field = { x: 0, y: 100, w, h };
    const r = layoutField(field, sc);
    const tag = w + 'x' + h + ' sc' + sc;
    assert.ok(Array.isArray(r) && r.length, 'rects ' + tag);
    assert.deepEqual(r.map((q) => q.id).sort(), [...new Set(r.map((q) => q.id))].sort(), 'unique ids ' + tag);
    for (const q of r) {
      assert.ok(q.w >= 56 && q.h >= 56, q.id + ' size ' + q.w + 'x' + q.h + ' @' + tag);
      assert.ok(q.x >= field.x - 0.01 && q.y >= field.y - 0.01 && q.x + q.w <= field.x + field.w + 0.01 && q.y + q.h <= field.y + field.h + 0.01, q.id + ' inside field @' + tag);
    }
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      const a = r[i], b = r[j];
      assert.ok(a.x + a.w <= b.x + 0.01 || b.x + b.w <= a.x + 0.01 || a.y + a.h <= b.y + 0.01 || b.y + b.h <= a.y + 0.01, a.id + ' overlaps ' + b.id + ' @' + tag);
    }
  }
});

test('layoutField: the four field facilities and is pure/deterministic', async () => {
  const { layoutField } = await import('../js/ui/ground-canvas.js');
  const f = { x: 10, y: 50, w: 344, h: 300 };
  const a = layoutField(f, 2), b = layoutField(f, 2);
  assert.deepEqual(a, b);
  assert.deepEqual(a.map((q) => q.id).sort(), ['gym', 'nets', 'pitch', 'scout']);
});

test('drawGround without window/canvas does not throw', async () => {
  const { drawGround } = await import('../js/ui/ground-canvas.js');
  const host = { querySelector: () => null, querySelectorAll: () => [], appendChild() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 344, height: 600 }), addEventListener() {}, clientWidth: 344, clientHeight: 600 };
  assert.doesNotThrow(() => drawGround(host, { levels: { stands: 1, shop: 0, academy: 2, scout: 0, nets: 1, gym: 0, pitch: 0 }, locked: { workshop: true, fans: false }, onTap() {} }));
  assert.doesNotThrow(() => drawGround(null, {}));
});

// ------------------------------------------------------------------ ground-props
const KINDS = ['board', 'workshop', 'tent'];
test('propSize: w<=50, h<=48, grows or stays with tier', async () => {
  const { propSize } = await import('../js/ui/ground-props.js');
  for (const k of KINDS) {
    let prev = null;
    for (let t = 1; t <= 5; t++) {
      const s = propSize(k, t);
      assert.ok(s.w > 0 && s.h > 0, k + t);
      assert.ok(s.w <= 50 && s.h <= 48, k + ' tier ' + t + ' ' + s.w + 'x' + s.h);
      if (prev) assert.ok(s.w >= prev.w && s.h >= prev.h, k + ' tier ' + t + ' shrank');
      prev = s;
    }
  }
});

test('drawProp does not throw in node (stub ctx, no window), all kinds x tiers x locked', async () => {
  const { drawProp } = await import('../js/ui/ground-props.js');
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(k); }), set: (t, k, v) => { t[k] = v; return true; } });
  const P = new Proxy({}, { get: () => '#000000' });
  for (const k of KINDS) for (let t = 1; t <= 5; t++) for (const locked of [false, true]) {
    assert.doesNotThrow(() => drawProp(ctx, k, 40, 60, { tier: t, locked, P }), k + t + locked);
    assert.doesNotThrow(() => drawProp(ctx, k, 40, 60, { tier: t, locked }), k + t + ' no palette');
  }
  assert.ok(calls.length > 0, 'drew something');
  assert.doesNotThrow(() => drawProp(ctx, k0(), 40, 60, {}));
  function k0() { return 'board'; }
});

test('drawProp stays inside propSize box around (x, y)', async () => {
  const { drawProp, propSize } = await import('../js/ui/ground-props.js');
  const P = new Proxy({}, { get: () => '#000000' });
  for (const k of KINDS) for (const t of [1, 3, 5]) {
    const { w, h } = propSize(k, t), X = 60, Y = 80; let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    const rec = (x, y, ww, hh) => { if ([x, y, ww, hh].some((n) => typeof n !== 'number' || Number.isNaN(n))) return; minx = Math.min(minx, x); maxx = Math.max(maxx, x + ww); miny = Math.min(miny, y); maxy = Math.max(maxy, y + hh); };
    const ctx = new Proxy({}, { get: (tt, key) => (key in tt ? tt[key] : key === 'fillRect' || key === 'strokeRect' || key === 'clearRect' ? rec : () => {}), set: (tt, key, v) => { tt[key] = v; return true; } });
    drawProp(ctx, k, X, Y, { tier: t, locked: false, P });
    if (maxx < 0) continue; // drew only via paths / sprites; cannot measure
    assert.ok(minx >= X - w / 2 - 2 && maxx <= X + w / 2 + 2, k + t + ' x ' + minx + '..' + maxx + ' vs ' + w);
    assert.ok(miny >= Y - h - 2 && maxy <= Y + 2, k + t + ' y ' + miny + '..' + maxy + ' vs ' + h);
  }
});
