// =====================================================
// battle.js — 자동 전투 시뮬레이션 (로직) + 캔버스 렌더러 (분리)
// =====================================================
(function () {
  var C = G.CONFIG;
  var R = 14; // 유닛 반지름

  // opts: { seed, heroMods, render, sides: [ { name, color, tactic, readCount, units: [ { player, heroId, order } ] } ] }
  function Battle(opts) {
    this.rng = new G.RNG(opts.seed || 1);
    this.render = !!opts.render;
    this.time = 0;
    this.score = [0, 0];
    this.ended = false;
    this.halfDone = false;
    this.halfPending = false;
    this.overtime = false;
    this.events = [];   // 킬 로그 등
    this.fx = [];       // 렌더링 효과
    this.banners = [];
    this.obj = { alive: false, hp: 0, maxhp: C.OBJ_HP, x: C.MAP_W / 2, y: C.MAP_H / 2, nextSpawn: C.OBJ_SPAWN, taken: [0, 0] };
    this.sides = [];
    this.units = [];
    var self = this;
    opts.sides.forEach(function (sd, si) {
      self.sides.push({
        name: sd.name, color: sd.color, tactic: sd.tactic || 'balanced', startTactic: sd.tactic || 'balanced',
        readCount: sd.readCount || 0, plays: [], nextPlay: C.TRICK.firstPlay, focus: null, focusT: 0, objBuff: 0
      });
      sd.units.forEach(function (ud, i) {
        self.units.push(self._makeUnit(ud, si, i, opts.heroMods));
      });
    });
  }

  Battle.prototype._makeUnit = function (ud, side, idx, mods) {
    var pl = ud.player;
    var hs = G.Hero.stats(ud.heroId, mods);
    var hero = G.HERO_BY_ID[ud.heroId];
    var s = pl.stats;
    var mastery = (pl.mastery && pl.mastery[ud.heroId]) || 0;
    var cond = pl.condition == null ? 90 : pl.condition;
    var u = {
      uid: side * 10 + idx, side: side, idx: idx,
      name: pl.nick, playerId: pl.id, heroId: ud.heroId, hero: hero,
      p: { atk: s.atk, def: s.def, phys: s.phys, iq: s.iq, team: s.team, mental: pl.mental || 10 },
      order: ud.order || { focus: 'auto', entry: 'now' },
      maxhp: hs.hp, hp: hs.hp, atk: hs.atk, range: hs.range, spd: hs.spd, as: hs.as,
      mul: (1 + (s.atk - 10) * C.ATK_PER) *
        (C.MASTERY_MIN + (C.MASTERY_MAX - C.MASTERY_MIN) * mastery / 100) *
        (C.COND_MIN + (C.COND_MAX - C.COND_MIN) * cond / 100),
      defMul: Math.max(0.5, 1 + (s.def - 10) * C.DEF_PER),
      alive: true, respawnT: 0,
      atkCd: this.rng.range(0, 0.5), skillCd: this.rng.range(1.5, 3), ultCd: hero.ult.cd * 0.55,
      target: null, retargetT: 0, buffs: [], shield: 0, stunT: 0,
      mode: null, modeT: 0, waypoint: null, ambush: false, afterFake: false, taunt: null,
      hits: {}, st: { k: 0, d: 0, a: 0, dmg: 0, taken: 0, heal: 0 },
      x: 0, y: 0, flash: 0
    };
    this._spawnPos(u);
    return u;
  };

  Battle.prototype._spawnPos = function (u) {
    u.x = u.side === 0 ? 70 : C.MAP_W - 70;
    u.y = C.MAP_H / 2 - 120 + u.idx * 60;
  };
  Battle.prototype.base = function (side) { return { x: side === 0 ? 40 : C.MAP_W - 40, y: C.MAP_H / 2 }; };
  Battle.prototype.alive = function (side) { return this.units.filter(function (u) { return u.alive && u.side === side; }); };
  Battle.prototype.dist = function (a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); };
  Battle.prototype.inOwnHalf = function (u) { return u.side === 0 ? u.x < C.MAP_W / 2 : u.x > C.MAP_W / 2; };

  Battle.prototype.addBuff = function (u, k, v, t) { u.buffs.push({ k: k, v: v, t: t }); };
  Battle.prototype.buff = function (u, k) {
    var s = 0;
    for (var i = 0; i < u.buffs.length; i++) if (u.buffs[i].k === k) s += u.buffs[i].v;
    return s;
  };
  Battle.prototype.log = function (text, side, cls) {
    this.events.push({ t: this.time, text: text, side: side, cls: cls || '' });
  };
  Battle.prototype.banner = function (text, side, ok) {
    if (this.render) this.banners.push({ text: text, side: side, ok: ok, t: 2.2 });
  };
  Battle.prototype._fx = function (f) { if (this.render) { f.t = f.t || 0.25; f.max = f.t; this.fx.push(f); } };

  // ---------- 메인 루프 ----------
  Battle.prototype.step = function () {
    if (this.ended || this.halfPending) return;
    var dt = C.TICK;
    this.time += dt;
    var self = this;

    if (!this.halfDone && this.time >= C.HALF_TIME) {
      this.halfDone = true;
      this.halfPending = true;
      return;
    }

    // 목표물
    if (!this.obj.alive && this.time >= this.obj.nextSpawn) {
      this.obj.alive = true; this.obj.hp = this.obj.maxhp;
      this.log('🐉 중앙 수호자가 나타났습니다', -1, 'obj');
    }
    // 변칙 플레이 / 집중 대상
    this.sides.forEach(function (S, si) {
      if (S.tactic === 'tricky' && self.time >= S.nextPlay) {
        S.nextPlay = self.time + C.TRICK.interval;
        G.Tactics.tryPlay(self, si);
      }
      if (S.focusT > 0) { S.focusT -= dt; if (S.focusT <= 0 || !S.focus || !S.focus.alive) { S.focus = null; } }
      if (S.objBuff > 0) S.objBuff -= dt;
    });

    for (var i = 0; i < this.units.length; i++) this._unitTick(this.units[i], dt);

    // 효과 정리
    if (this.render) {
      this.fx = this.fx.filter(function (f) { f.t -= dt; return f.t > 0; });
      this.banners = this.banners.filter(function (b) { b.t -= dt; return b.t > 0; });
    }

    // 종료 판정
    if (this.time >= C.MATCH_TIME) {
      if (this.score[0] !== this.score[1]) return this._end();
      if (!this.overtime) { this.overtime = true; this.log('⏱️ 동점! 서든데스 연장전', -1, 'obj'); }
      if (this.time >= C.MATCH_TIME + C.OT_TIME) return this._end();
    }
  };

  Battle.prototype.resumeHalf = function (t0, t1) {
    var self = this;
    [t0, t1].forEach(function (t, si) {
      if (t && t !== self.sides[si].tactic) {
        self.sides[si].tactic = t;
        self.log('📋 ' + self.sides[si].name + ' 전술 변경 → ' + C.TACTICS[t].name, si, 'tactic');
        if (t === 'tricky') self.sides[si].nextPlay = self.time + 3;
      }
    });
    this.halfPending = false;
  };

  Battle.prototype._unitTick = function (u, dt) {
    // 버프 시간
    for (var i = u.buffs.length - 1; i >= 0; i--) { u.buffs[i].t -= dt; if (u.buffs[i].t <= 0) u.buffs.splice(i, 1); }
    if (u.flash > 0) u.flash -= dt;
    if (!u.alive) {
      u.respawnT -= dt;
      if (u.respawnT <= 0) {
        u.alive = true; u.hp = u.maxhp; u.shield = 0; u.mode = null; u.stealth = false; u.target = null; u.buffs = []; u.ambush = false;
        this._spawnPos(u);
      }
      return;
    }
    u.atkCd -= dt; u.skillCd -= dt; u.ultCd -= dt;
    if (u.taunt) { u.taunt.t -= dt; if (u.taunt.t <= 0 || !u.taunt.by.alive) u.taunt = null; }

    // 진영 회복
    var base = this.base(u.side);
    if (this.dist(u, base) < 90) u.hp = Math.min(u.maxhp, u.hp + u.maxhp * C.BASE_REGEN * dt);

    if (u.stunT > 0) { u.stunT -= dt; return; }

    var S = this.sides[u.side];
    var T = C.TACTICS[S.tactic];

    // --- 모드 처리 ---
    if (u.mode === 'fake') {
      this._moveTo(u, base.x, base.y, dt);
      u.modeT -= dt;
      if (u.modeT <= 0) {
        u.mode = null;
        if (u.afterFake) { u.afterFake = false; G.Tactics.fakeTurn(this, u); }
      }
      return;
    }
    if (!u.mode && u.hero.role !== 'tank' && u.hp / u.maxhp < T.retreatHp && !this.overtime) {
      u.mode = 'retreat';
    }
    if (u.mode === 'retreat') {
      this._moveTo(u, base.x, base.y, dt);
      if (u.hp / u.maxhp >= 0.8) u.mode = null;
      // 쫓기면 반격
      var near = this._nearestEnemy(u);
      if (near && this.dist(u, near) <= u.range + R && u.atkCd <= 0) this._basicAttack(u, near);
      return;
    }
    if (u.mode === 'flank') {
      u.modeT -= dt;
      var ft = u.flankTarget;
      if (!ft || !ft.alive) {
        var bl = this.alive(1 - u.side).sort(function (a, b) { return a.hp - b.hp; });
        ft = u.flankTarget = bl[0] || null;
      }
      if (!ft) { u.mode = null; u.stealth = false; return; }
      // 측면으로 휘어 들어가는 경로
      var off = (u.idx % 2 ? 1 : -1) * Math.min(120, this.dist(u, ft) * 0.4);
      this._moveTo(u, ft.x, ft.y + off, dt);
      if (this.dist(u, ft) <= u.range + R + 10 || u.modeT <= 0) {
        u.mode = null; u.stealth = false;
        u.target = ft; u.retargetT = 2.5;
        if (this.dist(u, ft) <= u.range + R + 10 && u.atkCd <= 0) this._basicAttack(u, ft);
      }
      return;
    }
    if (u.mode === 'objective') {
      u.modeT -= dt;
      if (!this.obj.alive || u.modeT <= 0) u.mode = null;
      else { u.target = this.obj; u.retargetT = 1; }
    }

    // --- 진입 타이밍 ---
    var entry = C.ENTRY[u.order.entry] || 0;
    var nearE = this._nearestEnemy(u);
    var nearD = nearE ? this.dist(u, nearE) : 9999;
    if (this.time < entry && nearD > u.range + 60) return;

    // --- 타겟 ---
    u.retargetT -= dt;
    if (u.taunt) u.target = u.taunt.by;
    else if (!u.target || (u.target !== this.obj && !u.target.alive) || (u.target === this.obj && !this.obj.alive) || u.retargetT <= 0) {
      if (u.mode !== 'objective') this._chooseTarget(u, T, nearE, nearD);
    }
    var tgt = u.target;
    if (!tgt) return;

    // --- 스킬 ---
    if (u.ultCd <= 0 && this._tryCast(u, u.hero.ult, true)) u.ultCd = u.hero.ult.cd;
    else if (u.skillCd <= 0 && this._tryCast(u, u.hero.skill, false)) u.skillCd = u.hero.skill.cd;
    if (!u.alive || u.stunT > 0) return;
    tgt = u.target;
    if (!tgt) return;

    // --- 이동 / 공격 ---
    var d = this.dist(u, tgt);
    var reach = u.range + (tgt === this.obj ? 30 : R);
    if (d > reach) {
      var tx = tgt.x, ty = tgt.y;
      // 수비적: 라인 유지
      if (T.holdLine && this.time < 25 && tgt !== this.obj && nearD > u.range + 90) {
        var line = u.side === 0 ? C.MAP_W * T.holdLine : C.MAP_W * (1 - T.holdLine);
        if (u.side === 0 && tx > line) tx = line;
        if (u.side === 1 && tx < line) tx = line;
      }
      this._moveTo(u, tx, ty, dt);
    } else if (u.atkCd <= 0) {
      this._basicAttack(u, tgt);
    }
  };

  Battle.prototype._nearestEnemy = function (u) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.units.length; i++) {
      var e = this.units[i];
      if (!e.alive || e.side === u.side || e.stealth) continue;
      var d = this.dist(u, e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };

  Battle.prototype._chooseTarget = function (u, T, nearE, nearD) {
    var rng = this.rng, self = this;
    u.retargetT = rng.range(0.6, 1.0);
    var enemies = this.alive(1 - u.side).filter(function (e) { return !e.stealth; });
    var S = this.sides[u.side];
    // 목표물
    if (this.obj.alive && nearD > 250 && rng.chance(T.objWeight * 0.5)) { u.target = this.obj; return; }
    if (!enemies.length) { u.target = this.obj.alive ? this.obj : null; return; }
    // 집중 대상 (상대 기습 간파 시)
    if (S.focus && S.focus.alive && rng.chance(0.8)) { u.target = S.focus; return; }
    // 팀워크: 아군이 가장 많이 노리는 대상
    if (rng.chance(C.FOCUS_BASE + u.p.team * C.FOCUS_PER)) {
      var counts = {};
      this.alive(u.side).forEach(function (a) { if (a !== u && a.target && a.target.uid != null && a.target.alive) counts[a.target.uid] = (counts[a.target.uid] || 0) + 1; });
      var bestUid = null, bc = 0;
      Object.keys(counts).forEach(function (k) { if (counts[k] > bc) { bc = counts[k]; bestUid = +k; } });
      if (bestUid != null) {
        var ft = enemies.filter(function (e) { return e.uid === bestUid; })[0];
        if (ft && this.dist(u, ft) < 420) { u.target = ft; return; }
      }
    }
    // 운영: 최적 타겟 선택
    var smart = rng.chance(C.SMART_BASE + u.p.iq * C.SMART_PER);
    if (!smart) { u.target = nearE; return; }
    var focus = u.order.focus || 'auto';
    var pick = null;
    function lowest(list) { return list.slice().sort(function (a, b) { return a.hp / a.maxhp - b.hp / b.maxhp; })[0]; }
    function nearestOf(list) { return list.slice().sort(function (a, b) { return self.dist(u, a) - self.dist(u, b); })[0]; }
    var inReach = enemies.filter(function (e) { return self.dist(u, e) < 380; });
    if (!inReach.length) inReach = enemies;
    if (focus === 'carry') pick = nearestOf(inReach.filter(function (e) { return e.hero.role === 'marksman' || e.hero.role === 'mage'; }));
    else if (focus === 'lowest') pick = lowest(inReach);
    else if (focus === 'nearest') pick = nearE;
    else if (focus === 'support') pick = nearestOf(inReach.filter(function (e) { return e.hero.role === 'support'; }));
    else {
      var role = u.hero.role;
      if (role === 'fighter') pick = lowest(inReach);
      else if (role === 'support') {
        var weak = lowest(this.alive(u.side));
        pick = weak ? nearestOf(enemies.sort(function (a, b) { return self.dist(weak, a) - self.dist(weak, b); }).slice(0, 2)) : nearE;
      } else if (role === 'tank') pick = nearestOf(inReach.filter(function (e) { return G.Hero.beats(u.heroId, e.heroId); })) || nearE;
      else {
        // 딜러: 사거리 안에서 상성 좋은/체력 낮은 적
        var inRange = enemies.filter(function (e) { return self.dist(u, e) < u.range + 60; });
        pick = inRange.length ? lowest(inRange) : nearE;
      }
    }
    u.target = pick || nearE;
  };

  Battle.prototype._moveTo = function (u, tx, ty, dt) {
    var dx = tx - u.x, dy = ty - u.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) return;
    var spd = u.spd * Math.max(0.3, 1 + this.buff(u, 'spd') - this.buff(u, 'slow'));
    var step = Math.min(d, spd * dt);
    u.x += dx / d * step; u.y += dy / d * step;
    // 아군과 겹치지 않게
    for (var i = 0; i < this.units.length; i++) {
      var o = this.units[i];
      if (o === u || !o.alive || o.side !== u.side) continue;
      var ox = u.x - o.x, oy = u.y - o.y, od = Math.sqrt(ox * ox + oy * oy);
      if (od > 0 && od < R * 1.8) { u.x += ox / od * 1.2; u.y += oy / od * 1.2; }
    }
    u.x = G.clamp(u.x, 15, C.MAP_W - 15); u.y = G.clamp(u.y, 15, C.MAP_H - 15);
  };

  // ---------- 피해 ----------
  Battle.prototype._outMul = function (u) {
    var S = this.sides[u.side];
    var m = u.mul * (1 + this.buff(u, 'dmg') + G.Tactics.dmgMod(this, u) + (S.objBuff > 0 ? C.OBJ_BUFF_DMG : 0));
    if (this.score[1 - u.side] - this.score[u.side] >= 3) m *= 1 + (u.p.mental - 10) * C.MENTAL_PER;
    return Math.max(0.2, m);
  };

  Battle.prototype._damage = function (src, tgt, base, label) {
    if (tgt === this.obj) {
      var od = base * this._outMul(src) * (1 + this.buff(src, 'objdmg'));
      this.obj.hp -= od;
      src.st.dmg += od;
      this.obj.lastSide = src.side;
      if (this.obj.hp <= 0) this._objTaken(src);
      return od;
    }
    if (!tgt.alive) return 0;
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
    var real = dmg - absorbed;
    tgt.hp -= real;
    tgt.flash = 0.12;
    src.st.dmg += dmg; tgt.st.taken += dmg;
    tgt.hits[src.uid] = this.time;
    var ls = this.buff(src, 'lifesteal');
    if (ls > 0) src.hp = Math.min(src.maxhp, src.hp + dmg * ls);
    if (this.render) this._fx({ type: 'text', x: tgt.x + this.rng.range(-8, 8), y: tgt.y - 22, txt: Math.round(dmg), color: label === 'skill' ? '#ffd43b' : '#fff', t: 0.7 });
    if (tgt.hp <= 0) this._kill(src, tgt);
    return dmg;
  };

  Battle.prototype._kill = function (src, v) {
    var self = this;
    v.alive = false; v.hp = 0; v.target = null; v.mode = null; v.stealth = false;
    v.respawnT = C.RESPAWN_BASE + this.time * C.RESPAWN_GROW;
    v.st.d++; src.st.k++;
    this.score[src.side]++;
    var assists = [];
    Object.keys(v.hits).forEach(function (uid) {
      uid = +uid;
      if (uid === src.uid) return;
      if (self.time - v.hits[uid] <= C.ASSIST_WINDOW) {
        var a = self.units.filter(function (x) { return x.uid === uid && x.side === src.side; })[0];
        if (a) { a.st.a++; assists.push(a.name); }
      }
    });
    v.hits = {};
    this.log('⚔️ ' + src.name + '(' + src.hero.name + ') → ' + v.name + '(' + v.hero.name + ')', src.side, 'kill');
    this._fx({ type: 'ring', x: v.x, y: v.y, r: 26, color: this.sides[src.side].color, t: 0.6 });
    if (this.overtime) this._end();
  };

  Battle.prototype._objTaken = function (src) {
    this.obj.alive = false;
    this.obj.nextSpawn = this.time + C.OBJ_RESPAWN;
    this.obj.taken[src.side]++;
    this.score[src.side] += C.OBJ_POINTS;
    this.sides[src.side].objBuff = C.OBJ_BUFF_TIME;
    this.log('🐉 ' + this.sides[src.side].name + ' 수호자 처치! (+' + C.OBJ_POINTS + '점, 공격력 강화)', src.side, 'obj');
    this.banner(this.sides[src.side].name + ' 수호자 처치!', src.side, true);
    this._fx({ type: 'ring', x: this.obj.x, y: this.obj.y, r: 50, color: this.sides[src.side].color, t: 0.8 });
    if (this.overtime) this._end();
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

  // ---------- 스킬 ----------
  Battle.prototype._tryCast = function (u, sk, isUlt) {
    var self = this;
    var enemies = this.alive(1 - u.side);
    var allies = this.alive(u.side);
    var tgt = u.target && u.target !== this.obj && u.target.alive ? u.target : this._nearestEnemy(u);
    var color = isUlt ? '#ff6b6b' : '#ffd43b';
    function inR(list, cx, cy, r) { return list.filter(function (e) { var dx = e.x - cx, dy = e.y - cy; return dx * dx + dy * dy <= r * r; }); }
    var t = sk.t;
    var cast = false;

    if (t === 'dash' || t === 'stun' || t === 'drain' || t === 'aoe') {
      if (t === 'dash' && sk.lowest) {
        var cands = inR(enemies, u.x, u.y, sk.r).sort(function (a, b) { return a.hp - b.hp; });
        tgt = cands[0] || null;
      }
      if (!tgt || this.dist(u, tgt) > sk.r + R) return false;
      if (t === 'aoe') {
        var hitList = inR(enemies, tgt.x, tgt.y, sk.rad);
        if (isUlt && hitList.length < 2 && this.time < C.MATCH_TIME - 15 && tgt.hp > tgt.maxhp * 0.5) return false;
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
        } else {
          this._fx({ type: 'line', x1: u.x, y1: u.y, x2: tgt.x, y2: tgt.y, color: color, t: 0.3, w: 4 });
        }
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
      var targets = inR(enemies, u.x, u.y, sk.r).sort(function (a, b) { return a.hp - b.hp; });
      var st = targets[0];
      if (!st) return false;
      if (isUlt && st.hp > u.atk * sk.p * 1.6 && this.time < C.MATCH_TIME - 15) return false;
      this._fx({ type: 'line', x1: u.x, y1: u.y, x2: st.x, y2: st.y, color: color, t: 0.4, w: 3 });
      if (this._hit(u, st)) this._damage(u, st, u.atk * sk.p, 'skill'); else this._miss(st);
      cast = true;
    } else if (t === 'heal' || t === 'shield') {
      var amt = sk.p * 100 * u.mul;
      var pool = sk.all ? inR(allies, u.x, u.y, sk.rad || sk.r) : inR(allies, u.x, u.y, sk.r);
      var need = pool.filter(function (a) { return a.hp / a.maxhp < (sk.all ? 0.65 : 0.75); });
      if (!need.length) return false;
      if (t === 'shield' && !enemies.some(function (e) { return need.some(function (a) { return self.dist(a, e) < 300; }); })) return false;
      if (sk.all && need.length < 2) return false;
      var list = sk.all ? pool : [need.sort(function (a, b) { return a.hp / a.maxhp - b.hp / b.maxhp; })[0]];
      list.forEach(function (a) {
        if (t === 'heal') { var before = a.hp; a.hp = Math.min(a.maxhp, a.hp + amt); u.st.heal += a.hp - before; }
        else a.shield += amt;
        self._fx({ type: 'ring', x: a.x, y: a.y, r: 20, color: t === 'heal' ? '#51cf66' : '#74c0fc', t: 0.5 });
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
        self._fx({ type: 'ring', x: a.x, y: a.y, r: 22, color: '#ffa94d', t: 0.5 });
      });
      cast = true;
    } else if (t === 'taunt') {
      var near = inR(enemies, u.x, u.y, sk.rad);
      if (near.length < (isUlt ? 2 : 1)) return false;
      near.forEach(function (e) { e.taunt = { by: u, t: sk.dur }; e.target = u; });
      u.shield += sk.p * 100;
      this._fx({ type: 'ring', x: u.x, y: u.y, r: sk.rad, color: '#e599f7', t: 0.4, fill: true });
      cast = true;
    }
    if (cast && isUlt && this.render) this._fx({ type: 'text', x: u.x, y: u.y - 34, txt: '궁극기!', color: '#ff6b6b', t: 0.8 });
    return cast;
  };

  Battle.prototype._miss = function (e) {
    if (this.render) this._fx({ type: 'text', x: e.x, y: e.y - 22, txt: '회피', color: '#adb5bd', t: 0.6 });
  };

  Battle.prototype._end = function () {
    this.ended = true;
    var w;
    if (this.score[0] !== this.score[1]) w = this.score[0] > this.score[1] ? 0 : 1;
    else {
      var d0 = 0, d1 = 0;
      this.units.forEach(function (u) { if (u.side === 0) d0 += u.st.dmg; else d1 += u.st.dmg; });
      w = d0 >= d1 ? 0 : 1;
      this.log('⚖️ 연장 종료 — 총 피해량으로 승부 결정', -1, 'obj');
    }
    this.winner = w;
    // MVP
    var best = null, bs = -1e9;
    this.units.forEach(function (u) {
      if (u.side !== w) return;
      var s = u.st.k * 3 + u.st.a * 1.5 - u.st.d + u.st.dmg / 600 + u.st.heal / 400;
      if (s > bs) { bs = s; best = u; }
    });
    this.mvp = best;
    this.log('🏆 ' + this.sides[w].name + ' 승리! (' + this.score[0] + ' : ' + this.score[1] + ')', w, 'end');
  };

  // 렌더링 없이 끝까지 (하프타임은 AI 판단 or 콜백)
  Battle.prototype.runToEnd = function (halfFn) {
    var guard = 0;
    while (!this.ended && guard++ < 5000) {
      if (this.halfPending) {
        var t = halfFn ? halfFn(this) : [null, null];
        this.resumeHalf(t[0], t[1]);
      }
      this.step();
    }
    return this;
  };

  Battle.prototype.result = function () {
    return {
      winner: this.winner, score: this.score.slice(), time: this.time,
      plays: this.sides.map(function (s) { return s.plays.slice(); }),
      tactics: this.sides.map(function (s) { return s.tactic; }),
      startTactics: this.sides.map(function (s) { return s.startTactic; }),
      obj: this.obj.taken.slice(),
      mvp: this.mvp ? { playerId: this.mvp.playerId, name: this.mvp.name, heroId: this.mvp.heroId } : null,
      units: this.units.map(function (u) {
        return { side: u.side, playerId: u.playerId, name: u.name, heroId: u.heroId, k: u.st.k, d: u.st.d, a: u.st.a,
          dmg: Math.round(u.st.dmg), taken: Math.round(u.st.taken), heal: Math.round(u.st.heal) };
      })
    };
  };

  G.Battle = Battle;

  // =====================================================
  // 렌더러
  // =====================================================
  function BattleView(canvas, battle) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.b = battle;
  }
  BattleView.prototype.draw = function () {
    var ctx = this.ctx, b = this.b, W = C.MAP_W, H = C.MAP_H;
    ctx.clearRect(0, 0, W, H);
    // 맵
    var g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, hexA(b.sides[0].color, 0.18)); g.addColorStop(0.5, '#1b2230'); g.addColorStop(1, hexA(b.sides[1].color, 0.18));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (var x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (var y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
    // 진영
    [0, 1].forEach(function (s) {
      var bs = b.base(s);
      ctx.fillStyle = hexA(b.sides[s].color, 0.25);
      ctx.beginPath(); ctx.arc(bs.x, bs.y, 90, 0, Math.PI * 2); ctx.fill();
      ctx.font = '26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🏰', bs.x, bs.y);
    });
    // 목표물
    var o = b.obj;
    if (o.alive) {
      ctx.fillStyle = 'rgba(200,120,255,0.18)';
      ctx.beginPath(); ctx.arc(o.x, o.y, 34, 0, Math.PI * 2); ctx.fill();
      ctx.font = '34px sans-serif'; ctx.fillText('🐉', o.x, o.y);
      bar(ctx, o.x - 30, o.y + 30, 60, 6, o.hp / o.maxhp, '#cc5de8');
    } else if (b.time < o.nextSpawn) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '12px sans-serif';
      ctx.fillText('수호자 ' + Math.ceil(o.nextSpawn - b.time) + 's', o.x, o.y);
    }
    // 효과 (아래)
    b.fx.forEach(function (f) {
      var a = f.t / f.max;
      if (f.type === 'line') {
        ctx.strokeStyle = hexA(f.color, a); ctx.lineWidth = f.w || 2;
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      } else if (f.type === 'ring') {
        ctx.strokeStyle = hexA(f.color, a); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.2 - a * 0.2), 0, Math.PI * 2); ctx.stroke();
        if (f.fill) { ctx.fillStyle = hexA(f.color, a * 0.25); ctx.fill(); }
      }
    });
    // 유닛
    b.units.forEach(function (u) {
      if (!u.alive) return;
      var col = b.sides[u.side].color;
      if (u.stealth) ctx.globalAlpha = 0.45;
      if (u.mode === 'flank') { ctx.fillStyle = 'rgba(255,212,59,0.25)'; ctx.beginPath(); ctx.arc(u.x, u.y, R + 7, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = u.flash > 0 ? '#fff' : '#11151c';
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(u.x, u.y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(u.hero.emoji, u.x, u.y + 1);
      bar(ctx, u.x - 17, u.y - R - 9, 34, 4, u.hp / u.maxhp, u.side === 0 ? '#4dabf7' : '#ff6b6b');
      if (u.shield > 1) bar(ctx, u.x - 17, u.y - R - 13, 34, 3, Math.min(1, u.shield / u.maxhp), '#e9ecef');
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '10px sans-serif';
      ctx.fillText(u.name, u.x, u.y + R + 9);
      if (u.stunT > 0) { ctx.font = '12px sans-serif'; ctx.fillText('💫', u.x + 14, u.y - 14); }
      ctx.globalAlpha = 1;
    });
    // 텍스트 효과
    b.fx.forEach(function (f) {
      if (f.type !== 'text') return;
      var a = f.t / f.max;
      ctx.fillStyle = hexA(f.color, a); ctx.font = 'bold 12px sans-serif';
      ctx.fillText(f.txt, f.x, f.y - (1 - a) * 16);
    });
    // 배너
    b.banners.forEach(function (bn, i) {
      var a = Math.min(1, bn.t);
      ctx.fillStyle = 'rgba(0,0,0,' + 0.6 * a + ')';
      ctx.fillRect(W / 2 - 200, 40 + i * 40, 400, 32);
      ctx.fillStyle = hexA(bn.ok ? '#ffd43b' : '#ff8787', a); ctx.font = 'bold 16px sans-serif';
      ctx.fillText(bn.text, W / 2, 56 + i * 40);
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
