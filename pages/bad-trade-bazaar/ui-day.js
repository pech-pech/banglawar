// DAY-UI: morning / end-of-day / profit shop screens (btb-lessons-1). Builds DOM with createElement only.
let ctx = null;
const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Math.abs(n).toFixed(2);
const signed = (n) => (n < 0 ? '-' : '+') + money(n);
const pct = (r) => (r < 0 ? '-' : '+') + Math.abs(r * 100).toFixed(1) + '%';

function el(tag, props, kids) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'dataset') for (const d in v) e.dataset[d] = v[d];
    else if (k === 'on') for (const ev in v) e.addEventListener(ev, v[ev]);
    else if (k in e && k !== 'type' && k !== 'role') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  if (kids) for (const c of [].concat(kids)) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const btn = (props, kids) => el('button', Object.assign({ type: 'button' }, props), kids);
const fill = (root, kids) => { root.replaceChildren(...kids.filter(Boolean)); };
const scarName = (t) => ctx.core.SCARS[t].name;
const tag = (tx, cls) => el('span', { class: 'tag' + (cls ? ' ' + cls : ''), text: tx });

export function initDay(c) { ctx = c; }

// ---------------- morning ----------------
export function showMorning() {
  const { core } = ctx, p = ctx.getProfile(), c = ctx.getConfig();
  const root = $('screen-morning');
  const cash = core.dayCash(p, c);
  const tier = Math.min(4, Math.max(1, p.maxTier || 1));
  const head = el('header', { class: 'day-head' }, [
    el('div', { class: 'day-title', text: 'Day ' + (p.day + 1) }),
    el('div', { class: 'stall-sign', text: core.TIERS[tier - 1] }),
    el('div', { id: 'morning-cash', class: 'big-cash', text: money(cash) }),
  ]);
  let bar = null;
  if (tier < 4) {
    const need = c.tierUnlock[tier];
    const frac = need > 0 ? Math.max(0, Math.min(1, cash / need)) : 1;
    const fillEl = el('i'); fillEl.style.width = (frac * 100).toFixed(1) + '%';
    bar = el('div', { id: 'tier-bar', class: 'tier-bar' }, [
      el('span', { text: 'Next stall: ' + money(cash) + ' / ' + money(need) }),
      el('div', { class: 'track' }, fillEl)]);
  }
  const unlocked = core.unlockedGoods(p, c);
  const slots = [0, 1, 2].map((s) => {
    const row = el('div', { class: 'slot-group', role: 'group', 'aria-label': core.SLOTS[s] + ' good' }, [
      el('div', { class: 'slot-name', text: core.SLOTS[s] + ' good' })]);
    const wrap = el('div', { class: 'picks' });
    for (const g of unlocked.filter((x) => x.slot === s)) {
      wrap.append(btn({ class: 'pick', dataset: { slot: s, good: g.id }, 'aria-pressed': String(p.picks[s] === g.id),
        on: { click: () => { core.setPick(p, s, g.id, c); ctx.saveProfile(); showMorning(); } } }, [
        el('b', { text: g.name }),
        el('small', { text: g.kind + ' · ' + money(g.base) + ' each · ' + core.TIERS[g.tier - 1] })]));
    }
    row.append(wrap);
    return row;
  });
  const chips = el('div', { class: 'chips' });
  for (const key of p.perksOwned) {
    const perk = core.PERKS.find((x) => x.key === key); if (!perk) continue;
    chips.append(btn({ class: 'perk-chip', dataset: { key }, 'aria-pressed': String(p.perks.includes(key)),
      title: core.perkText(key, c), on: { click: () => { core.togglePerk(p, key, c); ctx.saveProfile(); showMorning(); } } }, [
      el('b', { text: perk.name }), el('small', { text: core.perkText(key, c) })]));
  }
  p.owned.forEach((o, type) => {
    if (o !== 1) return;
    const cov = p.cover[type] || 0, spent = cov <= 0;
    chips.append(btn({ class: 'lesson-chip' + (spent ? ' spent' : ''), dataset: { type }, 'aria-pressed': String(p.lessons.includes(type)),
      on: { click: () => { core.toggleLesson(p, type, c); ctx.saveProfile(); showMorning(); } } }, [
      el('b', { text: scarName(type) }), el('small', { text: spent ? 'lesson spent' : 'covers ' + money(cov) })]));
  });
  const build = el('section', { class: 'build' }, [
    el('div', { class: 'slot-name', text: 'Your powers (' + p.perks.length + '/' + c.perkSlots + ') and lessons (' + p.lessons.length + '/' + c.lessonSlots + ')' }),
    chips.children.length ? chips : el('p', { class: 'hint', text: 'Nothing yet. Win money to buy powers. Losing teaches lessons.' })]);
  const acts = el('div', { class: 'acts' }, [
    c.shopOn ? btn({ id: 'btn-shop-morning', class: 'btn secondary', text: 'Shop', on: { click: () => { showShop(); ctx.go('shop'); } } }) : null,
    btn({ id: 'btn-open-stall', class: 'btn big', text: 'Open stall', on: { click: () => ctx.startDay() } })]);
  fill(root, [head, bar, el('div', { class: 'scroll' }, [...slots, build]), acts]);
}

