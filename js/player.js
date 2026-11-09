// =====================================================
// player.js — 선수 생성, 성장, 가치
// =====================================================
G.Player = {
  _usedNicks: {},

  makeNick: function (rng) {
    for (var i = 0; i < 50; i++) {
      var n = rng.chance(0.55) ? rng.pick(G.NICK_EN) + rng.pick(G.NICK_B) : rng.pick(G.NICK_A) + rng.pick(G.NICK_B);
      if (!G.Player._usedNicks[n]) { G.Player._usedNicks[n] = 1; return n; }
    }
    var x = rng.pick(G.NICK_EN) + rng.int(100, 999);
    G.Player._usedNicks[x] = 1;
    return x;
  },

  // tier: 평균 능력치 목표치
  generate: function (rng, id, tier, opts) {
    opts = opts || {};
    var role = opts.role || rng.pick(G.ROLE_ORDER);
    var age = opts.age || rng.int(17, 27);
    var stats = {};
    G.STAT_KEYS.forEach(function (k) {
      stats[k] = Math.round(G.clamp(tier + rng.range(-3, 3), 1, 20));
    });
    // 역할별 특화
    var boost = { tank: 'def', fighter: 'atk', mage: 'atk', marksman: 'phys', support: 'team' }[role];
    stats[boost] = Math.min(20, stats[boost] + rng.int(1, 2));
    var ovr = G.Player.overallOf(stats);
    var youth = G.clamp((24 - age) / 7, 0, 1);
    var potential = Math.round(G.clamp(ovr + rng.range(0, 3) + youth * rng.range(1, 6) + (opts.potBonus || 0), ovr, 20));
    var p = {
      id: id,
      nick: G.Player.makeNick(rng),
      age: age,
      role: role,
      stats: stats,
      potential: potential,
      growth: Math.round(rng.range(0.6, 1.4) * 100) / 100,
      mental: rng.int(5, 18),
      condition: rng.int(80, 95),
      fatigue: rng.int(0, 15),
      morale: 60,
      salary: 0,
      years: rng.int(1, 3),
      mastery: {},
      progress: {},
      train: 'atk',
      trainHero: null,
      teamId: null,
      career: { games: 0, wins: 0, k: 0, d: 0, a: 0 },
      season: { games: 0, wins: 0, k: 0, d: 0, a: 0 }
    };
    // 숙련도: 선호 역할 영웅은 높게
    G.HEROES.forEach(function (h) {
      var base = h.role === role ? rng.int(35, 75) : rng.int(3, 30);
      p.mastery[h.id] = base;
    });
    p.train = boost;
    p.salary = G.Player.salaryDemand(p);
    return p;
  },

  overallOf: function (s) {
    return (s.atk + s.def + s.phys + s.iq + s.team) / 5;
  },
  overall: function (p) { return G.Player.overallOf(p.stats); },

  // 이적 가치 (만원)
  value: function (p) {
    var o = G.Player.overall(p);
    var ageF = p.age <= 21 ? 1.25 : p.age <= 25 ? 1.0 : p.age <= 27 ? 0.8 : 0.55;
    var potF = 1 + Math.max(0, p.potential - o) * 0.06;
    return Math.round(Math.pow(o, 2.6) * 1.1 * ageF * potF / 10) * 10;
  },
  salaryDemand: function (p) {
    var o = G.Player.overall(p);
    return Math.max(150, Math.round(Math.pow(o, 2.3) * 2.2 / 10) * 10);
  },

  bestHeroes: function (p, n) {
    return G.HEROES.map(function (h) { return { id: h.id, m: p.mastery[h.id] || 0 }; })
      .sort(function (a, b) { return b.m - a.m; }).slice(0, n || 3);
  },

  // 주간 훈련 처리
  weekly: function (p, facility, rng, isUser) {
    var cfg = G.CONFIG;
    var dormF = 1 - (facility.dorm - 1) * 0.08;
    var trainF = 1 + (facility.train - 1) * 0.15;
    var ageF = p.age <= 22 ? 1.2 : p.age <= 25 ? 1.0 : 0.6;
    var focus = isUser ? p.train : rng.pick(G.STAT_KEYS.concat(['rest']));
    if (!isUser && p.fatigue > 45) focus = 'rest';
    if (focus === 'rest') {
      p.fatigue = Math.max(0, p.fatigue - cfg.REST_RECOVER);
    } else {
      p.fatigue = Math.min(100, p.fatigue + cfg.TRAIN_FATIGUE * dormF);
      if (focus === 'hero') {
        var hid = p.trainHero || G.Player.bestHeroes(p, 1)[0].id;
        p.mastery[hid] = Math.min(100, (p.mastery[hid] || 0) + cfg.HERO_TRAIN_GAIN * p.growth * trainF);
      } else {
        var cap = p.stats[focus] < p.potential + 1 ? 1 : 0.15;
        var fatigueF = p.fatigue > 70 ? 0.5 : 1;
        p.progress[focus] = (p.progress[focus] || 0) + cfg.TRAIN_RATE * p.growth * trainF * ageF * cap * fatigueF;
        if (p.progress[focus] >= 1 && p.stats[focus] < 20) {
          p.stats[focus]++;
          p.progress[focus] -= 1;
          return { up: focus };
        }
      }
    }
    return null;
  },

  updateCondition: function (p, rng) {
    p.condition = Math.round(G.clamp(96 - p.fatigue * 0.6 + (p.morale - 50) * 0.12 + rng.range(-5, 5), 30, 100));
  },

  // 시즌 종료: 나이, 성장/하락, 은퇴
  ageUp: function (p, rng) {
    p.age++;
    var changes = [];
    G.STAT_KEYS.forEach(function (k) {
      if (p.age >= 26 && rng.chance((p.age - 25) * 0.14) && p.stats[k] > 1) { p.stats[k]--; changes.push(k + '-'); }
      else if (p.age <= 22 && p.stats[k] < p.potential && rng.chance(0.3 * p.growth)) { p.stats[k]++; changes.push(k + '+'); }
    });
    var retire = p.age >= 29 && rng.chance((p.age - 28) * 0.25);
    return { changes: changes, retire: retire };
  }
};
