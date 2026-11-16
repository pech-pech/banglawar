/* Hub H2 (C3.1) unit tests. Written against docs/CONTRACT-C.md s2, s5, s6 and PLAN-H2 s8.
 * EXPECTED RED until the hub-view.js H2 build lands (dockHtml, bannerHtml, sixHtml, footHtml). Do not "fix" the asserts to match old markup. node:test, no window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { letterOfShown } from '../js/core/letters.js';

const fake = () => ({ innerHTML: '', querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, contains: () => false });
const PL = (id, bat, bowl) => ({ id, name: 'P' + id, grade: 'C', pips: 1, bat, bowl });
const SIX = [[20, 200], [60, 90], [100, 100], [120, 40], [150, 170], [199, 25]].map(([b, w], i) => PL('p' + i, b, w));
const gate = (over) => Object.assign({ text: 'Fans 218 / 310 for stadium L2', pct: 70, ready: false, hidden: false, next: 2, fans: 218, gate: 310, left: 92 }, over || {});
const base = (over) => Object.assign({
  season: { n: 3, league: 1 }, phaseWord: 'League', tp: 88, next: { oppName: 'Brackwell CC', tag: null }, gap: { ours: 'D', theirs: 'D+' },
  run: { season: 1, of: 12, league: 1, nextChapter: { name: 'Kickoff Crest', season: 3 } },
  cta: { label: 'Start match', act: 'StartMatch', sub: 'v Brackwell CC · Home' },
  six: SIX, promo: { title: 'Go up to League 2', total: 3, done: 0, rows: [] },
  plan: { word: 'Suggested', ok: true, reason: '' },
  econ: { coins: 129, stadium: 1, fans: 218, fac: { stands: 1, shop: 0, academy: 2, scout: 0, nets: 1, gym: 0, pitch: 0 } },
  fansGate: gate(), matchPlan: { clinic: 0 },
  workshop: { visible: true, spokes: 30 },
  activities: { picked: null, available: true, options: [] },
}, over || {});
const nodeOf = (h, re) => { const m = h.match(re); return m ? m[0] : null; };
const all = (h, re) => [...h.matchAll(re)].map((m) => m[0]);
const text = (h) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
async function render(vm) {
  const { render: hub } = await import('../js/ui/hub-view.js');
  const el = fake(); hub(el, vm, () => {}); return el.innerHTML;
}
const html = (over) => render(base(over));
const plan = (h) => nodeOf(h, /<button[^>]*hb-plan[^>]*>[\s\S]*?<\/button>/);
const banner = (h) => nodeOf(h, /<div[^>]*class="[^"]*hb-banner[^"]*"[^>]*>[\s\S]*?(?=<div[^>]*class="[^"]*hb-dock|<div[^>]*class="[^"]*hb-colB|$)/);
const gb = (h) => nodeOf(h, /<button[^>]*hb-gb[^>]*>[\s\S]*?<\/button>/);

test('H2 squad: no canvas anywhere on home', async () => {
  const h = await html();
  assert.ok(!/<canvas(?![^>]*hb-bcv)/.test(h), 'only the banner canvas.hb-bcv may exist');
  const six = nodeOf(h, /<[a-z]+[^>]*class="[^"]*hb-six[^"]*"[^>]*>[\s\S]*?(?=<div[^>]*class="[^"]*m0-ctabar|$)/) || '';
  assert.ok(six, '.hb-six exists');
  assert.ok(!/<canvas/.test(six), 'no canvas in the squad');
});

test('H2 squad: 6 .hb-p rows open the team sheet, 2 .lt-cell each, letters match shown bat/bowl', async () => {
  const h = await html();
  const rows = all(h, /<button[^>]*class="[^"]*hb-p\b[^"]*"[^>]*>[\s\S]*?<\/button>/g);
  assert.equal(rows.length, 6, 'six .hb-p buttons');
  rows.forEach((r, i) => {
    assert.match(r, /data-act="sheet:team"/);
    assert.equal((r.match(/class="lt-cell"/g) || []).length, 2, 'row ' + i + ' has 2 lt-cell');
    const cells = all(r, /<span class="lt-cell">[\s\S]*?<\/span><\/span>/g);
    const letters = cells.map((c) => (c.match(/<b>([^<]+)<\/b>/) || [])[1]);
    assert.deepEqual(letters, [letterOfShown(SIX[i].bat), letterOfShown(SIX[i].bowl)], 'letters row ' + i);
  });
});

test('H2 squad: no raw ratings printed in rows', async () => {
  const h = await html();
  const rows = all(h, /<button[^>]*class="[^"]*hb-p\b[^"]*"[^>]*>[\s\S]*?<\/button>/g).join(' ');
  assert.ok(!/>\s*(199|150|120)\s*</.test(rows), 'no raw numbers as text');
});

test('H2 Clinic badge: hidden at 0, shows 2 at 2', async () => {
  const zero = plan(await html());
  assert.ok(zero, 'button.hb-plan exists');
  assert.match(zero, /<span[^>]*hb-badge[^>]*\shidden(?=[\s>])[^>]*>/);
  assert.ok(!/Clinic/.test(zero), 'no Clinic words at 0');
  const two = plan(await html({ matchPlan: { clinic: 2 } }));
  const badge = nodeOf(two, /<span[^>]*hb-badge[^>]*>[\s\S]*?<\/span>/);
  assert.ok(badge && !/\shidden(?=[\s>])/.test(badge.match(/<span[^>]*>/)[0]), 'badge not hidden');
  assert.match(badge, /aria-hidden="true"/); assert.equal(text(badge).trim(), '2');
});

test('H2 Clinic aria on the Match Plan button: plural and singular', async () => {
  const two = plan(await html({ matchPlan: { clinic: 2 } }));
  assert.match(two, /aria-label="[^"]*Match plan: 6 picked, overs suggested, 2 Clinic spins left"/i);
  const one = plan(await html({ matchPlan: { clinic: 1 } }));
  assert.match(one, /aria-label="[^"]*1 Clinic spin left"/); assert.ok(!/1 Clinic spins/.test(one));
  const zero = plan(await html());
  assert.ok(!/aria-label="[^"]*Clinic/.test(zero));
});

test('H2 Match Plan: data-act sheet:team, tab six when ok, tab overs when plan invalid', async () => {
  const ok = plan(await html());
  assert.match(ok, /data-act="sheet:team"/); assert.match(ok, /data-arg='\{"tab":"six"\}'|data-arg="\{&quot;tab&quot;:&quot;six&quot;\}"/);
  const bad = await html({ plan: { word: 'Fix it', ok: false, reason: 'Overs do not add up' } });
  assert.match(plan(bad), /data-arg='\{"tab":"overs"\}'|data-arg="\{&quot;tab&quot;:&quot;overs&quot;\}"/);
  assert.match(plan(bad), /is-warn/);
  assert.equal((bad.match(/m0-ctabar/g) || []).length, 1, 'exactly one ctabar');
});

test('H2 banner: button.hb-gb opens the stadium sheet; 92 fans to L2 at 218/310', async () => {
  const h = await html();
  const b = gb(h);
  assert.ok(b, 'button.hb-gb');
  assert.match(b, /data-act="sheet:stadium"/);
  assert.match(text(b), /92 fans to L2/);
  assert.match(h, /<canvas[^>]*hb-bcv/);
});

test('H2 banner: Fans ready when the gate is met', async () => {
  const h = await html({ fansGate: gate({ ready: true, pct: 100, fans: 400, left: 0, text: 'Fans ready: build stadium L2' }) });
  assert.match(text(gb(h)), /Fans ready/); assert.ok(!/fans to L/.test(text(gb(h))));
});

test('H2 banner: no ghost tag at stadium 5 (fansGate.hidden)', async () => {
  const h = await html({ econ: { coins: 1, stadium: 5, fans: 9999, fac: {} }, fansGate: gate({ hidden: true, pct: 0, ready: false, next: null, fans: 0, gate: 0, left: 0, text: '' }) });
  const b = gb(h);
  assert.ok(b, 'button.hb-gb still opens the stadium');
  assert.match(b, /data-act="sheet:stadium"/);
  assert.ok(!/fans to L|Fans ready|NaN|undefined/.test(text(b)), 'no gate tag');
  assert.ok(!/class="fg hb-fg"/.test(h), 'no fans line');
});

test('H2 .fg.hb-fg sits in .hb-banner, not .hb-board', async () => {
  const h = await html();
  assert.match(h, /class="fg hb-fg"/);
  const bn = banner(h);
  assert.ok(bn && /class="fg hb-fg"/.test(bn), 'inside banner');
  const board = nodeOf(h, /<div[^>]*class="[^"]*hb-board[^"]*"[^>]*>[\s\S]*?(?=<div[^>]*class="[^"]*hb-(banner|mid|dock)|$)/);
  assert.ok(board && !/hb-fg/.test(board), 'not inside board');
  assert.ok(h.indexOf('hb-banner') < h.indexOf('hb-fg'), 'after banner opens');
  assert.ok(/hb-band/.test(bn) && /hb-week|hb-band/.test(bn));
});

test('H2 dock: 6 tiles with the right acts', async () => {
  const h = await html();
  const acts = { table: 'sheet:table', stadium: 'sheet:stadium', extras: 'sheet:sinks', book: 'sheet:book', workshop: 'sheet:workshop', fans: 'sheet:activities' };
  for (const [s, act] of Object.entries(acts)) {
    const b = nodeOf(h, new RegExp('<button[^>]*data-plate="' + s + '"[^>]*>[\\s\\S]*?</button>'));
    assert.ok(b, 'tile ' + s); assert.match(b, new RegExp('data-act="' + act + '"'));
  }
  assert.match(h, /hb-dock/);
});

test('H2 home shows no coach, XP or job words except the Match Plan aria', async () => {
  for (const over of [{}, { matchPlan: { clinic: 2 } }]) {
    const h = await html(over);
    const stripped = h.replace(/<button[^>]*hb-plan[^>]*>/, '<button>');
    const visible = text(stripped.replace(/\s(aria-label|title|alt)="[^"]*"/g, ''));
    assert.ok(!/Clinic|XP|job/.test(visible), 'visible text: ' + (visible.match(/.{0,20}(Clinic|XP|job).{0,20}/) || [''])[0]);
    const labels = all(stripped, /aria-label="[^"]*"/g).join(' ');
    assert.ok(!/Clinic|XP|\bjob\b/.test(labels), 'no coach words in other aria-labels');
  }
});

test('H2 non-full branch still simple and does not throw on a stub vm', async () => {
  const h = await render({ season: { n: 1, league: 1 }, phaseWord: 'League', tp: 5, cta: 'Pick your six' });
  assert.ok(!/hb-banner|hb-dock|hb-six|hb-gb/.test(h)); assert.match(h, /Pick your six/);
});

test('H2 six row aria names batting X, bowling Y', async () => {
  const h = await html();
  const rows = all(h, /<button[^>]*class="[^"]*hb-p\b[^"]*"[^>]*>/g);
  assert.equal(rows.length, 6);
  rows.forEach((r) => assert.match(r, /aria-label="\d\. [^"]*, batting [^"]+, bowling [^"]+\. Edit the six"/));
});

test('H2 drawBanner returns null without a window', async () => {
  const { drawBanner } = await import('../js/ui/ground-canvas.js');
  assert.equal(drawBanner({ querySelector: () => null }, {}), null);
  assert.equal(drawBanner(null, {}), null);
});