// ---------------- end of day ----------------
export function showEnd(s) {
  const p = ctx.getProfile(), c = ctx.getConfig(), root = $('screen-end');
  const neg = s.profit < 0;
  const scars = el('div', { id: 'end-scars', class: 'end-scars' });
  for (const d of s.drops || []) scars.append(el('p', { class: 'drop', text: 'New lesson: ' + scarName(d.type) + ' covers ' + money(d.net) }));
  for (const g of s.grew || []) scars.append(el('p', { class: 'grew', text: scarName(g.type) + ' grew +' + money(g.add) }));
  if (s.bust && !(s.drops || []).length) scars.append(el('p', { class: 'drop', text: s.profit < 0 ? 'You lost ' + money(-s.profit) + ' today. Next stall, sell sooner.' : 'You made no trades, so there is no lesson to learn.' }));
  scars.append(el('p', { class: 'paid', text: s.paid > 0 ? 'Lessons paid you ' + money(s.paid) : 'Lessons paid you $0.00' }));
  let unlock = null;
  if (s.unlocked && s.unlocked.length) {
    const t = Math.max(...s.unlocked);
    unlock = el('div', { id: 'end-unlock', class: 'end-unlock', text: 'New goods at ' + ctx.core.TIERS[t - 1] });
  }
  const proto = el('div', { id: 'end-proto', class: 'end-proto' });
  try {
    const r = ctx.report.protoCheck(p, c);
    const have = (p.days || []).filter((d) => d.stall === p.stall).length;
    proto.textContent = r.status === 'WAIT' ? 'Profit test: play 5 days (day ' + Math.min(have, 5) + ' of 5)'
      : r.status === 'PASS' ? 'Profit test PASS ' + Math.round(r.ratio * 100) + '% of day 1'
      : r.status === 'MISS' ? 'Profit test MISS ' + Math.round(r.ratio * 100) + '% of day 1 (need ' + Math.round(c.protoTarget * 100) + '%)'
      : 'Profit test void: ' + r.reason;
  } catch (e) { proto.hidden = true; }
  const acts = el('div', { class: 'acts' });
  if (s.bust) acts.append(btn({ id: 'btn-new-stall', class: 'btn danger big', text: 'New stall', on: { click: () => ctx.newStall() } }));
  else acts.append(btn({ id: 'btn-next-day', class: 'btn big', text: 'Next day', on: { click: () => { showMorning(); ctx.go('morning'); } } }));
  if (c.shopOn && !s.bust) acts.append(btn({ id: 'btn-shop', class: 'btn secondary', text: 'Shop', on: { click: () => { showShop(); ctx.go('shop'); } } }));
  acts.append(
    btn({ id: 'btn-copy-report', class: 'btn secondary', text: 'Copy report', on: { click: async () => {
      try { await ctx.house.copyText(ctx.report.report(ctx.getProfile(), ctx.getConfig())); ctx.toast('Report copied'); }
      catch (e) { ctx.toast('Could not copy'); } } } }));
  fill(root, [
    el('div', { class: 'end-title', text: 'Closing bell · Day ' + s.day }),
    el('div', { id: 'end-cash', class: 'end-cash', text: money(s.endCash) }),
    el('div', { id: 'end-profit', class: 'end-profit' + (neg ? ' neg' : s.profit === 0 ? ' zero' : ''), text: signed(s.profit) + ' (' + pct(s.rate) + ')' }),
    s.bust ? el('div', { class: 'end-bust', text: 'Stall bust: under ' + money(c.bustCash) }) : null,
    el('div', { class: 'scroll' }, [scars, unlock, proto]),
    acts]);
}

