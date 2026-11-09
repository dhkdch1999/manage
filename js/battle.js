// =====================================================
// battle.js — 3라인 MOBA 자동 전투 시뮬레이션 (로직) + 캔버스 렌더러 (분리)
//   라인전 → 정글/갱킹/카운터 정글/로밍 → 오브젝트(드래곤·바론) → 포탑·넥서스
// =====================================================
(function () {
  var C = G.CONFIG, M = G.MAP;
  var R = 13; // 유닛 반지름

  // ---------- 경로 유틸 ----------
  function buildPath(pts) {
    var segs = [], total = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
      var len = Math.sqrt(dx * dx + dy * dy);
      segs.push({ x: pts[i][0], y: pts[i][1], dx: dx, dy: dy, len: len, start: total });
      total += len;
    }
    return { segs: segs, len: total, pts: pts };
  }
  function pathPoint(path, t) {
    var d = G.clamp(t, 0, 1) * path.len;
    for (var i = 0; i < path.segs.length; i++) {
      var s = path.segs[i];
      if (d <= s.start + s.len || i === path.segs.length - 1) {
        var k = s.len ? (d - s.start) / s.len : 0;
        return { x: s.x + s.dx * k, y: s.y + s.dy * k };
      }
    }
  }
  var PATHS = {};
  Object.keys(M.LANES).forEach(function (k) { PATHS[k] = buildPath(M.LANES[k]); });
  G.lanePoint = function (lane, t) { return pathPoint(PATHS[lane], t); };

  // opts: { seed, heroMods, render, sides: [ { name, color, tactic, readCount, units: [ { player, heroId, pos, order } ] } ] }
  function Battle(opts) {
    var self = this;
    this.rng = new G.RNG(opts.seed || 1);
    this.render = !!opts.render;
    this.time = 0;
    this.score = [0, 0];       // 킬
    this.ended = false;
    this.halfDone = false;
    this.halfPending = false;
    this.events = [];
    this.fx = [];
    this.banners = [];
    this.sides = [];
    this.units = [];
    // 라인
    this.lanes = {};
    Object.keys(M.LANES).forEach(function (k) { self.lanes[k] = { key: k, f: 0.5, path: PATHS[k] }; });
    // 포탑 / 넥서스
    this.towers = [];
    [0, 1].forEach(function (side) {
      Object.keys(M.LANES).forEach(function (lane) {
        M.TOWERS.forEach(function (tw) {
          var t = side === 0 ? tw.t : 1 - tw.t;
          var p = pathPoint(PATHS[lane], t);
          self.towers.push({ side: side, lane: lane, tier: tw.tier, t: t, x: p.x, y: p.y, hp: C.TOWER_HP[tw.tier], maxhp: C.TOWER_HP[tw.tier], alive: true, cd: 0, aggro: null });
        });
      });
    });
    this.nexus = [0, 1].map(function (s) { return { side: s, x: M.BASES[s].x + (s === 0 ? 22 : -22), y: M.BASES[s].y + (s === 0 ? -22 : 22), hp: C.NEXUS_HP, maxhp: C.NEXUS_HP, alive: true, isNexus: true }; });
    // 정글
    this.camps = M.CAMPS.map(function (c) { return { side: c.side, x: c.x, y: c.y, hp: C.CAMP_HP, maxhp: C.CAMP_HP, alive: true, respawnAt: 0, isCamp: true }; });
    this.dragon = { name: '드래곤', x: M.DRAGON.x, y: M.DRAGON.y, alive: false, nextSpawn: C.DRAGON.spawn, hp: 0, maxhp: 1, cfg: C.DRAGON, isEpic: true, emoji: '🐉' };
    this.baron = { name: '바론', x: M.BARON.x, y: M.BARON.y, alive: false, nextSpawn: C.BARON.spawn, hp: 0, maxhp: 1, cfg: C.BARON, isEpic: true, emoji: '👾' };

    opts.sides.forEach(function (sd, si) {
      self.sides.push({
        name: sd.name, color: sd.color, tactic: sd.tactic || 'balanced', startTactic: sd.tactic || 'balanced',
        readCount: sd.readCount || 0, plays: [], nextPlay: C.TRICK.firstPlay, focus: null, focusT: 0,
        call: null, callT: 0, callHold: 0, dragons: 0, barons: 0, baronT: 0, towers: 0
      });
      sd.units.forEach(function (ud, i) { self.units.push(self._makeUnit(ud, si, i, opts.heroMods)); });
    });
  }

  Battle.prototype._makeUnit = function (ud, side, idx, mods) {
    var pl = ud.player;
    var hs = G.Hero.stats(ud.heroId, mods);
    var hero = G.HERO_BY_ID[ud.heroId];
    var s = pl.stats;
    var pos = ud.pos || G.POS_ORDER[idx];
    var mastery = (pl.mastery && pl.mastery[ud.heroId]) || 0;
    var cond = pl.condition == null ? 90 : pl.condition;
    var mul = (1 + (s.atk - 10) * C.ATK_PER) *
      (C.MASTERY_MIN + (C.MASTERY_MAX - C.MASTERY_MIN) * mastery / 100) *
      (C.COND_MIN + (C.COND_MAX - C.COND_MIN) * cond / 100);
    var offHero = hero.pos.indexOf(pos) < 0;      // 영웅이 그 포지션에 안 맞음
    var offRole = pl.role && pl.role !== pos;     // 선수 주 포지션이 아님
    if (offHero) mul *= 0.9;
    if (offRole) mul *= 0.93;
    var u = {
      uid: side * 10 + idx, side: side, idx: idx, pos: pos, lane: G.POS_LANE[pos],
      name: pl.nick, playerId: pl.id, heroId: ud.heroId, hero: hero, offHero: offHero, offRole: offRole,
      p: { atk: s.atk, def: s.def, phys: s.phys, iq: s.iq, team: s.team, mental: pl.mental || 10 },
      order: ud.order || { focus: 'auto', entry: 'now' },
      baseHp: hs.hp, baseAtk: hs.atk, maxhp: hs.hp, hp: hs.hp, atk: hs.atk, range: hs.range, spd: hs.spd, as: hs.as,
      mul: mul, defMul: Math.max(0.5, 1 + (s.def - 10) * C.DEF_PER),
      farm: 0, lvl: 1,
      alive: true, respawnT: 0,
      atkCd: 0, skillCd: this.rng.range(2, 4), ultCd: hero.ult.cd * 0.8,
      target: null, retargetT: 0, buffs: [], shield: 0, stunT: 0,
      mode: null, modeT: 0, ambush: false, afterFake: false, taunt: null, stealth: false,
      task: null, taskT: 0, thinkT: this.rng.range(0, 0.5), combatT: 0, joinDelay: 0, hitChampT: -9,
      hits: {}, st: { k: 0, d: 0, a: 0, dmg: 0, taken: 0, heal: 0, struct: 0 },
      x: 0, y: 0, flash: 0
    };
    this._spawnPos(u);
    return u;
  };

  Battle.prototype._spawnPos = function (u) {
    var b = M.BASES[u.side];
    u.x = b.x + (u.idx - 2) * 9; u.y = b.y - (u.idx - 2) * 9;
  };
  Battle.prototype.base = function (side) { return M.BASES[side]; };
  Battle.prototype.alive = function (side) { return this.units.filter(function (u) { return u.alive && u.side === side; }); };
  Battle.prototype.dist = function (a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); };
  // 아군 진영 쪽인가 (대각선 기준)
  Battle.prototype.inOwnHalf = function (u) { return u.side === 0 ? (u.x - u.y) < 0 : (u.x - u.y) > 0; };
  Battle.prototype.phase = function () { return this.time < C.LANING_END ? 'lane' : this.time < C.LATE_START ? 'mid' : 'late'; };

  Battle.prototype.addBuff = function (u, k, v, t) { u.buffs.push({ k: k, v: v, t: t }); };
  Battle.prototype.buff = function (u, k) {
    var s = 0;
    for (var i = 0; i < u.buffs.length; i++) if (u.buffs[i].k === k) s += u.buffs[i].v;
    return s;
  };
  Battle.prototype.log = function (text, side, cls) { this.events.push({ t: this.time, text: text, side: side, cls: cls || '' }); };
  Battle.prototype.banner = function (text, side, ok) { if (this.render) this.banners.push({ text: text, side: side, ok: ok, t: 2.2 }); };
  Battle.prototype._fx = function (f) { if (this.render) { f.t = f.t || 0.25; f.max = f.t; this.fx.push(f); } };
  Battle.prototype.clock = function (t) {
    var s = Math.floor((t == null ? this.time : t) * C.TIME_SCALE), m = Math.floor(s / 60);
    s = s % 60; return m + ':' + (s < 10 ? '0' : '') + s;
  };

  // ---------- 라인 ----------
  Battle.prototype.frontPoint = function (lane) { return pathPoint(this.lanes[lane].path, this.lanes[lane].f); };
  // 해당 진영 기준 라인에서 서야 할 지점 (전선보다 조금 뒤)
  Battle.prototype.laneSpot = function (lane, side, back) {
    var L = this.lanes[lane];
    var off = (back || 38) / L.path.len;
    var t = side === 0 ? L.f - off : L.f + off;
    var T = C.TACTICS[this.sides[side].tactic];
    if (T.holdLine && this.time < C.LATE_START) t = side === 0 ? Math.min(t, T.holdLine) : Math.max(t, 1 - T.holdLine);
    return pathPoint(L.path, t);
  };
  // side 팀이 lane 에서 공격해야 할 다음 건물
  Battle.prototype.nextStructure = function (side, lane) {
    var enemy = 1 - side;
    var ts = this.towers.filter(function (t) { return t.alive && t.side === enemy && t.lane === lane; });
    if (ts.length) {
      ts.sort(function (a, b) { return side === 0 ? a.t - b.t : b.t - a.t; });
      return ts[0];
    }
    return this.nexus[enemy].alive ? this.nexus[enemy] : null;
  };
  Battle.prototype._laneTick = function (dt) {
    var self = this;
    Object.keys(this.lanes).forEach(function (k) {
      var L = self.lanes[k];
      var fp = pathPoint(L.path, L.f);
      var n = [0, 0];
      self.units.forEach(function (u) { if (u.alive && self.dist(u, fp) < 200) n[u.side]++; });
      var mul = [self.sides[0].baronT > 0 ? C.BARON.pushMul : 1, self.sides[1].baronT > 0 ? C.BARON.pushMul : 1];
      var v = (n[0] * mul[0] - n[1] * mul[1]) * C.PUSH_PER_UNIT;
      if (n[0] === 0 && n[1] === 0) v = (mul[0] - mul[1]) * C.PUSH_PER_UNIT * 0.5; // 미니언끼리
      // 포탑에 막힘
      var s0 = self.nextStructure(0, k), s1 = self.nextStructure(1, k);
      var maxF = s0 ? (s0.isNexus ? 0.94 : s0.t - 0.02) : 0.97;
      var minF = s1 ? (s1.isNexus ? 0.06 : s1.t + 0.02) : 0.03;
      L.f = G.clamp(L.f + v * dt, minF, maxF);
      L.atTower = null;
      if (L.f >= maxF - 0.004 && s0) L.atTower = { side: 0, s: s0 };
      if (L.f <= minF + 0.004 && s1) L.atTower = { side: 1, s: s1 };
      // 미니언이 포탑을 친다
      if (L.atTower) {
        var att = L.atTower.side;
        self._structDamage(null, L.atTower.s, C.MINION_TOWER_DPS * mul[att] * dt, att);
      }
    });
  };

  // ---------- 메인 루프 ----------
  Battle.prototype.step = function () {
    if (this.ended || this.halfPending) return;
    var dt = C.TICK, self = this;
    this.time += dt;
    if (!this.halfDone && this.time >= C.HALF_TIME) { this.halfDone = true; this.halfPending = true; return; }

    // 오브젝트 등장
    [this.dragon, this.baron].forEach(function (o) {
      if (!o.alive && self.time >= o.nextSpawn) {
        o.alive = true; o.maxhp = o.hp = o.cfg.hp + o.cfg.hpGrow * self.time;
        self.log(o.emoji + ' ' + o.name + '이(가) 등장했습니다', -1, 'obj');
      }
    });
    this.camps.forEach(function (c) { if (!c.alive && self.time >= c.respawnAt) { c.alive = true; c.maxhp = c.hp = C.CAMP_HP + self.time * 4; } });

    this.sides.forEach(function (S, si) {
      if (S.tactic === 'tricky' && self.time >= S.nextPlay) { S.nextPlay = self.time + C.TRICK.interval; G.Tactics.tryPlay(self, si); }
      if (S.focusT > 0) { S.focusT -= dt; if (S.focusT <= 0 || !S.focus || !S.focus.alive) S.focus = null; }
      if (S.baronT > 0) S.baronT -= dt;
      S.callT -= dt;
      if (S.callT <= 0) { S.callT = 2; self._teamCall(si); }
    });

    this._laneTick(dt);
    for (var i = 0; i < this.units.length; i++) this._unitTick(this.units[i], dt);
    this._towersTick(dt);
    this._epicTick(dt);

    if (this.render) {
      this.fx = this.fx.filter(function (f) { f.t -= dt; return f.t > 0; });
      this.banners = this.banners.filter(function (b) { b.t -= dt; return b.t > 0; });
    }
    if (!this.ended && this.time >= C.MATCH_TIME) this._end(null);
  };

  Battle.prototype.resumeHalf = function (t0, t1) {
    var self = this;
    [t0, t1].forEach(function (t, si) {
      if (t && t !== self.sides[si].tactic) {
        self.sides[si].tactic = t;
        self.log('📋 ' + self.sides[si].name + ' 전술 변경 → ' + C.TACTICS[t].name, si, 'tactic');
        if (t === 'tricky') self.sides[si].nextPlay = self.time + 4;
      }
    });
    this.halfPending = false;
  };

  // ---------- 팀 운영 판단 (2초마다) ----------
  Battle.prototype._teamCall = function (si) {
    var S = this.sides[si], T = C.TACTICS[S.tactic], ph = this.phase(), self = this;
    var mine = this.alive(si).length, theirs = this.alive(1 - si).length;
    var adv = mine - theirs - (T.callAdv || 0);
    var prev = S.call;
    // 진행 중인 콜은 일정 시간 유지 (오브젝트가 살아 있고 불리해지지 않았으면)
    if (prev && this.time < S.callHold) {
      var valid = prev.type === 'obj' ? prev.target.alive && adv >= -1 : !!this.nextStructure(si, prev.lane) && adv >= -1;
      if (valid) return;
    }
    S.call = null;
    if (ph === 'lane' && adv < 3) return;
    function pushLane() {
      var best = null, bd = 1e9;
      Object.keys(self.lanes).forEach(function (k) {
        var st = self.nextStructure(si, k); if (!st) return;
        var d = self.dist(st, self.base(1 - si)) * -1 + (st.isNexus ? 0 : 0);
        // 이미 밀려 있는 라인(전선이 적 포탑 앞) 우선
        var L = self.lanes[k], f = si === 0 ? L.f : 1 - L.f;
        d -= f * 600;
        if (d < bd) { bd = d; best = k; }
      });
      return best;
    }
    // 넥서스가 열렸으면 끝내러 간다
    var endLane = null;
    Object.keys(this.lanes).forEach(function (k) { var st = self.nextStructure(si, k); if (st && st.isNexus && self._structOk(si, st)) endLane = k; });
    if (endLane && ph !== 'lane' && adv >= 1) S.call = { type: 'push', lane: endLane };
    else if (adv >= (ph === 'lane' ? 3 : 2) || (S.baronT > 0 && adv >= 0)) {
      var pl = pushLane(); if (pl) S.call = { type: 'push', lane: pl };
    } else if (this.baron.alive && (adv >= 1 || (adv >= 0 && this._uncontested(si, this.baron) && this.rng.chance(0.5 * T.objWeight)))) {
      S.call = { type: 'obj', target: this.baron };
    } else if (this.dragon.alive && (adv >= 1 || (adv >= 0 && this._uncontested(si, this.dragon))) && this.rng.chance(Math.min(1, 0.5 * T.objWeight + (adv > 0 ? 0.4 : 0)))) {
      S.call = { type: 'obj', target: this.dragon };
    } else if (ph === 'late' || adv >= 2) {
      var pl2 = pushLane(); if (pl2) S.call = { type: 'push', lane: pl2 };
    }
    if (S.call) S.callHold = this.time + 10;
    if (S.call && (!prev || prev.type !== S.call.type || prev.target !== S.call.target || prev.lane !== S.call.lane)) {
      var txt = S.call.type === 'obj' ? S.call.target.emoji + ' ' + S.call.target.name + ' 사냥 시도' : '🗼 ' + M.LANE_NAMES[S.call.lane] + ' 푸시';
      this.log('📣 ' + S.name + ': ' + txt, si, 'tactic');
    }
  };

  // 상대가 오브젝트 근처에 없는가 (운영 판단)
  Battle.prototype._uncontested = function (si, o) {
    var self = this;
    return this.alive(1 - si).filter(function (e) { return self.dist(e, o) < 380; }).length === 0;
  };

  // ---------- 유닛 ----------
  Battle.prototype._unitTick = function (u, dt) {
    for (var i = u.buffs.length - 1; i >= 0; i--) { u.buffs[i].t -= dt; if (u.buffs[i].t <= 0) u.buffs.splice(i, 1); }
    if (u.flash > 0) u.flash -= dt;
    if (!u.alive) {
      u.respawnT -= dt;
      if (u.respawnT <= 0) {
        u.alive = true; u.hp = u.maxhp; u.shield = 0; u.mode = null; u.stealth = false; u.target = null; u.buffs = []; u.ambush = false; u.task = null;
        this._spawnPos(u);
      }
      return;
    }
    u.atkCd -= dt; u.skillCd -= dt; u.ultCd -= dt; u.combatT -= dt; u.thinkT -= dt;
    if (u.taunt) { u.taunt.t -= dt; if (u.taunt.t <= 0 || !u.taunt.by.alive) u.taunt = null; }
    var base = this.base(u.side);
    if (this.dist(u, base) < 85) u.hp = Math.min(u.maxhp, u.hp + u.maxhp * C.BASE_REGEN * dt);
    if (u.stunT > 0) { u.stunT -= dt; return; }

    var S = this.sides[u.side], T = C.TACTICS[S.tactic];

    // --- 특수 모드 (변칙 플레이 / 귀환) ---
    if (u.mode === 'fake') {
      this._moveTo(u, base.x, base.y, dt);
      u.modeT -= dt;
      if (u.modeT <= 0) { u.mode = null; if (u.afterFake) { u.afterFake = false; G.Tactics.fakeTurn(this, u); } }
      return;
    }
    if (u.mode !== 'retreat' && u.hp / u.maxhp < T.retreatHp && !(u.combatT > 0 && u.target && u.target.alive && u.target.hp < u.hp * 0.6)) {
      u.mode = 'retreat'; u.target = null;
    }
    if (u.mode === 'retreat') {
      this._moveTo(u, base.x, base.y, dt);
      if (u.hp / u.maxhp >= 0.92) u.mode = null;
      var near = this._nearestEnemy(u, u.range + R);
      if (near && u.atkCd <= 0) this._basicAttack(u, near);
      return;
    }
    if (u.mode === 'flank') {
      u.modeT -= dt;
      var ft = u.flankTarget;
      if (!ft || !ft.alive) { u.mode = null; u.stealth = false; }
      else {
        var off = (u.idx % 2 ? 1 : -1) * Math.min(100, this.dist(u, ft) * 0.35);
        this._moveTo(u, ft.x + off * 0.5, ft.y + off, dt);
        if (this.dist(u, ft) <= u.range + R + 10 || u.modeT <= 0) {
          u.mode = null; u.stealth = false; u.target = ft; u.retargetT = 3; u.combatT = 3;
        }
        return;
      }
    }

    // --- 교전 판단 ---
    var enemy = this._pickCombatTarget(u, T);
    if (enemy) {
      if (u.combatT <= 0) u.joinDelay = C.ENTRY[u.order.entry] || 0;
      u.combatT = 1.2;
      if (u.joinDelay > 0) { u.joinDelay -= dt; return; }
      this._fight(u, enemy, dt);
      return;
    }

    // --- 운영 (어디로 갈지) ---
    if (u.thinkT <= 0) { u.thinkT = 0.5; this._think(u, S, T); }
    this._doTask(u, dt);
  };

  Battle.prototype._nearestEnemy = function (u, maxD) {
    var best = null, bd = maxD || 1e9;
    for (var i = 0; i < this.units.length; i++) {
      var e = this.units[i];
      if (!e.alive || e.side === u.side || e.stealth) continue;
      var d = this.dist(u, e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };
  Battle.prototype._enemyTowerAt = function (side, x, y, pad) {
    var p = { x: x, y: y };
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      if (t.alive && t.side !== side && this.dist(t, p) < C.TOWER_RANGE + (pad || 0)) return t;
    }
    return null;
  };
  // 포탑 다이브를 해도 되는가
  Battle.prototype._canDive = function (u, tgt, tower) {
    if (!tower) return true;
    var L = this.lanes[tower.lane];
    if (L && L.atTower && L.atTower.s === tower) return true; // 미니언이 포탑을 맞고 있음
    var allies = this.alive(u.side).filter(function (a) { return this.dist(a, tower) < 260; }, this).length;
    if (allies >= 3 && this.alive(1 - u.side).filter(function (e) { return this.dist(e, tower) < 300; }, this).length <= allies - 1) return true;
    return tgt.hp / tgt.maxhp < 0.22 && u.hp / u.maxhp > 0.55;
  };

  Battle.prototype._pickCombatTarget = function (u, T) {
    if (u.taunt) return u.taunt.by;
    var S = this.sides[u.side];
    if (u.target && u.target.alive && u.target.side !== u.side && u.retargetT > 0 && !u.target.stealth &&
      this.dist(u, u.target) < u.range + C.ENGAGE_RANGE + 60) { u.retargetT -= C.TICK; return u.target; }
    var reach = u.range + C.ENGAGE_RANGE + (u.combatT > 0 ? 60 : 0);
    var cands = [];
    for (var i = 0; i < this.units.length; i++) {
      var e = this.units[i];
      if (!e.alive || e.side === u.side || e.stealth) continue;
      if (this.dist(u, e) > reach) continue;
      var tw = this._enemyTowerAt(u.side, e.x, e.y, 10);
      if (tw && !this._canDive(u, e, tw)) continue;
      cands.push(e);
    }
    if (!cands.length) { u.target = null; return null; }
    this._chooseTarget(u, cands);
    return u.target;
  };

  Battle.prototype._chooseTarget = function (u, enemies) {
    var rng = this.rng, self = this, S = this.sides[u.side];
    u.retargetT = rng.range(0.6, 1.0);
    var nearE = enemies.slice().sort(function (a, b) { return self.dist(u, a) - self.dist(u, b); })[0];
    if (S.focus && S.focus.alive && enemies.indexOf(S.focus) >= 0 && rng.chance(0.8)) { u.target = S.focus; return; }
    if (rng.chance(C.FOCUS_BASE + u.p.team * C.FOCUS_PER)) {
      var counts = {};
      this.alive(u.side).forEach(function (a) { if (a !== u && a.target && a.target.uid != null && a.target.alive && a.combatT > 0) counts[a.target.uid] = (counts[a.target.uid] || 0) + 1; });
      var bestUid = null, bc = 0;
      Object.keys(counts).forEach(function (k) { if (counts[k] > bc) { bc = counts[k]; bestUid = +k; } });
      var ft = bestUid != null ? enemies.filter(function (e) { return e.uid === bestUid; })[0] : null;
      if (ft) { u.target = ft; return; }
    }
    if (!rng.chance(C.SMART_BASE + u.p.iq * C.SMART_PER)) { u.target = nearE; return; }
    function lowest(list) { return list.slice().sort(function (a, b) { return a.hp / a.maxhp - b.hp / b.maxhp; })[0]; }
    function nearestOf(list) { return list.slice().sort(function (a, b) { return self.dist(u, a) - self.dist(u, b); })[0]; }
    var focus = u.order.focus || 'auto', pick = null;
    if (focus === 'carry') pick = nearestOf(enemies.filter(function (e) { return e.pos === 'adc' || e.pos === 'mid'; }));
    else if (focus === 'lowest') pick = lowest(enemies);
    else if (focus === 'nearest') pick = nearE;
    else if (focus === 'support') pick = nearestOf(enemies.filter(function (e) { return e.pos === 'support'; }));
    else {
      var role = u.hero.role;
      if (role === 'fighter') pick = lowest(enemies);
      else if (role === 'tank') pick = nearestOf(enemies.filter(function (e) { return G.Hero.beats(u.heroId, e.heroId); })) || nearE;
      else if (role === 'support') pick = nearE;
      else {
        var inRange = enemies.filter(function (e) { return self.dist(u, e) < u.range + 50; });
        pick = inRange.length ? lowest(inRange) : nearE;
      }
    }
    u.target = pick || nearE;
  };

  Battle.prototype._fight = function (u, tgt, dt) {
    if (u.ultCd <= 0 && this._tryCast(u, u.hero.ult, true)) u.ultCd = u.hero.ult.cd;
    else if (u.skillCd <= 0 && this._tryCast(u, u.hero.skill, false)) u.skillCd = u.hero.skill.cd;
    if (!u.alive || u.stunT > 0) return;
    tgt = u.target && u.target.alive ? u.target : tgt;
    var d = this.dist(u, tgt);
    if (d > u.range + R) this._moveTo(u, tgt.x, tgt.y, dt);
    else if (u.atkCd <= 0) this._basicAttack(u, tgt);
  };

  // 어디로 갈지 결정
  Battle.prototype._think = function (u, S, T) {
    var ph = this.phase(), self = this;
    // 팀 콜 (라인전 단계에는 정글·서폿만 일부 참여)
    if (S.call && (ph !== 'lane' || S.call.type === 'push')) {
      if (S.call.type === 'obj' && S.call.target.alive) { u.task = { type: 'obj', target: S.call.target }; return; }
      if (S.call.type === 'push') { u.task = { type: 'push', lane: S.call.lane }; return; }
    }
    // 스플릿 (변칙)
    if (u.task && u.task.type === 'split' && u.taskT > this.time) return;
    // 갱킹·로밍 진행 중
    if (u.task && (u.task.type === 'gank' || u.task.type === 'invade') && u.taskT > this.time) {
      if (u.task.type === 'invade' && !u.task.camp.alive) u.task = null; else return;
    }
    // 아군 교전 합류
    // 라인전 단계에는 정글·서폿·같은 라인 아군만 합류
    var joinR = ph === 'lane' ? (u.pos === 'jungle' ? 380 : 220) : 420;
    var fighting = this.alive(u.side).filter(function (a) {
      if (a === u || a.combatT <= 0 || self.dist(a, u) > joinR) return false;
      return ph !== 'lane' || u.pos === 'jungle' || a.lane === u.lane;
    });
    if (fighting.length && this.rng.chance(0.2 + u.p.iq * 0.02)) { u.task = { type: 'join', ally: fighting[0] }; u.taskT = this.time + 3; return; }
    if (u.task && u.task.type === 'join' && u.taskT > this.time && u.task.ally.alive) return;

    if (u.pos === 'jungle') return this._thinkJungle(u, S, T);
    // 미드 로밍
    if (u.pos === 'mid' && ph !== 'lane' || (u.pos === 'mid' && this.time > 30)) {
      var L = this.lanes.mid, pushed = u.side === 0 ? L.f > 0.55 : L.f < 0.45;
      if (pushed && this.rng.chance(0.04 + u.p.iq * 0.004)) {
        var g = this._bestGank(u.side, ['top', 'bot']);
        if (g && g.score > C.GANK_THRESHOLD - 0.3) {
          u.task = { type: 'gank', lane: g.lane }; u.taskT = this.time + 10;
          this.log('🏃 ' + u.name + ' ' + M.LANE_NAMES[g.lane] + ' 로밍', u.side, 'roam');
          return;
        }
      }
    }
    // 서폿은 원딜 따라다니기 (라인전 이후)
    if (u.pos === 'support' && ph !== 'lane') {
      var adc = this.units.filter(function (a) { return a.side === u.side && a.pos === 'adc' && a.alive; })[0];
      if (adc) { u.task = { type: 'follow', ally: adc }; return; }
    }
    u.task = { type: 'lane', lane: u.lane || 'mid' };
  };

  Battle.prototype._bestGank = function (side, lanes) {
    var self = this, best = null;
    lanes.forEach(function (k) {
      var L = self.lanes[k], fp = pathPoint(L.path, L.f);
      var enemies = self.units.filter(function (e) { return e.alive && e.side !== side && self.dist(e, fp) < 260; });
      var allies = self.units.filter(function (a) { return a.alive && a.side === side && self.dist(a, fp) < 260; });
      if (!enemies.length) return;
      var hpLow = enemies.reduce(function (s, e) { return s + (1 - e.hp / e.maxhp); }, 0) / enemies.length;
      var over = side === 0 ? (0.5 - L.f) : (L.f - 0.5); // 적이 우리 쪽으로 밀고 들어옴
      var score = hpLow * 3 + Math.max(0, over) * 9 + allies.length * 0.6 - enemies.length * 0.7 + 1;
      if (!best || score > best.score) best = { lane: k, score: score };
    });
    return best;
  };

  Battle.prototype._thinkJungle = function (u, S, T) {
    var self = this, rng = this.rng;
    // 갱킹
    if (this.time > 12 && rng.chance(0.18)) {
      var g = this._bestGank(u.side, ['top', 'mid', 'bot']);
      if (g && g.score > C.GANK_THRESHOLD + (T.gank || 0) - u.p.iq * 0.04) {
        u.task = { type: 'gank', lane: g.lane }; u.taskT = this.time + 11;
        this.log('🌲 ' + u.name + ' ' + M.LANE_NAMES[g.lane] + ' 갱킹 시도', u.side, 'roam');
        return;
      }
    }
    // 카운터 정글: 상대 정글러가 멀리 있거나 죽었을 때
    var enemyJg = this.units.filter(function (e) { return e.side !== u.side && e.pos === 'jungle'; })[0];
    var enemyCamps = this.camps.filter(function (c) { return c.side !== u.side && c.alive; });
    if (enemyCamps.length && enemyJg) {
      var away = !enemyJg.alive || (enemyJg.task && enemyJg.task.type === 'gank');
      if (away && rng.chance((T.invade || 0.1) + u.p.iq * 0.01)) {
        var camp = enemyCamps.sort(function (a, b) { return self.dist(u, a) - self.dist(u, b); })[0];
        u.task = { type: 'invade', camp: camp }; u.taskT = this.time + 12;
        this.log('🕵️ ' + u.name + ' 카운터 정글 — 상대 정글 캠프 습격', u.side, 'roam');
        return;
      }
    }
    var own = this.camps.filter(function (c) { return c.side === u.side && c.alive; }).sort(function (a, b) { return self.dist(u, a) - self.dist(u, b); });
    if (own.length) { u.task = { type: 'camp', camp: own[0] }; return; }
    var g2 = this._bestGank(u.side, ['top', 'mid', 'bot']);
    u.task = { type: 'gank', lane: g2 ? g2.lane : 'mid' }; u.taskT = this.time + 6;
  };

  Battle.prototype._doTask = function (u, dt) {
    var t = u.task;
    if (!t) { var b = this.base(u.side); this._moveTo(u, b.x, b.y, dt); return; }
    if (t.type === 'lane' || t.type === 'split') {
      var lane = t.lane, L = this.lanes[lane];
      var spot = this.laneSpot(lane, u.side, u.pos === 'support' ? 55 : 38);
      var st = this.nextStructure(u.side, lane);
      // 미니언이 포탑을 치고 있으면 같이 친다
      if (L.atTower && L.atTower.side === u.side && st && this._structOk(u.side, st)) { this._hitStruct(u, st, dt); this._farm(u, C.FARM_LANE * 0.6 * dt); return; }
      this._moveTo(u, spot.x, spot.y, dt);
      if (this.dist(u, spot) < 80) this._farm(u, C.FARM_LANE * dt);
      return;
    }
    if (t.type === 'push') {
      var st2 = this.nextStructure(u.side, t.lane);
      if (!st2) { u.task = null; return; }
      if (this._structOk(u.side, st2) && (this.lanes[t.lane].atTower || this.dist(u, st2) < C.TOWER_RANGE + 40)) { this._hitStruct(u, st2, dt); return; }
      var sp = this.laneSpot(t.lane, u.side, 20);
      this._moveTo(u, sp.x, sp.y, dt);
      this._farm(u, C.FARM_LANE * 0.5 * dt);
      return;
    }
    if (t.type === 'obj') {
      var o = t.target;
      if (!o.alive) { u.task = null; return; }
      if (this.dist(u, o) > u.range + 28) this._moveTo(u, o.x, o.y, dt);
      else if (u.atkCd <= 0) this._hitEpic(u, o);
      return;
    }
    if (t.type === 'camp' || t.type === 'invade') {
      var c = t.camp;
      if (!c.alive) { u.task = null; return; }
      if (this.dist(u, c) > u.range + 20) this._moveTo(u, c.x, c.y, dt);
      else if (u.atkCd <= 0) this._hitCamp(u, c);
      return;
    }
    if (t.type === 'gank') {
      var Lg = this.lanes[t.lane], fp = pathPoint(Lg.path, Lg.f);
      this._moveTo(u, fp.x, fp.y, dt);
      if (this.dist(u, fp) < 60 && !this._nearestEnemy(u, 300)) u.task = null;
      return;
    }
    if (t.type === 'follow' || t.type === 'join') {
      var a = t.ally;
      if (!a || !a.alive) { u.task = null; return; }
      if (this.dist(u, a) > 50) this._moveTo(u, a.x - (u.side === 0 ? 25 : -25), a.y + (u.side === 0 ? 25 : -25), dt);
      if (t.type === 'follow' && a.task && a.task.type === 'lane' && this.dist(u, a) < 120) this._farm(u, C.FARM_LANE * 0.4 * dt);
    }
  };

  Battle.prototype._moveTo = function (u, tx, ty, dt) {
    var dx = tx - u.x, dy = ty - u.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) return;
    var spd = u.spd * Math.max(0.3, 1 + this.buff(u, 'spd') - this.buff(u, 'slow'));
    var step = Math.min(d, spd * dt);
    var nx = u.x + dx / d * step, ny = u.y + dy / d * step;
    // 공격 목적이 아니면 적 포탑 사거리에 들어가지 않는다
    if (!(u.combatT > 0) && u.mode !== 'flank' && !(u.task && (u.task.type === 'push' || u.task.type === 'split'))) {
      var tw = this._enemyTowerAt(u.side, nx, ny, 0);
      if (tw && !this._enemyTowerAt(u.side, u.x, u.y, 0)) {
        var L = this.lanes[tw.lane];
        if (!(L.atTower && L.atTower.s === tw)) return;
      }
    }
    u.x = nx; u.y = ny;
    for (var i = 0; i < this.units.length; i++) {
      var o = this.units[i];
      if (o === u || !o.alive || o.side !== u.side) continue;
      var ox = u.x - o.x, oy = u.y - o.y, od = Math.sqrt(ox * ox + oy * oy);
      if (od > 0 && od < R * 1.7) { u.x += ox / od * 1.0; u.y += oy / od * 1.0; }
    }
    u.x = G.clamp(u.x, 12, M.W - 12); u.y = G.clamp(u.y, 12, M.H - 12);
  };

  // ---------- 성장 ----------
  Battle.prototype._farm = function (u, amt) {
    u.farm += amt;
    var lv = Math.min(C.MAX_LEVEL, 1 + Math.floor(u.farm / C.FARM_PER_LEVEL));
    if (lv !== u.lvl) {
      var ratio = u.hp / u.maxhp;
      u.lvl = lv;
      u.maxhp = u.baseHp * (1 + C.LVL_HP * (lv - 1));
      u.hp = u.maxhp * ratio;
      u.atk = u.baseAtk * (1 + C.LVL_ATK * (lv - 1));
    }
  };

  // ---------- 피해 ----------
  Battle.prototype._outMul = function (u) {
    var S = this.sides[u.side];
    var m = u.mul * (1 + this.buff(u, 'dmg') + G.Tactics.dmgMod(this, u) + S.dragons * C.DRAGON.buff + (S.baronT > 0 ? C.BARON.buffDmg : 0));
    if (this.score[1 - u.side] - this.score[u.side] >= 4) m *= 1 + (u.p.mental - 10) * C.MENTAL_PER;
    return Math.max(0.2, m);
  };

  Battle.prototype._damage = function (src, tgt, base, label) {
    if (!tgt.alive) return 0;
    if (tgt.uid == null) return 0; // 챔피언만
    var dmg = base * this._outMul(src);
    if (G.Hero.beats(src.heroId, tgt.heroId)) dmg *= 1 + C.COUNTER_BONUS;
    dmg /= tgt.defMul * Math.max(0.4, 1 + this.buff(tgt, 'def'));
    if (tgt.hero.armor) dmg *= 1 - tgt.hero.armor;
    if (src.ambush) {
      src.ambush = false;
      dmg *= 1 + C.TRICK.ambushDmg;
      tgt.stunT = Math.max(tgt.stunT, C.TRICK.ambushStun);
      this.log('🗡️ ' + src.name + '의 기습이 ' + tgt.name + '에게 적중!', src.side, 'trick-ok');
      this._fx({ type: 'ring', x: tgt.x, y: tgt.y, r: 30, color: '#ffd43b', t: 0.6 });
    }
    var absorbed = Math.min(tgt.shield, dmg);
    tgt.shield -= absorbed;
    tgt.hp -= dmg - absorbed;
    tgt.flash = 0.12;
    src.st.dmg += dmg; tgt.st.taken += dmg;
    tgt.hits[src.uid] = this.time;
    src.hitChampT = this.time;
    src.combatT = Math.max(src.combatT, 1.2);
    var ls = this.buff(src, 'lifesteal');
    if (ls > 0) src.hp = Math.min(src.maxhp, src.hp + dmg * ls);
    if (this.render) this._fx({ type: 'text', x: tgt.x + this.rng.range(-8, 8), y: tgt.y - 20, txt: Math.round(dmg), color: label === 'skill' ? '#ffd43b' : '#fff', t: 0.7 });
    if (tgt.hp <= 0) this._kill(src, tgt);
    return dmg;
  };

  // neutral: 몬스터에게 죽음 (상대 팀 킬로 치지 않음)
  Battle.prototype._kill = function (src, v, neutral) {
    var self = this;
    v.alive = false; v.hp = 0; v.target = null; v.mode = null; v.stealth = false; v.task = null;
    v.respawnT = C.RESPAWN_BASE + this.time * C.RESPAWN_GROW + v.lvl * 0.3;
    v.st.d++;
    if (neutral) { v.hits = {}; this.log('💀 ' + v.name + '(' + v.hero.name + ')이(가) ' + neutral + '에게 쓰러졌습니다', v.side, 'kill'); return; }
    var killerSide = src ? src.side : 1 - v.side;
    this.score[killerSide]++;
    var assists = [];
    Object.keys(v.hits).forEach(function (uid) {
      uid = +uid;
      if (src && uid === src.uid) return;
      if (self.time - v.hits[uid] <= C.ASSIST_WINDOW) {
        var a = self.units.filter(function (x) { return x.uid === uid && x.side === killerSide; })[0];
        if (a) { a.st.a++; assists.push(a.name); self._farm(a, C.FARM_ASSIST); }
      }
    });
    v.hits = {};
    if (src && src.uid != null) {
      src.st.k++; this._farm(src, C.FARM_KILL + v.lvl * 0.5);
      this.log('⚔️ ' + src.name + '(' + src.hero.name + ') → ' + v.name + '(' + v.hero.name + ')', src.side, 'kill');
    } else {
      this.log('🗼 ' + v.name + '(' + v.hero.name + ')이(가) 포탑에 처치당했습니다', killerSide, 'kill');
    }
    this._fx({ type: 'ring', x: v.x, y: v.y, r: 24, color: this.sides[killerSide].color, t: 0.6 });
  };

  Battle.prototype._basicAttack = function (u, tgt) {
    u.atkCd = 1 / (u.as * Math.max(0.3, 1 + this.buff(u, 'as')));
    this._fx({ type: 'line', x1: u.x, y1: u.y, x2: tgt.x, y2: tgt.y, color: this.sides[u.side].color, t: 0.12, w: u.range > 100 ? 1.5 : 3 });
    this._damage(u, tgt, u.atk, 'basic');
  };

  Battle.prototype._hit = function (src, tgt) {
    var p = C.HIT_BASE + (src.p.phys - 10) * C.HIT_PER_PHYS - (tgt.p.phys - 10) * C.DODGE_PER_PHYS + 0.1;
    return this.rng.chance(G.clamp(p, 0.35, 0.97));
  };

  // ---------- 건물 ----------
  Battle.prototype._structOk = function (side, st) {
    if (!st.isNexus) return true;
    var enemy = 1 - side;
    // 넥서스: 어느 라인이든 억제 포탑(안쪽)까지 다 깨야 공격 가능
    return this.towers.some(function (t) { return t.side === enemy && t.tier === 'inner' && !t.alive; });
  };
  Battle.prototype._hitStruct = function (u, st, dt) {
    if (this.dist(u, st) > u.range + 22) { this._moveTo(u, st.x, st.y, dt); return; }
    if (u.atkCd > 0) return;
    u.atkCd = 1 / (u.as * Math.max(0.3, 1 + this.buff(u, 'as')));
    var dmg = u.atk * C.STRUCT_DMG * this._outMul(u) * (1 + this.buff(u, 'objdmg'));
    this._fx({ type: 'line', x1: u.x, y1: u.y, x2: st.x, y2: st.y, color: this.sides[u.side].color, t: 0.12, w: 2 });
    u.st.struct += dmg;
    this._structDamage(u, st, dmg, u.side);
  };
  Battle.prototype._structDamage = function (u, st, dmg, side) {
    if (!st.alive || this.ended) return;
    if (st.isNexus && !this._structOk(side, st)) return;
    st.hp -= dmg;
    if (st.hp > 0) return;
    st.alive = false; st.hp = 0;
    var S = this.sides[side], self = this;
    if (st.isNexus) {
      this.log('💥 ' + S.name + '이(가) 넥서스를 파괴했습니다!', side, 'end');
      this._end(side);
      return;
    }
    S.towers++;
    this.alive(side).forEach(function (a) { self._farm(a, C.FARM_TOWER); });
    this.log('🗼 ' + S.name + ' ' + M.LANE_NAMES[st.lane] + ' ' + (st.tier === 'outer' ? '1차' : '2차(억제)') + ' 포탑 파괴', side, 'obj');
    this.banner(S.name + ' — ' + M.LANE_NAMES[st.lane] + ' 포탑 파괴', side, true);
    this._fx({ type: 'ring', x: st.x, y: st.y, r: 40, color: S.color, t: 0.8 });
  };
  Battle.prototype._towersTick = function (dt) {
    var self = this;
    this.towers.forEach(function (tw) {
      if (!tw.alive) return;
      tw.cd -= dt;
      if (tw.cd > 0) return;
      var L = self.lanes[tw.lane];
      var minions = L.atTower && L.atTower.s === tw;
      var cands = self.units.filter(function (e) { return e.alive && e.side !== tw.side && !e.stealth && self.dist(e, tw) < C.TOWER_RANGE; });
      if (!cands.length) { tw.target = null; return; }
      // 미니언이 있으면 아군 챔피언을 때린 적 챔피언만 노린다
      var aggro = cands.filter(function (e) { return self.time - e.hitChampT < 1.5; });
      var tgt = minions ? aggro[0] : (aggro[0] || cands.sort(function (a, b) { return self.dist(a, tw) - self.dist(b, tw); })[0]);
      if (!tgt) return;
      tw.cd = 1 / C.TOWER_AS;
      tw.target = tgt;
      var dmg = (C.TOWER_DMG + C.TOWER_DMG_GROW * self.time) / tgt.defMul;
      self._fx({ type: 'line', x1: tw.x, y1: tw.y, x2: tgt.x, y2: tgt.y, color: '#ffe066', t: 0.2, w: 3 });
      var ab = Math.min(tgt.shield, dmg); tgt.shield -= ab; tgt.hp -= dmg - ab; tgt.st.taken += dmg; tgt.flash = 0.12;
      if (tgt.hp <= 0) {
        // 마지막으로 때린 적 챔피언에게 킬
        var last = null, lt = -1;
        Object.keys(tgt.hits).forEach(function (uid) { if (tgt.hits[uid] > lt && self.time - tgt.hits[uid] < C.ASSIST_WINDOW) { lt = tgt.hits[uid]; last = +uid; } });
        var killer = last != null ? self.units.filter(function (x) { return x.uid === last && x.side === tw.side; })[0] : null;
        if (killer) delete tgt.hits[killer.uid];
        self._kill(killer || null, tgt);
      }
    });
  };

  // ---------- 정글 / 오브젝트 ----------
  Battle.prototype._hitCamp = function (u, c) {
    u.atkCd = 1 / (u.as * Math.max(0.3, 1 + this.buff(u, 'as')));
    c.hp -= u.atk * this._outMul(u) * 1.2;
    this._fx({ type: 'line', x1: u.x, y1: u.y, x2: c.x, y2: c.y, color: '#8ce99a', t: 0.12, w: 2 });
    if (c.hp <= 0) {
      c.alive = false; c.respawnAt = this.time + C.CAMP_RESPAWN;
      this._farm(u, C.FARM_CAMP);
      if (c.side !== u.side) this.log('🍖 ' + u.name + ' 상대 정글 캠프 스틸!', u.side, 'roam');
      u.task = null;
    }
  };
  Battle.prototype._hitEpic = function (u, o) {
    u.atkCd = 1 / (u.as * Math.max(0.3, 1 + this.buff(u, 'as')));
    var dmg = u.atk * this._outMul(u) * (1 + this.buff(u, 'objdmg'));
    o.hp -= dmg; u.st.struct += dmg;
    o.hitters = o.hitters || {}; o.hitters[u.side] = this.time;
    this._fx({ type: 'line', x1: u.x, y1: u.y, x2: o.x, y2: o.y, color: '#cc5de8', t: 0.12, w: 2 });
    if (o.hp <= 0) this._epicTaken(u.side, o);
  };
  Battle.prototype._epicTick = function (dt) {
    var self = this;
    [this.dragon, this.baron].forEach(function (o) {
      if (!o.alive) return;
      // 오브젝트 반격
      self.units.forEach(function (u) {
        if (u.alive && u.task && u.task.target === o && self.dist(u, o) < 90) {
          u.hp -= o.cfg.dps * dt / u.defMul;
          if (u.hp <= 0) self._kill(null, u, o.name);
        }
      });
    });
  };
  Battle.prototype._epicTaken = function (side, o) {
    var S = this.sides[side], self = this;
    o.alive = false; o.nextSpawn = this.time + o.cfg.respawn; o.hitters = {};
    if (o === this.dragon) {
      S.dragons++;
      this.log('🐉 ' + S.name + ' 드래곤 처치! (영구 피해 +' + Math.round(C.DRAGON.buff * 100 * S.dragons) + '%)', side, 'obj');
    } else {
      S.barons++; S.baronT = C.BARON.buffTime;
      this.log('👾 ' + S.name + ' 바론 처치! 미니언 강화 + 피해 +' + Math.round(C.BARON.buffDmg * 100) + '%', side, 'obj');
    }
    this.alive(side).forEach(function (a) { self._farm(a, 6); if (a.task && a.task.target === o) a.task = null; });
    this.alive(1 - side).forEach(function (a) { if (a.task && a.task.target === o) a.task = null; });
    this.banner(S.name + ' — ' + o.name + ' 처치!', side, true);
    this._fx({ type: 'ring', x: o.x, y: o.y, r: 50, color: S.color, t: 0.8 });
  };

  // ---------- 스킬 ----------
  Battle.prototype._tryCast = function (u, sk, isUlt) {
    var self = this;
    var enemies = this.alive(1 - u.side).filter(function (e) { return !e.stealth; });
    var allies = this.alive(u.side);
    var tgt = u.target && u.target.alive && u.target.uid != null ? u.target : this._nearestEnemy(u);
    var color = isUlt ? '#ff6b6b' : '#ffd43b';
    function inR(list, cx, cy, r) { return list.filter(function (e) { var dx = e.x - cx, dy = e.y - cy; return dx * dx + dy * dy <= r * r; }); }
    var t = sk.t, cast = false;
    if (t === 'dash' || t === 'stun' || t === 'drain' || t === 'aoe') {
      if (t === 'dash' && sk.lowest) tgt = inR(enemies, u.x, u.y, sk.r).sort(function (a, b) { return a.hp - b.hp; })[0] || null;
      if (!tgt || this.dist(u, tgt) > sk.r + R) return false;
      if (t === 'dash') {
        var tw = this._enemyTowerAt(u.side, tgt.x, tgt.y, 0);
        if (tw && !this._canDive(u, tgt, tw)) return false;
      }
      if (t === 'aoe') {
        var hitList = inR(enemies, tgt.x, tgt.y, sk.rad);
        if (isUlt && hitList.length < 2 && tgt.hp > tgt.maxhp * 0.45) return false;
        this._fx({ type: 'ring', x: tgt.x, y: tgt.y, r: sk.rad, color: color, t: 0.35, fill: true });
        hitList.forEach(function (e) {
          if (!self._hit(u, e)) { self._miss(e); return; }
          var d = self._damage(u, e, u.atk * sk.p, 'skill');
          if (sk.drain) u.hp = Math.min(u.maxhp, u.hp + d * sk.drain);
          if (sk.stun) e.stunT = Math.max(e.stunT, sk.stun);
          if (sk.slow) self.addBuff(e, 'slow', sk.slow, sk.slowDur || 2);
        });
        cast = true;
      } else {
        if (t === 'dash') {
          var dx = tgt.x - u.x, dy = tgt.y - u.y, dd = Math.sqrt(dx * dx + dy * dy) || 1;
          this._fx({ type: 'line', x1: u.x, y1: u.y, x2: tgt.x, y2: tgt.y, color: color, t: 0.3, w: 5 });
          u.x = tgt.x - dx / dd * (R * 2); u.y = tgt.y - dy / dd * (R * 2);
        } else this._fx({ type: 'line', x1: u.x, y1: u.y, x2: tgt.x, y2: tgt.y, color: color, t: 0.3, w: 4 });
        if (this._hit(u, tgt)) {
          var dmg = this._damage(u, tgt, u.atk * sk.p, 'skill');
          if (t === 'drain') { var h = dmg * (sk.heal || 0.5); u.hp = Math.min(u.maxhp, u.hp + h); u.st.heal += h; }
          if (sk.stun) tgt.stunT = Math.max(tgt.stunT, sk.stun);
          if (sk.slow) this.addBuff(tgt, 'slow', sk.slow, sk.slowDur || 2);
        } else this._miss(tgt);
        u.target = tgt;
        cast = true;
      }
    } else if (t === 'snipe') {
      var st = inR(enemies, u.x, u.y, sk.r).sort(function (a, b) { return a.hp - b.hp; })[0];
      if (!st) return false;
      if (isUlt && st.hp > u.atk * sk.p * 1.6) return false;
      this._fx({ type: 'line', x1: u.x, y1: u.y, x2: st.x, y2: st.y, color: color, t: 0.4, w: 3 });
      if (this._hit(u, st)) this._damage(u, st, u.atk * sk.p, 'skill'); else this._miss(st);
      cast = true;
    } else if (t === 'heal' || t === 'shield') {
      var amt = sk.p * 100 * u.mul * (1 + C.LVL_ATK * (u.lvl - 1));
      var pool = inR(allies, u.x, u.y, sk.all ? (sk.rad || sk.r) : sk.r);
      var need = pool.filter(function (a) { return a.hp / a.maxhp < (sk.all ? 0.65 : 0.75); });
      if (!need.length) return false;
      if (t === 'shield' && !enemies.some(function (e) { return need.some(function (a) { return self.dist(a, e) < 300; }); })) return false;
      if (sk.all && need.length < 2) return false;
      var list = sk.all ? pool : [need.sort(function (a, b) { return a.hp / a.maxhp - b.hp / b.maxhp; })[0]];
      list.forEach(function (a) {
        if (t === 'heal') { var before = a.hp; a.hp = Math.min(a.maxhp, a.hp + amt); u.st.heal += a.hp - before; }
        else a.shield += amt;
        self._fx({ type: 'ring', x: a.x, y: a.y, r: 18, color: t === 'heal' ? '#51cf66' : '#74c0fc', t: 0.5 });
      });
      cast = true;
    } else if (t === 'rally') {
      if (!enemies.some(function (e) { return self.dist(u, e) < 260; })) return false;
      var group = sk.self ? [u] : inR(allies, u.x, u.y, sk.rad);
      group.forEach(function (a) {
        if (sk.as) self.addBuff(a, 'as', sk.as, sk.dur);
        if (sk.dmg) self.addBuff(a, 'dmg', sk.dmg, sk.dur);
        if (sk.spd) self.addBuff(a, 'spd', sk.spd, sk.dur);
        if (sk.lifesteal) self.addBuff(a, 'lifesteal', sk.lifesteal, sk.dur);
        self._fx({ type: 'ring', x: a.x, y: a.y, r: 20, color: '#ffa94d', t: 0.5 });
      });
      cast = true;
    } else if (t === 'taunt') {
      var near = inR(enemies, u.x, u.y, sk.rad);
      if (near.length < (isUlt ? 2 : 1)) return false;
      near.forEach(function (e) { e.taunt = { by: u, t: sk.dur }; e.target = u; });
      u.shield += sk.p * 100 * (1 + C.LVL_HP * (u.lvl - 1));
      this._fx({ type: 'ring', x: u.x, y: u.y, r: sk.rad, color: '#e599f7', t: 0.4, fill: true });
      cast = true;
    }
    if (cast && isUlt && this.render) this._fx({ type: 'text', x: u.x, y: u.y - 32, txt: '궁극기!', color: '#ff6b6b', t: 0.8 });
    return cast;
  };
  Battle.prototype._miss = function (e) { if (this.render) this._fx({ type: 'text', x: e.x, y: e.y - 20, txt: '회피', color: '#adb5bd', t: 0.6 }); };

  // ---------- 종료 ----------
  Battle.prototype.points = function (s) {
    var S = this.sides[s], P = C.SCORE;
    return this.score[s] * P.kill + S.towers * P.tower + S.dragons * P.dragon + S.barons * P.baron;
  };
  Battle.prototype._end = function (winner) {
    if (this.ended) return;
    this.ended = true;
    var w = winner;
    this.endBy = winner != null ? 'nexus' : 'time';
    if (w == null) {
      var p0 = this.points(0), p1 = this.points(1);
      if (p0 !== p1) w = p0 > p1 ? 0 : 1;
      else {
        var f = [0, 0];
        this.units.forEach(function (u) { f[u.side] += u.farm; });
        w = f[0] >= f[1] ? 0 : 1;
      }
      this.log('⏱️ 제한 시간 종료 — 운영 점수 ' + p0 + ' : ' + p1, -1, 'obj');
    }
    this.winner = w;
    var best = null, bs = -1e9;
    this.units.forEach(function (u) {
      if (u.side !== w) return;
      var s = u.st.k * 3 + u.st.a * 1.5 - u.st.d * 1.2 + u.st.dmg / 1500 + u.st.heal / 800 + u.st.struct / 2000;
      if (s > bs) { bs = s; best = u; }
    });
    this.mvp = best;
    this.log('🏆 ' + this.sides[w].name + ' 승리! (' + (this.endBy === 'nexus' ? '넥서스 파괴' : '시간 판정') + ')', w, 'end');
  };

  Battle.prototype.runToEnd = function (halfFn) {
    var guard = 0;
    while (!this.ended && guard++ < 10000) {
      if (this.halfPending) { var t = halfFn ? halfFn(this) : [null, null]; this.resumeHalf(t[0], t[1]); }
      this.step();
    }
    return this;
  };

  Battle.prototype.result = function () {
    var self = this;
    return {
      winner: this.winner, score: this.score.slice(), time: this.time, endBy: this.endBy,
      points: [this.points(0), this.points(1)],
      towers: this.sides.map(function (s) { return s.towers; }),
      dragons: this.sides.map(function (s) { return s.dragons; }),
      barons: this.sides.map(function (s) { return s.barons; }),
      plays: this.sides.map(function (s) { return s.plays.slice(); }),
      tactics: this.sides.map(function (s) { return s.tactic; }),
      startTactics: this.sides.map(function (s) { return s.startTactic; }),
      clock: this.clock(),
      mvp: this.mvp ? { playerId: this.mvp.playerId, name: this.mvp.name, heroId: this.mvp.heroId } : null,
      units: this.units.map(function (u) {
        return { side: u.side, playerId: u.playerId, name: u.name, heroId: u.heroId, pos: u.pos, lvl: u.lvl, farm: Math.round(u.farm * 2),
          k: u.st.k, d: u.st.d, a: u.st.a, dmg: Math.round(u.st.dmg), taken: Math.round(u.st.taken), heal: Math.round(u.st.heal), struct: Math.round(u.st.struct) };
      })
    };
  };

  G.Battle = Battle;

  // =====================================================
  // 렌더러
  // =====================================================
  function BattleView(canvas, battle) { this.c = canvas; this.ctx = canvas.getContext('2d'); this.b = battle; }
  BattleView.prototype.draw = function () {
    var ctx = this.ctx, b = this.b, W = M.W, H = M.H;
    ctx.clearRect(0, 0, W, H);
    // 바탕 (정글)
    ctx.fillStyle = '#1d2b22'; ctx.fillRect(0, 0, W, H);
    // 진영 색
    var g0 = ctx.createRadialGradient(M.BASES[0].x, M.BASES[0].y, 10, M.BASES[0].x, M.BASES[0].y, 260);
    g0.addColorStop(0, G.hexA(b.sides[0].color, 0.35)); g0.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
    var g1 = ctx.createRadialGradient(M.BASES[1].x, M.BASES[1].y, 10, M.BASES[1].x, M.BASES[1].y, 260);
    g1.addColorStop(0, G.hexA(b.sides[1].color, 0.35)); g1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
    // 강
    ctx.strokeStyle = 'rgba(77,171,247,0.22)'; ctx.lineWidth = 46; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(90, 90); ctx.lineTo(630, 630); ctx.stroke();
    // 라인
    ctx.strokeStyle = '#4a4232'; ctx.lineWidth = 30; ctx.lineJoin = 'round';
    Object.keys(M.LANES).forEach(function (k) {
      var pts = M.LANES[k];
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    });
    ctx.lineCap = 'butt';
    // 라인 이름
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TOP', 34, 360); ctx.fillText('MID', 330, 330); ctx.fillText('BOT', 360, 690);
    // 정글 캠프
    b.camps.forEach(function (c) {
      ctx.fillStyle = c.alive ? 'rgba(140,233,154,0.55)' : 'rgba(140,233,154,0.12)';
      ctx.beginPath(); ctx.arc(c.x, c.y, 11, 0, Math.PI * 2); ctx.fill();
      if (c.alive) { ctx.font = '12px sans-serif'; ctx.fillText('🐗', c.x, c.y + 1); }
    });
    // 오브젝트
    [b.dragon, b.baron].forEach(function (o) {
      ctx.fillStyle = 'rgba(200,120,255,0.15)';
      ctx.beginPath(); ctx.arc(o.x, o.y, 26, 0, Math.PI * 2); ctx.fill();
      if (o.alive) {
        ctx.font = '26px sans-serif'; ctx.fillText(o.emoji, o.x, o.y);
        bar(ctx, o.x - 24, o.y + 22, 48, 5, o.hp / o.maxhp, '#cc5de8');
      } else if (b.time < o.nextSpawn) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '11px sans-serif';
        ctx.fillText(b.clock(o.nextSpawn), o.x, o.y);
      }
    });
    // 미니언 (라인 전선)
    Object.keys(b.lanes).forEach(function (k) {
      var L = b.lanes[k];
      [0, 1].forEach(function (s) {
        var off = (s === 0 ? -14 : 14) / L.path.len;
        for (var i = 0; i < 3; i++) {
          var p = pathPoint(L.path, L.f + off * (1 + i * 0.6));
          ctx.fillStyle = s === 0 ? '#74c0fc' : '#ff8787';
          ctx.beginPath(); ctx.arc(p.x + (i - 1) * 4, p.y + (i - 1) * 4, 2.6, 0, Math.PI * 2); ctx.fill();
        }
      });
    });
    // 포탑
    b.towers.forEach(function (t) {
      var col = b.sides[t.side].color;
      if (!t.alive) { ctx.fillStyle = 'rgba(120,120,120,0.35)'; ctx.fillRect(t.x - 6, t.y - 6, 12, 12); return; }
      ctx.strokeStyle = G.hexA(col, 0.18); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(t.x, t.y, C.TOWER_RANGE, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(t.x - 8, t.y - 8, 16, 16);
      ctx.fillStyle = '#111'; ctx.fillRect(t.x - 4, t.y - 4, 8, 8);
      bar(ctx, t.x - 14, t.y - 16, 28, 4, t.hp / t.maxhp, col);
    });
    // 넥서스
    b.nexus.forEach(function (n) {
      ctx.font = '28px sans-serif'; ctx.globalAlpha = n.alive ? 1 : 0.3;
      ctx.fillText('🏰', n.x, n.y); ctx.globalAlpha = 1;
      bar(ctx, n.x - 22, n.y + 18, 44, 5, n.hp / n.maxhp, b.sides[n.side].color);
    });
    // 효과
    b.fx.forEach(function (f) {
      var a = f.t / f.max;
      if (f.type === 'line') {
        ctx.strokeStyle = G.hexA(f.color, a); ctx.lineWidth = f.w || 2;
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      } else if (f.type === 'ring') {
        ctx.strokeStyle = G.hexA(f.color, a); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.2 - a * 0.2), 0, Math.PI * 2); ctx.stroke();
        if (f.fill) { ctx.fillStyle = G.hexA(f.color, a * 0.25); ctx.fill(); }
      }
    });
    // 유닛
    b.units.forEach(function (u) {
      if (!u.alive) return;
      var col = b.sides[u.side].color;
      if (u.stealth) ctx.globalAlpha = 0.45;
      ctx.fillStyle = u.flash > 0 ? '#fff' : '#11151c';
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(u.x, u.y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = '15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(u.hero.emoji, u.x, u.y + 1);
      bar(ctx, u.x - 16, u.y - R - 8, 32, 4, u.hp / u.maxhp, u.side === 0 ? '#4dabf7' : '#ff6b6b');
      if (u.shield > 1) bar(ctx, u.x - 16, u.y - R - 12, 32, 3, Math.min(1, u.shield / u.maxhp), '#e9ecef');
      ctx.fillStyle = G.POS_COLOR[u.pos]; ctx.beginPath(); ctx.arc(u.x + R - 1, u.y + R - 1, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.fillText(u.lvl, u.x + R - 1, u.y + R - 0.5);
      if (u.stunT > 0) { ctx.font = '11px sans-serif'; ctx.fillText('💫', u.x - 12, u.y - 13); }
      ctx.globalAlpha = 1;
    });
    b.fx.forEach(function (f) {
      if (f.type !== 'text') return;
      var a = f.t / f.max;
      ctx.fillStyle = G.hexA(f.color, a); ctx.font = 'bold 11px sans-serif';
      ctx.fillText(f.txt, f.x, f.y - (1 - a) * 16);
    });
    b.banners.forEach(function (bn, i) {
      var a = Math.min(1, bn.t);
      ctx.fillStyle = 'rgba(0,0,0,' + 0.65 * a + ')';
      ctx.fillRect(W / 2 - 210, 300 + i * 38, 420, 30);
      ctx.fillStyle = G.hexA(bn.ok ? '#ffd43b' : '#ff8787', a); ctx.font = 'bold 15px sans-serif';
      ctx.fillText(bn.text, W / 2, 315 + i * 38);
    });
  };
  function bar(ctx, x, y, w, h, r, col) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col; ctx.fillRect(x, y, w * G.clamp(r, 0, 1), h);
  }
  function hexA(hex, a) {
    if (hex[0] !== '#') return hex;
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  G.hexA = hexA;
  G.BattleView = BattleView;
})();
