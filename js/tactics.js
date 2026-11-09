// =====================================================
// tactics.js — 팀 전술, 변칙 플레이, AI 전술 선택, 간파 시스템
// =====================================================
G.Tactics = {
  // 전술에 따른 피해 보정 (u: 유닛, b: 전투)
  dmgMod: function (b, u) {
    var t = G.CONFIG.TACTICS[b.sides[u.side].tactic];
    var m = b.time < G.CONFIG.HALF_TIME ? t.dmgEarly : t.dmgLate;
    if (t.counterBonus && b.inOwnHalf(u)) m += t.counterBonus;
    return m;
  },

  // ---- 간파 시스템 ----
  // memory[teamId][oppId] = 해당 상대에게 변칙 전술을 연속으로 쓴 횟수
  readCount: function (memory, teamId, oppId) {
    return (memory && memory[teamId] && memory[teamId][oppId]) || 0;
  },
  recordUse: function (memory, teamId, oppId, usedTricky) {
    if (!memory) return;
    memory[teamId] = memory[teamId] || {};
    memory[teamId][oppId] = usedTricky ? (memory[teamId][oppId] || 0) + 1 : 0;
  },

  // ---- AI 전술 선택 ----
  chooseAI: function (style, myStr, oppStr, readCount, rng) {
    var diff = myStr - oppStr;
    if (diff < -0.8 && readCount < 2 && rng.chance(0.55)) return 'tricky';
    if (style === 'tricky' && readCount >= 2 && rng.chance(0.7)) return 'balanced';
    if (diff > 1.2 && rng.chance(0.3)) return 'aggressive';
    if (rng.chance(0.2)) return rng.pick(G.STYLES);
    return style;
  },
  halftimeAI: function (cur, scoreDiff, rng) {
    if (scoreDiff <= -3) return rng.chance(0.5) ? 'tricky' : 'aggressive';
    if (scoreDiff >= 4) return rng.chance(0.6) ? 'defensive' : cur;
    return cur;
  },

  // ---- 변칙 플레이 ----
  tryPlay: function (b, side) {
    var cfg = G.CONFIG.TRICK;
    var S = b.sides[side], E = b.sides[1 - side];
    var mine = b.alive(side), theirs = b.alive(1 - side);
    if (mine.length < 3) return;
    var rng = b.rng;

    var types = ['ambush', 'fake'];
    if (b.obj.alive) types.push('split', 'split');
    var type = rng.pick(types);

    // 성공 판정: 아군 운영·팀워크 vs 상대 운영
    var myIQ = avg(mine, function (u) { return (u.p.iq + u.p.team) / 2; });
    var theirIQ = avg(theirs.length ? theirs : b.units.filter(function (u) { return u.side !== side; }),
      function (u) { return u.p.iq; });
    var penalty = S.readCount * cfg.readPenaltyPerUse + S.plays.length * cfg.inMatchPenalty;
    var mineRoll = myIQ + rng.range(0, cfg.roll) - penalty;
    var theirRoll = theirIQ + rng.range(0, cfg.roll) - 2.5;
    var ok = mineRoll > theirRoll;
    S.plays.push({ type: type, ok: ok, t: b.time });

    var names = { ambush: '기습', split: '분산 압박', fake: '페이크 후퇴' };
    b.log((ok ? '🎭 ' : '❌ ') + S.name + ' ' + names[type] + (ok ? ' 성공!' : ' 간파당함'), side, ok ? 'trick-ok' : 'trick-fail');
    b.banner(S.name + ' — ' + names[type] + (ok ? ' 성공!' : ' 실패'), side, ok);

    if (type === 'ambush') {
      var flankers = mine.slice().sort(function (a, c) {
        return score(c) - score(a);
        function score(u) { return (u.hero.arch === 'dive' ? 10 : 0) + u.p.phys; }
      }).slice(0, 2);
      // 상대 후열(딜러·서포터) 중 체력이 가장 낮은 대상을 노린다
      var back = theirs.filter(function (e) { return e.hero.role === 'marksman' || e.hero.role === 'mage' || e.hero.role === 'support'; });
      if (!back.length) back = theirs;
      back.sort(function (a, c) { return a.hp - c.hp; });
      flankers.forEach(function (u) {
        u.mode = 'flank';
        u.flankTarget = back[0];
        u.modeT = 3;
        b.addBuff(u, 'spd', cfg.ambushSpeed, 3);
        if (ok) {
          u.ambush = true;
          u.stealth = true; // 성공 시 우회하는 동안 상대가 발견하지 못함
        } else {
          b.addBuff(u, 'def', cfg.exposedDef, cfg.exposedTime);
          E.focus = u; E.focusT = cfg.exposedTime;
        }
      });
    } else if (type === 'split') {
      var splitters = mine.filter(function (u) { return u.hero.role !== 'tank'; }).slice(0, 2);
      splitters.forEach(function (u) {
        u.mode = 'objective'; u.modeT = cfg.splitTime;
        if (ok) b.addBuff(u, 'objdmg', cfg.splitObjBonus, cfg.splitTime);
      });
      if (ok) mine.forEach(function (u) { b.addBuff(u, 'dmg', cfg.splitTeamDmg, cfg.splitTime); });
      if (!ok) mine.forEach(function (u) { b.addBuff(u, 'dmg', cfg.splitFailDmg, cfg.splitFailTime); });
    } else if (type === 'fake') {
      mine.forEach(function (u) {
        u.mode = 'fake'; u.modeT = cfg.fakeRetreat;
        if (ok) {
          u.afterFake = true;
        } else {
          b.addBuff(u, 'dmg', cfg.fakeFailDmg, cfg.fakeFailTime + cfg.fakeRetreat);
          b.addBuff(u, 'slow', cfg.fakeFailSlow, cfg.fakeFailTime);
        }
      });
    }
  },

  // 페이크 후퇴가 끝나고 반격할 때
  fakeTurn: function (b, u) {
    var cfg = G.CONFIG.TRICK;
    b.addBuff(u, 'dmg', cfg.fakeDmg, cfg.fakeTime);
    b.addBuff(u, 'spd', cfg.fakeSpd, cfg.fakeTime);
    b.alive(1 - u.side).forEach(function (e) {
      if (b.dist(e, u) < 260) b.addBuff(e, 'slow', cfg.fakeSlow, 2);
    });
  }
};

function avg(arr, f) {
  if (!arr.length) return 10;
  var s = 0;
  arr.forEach(function (x) { s += f(x); });
  return s / arr.length;
}