// ---------------- shop ----------------
const scopeTag = (sc) => (sc === 'global' ? 'Global' : ctx.core.SLOTS[sc] + ' good');
let stallTimer = 0;
export function showShop() {
  const { core } = ctx, p = ctx.getProfile(), c = ctx.getConfig(), root = $('screen-shop');
  const cash = core.dayCash(p, c);
  const slotRow = el('div', { class: 'power-slots' });
  for (let i = 0; i < c.perkSlots; i++) {
    const k = p.perks[i], perk = k && core.PERKS.find((x) => x.key === k);
    slotRow.append(el('div', { class: 'power-slot' + (perk ? ' full' : ''), text: perk ? perk.name : 'Empty slot' }));
  }
  const list = el('div', { class: 'perks' });
  for (const perk of core.PERKS) {
    const owned = p.perksOwned.includes(perk.key), price = core.perkPrice(perk.key, c);
    let label = 'Buy ' + money(price), ok = false;
    if (owned) label = 'Owned';
    else if (!c.shopOn) label = 'Shop closed';
    else if (core.canBuyPerk(p, perk.key, c)) ok = true;
    else label = 'Need ' + money(Math.max(0.01, price + c.bustCash - cash));
    const slotted = p.perks.includes(perk.key);
    list.append(el('div', { class: 'perk' + (owned ? ' owned' : ''), dataset: { key: perk.key } }, [
      el('div', { class: 'perk-top' }, [el('b', { text: perk.name }), tag(scopeTag(perk.scope))]),
      el('div', { class: 'perk-text', text: core.perkText(perk.key, c) }),
      el('div', { class: 'perk-acts' }, [
        btn({ class: 'perk-buy', disabled: !ok, text: label, on: { click: () => {
          if (core.buyPerk(p, perk.key, c)) { ctx.saveProfile(); ctx.toast('Bought ' + perk.name); showShop(); } } } }),
        owned ? btn({ class: 'perk-slot', text: slotted ? 'Unslot' : 'Slot', 'aria-pressed': String(slotted), on: { click: () => {
          core.togglePerk(p, perk.key, c); ctx.saveProfile(); showShop(); } } }) : null])]));
  }
  const reset = btn({ id: 'btn-new-stall-shop', class: 'btn-small', text: 'New stall', on: { click: () => {
    if (reset.dataset.armed) { clearTimeout(stallTimer); ctx.newStall(); return; }
    reset.dataset.armed = '1'; reset.textContent = 'Tap again to start over';
    stallTimer = setTimeout(() => { delete reset.dataset.armed; reset.textContent = 'New stall'; }, 3000);
  } } });
  fill(root, [
    el('header', { class: 'day-head' }, [el('div', { class: 'day-title', text: 'Profit shop' }),
      el('div', { id: 'shop-cash', class: 'big-cash', text: money(cash) })]),
    el('div', { class: 'scroll' }, [el('div', { class: 'slot-name', text: 'Power slots' }), slotRow, list, reset]),
    el('div', { class: 'acts' }, btn({ id: 'btn-shop-done', class: 'btn big', text: 'Done', on: { click: () => { showMorning(); ctx.go('morning'); } } }))]);
}
