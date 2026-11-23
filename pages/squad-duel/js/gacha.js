(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});

  // admin default: hard fallbacks when SD.data / T keys are missing
  const FALLBACK = { pullCost: 100, starterRare: 70, starterEpic: 25, starterLegend: 5, pityEpic: 10,
    pityLegend: 30, maxStars: 5, dupeCoinsAtMax: 25,
    normal: { Common: 0.55, Rare: 0.30, Epic: 0.12, Legend: 0.03 } };
  const TIERS = ['Common', 'Rare', 'Epic', 'Legend'];

  function tw(T, k) {
    if (T && T[k] != null) return T[k];
    const d = SD.data && SD.data.TWEAK_DEFAULTS;
    if (d && d[k] != null) return d[k];
    return FALLBACK[k];
  }
  function pullCfg() { return (SD.data && SD.data.PULL) || {}; }
  function maxStars() { return pullCfg().maxStars || FALLBACK.maxStars; }
  function dupeCoins() { return pullCfg().dupeCoinsAtMax || FALLBACK.dupeCoinsAtMax; }
  function legendPity() { return pullCfg().pityLegend || FALLBACK.pityLegend; }
  function normalTable() { return pullCfg().normal || FALLBACK.normal; }
  function starterTable(T) {
    return { Rare: tw(T, 'starterRare') / 100, Epic: tw(T, 'starterEpic') / 100, Legend: tw(T, 'starterLegend') / 100 };
  }
  function pool() { return (SD.data && SD.data.POOL) || []; }
  function pdata(pid) { return SD.data.byId(pid); }

  function cost(T) { return tw(T, 'pullCost'); }

  function canPull(S, T) {
    const need = cost(T), have = S.coins || 0;
    const ok = have >= need;
    return { ok, why: ok ? '' : 'Pull ' + ((S.pulls || 0) + 1) + ': ' + have + '/' + need, have, need };
  }

  function oddsFor(S, T) {
    if ((S.pulls || 0) === 0) {
      return { label: 'Starter pull: Rare or better. Normal odds from pull 2.', table: starterTable(T) };
    }
    return { label: 'Normal odds', table: Object.assign({}, normalTable()) };
  }

  function roll(table, r, order) {
    let acc = 0, last = null;
    for (const t of order) {
      if (!(table[t] > 0)) continue;
      acc += table[t]; last = t;
      if (r < acc) return t;
    }
    return last; // float slack
  }

  function pull(S, T) {
    const chk = canPull(S, T);
    if (!chk.ok) return { error: true, why: chk.why };
    S.pity = S.pity || { epic: 0, legend: 0 };
    S.owned = S.owned || {};
    const pullNo = (S.pulls || 0) + 1;
    const starter = pullNo === 1;
    const R = SD.rng.make(SD.rng.pullSeed(S.seed, pullNo));
    const pityBefore = S.pity.epic;
    const epicAt = tw(T, 'pityEpic');
    const legAt = legendPity();

    let table = starter ? starterTable(T) : normalTable();
    // draw order: tier roll, then pick roll (always exactly 2 draws)
    const rTier = R.next();
    const rPick = R.next();
    let tier = roll(table, rTier, TIERS);

    // pity (the pull that would reach the limit is forced)
    if (S.pity.legend + 1 >= legAt) {
      tier = 'Legend';
    } else if (S.pity.epic + 1 >= epicAt && tier !== 'Epic' && tier !== 'Legend') {
      tier = 'Epic'; // admin default: Epic pity forces exactly Epic (Legend has its own pity)
    }

    let pid;
    if (tier === 'Common') {
      const starters = Object.keys(S.owned).filter(function (id) { const p = pdata(id); return p && p.starter; });
      const list = starters.length ? starters : Object.keys(S.owned);
      pid = list[Math.min(list.length - 1, Math.floor(rPick * list.length))];
    } else {
      let list = pool().filter(function (id) { return pdata(id).rarity === tier; });
      if (!list.length) list = pool(); // admin default: empty tier falls back to whole pool
      pid = list[Math.min(list.length - 1, Math.floor(rPick * list.length))];
      tier = pdata(pid).rarity;
    }

    const rarity = pdata(pid).rarity;
    let isNew = false, dupeCoinsPaid = 0, stars = 0;
    const cur = S.owned[pid];
    if (!cur) {
      isNew = true; stars = 0;
      S.owned[pid] = { stars: 0, xp: 0, level: 1, isNew: true };
    } else {
      stars = cur.stars || 0;
      if (stars >= maxStars()) { dupeCoinsPaid = dupeCoins(); }
      else { stars += 1; cur.stars = stars; }
      cur.isNew = false; // admin default: a dupe does not raise the New flag
    }

    S.coins = (S.coins || 0) - cost(T) + dupeCoinsPaid;
    S.pulls = pullNo;
    S.pity.epic = (rarity === 'Epic' || rarity === 'Legend') ? 0 : S.pity.epic + 1;
    S.pity.legend = rarity === 'Legend' ? 0 : S.pity.legend + 1;

    const res = { pullNo, pid, rarity, isNew, stars, dupeCoins: dupeCoinsPaid,
      pityBefore, pityAfter: S.pity.epic, starter };
    S.lastPull = res;
    return res;
  }

  function pityText(S, T) {
    return 'Epic pity ' + ((S.pity && S.pity.epic) || 0) + '/' + tw(T, 'pityEpic');
  }

  SD.gacha = { cost, canPull, oddsFor, pull, pityText };
})();
