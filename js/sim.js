// =====================================================
// sim.js — 밸런스 점검용 무작위 경기 시뮬레이션 (게임 내 디버그 + node 도구 공용)
// =====================================================
G.Sim = {
  // 포지션에 맞는 영웅을 겹치지 않게 무작위 배정
  randomComp: function (rng, used) {
    return G.POS_ORDER.map(function (pos) {
      var c = G.HEROES.filter(function (h) { return h.pos.indexOf(pos) >= 0 && !used[h.id]; });
      var h = rng.pick(c); used[h.id] = 1; return h.id;
    });
  },
  // n판 실행 → 영웅·전술 승률, 경기 통계
  random: function (n, opts) {
    opts = opts || {};
    var rng = opts.rng || new G.RNG(Date.now() % 1e9);
    var out = { n: n, heroW: {}, tac: {}, plays: {}, kills: 0, towers: 0, nexus: 0, time: 0, drag: 0, baron: 0 };
    for (var i = 0; i < n; i++) {
      var used = {};
      var sides = [0, 1].map(function (s) {
        var comp = G.Sim.randomComp(rng, used);
        return { name: 'T' + s, color: s ? '#ff6b6b' : '#4dabf7', tactic: opts.tactics ? opts.tactics[s] : rng.pick(G.STYLES),
          units: G.POS_ORDER.map(function (pos, k) {
            return { player: G.Player.generate(rng, 'sim' + s + k, 11, { role: pos }), heroId: comp[k], pos: pos };
          }) };
      });
      var r = new G.Battle({ seed: rng.int(1, 1e9), sides: sides, heroMods: opts.mods }).runToEnd().result();
      out.kills += r.score[0] + r.score[1]; out.towers += r.towers[0] + r.towers[1]; out.time += r.time;
      out.drag += r.dragons[0] + r.dragons[1]; out.baron += r.barons[0] + r.barons[1];
      if (r.endBy === 'nexus') out.nexus++;
      r.units.forEach(function (u) { var h = out.heroW[u.heroId] = out.heroW[u.heroId] || { p: 0, w: 0 }; h.p++; if (u.side === r.winner) h.w++; });
      r.plays.forEach(function (pl) { pl.forEach(function (x) { var k = x.type; out.plays[k] = out.plays[k] || [0, 0]; out.plays[k][1]++; if (x.ok) out.plays[k][0]++; }); });
      [0, 1].forEach(function (s) {
        var t = r.startTactics[s], x = out.tac[t] = out.tac[t] || { p: 0, w: 0, diffs: [] };
        x.p++; if (s === r.winner) x.w++; x.diffs.push(r.points[s] - r.points[1 - s]);
      });
    }
    return out;
  },
  sd: function (arr) {
    var m = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
    return Math.sqrt(arr.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / arr.length);
  }
};
