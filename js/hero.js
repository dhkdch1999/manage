// =====================================================
// hero.js — 영웅 스탯, 상성, 패치(메타)
// =====================================================
G.Hero = {
  // 패치가 반영된 스탯
  stats: function (id, mods) {
    var h = G.HERO_BY_ID[id];
    var m = (mods && mods[id]) || 1;
    return { hp: Math.round(h.hp * m), atk: h.atk * m, range: h.range, spd: h.spd, as: h.as };
  },
  // a 영웅이 b 영웅에게 상성 우위인가
  beats: function (aId, bId) {
    return G.ARCH_BEATS[G.HERO_BY_ID[aId].arch] === G.HERO_BY_ID[bId].arch;
  },
  // 조합 상성 점수 (양수면 mine 이 유리)
  compScore: function (mine, theirs) {
    var s = 0;
    mine.forEach(function (a) {
      theirs.forEach(function (b) {
        if (G.Hero.beats(a, b)) s++;
        if (G.Hero.beats(b, a)) s--;
      });
    });
    return s;
  },
  meta: function (id, mods) {
    var m = (mods && mods[id]) || 1;
    return (m - 1) * 100; // +7 = 버프 1단계
  },
  // 시즌 패치: 일부 영웅 버프/너프
  makePatch: function (mods, rng, heroStats) {
    var cfg = G.CONFIG;
    var ids = G.HEROES.map(function (h) { return h.id; });
    // 지난 시즌 승률이 높으면 너프 후보, 낮으면 버프 후보
    var scored = ids.map(function (id) {
      var st = heroStats && heroStats[id];
      var wr = st && st.picks >= 3 ? st.wins / st.picks : 0.5;
      return { id: id, wr: wr + rng.range(-0.08, 0.08) };
    });
    scored.sort(function (a, b) { return b.wr - a.wr; });
    var notes = [];
    for (var i = 0; i < cfg.PATCH_COUNT; i++) {
      var n = scored[i].id;
      mods[n] = Math.max(0.79, ((mods[n] || 1) - cfg.PATCH_STEP));
      notes.push({ id: n, type: 'nerf' });
      var b = scored[scored.length - 1 - i].id;
      mods[b] = Math.min(1.21, ((mods[b] || 1) + cfg.PATCH_STEP));
      notes.push({ id: b, type: 'buff' });
    }
    return notes;
  }
};
