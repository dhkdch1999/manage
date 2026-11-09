// =====================================================
// league.js — 게임 상태, 리그/플레이오프/세계 대회, 주간 진행, 구단 운영, 이적시장
// =====================================================
G.League = (function () {
  var C = G.CONFIG;
  var L = {};

  function S() { return G.state; }
  function rng() { return G.rng; }

  // ---------- 새 게임 ----------
  L.newGame = function (teamName, seed) {
    seed = seed || Math.floor(Math.random() * 1e9);
    G.rng = new G.RNG(seed);
    G.Player._usedNicks = {};
    var st = G.state = {
      version: 1, seed: seed, season: 1, week: 0, phase: 'season',
      userTeamId: 'T0', money: C.START_MONEY, fans: C.START_FANS, facility: { train: 1, dorm: 1 },
      teams: {}, players: {}, nextPid: 1, divisions: { 1: [], 2: [] }, schedule: {},
      results: [], bracket: {}, worldTeams: [], heroMods: {}, heroStats: {}, patchNotes: [],
      trickMemory: {}, scouted: {}, freeAgents: [], history: [], news: [], matchLog: [], pendingRenewals: [],
      userPlan: { tactic: 'balanced', orders: {} }, tutorialSeen: false, speed: 1
    };
    // 2부: 유저 팀 + 7팀, 1부: 8팀
    var idx = 0;
    addTeam('T0', teamName || '신생 게이밍', 2, 8.6, 'balanced', true);
    G.TEAM_NAMES_2.forEach(function (n) { addTeam('T' + (++idx), n, 2, rng().range(8.3, 10.2), rng().pick(G.STYLES)); });
    G.TEAM_NAMES_1.forEach(function (n) { addTeam('T' + (++idx), n, 1, rng().range(10.6, 12.8), rng().pick(G.STYLES)); });
    // 자유계약 선수 풀
    for (var i = 0; i < 24; i++) {
      var p = L.newPlayer(rng().range(6.5, 10.5), {});
      st.freeAgents.push(p.id);
    }
    L.startSeason(true);
    L.news('🎮 ' + teamName + ' 창단! 2부 리그에서 첫 시즌을 시작합니다.');
    return st;
  };

  function addTeam(id, name, div, tier, style, isUser) {
    var st = S();
    var t = { id: id, name: name, color: G.TEAM_COLORS[Object.keys(st.teams).length % G.TEAM_COLORS.length],
      div: div, players: [], starters: [], style: style, user: !!isUser };
    st.teams[id] = t;
    if (div) st.divisions[div].push(id);
    // 역할별 1명씩 + 후보 1명
    G.ROLE_ORDER.forEach(function (r) {
      var p = L.newPlayer(tier + rng().range(-0.6, 0.6), { role: r });
      L.joinTeam(p, t);
    });
    t.starters = t.players.slice(0, 5); // 역할별 1명씩 선발
    var sub = L.newPlayer(tier - 1, {});
    L.joinTeam(sub, t);
    return t;
  }

  L.newPlayer = function (tier, opts) {
    var st = S();
    var p = G.Player.generate(rng(), 'P' + (st.nextPid++), tier, opts);
    st.players[p.id] = p;
    return p;
  };
  L.joinTeam = function (p, t) {
    if (p.teamId && S().teams[p.teamId]) L.leaveTeam(p);
    var fa = S().freeAgents.indexOf(p.id);
    if (fa >= 0) S().freeAgents.splice(fa, 1);
    p.teamId = t.id;
    t.players.push(p.id);
  };
  L.leaveTeam = function (p, toFA) {
    var t = S().teams[p.teamId];
    if (t) {
      t.players = t.players.filter(function (x) { return x !== p.id; });
      t.starters = t.starters.filter(function (x) { return x !== p.id; });
      if (t.starters.length < 5) L.fillStarters(t);
    }
    p.teamId = null;
    if (toFA) S().freeAgents.push(p.id);
  };
  L.autoStarters = function (t) {
    var ps = t.players.map(L.p).sort(function (a, b) { return G.Player.overall(b) - G.Player.overall(a); });
    t.starters = ps.slice(0, 5).map(function (p) { return p.id; });
  };
  L.fillStarters = function (t) {
    var rest = t.players.filter(function (x) { return t.starters.indexOf(x) < 0; }).map(L.p)
      .sort(function (a, b) { return G.Player.overall(b) - G.Player.overall(a); });
    while (t.starters.length < 5 && rest.length) t.starters.push(rest.shift().id);
  };

  L.p = function (id) { return S().players[id]; };
  L.t = function (id) { return S().teams[id]; };
  L.user = function () { return S().teams[S().userTeamId]; };
  L.strength = function (teamId) {
    var t = L.t(teamId);
    var ps = t.starters.map(L.p);
    if (!ps.length) return 0;
    return ps.reduce(function (s, p) { return s + G.Player.overall(p); }, 0) / ps.length;
  };
  L.news = function (text) {
    var st = S();
    st.news.unshift({ season: st.season, week: st.week, text: text });
    if (st.news.length > 60) st.news.length = 60;
  };

  // ---------- 시즌 ----------
  L.startSeason = function (first) {
    var st = S();
    st.week = 0; st.phase = 'season'; st.bracket = {}; st._fxKey = null;
    // 지난 시즌 경기 기록은 우리 팀 경기만 남긴다 (저장 용량 관리)
    var uid0 = st.userTeamId;
    st.results = st.results.filter(function (r) { return r.season === st.season || r.a === uid0 || r.b === uid0; });
    // 일정
    [1, 2].forEach(function (d) { st.schedule[d] = roundRobin(rng().shuffle(st.divisions[d].slice())); });
    // 세계 대회 해외 팀
    st.worldTeams.forEach(function (id) {
      var t = st.teams[id];
      t.players.forEach(function (pid) { delete st.players[pid]; });
      delete st.teams[id];
    });
    st.worldTeams = [];
    var names = rng().shuffle(G.WORLD_TEAMS.slice());
    for (var i = 0; i < 2; i++) {
      var wid = 'W' + st.season + '_' + i;
      var t = addTeam(wid, names[i], 0, rng().range(12.8, 14.2) + st.season * 0.05, rng().pick(G.STYLES));
      t.foreign = true;
      st.worldTeams.push(wid);
    }
    // 패치
    if (!first) {
      var notes = G.Hero.makePatch(st.heroMods, rng(), st.heroStats);
      st.patchNotes = notes;
      L.news('🛠️ 시즌 ' + st.season + ' 패치: ' + notes.map(function (n) {
        return G.HERO_BY_ID[n.id].name + (n.type === 'buff' ? '▲' : '▼');
      }).join(', '));
    }
    st.heroStats = {};
    Object.keys(st.players).forEach(function (id) { st.players[id].season = { games: 0, wins: 0, k: 0, d: 0, a: 0 }; });
  };

  function roundRobin(ids) {
    var n = ids.length, arr = ids.slice(), rounds = [];
    for (var r = 0; r < n - 1; r++) {
      var games = [];
      for (var i = 0; i < n / 2; i++) {
        var a = arr[i], b = arr[n - 1 - i];
        games.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
      rounds.push(games);
      arr.splice(1, 0, arr.pop());
    }
    var second = rounds.map(function (g) { return g.map(function (x) { return [x[1], x[0]]; }); });
    return rounds.concat(second);
  }

  L.stageName = function (stage) {
    return { regular: '정규 시즌', semi: '플레이오프 4강', final: '플레이오프 결승', wsemi: '세계 대회 4강', wfinal: '세계 대회 결승' }[stage] || stage;
  };

  L.weekLabel = function () {
    var st = S();
    if (st.phase === 'offseason') return '오프시즌';
    if (st.week < C.WEEKS_REGULAR) return (st.week + 1) + '주차';
    return L.stageName(['semi', 'final', 'wsemi', 'wfinal'][st.week - C.WEEKS_REGULAR]);
  };

  // 이번 주 경기 목록
  L.fixtures = function () {
    var st = S(), w = st.week, out = [];
    if (st.phase === 'offseason') return out;
    // 같은 주에 여러 번 호출돼도 대진이 바뀌지 않도록 캐시
    var key = st.season + '-' + w;
    if (st._fxKey === key && st._fx) return st._fx;
    if (w < C.WEEKS_REGULAR) {
      [1, 2].forEach(function (d) {
        st.schedule[d][w].forEach(function (g) { out.push({ a: g[0], b: g[1], div: d, stage: 'regular' }); });
      });
    } else if (w === C.WEEKS_REGULAR) {
      [1, 2].forEach(function (d) {
        var tb = L.table(d);
        st.bracket[d] = { top4: tb.slice(0, 4).map(function (r) { return r.id; }) };
        var t4 = st.bracket[d].top4;
        out.push({ a: t4[0], b: t4[3], div: d, stage: 'semi' }, { a: t4[1], b: t4[2], div: d, stage: 'semi' });
      });
    } else if (w === C.WEEKS_REGULAR + 1) {
      [1, 2].forEach(function (d) {
        var f = st.bracket[d].finalists;
        out.push({ a: f[0], b: f[1], div: d, stage: 'final' });
      });
    } else if (w === C.WEEKS_REGULAR + 2) {
      var b1 = st.bracket[1];
      st.bracket.w = { teams: [b1.champ, b1.runner, st.worldTeams[0], st.worldTeams[1]] };
      out.push({ a: b1.champ, b: st.worldTeams[1], div: 0, stage: 'wsemi' }, { a: b1.runner, b: st.worldTeams[0], div: 0, stage: 'wsemi' });
    } else if (w === C.WEEKS_REGULAR + 3) {
      var fw = st.bracket.w.finalists;
      out.push({ a: fw[0], b: fw[1], div: 0, stage: 'wfinal' });
    }
    st._fxKey = key; st._fx = out;
    return out;
  };
  L.userFixture = function () {
    var uid = S().userTeamId;
    return L.fixtures().filter(function (f) { return f.a === uid || f.b === uid; })[0] || null;
  };

  L.table = function (div) {
    var st = S();
    var rows = {};
    st.divisions[div].forEach(function (id) { rows[id] = { id: id, w: 0, l: 0, sf: 0, sa: 0 }; });
    st.results.forEach(function (r) {
      if (r.season !== st.season || r.stage !== 'regular' || r.div !== div) return;
      if (!rows[r.a] || !rows[r.b]) return;
      var wa = r.winner === r.a;
      rows[r.a].w += wa ? 1 : 0; rows[r.a].l += wa ? 0 : 1;
      rows[r.b].w += wa ? 0 : 1; rows[r.b].l += wa ? 1 : 0;
      rows[r.a].sf += r.score[0]; rows[r.a].sa += r.score[1];
      rows[r.b].sf += r.score[1]; rows[r.b].sa += r.score[0];
    });
    return Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (x, y) {
      return (y.w - x.w) || ((y.sf - y.sa) - (x.sf - x.sa)) || (y.sf - x.sf);
    });
  };

  // ---------- 경기 ----------
  L.sidePlayers = function (teamId) { return L.t(teamId).starters.map(L.p); };

  L.aiTactic = function (teamId, oppId) {
    var t = L.t(teamId);
    var rc = G.Tactics.readCount(S().trickMemory, teamId, oppId);
    return G.Tactics.chooseAI(t.style, L.strength(teamId), L.strength(oppId), rc, rng());
  };

  // 밴픽 결과 + 전술로 전투 생성
  L.makeBattle = function (fx, draft, tactics, orders, render) {
    var st = S();
    var sides = [fx.a, fx.b].map(function (tid, si) {
      var t = L.t(tid);
      var opp = si === 0 ? fx.b : fx.a;
      return {
        name: t.name, color: si === 0 ? '#4dabf7' : '#ff6b6b', tactic: tactics[si],
        readCount: tactics[si] === 'tricky' ? G.Tactics.readCount(st.trickMemory, tid, opp) : 0,
        units: draft.picks[si].map(function (pk) {
          return { player: L.p(pk.playerId), heroId: pk.heroId, order: (orders && orders[si] && orders[si][pk.playerId]) || { focus: 'auto', entry: 'now' } };
        })
      };
    });
    return new G.Battle({ seed: rng().int(1, 1e9), heroMods: st.heroMods, sides: sides, render: render });
  };

  L.simFixture = function (fx) {
    var d = G.Draft.create([L.sidePlayers(fx.a), L.sidePlayers(fx.b)], S().heroMods);
    G.Draft.autoAll(d, rng());
    var tactics = [L.aiTactic(fx.a, fx.b), L.aiTactic(fx.b, fx.a)];
    var b = L.makeBattle(fx, d, tactics, null, false);
    b.runToEnd(function (bt) {
      return [G.Tactics.halftimeAI(bt.sides[0].tactic, bt.score[0] - bt.score[1], rng()),
        G.Tactics.halftimeAI(bt.sides[1].tactic, bt.score[1] - bt.score[0], rng())];
    });
    return L.applyResult(fx, b.result(), d);
  };

  L.applyResult = function (fx, res, draft) {
    var st = S();
    var winner = res.winner === 0 ? fx.a : fx.b;
    var loser = res.winner === 0 ? fx.b : fx.a;
    var rec = { season: st.season, week: st.week, div: fx.div, stage: fx.stage, a: fx.a, b: fx.b, winner: winner,
      score: res.score, mvp: res.mvp, tactics: res.startTactics, plays: res.plays.map(function (p) { return p.length; }) };
    st.results.push(rec);
    // 선수 기록
    res.units.forEach(function (u) {
      var p = L.p(u.playerId);
      if (!p) return;
      var won = (u.side === res.winner);
      [p.season, p.career].forEach(function (c) { c.games++; if (won) c.wins++; c.k += u.k; c.d += u.d; c.a += u.a; });
      p.mastery[u.heroId] = Math.min(100, (p.mastery[u.heroId] || 0) + C.MATCH_MASTERY_GAIN);
      p.fatigue = Math.min(100, p.fatigue + C.MATCH_FATIGUE);
      p.morale = G.clamp(p.morale + (won ? 8 : -6), 0, 100);
      var hs = st.heroStats[u.heroId] = st.heroStats[u.heroId] || { picks: 0, wins: 0, bans: 0 };
      hs.picks++; if (won) hs.wins++;
    });
    if (draft) [0, 1].forEach(function (s) { draft.bans[s].forEach(function (h) {
      var hs = st.heroStats[h] = st.heroStats[h] || { picks: 0, wins: 0, bans: 0 }; hs.bans++;
    }); });
    // 간파 기록
    G.Tactics.recordUse(st.trickMemory, fx.a, fx.b, res.startTactics[0] === 'tricky' || res.tactics[0] === 'tricky');
    G.Tactics.recordUse(st.trickMemory, fx.b, fx.a, res.startTactics[1] === 'tricky' || res.tactics[1] === 'tricky');
    // 플레이오프 진출 처리
    var br;
    if (fx.stage === 'semi') {
      br = st.bracket[fx.div]; br.finalists = br.finalists || []; br.finalists.push(winner);
      br.semiLosers = br.semiLosers || []; br.semiLosers.push(loser);
    } else if (fx.stage === 'final') {
      br = st.bracket[fx.div]; br.champ = winner; br.runner = loser;
      L.news('🏆 ' + fx.div + '부 리그 우승: ' + L.t(winner).name);
      prize(winner, C.PLAYOFF_PRIZE[fx.div][0]); prize(loser, C.PLAYOFF_PRIZE[fx.div][1]);
    } else if (fx.stage === 'wsemi') {
      br = st.bracket.w; br.finalists = br.finalists || []; br.finalists.push(winner);
      br.semiLosers = br.semiLosers || []; br.semiLosers.push(loser);
    } else if (fx.stage === 'wfinal') {
      br = st.bracket.w; br.champ = winner; br.runner = loser;
      L.news('🌏 세계 대회 우승: ' + L.t(winner).name + '!');
      prize(winner, C.WORLDS_PRIZE[0]); prize(loser, C.WORLDS_PRIZE[1]);
    }
    // 유저 팀 재정·팬
    var uid = st.userTeamId;
    if (fx.a === uid || fx.b === uid) {
      var won = winner === uid;
      if (won) st.money += C.WIN_PRIZE[L.user().div] || 100;
      st.fans = Math.round(st.fans * (won ? 1.04 : 0.98) + (won ? 20 : 0));
      var opp = fx.a === uid ? fx.b : fx.a;
      st.matchLog.unshift({ season: st.season, week: st.week, stage: fx.stage, opp: opp, win: won,
        score: fx.a === uid ? res.score : [res.score[1], res.score[0]], mvp: res.mvp,
        plays: res.plays[fx.a === uid ? 0 : 1] });
      if (st.matchLog.length > 40) st.matchLog.length = 40;
    }
    return rec;
  };

  function prize(teamId, amount) {
    if (teamId === S().userTeamId) { S().money += amount; L.news('💰 상금 ' + amount.toLocaleString() + '만원 획득'); }
  }

  // ---------- 주간 진행 ----------
  // 유저 경기는 UI에서 먼저 applyResult 로 처리된 상태여야 함
  L.advanceWeek = function () {
    var st = S();
    var played = {};
    st.results.forEach(function (r) { if (r.season === st.season && r.week === st.week) played[r.a + r.b] = 1; });
    L.fixtures().forEach(function (fx) {
      if (played[fx.a + fx.b]) return;
      L.simFixture(fx); // 유저가 직접 하지 않은 경기(건너뛰기 포함)는 자동 진행
    });
    L.weeklyProcess();
    st.week++;
    st._fxKey = null;
    // 단계 전환
    if (st.week === C.WEEKS_REGULAR) { st.phase = 'playoffs'; L.news('🔥 정규 시즌 종료! 플레이오프가 시작됩니다.'); }
    if (st.week === C.WEEKS_REGULAR + 2) {
      st.phase = 'worlds';
      var b1 = st.bracket[1];
      L.news('🌏 세계 대회 진출: ' + L.t(b1.champ).name + ', ' + L.t(b1.runner).name);
    }
    if (st.week >= C.WEEKS_REGULAR + 4) L.endSeason();
  };

  L.weeklyProcess = function () {
    var st = S(), uid = st.userTeamId;
    var ups = [];
    Object.keys(st.players).forEach(function (id) {
      var p = st.players[id];
      if (!p.teamId) { p.fatigue = Math.max(0, p.fatigue - 10); return; }
      var isUser = p.teamId === uid;
      var r = G.Player.weekly(p, isUser ? st.facility : { train: 2, dorm: 2 }, rng(), isUser);
      if (r && isUser) ups.push(p.nick + ' ' + G.STAT_NAMES[r.up] + ' +1');
      G.Player.updateCondition(p, rng());
    });
    if (ups.length) L.news('📈 훈련 성과: ' + ups.join(', '));
    // 재정
    var t = L.user();
    var salary = t.players.reduce(function (s, id) { return s + L.p(id).salary; }, 0);
    var pay = Math.round(salary / C.SALARY_DIVISOR);
    var sponsor = Math.round(C.SPONSOR_BASE + st.fans * C.SPONSOR_PER_FAN + (t.div === 1 ? 150 : 0));
    st.money += sponsor - pay;
    st.lastFinance = { sponsor: sponsor, salary: pay };
    if (st.money < 0) L.news('⚠️ 자금이 마이너스입니다! 선수를 정리하거나 성적을 내야 합니다.');
  };

  // ---------- 시즌 종료 ----------
  L.endSeason = function () {
    var st = S(), uid = st.userTeamId, ut = L.user();
    st.phase = 'offseason';
    // 기록
    var div = ut.div;
    var tb = L.table(div);
    var rank = tb.map(function (r) { return r.id; }).indexOf(uid) + 1;
    var br = st.bracket[div] || {};
    var po = br.champ === uid ? '우승' : br.runner === uid ? '준우승' : (br.top4 || []).indexOf(uid) >= 0 ? '4강' : '-';
    var bw = st.bracket.w || {};
    var wr = bw.champ === uid ? '우승' : bw.runner === uid ? '준우승' : (bw.teams || []).indexOf(uid) >= 0 ? '4강' : '-';
    var seasonRes = st.results.filter(function (r) { return r.season === st.season && (r.a === uid || r.b === uid); });
    st.history.push({ season: st.season, div: div, rank: rank, playoff: po, worlds: wr,
      w: seasonRes.filter(function (r) { return r.winner === uid; }).length, l: seasonRes.filter(function (r) { return r.winner !== uid; }).length,
      champ1: (st.bracket[1] || {}).champ ? L.t(st.bracket[1].champ).name : '-', worldChamp: bw.champ ? L.t(bw.champ).name : '-' });

    // 승강
    var t1 = L.table(1), t2 = L.table(2);
    var down = t1.slice(-2).map(function (r) { return r.id; });
    var up = t2.slice(0, 2).map(function (r) { return r.id; });
    down.forEach(function (id) { L.t(id).div = 2; });
    up.forEach(function (id) { L.t(id).div = 1; });
    st.divisions[1] = st.divisions[1].filter(function (id) { return down.indexOf(id) < 0; }).concat(up);
    st.divisions[2] = st.divisions[2].filter(function (id) { return up.indexOf(id) < 0; }).concat(down);
    L.news('⬆️ 1부 승격: ' + up.map(function (id) { return L.t(id).name; }).join(', ') +
      ' / ⬇️ 2부 강등: ' + down.map(function (id) { return L.t(id).name; }).join(', '));
    if (up.indexOf(uid) >= 0) L.news('🎉 축하합니다! 우리 팀이 1부 리그로 승격했습니다!');
    if (down.indexOf(uid) >= 0) L.news('😢 우리 팀이 2부 리그로 강등됐습니다.');

    // 선수 나이·은퇴·계약
    st.pendingRenewals = [];
    Object.keys(st.players).forEach(function (id) {
      var p = st.players[id];
      var team = p.teamId && st.teams[p.teamId];
      if (team && team.foreign) return;
      var r = G.Player.ageUp(p, rng());
      if (r.retire) {
        if (p.teamId === uid) L.news('👋 ' + p.nick + ' 선수가 은퇴를 선언했습니다. (' + p.age + '세)');
        L.leaveTeam(p, false);
        delete st.players[id];
        var fi = st.freeAgents.indexOf(id); if (fi >= 0) st.freeAgents.splice(fi, 1);
        return;
      }
      if (!p.teamId) return;
      p.years--;
      if (p.years <= 0) {
        if (p.teamId === uid) st.pendingRenewals.push(p.id);
        else if (rng().chance(0.72)) { p.years = rng().int(1, 3); p.salary = G.Player.salaryDemand(p); }
        else L.leaveTeam(p, true);
      }
    });
    if (st.pendingRenewals.length) L.news('📝 계약 만료 선수 ' + st.pendingRenewals.length + '명 — 이적시장에서 재계약하세요.');

    // 신인
    for (var i = 0; i < 14; i++) {
      var rk = L.newPlayer(rng().range(5.5, 9.5), { age: rng().int(16, 19), potBonus: 2 });
      st.freeAgents.push(rk.id);
    }
    // 자유계약 풀 정리
    st.freeAgents.sort(function (a, b) { return G.Player.value(L.p(b)) - G.Player.value(L.p(a)); });
    while (st.freeAgents.length > 45) { var gone = st.freeAgents.pop(); delete st.players[gone]; }

    // AI 팀 보강
    Object.keys(st.teams).forEach(function (tid) {
      var t = st.teams[tid];
      if (t.user || t.foreign) return;
      while (t.players.length < 6 && st.freeAgents.length) {
        var best = st.freeAgents.slice(0, 8).sort(function (a, b) { return G.Player.overall(L.p(b)) - G.Player.overall(L.p(a)); })[0];
        var bp = L.p(best);
        bp.years = rng().int(1, 3); bp.salary = G.Player.salaryDemand(bp);
        L.joinTeam(bp, t);
      }
      L.autoStarters(t);
    });
    var u = L.user();
    u.starters = u.starters.filter(function (id) { return u.players.indexOf(id) >= 0; });
    L.fillStarters(u);
    L.news('📅 시즌 ' + st.season + ' 종료. 이적시장이 열렸습니다.');
  };

  L.canStartSeason = function () {
    var u = L.user();
    var active = u.players.filter(function (id) { return S().pendingRenewals.indexOf(id) < 0; });
    if (active.length < C.ROSTER_MIN) return '선수가 ' + C.ROSTER_MIN + '명 이상 필요합니다 (재계약 안 한 선수 제외 ' + active.length + '명).';
    return null;
  };
  L.newSeason = function () {
    var st = S();
    // 재계약 안 한 선수는 방출
    st.pendingRenewals.forEach(function (id) {
      var p = L.p(id);
      if (p && p.teamId === st.userTeamId && p.years <= 0) { L.leaveTeam(p, true); L.news('🚪 ' + p.nick + ' 선수가 계약 만료로 팀을 떠났습니다.'); }
    });
    st.pendingRenewals = [];
    st.season++;
    L.startSeason(false);
    var u = L.user(); L.fillStarters(u);
    L.news('🚀 시즌 ' + st.season + ' 개막! ' + u.div + '부 리그');
  };

  // ---------- 이적시장 / 계약 ----------
  L.isKnown = function (pid) {
    var p = L.p(pid);
    return p.teamId === S().userTeamId || !!S().scouted[pid];
  };
  // 스카우트 전에 보이는 능력치 2개
  L.visibleStats = function (pid) {
    var h = 0;
    for (var i = 0; i < pid.length; i++) h = (h * 31 + pid.charCodeAt(i)) >>> 0;
    var a = G.STAT_KEYS[h % 5], b = G.STAT_KEYS[(h + 2) % 5];
    return [a, b];
  };
  L.scout = function (pid) {
    var st = S();
    if (st.money < C.SCOUT_COST) return '자금이 부족합니다.';
    st.money -= C.SCOUT_COST; st.scouted[pid] = true;
    return null;
  };
  L.demand = function (p) {
    var base = G.Player.salaryDemand(p);
    var rep = L.user().div === 1 ? 0.95 : 1.08;
    return Math.round(base * rep / 10) * 10;
  };
  // 계약 협상: 결과 메시지와 성공 여부
  L.offer = function (pid, salary, years) {
    var p = L.p(pid);
    var need = L.demand(p) * (years >= 3 && p.age >= 26 ? 0.93 : years === 1 && p.age <= 21 ? 0.95 : 1);
    var ratio = salary / need;
    if (ratio >= 1) return { ok: true, msg: p.nick + ': "좋습니다. 계약하죠!"' };
    if (ratio >= 0.9 && rng().chance((ratio - 0.9) * 7)) return { ok: true, msg: p.nick + ': "조금 아쉽지만 받아들이겠습니다."' };
    return { ok: false, msg: p.nick + ': "' + (ratio < 0.75 ? '말도 안 되는 금액이네요.' : '조금만 더 올려 주시면 생각해 볼게요.') + '" (희망 연봉 약 ' + Math.round(need / 10) * 10 + '만원)' };
  };
  L.transferFee = function (p) { return Math.round(G.Player.value(p) * 1.15 / 10) * 10; };
  L.canBuyFromTeams = function () { return S().phase === 'offseason'; };

  L.sign = function (pid, salary, years) {
    var st = S(), p = L.p(pid), u = L.user();
    if (u.players.length >= C.ROSTER_MAX) return { ok: false, msg: '선수단이 가득 찼습니다 (최대 ' + C.ROSTER_MAX + '명).' };
    var fee = 0;
    if (p.teamId) {
      if (!L.canBuyFromTeams()) return { ok: false, msg: '다른 팀 선수 영입은 오프시즌에만 가능합니다.' };
      var from = L.t(p.teamId);
      if (from.players.length <= 5) return { ok: false, msg: from.name + '은(는) 선수가 부족해 판매를 거절했습니다.' };
      fee = L.transferFee(p);
      if (st.money < fee) return { ok: false, msg: '이적료 ' + fee.toLocaleString() + '만원이 부족합니다.' };
    }
    var r = L.offer(pid, salary, years);
    if (!r.ok) return r;
    if (p.teamId) { var ft = L.t(p.teamId); L.leaveTeam(p, false); L.autoStarters(ft); }
    st.money -= fee;
    p.salary = salary; p.years = years; p.train = 'atk'; p.morale = 70;
    L.joinTeam(p, u);
    st.scouted[pid] = true;
    if (u.starters.length < 5) L.fillStarters(u);
    L.news('✍️ ' + p.nick + ' 영입 (연봉 ' + salary + '만원 / ' + years + '년' + (fee ? ', 이적료 ' + fee.toLocaleString() + '만원' : '') + ')');
    return r;
  };
  L.renew = function (pid, salary, years) {
    var r = L.offer(pid, salary, years);
    if (!r.ok) return r;
    var p = L.p(pid);
    p.salary = salary; p.years = years;
    S().pendingRenewals = S().pendingRenewals.filter(function (x) { return x !== pid; });
    L.news('🖊️ ' + p.nick + ' 재계약 (연봉 ' + salary + '만원 / ' + years + '년)');
    return r;
  };
  L.releaseCost = function (p) { return Math.round(p.salary * 0.5); };
  L.release = function (pid) {
    var st = S(), p = L.p(pid), u = L.user();
    if (u.players.length <= C.ROSTER_MIN) return '선수단은 최소 ' + C.ROSTER_MIN + '명이어야 합니다.';
    var cost = L.releaseCost(p);
    st.money -= cost;
    L.leaveTeam(p, true);
    st.pendingRenewals = st.pendingRenewals.filter(function (x) { return x !== pid; });
    L.news('🚪 ' + p.nick + ' 방출 (위약금 ' + cost + '만원)');
    return null;
  };
  // 판매 제안 받기
  L.sellOffer = function (pid) {
    var p = L.p(pid);
    var buyers = Object.keys(S().teams).map(L.t).filter(function (t) { return !t.user && !t.foreign && t.players.length < C.ROSTER_MAX; });
    if (!buyers.length) return null;
    var b = rng().pick(buyers);
    return { teamId: b.id, fee: Math.round(G.Player.value(p) * rng().range(0.75, 1.1) / 10) * 10 };
  };
  L.sell = function (pid, offer) {
    var st = S(), p = L.p(pid), u = L.user();
    if (u.players.length <= C.ROSTER_MIN) return '선수단은 최소 ' + C.ROSTER_MIN + '명이어야 합니다.';
    var t = L.t(offer.teamId);
    L.leaveTeam(p, false);
    p.salary = G.Player.salaryDemand(p); p.years = Math.max(1, p.years);
    L.joinTeam(p, t); L.autoStarters(t);
    st.money += offer.fee;
    st.pendingRenewals = st.pendingRenewals.filter(function (x) { return x !== pid; });
    L.news('💸 ' + p.nick + ' → ' + t.name + ' 이적 (이적료 ' + offer.fee.toLocaleString() + '만원)');
    return null;
  };

  // ---------- 시설 ----------
  L.upgradeCost = function (key) { return S().facility[key] * C.FACILITY_COST; };
  L.upgrade = function (key) {
    var st = S();
    if (st.facility[key] >= C.FACILITY_MAX) return '이미 최고 레벨입니다.';
    var cost = L.upgradeCost(key);
    if (st.money < cost) return '자금이 부족합니다.';
    st.money -= cost; st.facility[key]++;
    L.news('🏗️ ' + (key === 'train' ? '훈련장' : '숙소') + ' Lv.' + st.facility[key] + ' 업그레이드');
    return null;
  };

  return L;
})();
