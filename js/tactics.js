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
  // 기습 갱킹 / 스플릿 푸시(분산 압박) / 페이크 후퇴
  tryPlay: function (b, side) {
    var cfg = G.CONFIG.TRICK;
    var S = b.sides[side], E = b.sides[1 - side];
    var mine = b.alive(side), theirs = b.alive(1 - side);
    if (mine.length < 3 || !theirs.length) return;
    var rng = b.rng;
    var type = rng.pick(['ambush', 'split', 'fake']);

    var myIQ = avg(mine, function (u) { return (u.p.iq + u.p.team) / 2; });
    var theirIQ = avg(theirs, function (u) { return u.p.iq; });
    var penalty = S.readCount * cfg.readPenaltyPerUse + S.plays.length * cfg.inMatchPenalty;
    var ok = myIQ + rng.range(0, cfg.roll) - penalty > theirIQ + rng.range(0, cfg.roll) - 2.5;
    S.plays.push({ type: type, ok: ok, t: b.time });

    var names = { ambush: '기습 갱킹', split: '스플릿 푸시', fake: '페이크 후퇴' };
    b.log((ok ? '🎭 ' : '❌ ') + S.name + ' ' + names[type] + (ok ? ' 성공!' : ' 간파당함'), side, ok ? 'trick-ok' : 'trick-fail');
    b.banner(S.name + ' — ' + names[type] + (ok ? ' 성공!' : ' 실패'), side, ok);

    if (type === 'ambush') {
      // 정글 + 미드(또는 돌진형)가 몰래 돌아가 상대 사이드 라이너를 노린다
      var flankers = mine.slice().sort(function (a, c) { return sc(c) - sc(a); }).slice(0, 2);
      function sc(u) { return (u.pos === 'jungle' ? 20 : u.pos === 'mid' ? 10 : 0) + (u.hero.arch === 'dive' ? 5 : 0) + u.p.phys * 0.1; }
      var prey = theirs.slice().sort(function (a, c) { return (a.hp / a.maxhp + (a.pos === 'adc' || a.pos === 'top' ? -0.2 : 0)) - (c.hp / c.maxhp + (c.pos === 'adc' || c.pos === 'top' ? -0.2 : 0)); })[0];
      flankers.forEach(function (u) {
        u.mode = 'flank'; u.flankTarget = prey; u.modeT = 7; u.task = null;
        b.addBuff(u, 'spd', cfg.ambushSpeed, 7);
        if (ok) { u.ambush = true; u.stealth = true; }
        else { b.addBuff(u, 'def', cfg.exposedDef, cfg.exposedTime + 4); E.focus = u; E.focusT = cfg.exposedTime + 4; }
      });
    } else if (type === 'split') {
      // 탑 라이너가 반대편 라인을 밀고, 나머지는 오브젝트/미드 압박
      var epic = b.baron.alive ? b.baron : b.dragon.alive ? b.dragon : null;
      var splitter = mine.filter(function (u) { return u.pos === 'top'; })[0] || mine[0];
      var splitLane = epic === b.dragon ? 'top' : epic === b.baron ? 'bot' : 'top';
      splitter.task = { type: 'split', lane: splitLane }; splitter.taskT = b.time + cfg.splitTime;
      if (ok) b.addBuff(splitter, 'objdmg', cfg.splitObjBonus, cfg.splitTime);
      S.call = epic ? { type: 'obj', target: epic } : { type: 'push', lane: 'mid' };
      S.callT = cfg.splitTime;
      mine.forEach(function (u) {
        if (u === splitter) return;
        b.addBuff(u, 'dmg', ok ? cfg.splitTeamDmg : cfg.splitFailDmg, ok ? cfg.splitTime : cfg.splitFailTime);
        u.task = null; u.thinkT = 0;
      });
      if (!ok) { E.focus = splitter; E.focusT = cfg.splitFailTime; }
    } else {
      mine.forEach(function (u) {
        u.mode = 'fake'; u.modeT = cfg.fakeRetreat;
        if (ok) u.afterFake = true;
        else { b.addBuff(u, 'dmg', cfg.fakeFailDmg, cfg.fakeFailTime + cfg.fakeRetreat); b.addBuff(u, 'slow', cfg.fakeFailSlow, cfg.fakeFailTime); }
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
