// =====================================================
// draft.js — 밴픽 (2밴 → 스네이크 픽 1-2-2-2-2-1) + AI 밴픽
// =====================================================
G.Draft = {
  ORDER: [
    { side: 0, type: 'ban' }, { side: 1, type: 'ban' }, { side: 0, type: 'ban' }, { side: 1, type: 'ban' },
    { side: 0, type: 'pick' }, { side: 1, type: 'pick' }, { side: 1, type: 'pick' }, { side: 0, type: 'pick' },
    { side: 0, type: 'pick' }, { side: 1, type: 'pick' }, { side: 1, type: 'pick' }, { side: 0, type: 'pick' },
    { side: 0, type: 'pick' }, { side: 1, type: 'pick' }
  ],

  // players: [[5명], [5명]] — 각 팀 라인업 순서 (탑·정글·미드·원딜·서폿)
  create: function (players, heroMods) {
    var pos = players.map(function (list) {
      var m = {}; list.forEach(function (p, i) { m[p.id] = G.POS_ORDER[i]; }); return m;
    });
    return { step: 0, players: players, pos: pos, mods: heroMods || {}, bans: [[], []], picks: [[], []] };
  },
  current: function (d) { return G.Draft.ORDER[d.step] || null; },
  done: function (d) { return d.step >= G.Draft.ORDER.length; },
  taken: function (d) {
    var t = {};
    [0, 1].forEach(function (s) {
      d.bans[s].forEach(function (h) { t[h] = 'ban'; });
      d.picks[s].forEach(function (p) { t[p.heroId] = 'pick'; });
    });
    return t;
  },
  available: function (d) {
    var t = G.Draft.taken(d);
    return G.HEROES.filter(function (h) { return !t[h.id]; }).map(function (h) { return h.id; });
  },
  freePlayers: function (d, side) {
    var used = {};
    d.picks[side].forEach(function (p) { used[p.playerId] = 1; });
    return d.players[side].filter(function (p) { return !used[p.id]; });
  },
  ban: function (d, heroId) {
    var c = G.Draft.current(d);
    d.bans[c.side].push(heroId); d.step++;
  },
  pick: function (d, heroId, playerId) {
    var c = G.Draft.current(d);
    d.picks[c.side].push({ heroId: heroId, playerId: playerId }); d.step++;
  },

  // 같은 팀 두 선수의 영웅 맞바꾸기
  swap: function (d, side, pidA, pidB) {
    var a = d.picks[side].filter(function (p) { return p.playerId === pidA; })[0];
    var b = d.picks[side].filter(function (p) { return p.playerId === pidB; })[0];
    if (!a || !b) return false;
    a.playerId = pidB; b.playerId = pidA;
    return true;
  },

  // ---- AI ----
  heroScore: function (d, side, heroId, rng) {
    var h = G.HERO_BY_ID[heroId];
    var mine = d.picks[side].map(function (p) { return p.heroId; });
    var theirs = d.picks[1 - side].map(function (p) { return p.heroId; });
    var s = G.Hero.meta(heroId, d.mods) * 0.5;
    theirs.forEach(function (e) {
      if (G.Hero.beats(heroId, e)) s += 2.5;
      if (G.Hero.beats(e, heroId)) s -= 2.5;
    });
    // 남은 포지션에 맞는 영웅인가 + 그 선수의 숙련도
    var best = -99;
    G.Draft.freePlayers(d, side).forEach(function (p) { best = Math.max(best, G.Draft.fit(p, heroId, d.pos[side][p.id])); });
    s += best / 8;
    // 탱커형이 하나도 없으면 후반 픽에서 보정
    var roles = mine.map(function (m) { return G.HERO_BY_ID[m].role; });
    if (roles.indexOf('tank') < 0 && roles.indexOf('fighter') < 0 && (h.role === 'tank' || h.role === 'fighter') && mine.length >= 2) s += 2;
    return s + (rng ? rng.range(0, 3) : 0);
  },
  // 선수-영웅 적합도: 숙련도 + 그 선수 자리(포지션)에 맞는 영웅인가
  fit: function (p, heroId, pos) {
    var h = G.HERO_BY_ID[heroId];
    pos = pos || p.role;
    return (p.mastery[heroId] || 0) + (h.pos.indexOf(pos) >= 0 ? (h.pos[0] === pos ? 45 : 35) : -45);
  },
  bestPlayerFor: function (d, side, heroId) {
    var free = G.Draft.freePlayers(d, side);
    free.sort(function (a, b) { return G.Draft.fit(b, heroId, d.pos[side][b.id]) - G.Draft.fit(a, heroId, d.pos[side][a.id]); });
    return free[0];
  },
  aiAct: function (d, rng) {
    var c = G.Draft.current(d);
    var avail = G.Draft.available(d);
    if (c.type === 'ban') {
      // 메타 영웅 + 상대 선수가 잘 다루는 영웅을 밴
      var opp = d.players[1 - c.side];
      var scored = avail.map(function (id) {
        var m = 0;
        opp.forEach(function (p) { m = Math.max(m, G.Draft.fit(p, id, d.pos[1 - c.side][p.id])); });
        return { id: id, s: G.Hero.meta(id, d.mods) * 0.6 + m / 10 + rng.range(0, 3) };
      }).sort(function (a, b) { return b.s - a.s; });
      G.Draft.ban(d, scored[0].id);
      return { type: 'ban', heroId: scored[0].id };
    }
    var best = avail.map(function (id) { return { id: id, s: G.Draft.heroScore(d, c.side, id, rng) }; })
      .sort(function (a, b) { return b.s - a.s; })[0];
    var pl = G.Draft.bestPlayerFor(d, c.side, best.id);
    G.Draft.pick(d, best.id, pl.id);
    return { type: 'pick', heroId: best.id, playerId: pl.id };
  },
  autoAll: function (d, rng) {
    while (!G.Draft.done(d)) G.Draft.aiAct(d, rng);
    return d;
  }
};
