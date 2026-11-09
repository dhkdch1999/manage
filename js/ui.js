// =====================================================
// ui.js — 모든 화면 (타이틀, 구단 관리, 경기 준비, 밴픽, 전투 관전, 결과)
// =====================================================
(function () {
  var C = G.CONFIG, L = G.League;
  var UI = G.UI = { view: 'home', tab: {}, match: null, roleFilter: 'all' };
  var app = document.getElementById('app');
  var modalRoot = document.getElementById('modal-root');

  // ---------- 유틸 ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { return Math.round(n).toLocaleString() + '만원'; }
  function sCls(v) { return v >= 14 ? 's-hi' : v >= 9 ? 's-mid' : 's-lo'; }
  function sv(v, known) { return known ? '<span class="stat-v ' + sCls(v) + '">' + v + '</span>' : '<span class="stat-v s-q">?</span>'; }
  function ovr(p) { return G.Player.overall(p).toFixed(1); }
  function bar(v, col) { return '<div class="bar"><i style="width:' + G.clamp(v, 0, 100) + '%;background:' + (col || 'var(--green)') + '"></i></div>'; }
  function heroTag(id) { var h = G.HERO_BY_ID[id]; return h ? h.emoji + ' ' + esc(h.name) : '-'; }
  function teamName(id) { var t = L.t(id); return t ? esc(t.name) : '?'; }
  function toast(msg, ms) {
    var root = document.getElementById('toast-root');
    while (root.children.length >= 3) root.firstChild.remove();
    var d = document.createElement('div'); d.className = 'toast'; d.innerHTML = msg;
    root.appendChild(d);
    setTimeout(function () { d.remove(); }, ms || 2600);
  }
  UI.toast = toast;
  function modal(html, wide) {
    modalRoot.innerHTML = '<div class="modal-bg" data-act="modal-bg"><div class="modal' + (wide ? ' wide' : '') + '">' + html + '</div></div>';
  }
  function closeModal() { modalRoot.innerHTML = ''; }
  function save() { G.Save.save(); }
  function patchTag(id) {
    var m = G.state.heroMods[id] || 1;
    if (m > 1.001) return '<span class="tag buff">버프 +' + Math.round((m - 1) * 100) + '%</span>';
    if (m < 0.999) return '<span class="tag nerf">너프 ' + Math.round((m - 1) * 100) + '%</span>';
    return '';
  }
  function skillText(sk) {
    var t = {
      dash: '돌진해 공격력 ×' + sk.p + ' 피해' + (sk.lowest ? ' (체력 낮은 적 우선)' : ''),
      aoe: '범위 공격력 ×' + sk.p + ' 피해',
      stun: '단일 대상 공격력 ×' + sk.p + ' 피해',
      snipe: '사거리 ' + sk.r + ' 안 가장 약한 적 저격 ×' + sk.p,
      drain: '공격력 ×' + sk.p + ' 피해 + 흡혈',
      heal: (sk.all ? '아군 전체' : '아군 1명') + ' 체력 ' + Math.round(sk.p * 100) + ' 회복',
      shield: (sk.all ? '아군 전체' : '아군 1명') + ' 보호막 ' + Math.round(sk.p * 100),
      rally: (sk.self ? '자신' : '주변 아군') + ' 강화' + (sk.as ? ' 공속+' + Math.round(sk.as * 100) + '%' : '') + (sk.dmg ? ' 피해+' + Math.round(sk.dmg * 100) + '%' : '') + (sk.spd ? ' 이속+' + Math.round(sk.spd * 100) + '%' : '') + (sk.lifesteal ? ' 흡혈' : ''),
      taunt: '주변 적 도발 ' + sk.dur + '초 + 보호막'
    }[sk.t] || sk.t;
    if (sk.stun) t += ', 기절 ' + sk.stun + '초';
    if (sk.slow) t += ', 둔화 ' + Math.round(sk.slow * 100) + '%';
    return t + ' (쿨 ' + sk.cd + '초)';
  }

  // ---------- 렌더 ----------
  function render() {
    if (!G.state) { app.innerHTML = vTitle(); return; }
    if (UI.match) { app.innerHTML = vMatch(); afterMatchRender(); return; }
    var st = G.state, u = L.user();
    var nav = [['home', '🏠 홈'], ['squad', '👥 선수단'], ['training', '🏋️ 훈련'], ['league', '🏆 리그'], ['market', '🔁 이적시장'],
      ['club', '🏢 구단'], ['heroes', '🦸 영웅'], ['settings', '⚙️ 설정']];
    var views = { home: vHome, squad: vSquad, training: vTraining, league: vLeague, market: vMarket, club: vClub, heroes: vHeroes, settings: vSettings };
    app.innerHTML =
      '<div class="layout"><aside class="sidebar"><div class="brand">⚔️ 팀파이트 감독</div><div class="nav">' +
      nav.map(function (n) { return '<button data-act="nav" data-v="' + n[0] + '" class="' + (UI.view === n[0] ? 'active' : '') + '">' + n[1] + '</button>'; }).join('') +
      '</div></aside><main class="main">' +
      '<div class="topbar"><span class="team" style="color:' + u.color + '">' + esc(u.name) + '</span>' +
      '<span class="stat">시즌 <b>' + st.season + '</b></span><span class="stat"><b>' + L.weekLabel() + '</b></span>' +
      '<span class="stat"><b>' + u.div + '부</b> 리그</span><span class="spacer"></span>' +
      '<span class="stat">팬 <b>' + st.fans.toLocaleString() + '</b></span>' +
      '<span class="stat">자금 <b class="' + (st.money < 0 ? 'red' : '') + '">' + money(st.money) + '</b></span></div>' +
      views[UI.view]() + '</main></div>';
  }
  UI.render = render;

  // ---------- 타이틀 ----------
  function vTitle() {
    return '<div class="title-screen"><div class="title-box">' +
      '<div class="logo">팀파이트 감독</div><div class="muted">5v5 자동 전투 × 구단 운영 e스포츠 매니저</div>' +
      '<div class="card"><h2>새 게임</h2>' +
      '<label>팀 이름</label><input id="ng-name" value="신생 게이밍" maxlength="14">' +
      '<label>시드 (비워두면 랜덤 · 같은 시드면 같은 세계)</label><input id="ng-seed" placeholder="예: 12345">' +
      '<div style="margin-top:14px" class="row"><button class="primary" data-act="new-game">창단하기</button></div></div>' +
      '<div class="card"><div class="row">' +
      (G.Save.has() ? '<button data-act="continue">▶ 이어하기</button>' : '') +
      '<input type="file" id="import-file" accept=".json" style="display:none"><button data-act="import-click">📂 저장 파일 불러오기</button>' +
      '</div></div></div></div>';
  }

  // ---------- 홈 ----------
  function vHome() {
    var st = G.state, u = L.user(), html = '';
    if (st.phase === 'offseason') {
      var err = L.canStartSeason();
      html += '<div class="card"><h2>🌙 오프시즌</h2><p class="muted">이적시장이 열려 있습니다. 다른 팀 선수 영입, 재계약, 방출을 마친 뒤 새 시즌을 시작하세요.</p>' +
        (st.pendingRenewals.length ? '<p class="gold">재계약 대기 선수 ' + st.pendingRenewals.length + '명 — 재계약하지 않으면 새 시즌 시작 시 팀을 떠납니다.</p>' : '') +
        '<div class="row"><button data-act="nav" data-v="market">🔁 이적시장</button><button class="primary" data-act="new-season" ' + (err ? 'disabled' : '') + '>🚀 시즌 ' + (st.season + 1) + ' 시작</button>' +
        (err ? '<span class="red">' + err + '</span>' : '') + '</div></div>';
    } else {
      var fx = L.userFixture();
      if (fx) {
        var opp = fx.a === u.id ? fx.b : fx.a, ot = L.t(opp);
        var rc = G.Tactics.readCount(st.trickMemory, u.id, opp);
        html += '<div class="card"><h3>다음 경기 · ' + L.stageName(fx.stage) + '</h3><div class="next-match">' +
          '<div><div class="team-big" style="color:' + u.color + '">' + esc(u.name) + '</div><div class="muted">전력 ' + L.strength(u.id).toFixed(1) + '</div></div>' +
          '<div class="vs">VS</div>' +
          '<div><div class="team-big" style="color:' + ot.color + '">' + esc(ot.name) + '</div><div class="muted">전력 ' + L.strength(opp).toFixed(1) + ' · 주 전술 ' + C.TACTICS[ot.style].name + '</div></div>' +
          '<span class="spacer"></span><div class="row"><button data-act="auto-match">⏩ 자동 진행</button><button class="primary" data-act="prep">⚔️ 경기 준비</button></div></div>' +
          (rc > 0 ? '<p class="gold" style="margin-bottom:0">⚠️ 이 상대에게 변칙 전술을 ' + rc + '번 연속 사용했습니다. 또 쓰면 간파당할 확률이 높아집니다.</p>' : '') + '</div>';
      } else {
        html += '<div class="card"><h3>' + L.weekLabel() + '</h3><p class="muted">이번 주에는 우리 팀 경기가 없습니다.</p>' +
          '<button class="primary" data-act="advance">다음 주로 ▶</button></div>';
      }
    }
    // 뉴스 + 순위
    var tb = L.table(u.div);
    html += '<div class="grid2" style="margin-top:14px"><div class="card"><h3>📰 소식</h3><ul class="news">' +
      st.news.slice(0, 25).map(function (n) { return '<li><span class="muted">S' + n.season + '</span> ' + esc(n.text) + '</li>'; }).join('') +
      '</ul></div><div class="card"><h3>' + u.div + '부 리그 순위</h3>' + tableHTML(tb, u.div) +
      (st.lastFinance ? '<p class="muted" style="margin-bottom:0">지난주 수입 ' + money(st.lastFinance.sponsor) + ' / 연봉 지출 ' + money(st.lastFinance.salary) + '</p>' : '') +
      '</div></div>';
    return html;
  }

  function tableHTML(tb, div) {
    var uid = G.state.userTeamId;
    return '<table><tr><th>#</th><th>팀</th><th class="num">승</th><th class="num">패</th><th class="num">득실</th><th>전력</th></tr>' +
      tb.map(function (r, i) {
        var t = L.t(r.id);
        var zone = div === 1 && i >= tb.length - 2 ? ' <span class="tag nerf">강등권</span>' : div === 2 && i < 2 ? ' <span class="tag buff">승격권</span>' : '';
        return '<tr class="' + (r.id === uid ? 'me' : '') + '"><td>' + (i + 1) + (i < 4 ? ' <span class="gold">●</span>' : '') + '</td><td><span style="color:' + t.color + '">■</span> ' + esc(t.name) + zone + '</td>' +
          '<td class="num">' + r.w + '</td><td class="num">' + r.l + '</td><td class="num">' + (r.sf - r.sa > 0 ? '+' : '') + (r.sf - r.sa) + '</td><td>' + L.strength(r.id).toFixed(1) + '</td></tr>';
      }).join('') + '</table>';
  }

  // ---------- 선수단 ----------
  function vSquad() {
    var u = L.user();
    var ps = u.players.map(L.p).sort(function (a, b) { return G.ROLE_ORDER.indexOf(a.role) - G.ROLE_ORDER.indexOf(b.role); });
    return '<div class="card"><div class="row"><h2>👥 선수단 (' + ps.length + '/' + C.ROSTER_MAX + ')</h2><span class="spacer"></span>' +
      '<span class="muted">선발 ' + u.starters.length + '/5 · 선수를 누르면 상세 정보</span><button class="small" data-act="auto-starters">자동 선발</button></div>' +
      '<table><tr><th>선발</th><th>닉네임</th><th>역할</th><th class="num">나이</th>' +
      G.STAT_KEYS.map(function (k) { return '<th class="num">' + G.STAT_NAMES[k] + '</th>'; }).join('') +
      '<th class="num">종합</th><th class="num">잠재</th><th>컨디션</th><th class="num">피로</th><th>주력 영웅</th><th class="num">연봉</th><th class="num">계약</th></tr>' +
      ps.map(function (p) {
        var on = u.starters.indexOf(p.id) >= 0;
        var pend = G.state.pendingRenewals.indexOf(p.id) >= 0;
        return '<tr class="click" data-act="player" data-pid="' + p.id + '"><td><button class="small ' + (on ? 'primary' : '') + '" data-act="starter" data-pid="' + p.id + '">' + (on ? '선발' : '후보') + '</button></td>' +
          '<td><b>' + esc(p.nick) + '</b>' + (pend ? ' <span class="tag warn">재계약</span>' : '') + '</td><td>' + G.ROLES[p.role] + '</td><td class="num">' + p.age + '</td>' +
          G.STAT_KEYS.map(function (k) { return '<td class="num">' + sv(p.stats[k], true) + '</td>'; }).join('') +
          '<td class="num"><b>' + ovr(p) + '</b></td><td class="num">' + p.potential + '</td><td>' + bar(p.condition, p.condition < 60 ? 'var(--red)' : '') + '</td>' +
          '<td class="num">' + Math.round(p.fatigue) + '</td><td>' + G.Player.bestHeroes(p, 3).map(function (b) { return G.HERO_BY_ID[b.id].emoji; }).join(' ') + '</td>' +
          '<td class="num">' + p.salary + '</td><td class="num">' + p.years + '년</td></tr>';
      }).join('') + '</table></div>';
  }

  function playerModal(pid) {
    var p = L.p(pid), st = G.state, mine = p.teamId === st.userTeamId, known = L.isKnown(pid);
    var vis = L.visibleStats(pid);
    var team = p.teamId ? teamName(p.teamId) : '자유계약';
    var ms = G.HEROES.map(function (h) { return { h: h, m: p.mastery[h.id] || 0 }; }).sort(function (a, b) { return b.m - a.m; }).slice(0, 8);
    var c = p.career, s = p.season;
    var html = '<h2>' + esc(p.nick) + ' <span class="muted" style="font-size:14px">' + G.ROLES[p.role] + ' · ' + p.age + '세 · ' + team + '</span></h2>' +
      '<div class="grid2"><div><h3>능력치</h3><table>' +
      G.STAT_KEYS.map(function (k) {
        var k2 = known || vis.indexOf(k) >= 0;
        return '<tr><td>' + G.STAT_NAMES[k] + '</td><td class="num">' + sv(p.stats[k], k2) + '</td><td style="width:50%">' + (mine ? bar((p.progress[k] || 0) * 100, 'var(--accent)') : '') + '</td></tr>';
      }).join('') +
      '<tr><td>잠재력</td><td class="num">' + sv(p.potential, known) + '</td><td></td></tr><tr><td>멘탈</td><td class="num">' + sv(p.mental, known) + '</td><td></td></tr>' +
      '<tr><td>성장 속도</td><td class="num">' + (known ? '×' + p.growth : '?') + '</td><td></td></tr></table>' +
      (mine ? '<p class="muted">컨디션 ' + p.condition + ' · 피로 ' + Math.round(p.fatigue) + ' · 사기 ' + Math.round(p.morale) + '</p>' : '') +
      '</div><div><h3>영웅 숙련도</h3><table>' + ms.map(function (x) {
        return '<tr><td>' + x.h.emoji + ' ' + esc(x.h.name) + '</td><td style="width:55%">' + (known ? bar(x.m, 'var(--blue)') : '<span class="muted">스카우트 필요</span>') + '</td><td class="num">' + (known ? Math.round(x.m) : '') + '</td></tr>';
      }).join('') + '</table></div></div>' +
      '<p class="muted">이번 시즌 ' + s.games + '경기 ' + s.wins + '승 · KDA ' + s.k + '/' + s.d + '/' + s.a + ' &nbsp;|&nbsp; 통산 ' + c.games + '경기 ' + c.wins + '승 · KDA ' + c.k + '/' + c.d + '/' + c.a + '</p>' +
      '<p class="muted">연봉 ' + p.salary + '만원 · 계약 ' + p.years + '년 · 이적 가치 ' + money(G.Player.value(p)) + '</p>' +
      '<div class="actions">';
    if (mine) {
      var pend = st.pendingRenewals.indexOf(pid) >= 0;
      if (pend) html += '<button class="primary" data-act="negotiate" data-pid="' + pid + '" data-mode="renew">재계약 협상</button>';
      html += '<button data-act="sell" data-pid="' + pid + '">판매 제안 받기</button><button class="danger" data-act="release" data-pid="' + pid + '">방출 (위약금 ' + L.releaseCost(p) + ')</button>';
    } else {
      if (!known) html += '<button data-act="scout" data-pid="' + pid + '">🔍 스카우트 (' + C.SCOUT_COST + '만원)</button>';
      if (!L.t(p.teamId || '') || !L.t(p.teamId).foreign) html += '<button class="primary" data-act="negotiate" data-pid="' + pid + '">영입 협상</button>';
    }
    html += '<button data-act="close">닫기</button></div>';
    modal(html, true);
  }

  // ---------- 훈련 ----------
  function vTraining() {
    var u = L.user(), st = G.state;
    var opts = [['atk', '공격'], ['def', '방어'], ['phys', '피지컬'], ['iq', '운영'], ['team', '팀워크'], ['hero', '영웅 숙련'], ['rest', '휴식']];
    return '<div class="card"><div class="row"><h2>🏋️ 주간 훈련</h2><span class="spacer"></span><button class="small" data-act="all-rest">전원 휴식</button><button class="small" data-act="all-train">전원 주 능력치 훈련</button></div>' +
      '<p class="muted">훈련은 매주 진행 시 적용됩니다. 훈련하면 피로가 쌓이고, 피로가 높으면 컨디션과 성장 효율이 떨어집니다. 훈련장 Lv.' + st.facility.train + ' (성장 +' + (st.facility.train - 1) * 15 + '%) · 숙소 Lv.' + st.facility.dorm + ' (피로 -' + (st.facility.dorm - 1) * 8 + '%)</p>' +
      '<table><tr><th>선수</th><th>역할</th><th>훈련</th><th>영웅</th><th>진행도</th><th class="num">피로</th><th>컨디션</th><th class="num">잠재</th></tr>' +
      u.players.map(L.p).map(function (p) {
        var prog = p.train !== 'rest' && p.train !== 'hero' ? (p.progress[p.train] || 0) * 100 : 0;
        return '<tr><td><b>' + esc(p.nick) + '</b></td><td>' + G.ROLES[p.role] + '</td><td><select data-chg="train" data-pid="' + p.id + '">' +
          opts.map(function (o) { return '<option value="' + o[0] + '"' + (p.train === o[0] ? ' selected' : '') + '>' + o[1] + (G.STAT_NAMES[o[0]] ? ' (' + p.stats[o[0]] + ')' : '') + '</option>'; }).join('') +
          '</select></td><td>' + (p.train === 'hero' ? '<select data-chg="train-hero" data-pid="' + p.id + '">' + G.HEROES.map(function (h) {
            return '<option value="' + h.id + '"' + ((p.trainHero || G.Player.bestHeroes(p, 1)[0].id) === h.id ? ' selected' : '') + '>' + h.emoji + ' ' + h.name + ' (' + Math.round(p.mastery[h.id] || 0) + ')</option>';
          }).join('') + '</select>' : '<span class="muted">-</span>') + '</td>' +
          '<td style="width:120px">' + bar(prog, 'var(--accent)') + '</td><td class="num ' + (p.fatigue > 60 ? 'red' : '') + '">' + Math.round(p.fatigue) + '</td>' +
          '<td style="width:100px">' + bar(p.condition, p.condition < 60 ? 'var(--red)' : '') + '</td><td class="num">' + p.potential + '</td></tr>';
      }).join('') + '</table></div>';
  }

  // ---------- 리그 ----------
  function vLeague() {
    var st = G.state, tab = UI.tab.league || L.user().div;
    var html = '<div class="tabs"><button data-act="tab" data-k="league" data-v="1" class="' + (tab == 1 ? 'on' : '') + '">1부 리그</button>' +
      '<button data-act="tab" data-k="league" data-v="2" class="' + (tab == 2 ? 'on' : '') + '">2부 리그</button>' +
      '<button data-act="tab" data-k="league" data-v="w" class="' + (tab === 'w' ? 'on' : '') + '">세계 대회</button></div>';
    if (tab === 'w') {
      var bw = st.bracket.w;
      html += '<div class="card"><h2>🌏 세계 대회</h2><p class="muted">1부 리그 우승·준우승 팀과 해외 강호 2팀이 겨룹니다. 해외팀: ' +
        st.worldTeams.map(function (id) { return teamName(id) + ' (전력 ' + L.strength(id).toFixed(1) + ')'; }).join(', ') + '</p>' +
        (bw ? bracketHTML(bw, 'wsemi', 'wfinal') : '<p>정규 시즌과 플레이오프가 끝나면 열립니다.</p>') + '</div>';
      return html;
    }
    var d = +tab;
    html += '<div class="grid2"><div class="card"><h2>' + d + '부 리그 순위</h2>' + tableHTML(L.table(d), d) +
      '<p class="muted">상위 4팀 플레이오프 진출 · ' + (d === 1 ? '하위 2팀 2부 강등 · 결승 진출 2팀 세계 대회 진출' : '상위 2팀 1부 승격') + '</p></div>' +
      '<div class="card"><h2>' + (st.week < C.WEEKS_REGULAR ? L.weekLabel() + ' 경기' : '플레이오프') + '</h2>';
    if (st.bracket[d] && st.bracket[d].top4) html += bracketHTML(st.bracket[d], 'semi', 'final');
    else if (st.phase === 'season') {
      var played = st.results.filter(function (r) { return r.season === st.season && r.week === st.week; });
      html += '<table>' + L.fixtures().filter(function (f) { return f.div === d; }).map(function (f) {
        var r = played.filter(function (x) { return x.a === f.a && x.b === f.b; })[0];
        return '<tr><td>' + teamName(f.a) + '</td><td class="num">' + (r ? r.score[0] + ' : ' + r.score[1] : 'vs') + '</td><td>' + teamName(f.b) + '</td></tr>';
      }).join('') + '</table>';
      // 지난주 결과
      var last = st.results.filter(function (r) { return r.season === st.season && r.week === st.week - 1 && r.div === d; });
      if (last.length) html += '<h3 style="margin-top:14px">지난주 결과</h3><table>' + last.map(function (r) {
        return '<tr><td class="' + (r.winner === r.a ? 'gold' : '') + '">' + teamName(r.a) + '</td><td class="num">' + r.score[0] + ' : ' + r.score[1] + '</td><td class="' + (r.winner === r.b ? 'gold' : '') + '">' + teamName(r.b) + '</td><td class="muted">' + (r.mvp ? 'MVP ' + esc(r.mvp.name) : '') + '</td></tr>';
      }).join('') + '</table>';
    }
    html += '</div></div>';
    return html;
  }
  function bracketHTML(br, sStage, fStage) {
    var st = G.state;
    var res = st.results.filter(function (r) { return r.season === st.season; });
    function m(a, b, stage) {
      var r = res.filter(function (x) { return x.stage === stage && ((x.a === a && x.b === b) || (x.a === b && x.b === a)); })[0];
      function line(id) { return '<div class="' + (r && r.winner === id ? 'w' : '') + '">' + (id ? teamName(id) : '?') + '</div>'; }
      return '<div class="m">' + line(a) + line(b) + (r ? '<div class="muted" style="font-size:11px">' + r.score[0] + ':' + r.score[1] + '</div>' : '') + '</div>';
    }
    var semis = sStage === 'semi' ? [[br.top4[0], br.top4[3]], [br.top4[1], br.top4[2]]] : [[br.teams[0], br.teams[3]], [br.teams[1], br.teams[2]]];
    var f = br.finalists || [];
    return '<div class="bracket"><div>' + m(semis[0][0], semis[0][1], sStage) + m(semis[1][0], semis[1][1], sStage) + '</div>' +
      '<div>' + m(f[0], f[1], fStage) + '</div><div>' + (br.champ ? '<div class="team-big gold">🏆 ' + teamName(br.champ) + '</div>' : '') + '</div></div>';
  }

  // ---------- 이적시장 ----------
  function vMarket() {
    var st = G.state, tab = UI.tab.market || 'fa', rf = UI.roleFilter;
    var html = '<div class="tabs"><button data-act="tab" data-k="market" data-v="fa" class="' + (tab === 'fa' ? 'on' : '') + '">자유계약 (' + st.freeAgents.length + ')</button>' +
      '<button data-act="tab" data-k="market" data-v="teams" class="' + (tab === 'teams' ? 'on' : '') + '">다른 팀 선수' + (L.canBuyFromTeams() ? '' : ' 🔒') + '</button>' +
      '<button data-act="tab" data-k="market" data-v="renew" class="' + (tab === 'renew' ? 'on' : '') + '">재계약 (' + st.pendingRenewals.length + ')</button>' +
      '<span class="spacer"></span><select data-chg="role-filter"><option value="all">전체 역할</option>' +
      G.ROLE_ORDER.map(function (r) { return '<option value="' + r + '"' + (rf === r ? ' selected' : '') + '>' + G.ROLES[r] + '</option>'; }).join('') + '</select></div>';
    var list;
    if (tab === 'fa') list = st.freeAgents.map(L.p);
    else if (tab === 'teams') list = Object.keys(st.teams).map(L.t).filter(function (t) { return !t.user && !t.foreign; })
      .reduce(function (a, t) { return a.concat(t.players.map(L.p)); }, []);
    else list = st.pendingRenewals.map(L.p);
    list = list.filter(function (p) { return p && (rf === 'all' || p.role === rf); })
      .sort(function (a, b) { return G.Player.value(b) - G.Player.value(a); }).slice(0, 60);
    html += '<div class="card">' + (tab === 'teams' && !L.canBuyFromTeams() ? '<p class="gold">다른 팀 선수 영입은 오프시즌에만 가능합니다. (목록 열람·스카우트는 가능)</p>' : '') +
      (tab === 'fa' ? '<p class="muted">스카우트하지 않은 선수는 능력치 일부와 잠재력이 "?"로 가려집니다.</p>' : '') +
      '<table><tr><th>닉네임</th><th>팀</th><th>역할</th><th class="num">나이</th>' + G.STAT_KEYS.map(function (k) { return '<th class="num">' + G.STAT_NAMES[k] + '</th>'; }).join('') +
      '<th class="num">잠재</th><th class="num">' + (tab === 'teams' ? '이적료' : '가치') + '</th><th class="num">희망 연봉</th><th></th></tr>' +
      list.map(function (p) {
        var known = L.isKnown(p.id), vis = L.visibleStats(p.id);
        return '<tr class="click" data-act="player" data-pid="' + p.id + '"><td><b>' + esc(p.nick) + '</b></td><td class="muted">' + (p.teamId ? teamName(p.teamId) : 'FA') + '</td><td>' + G.ROLES[p.role] + '</td><td class="num">' + p.age + '</td>' +
          G.STAT_KEYS.map(function (k) { return '<td class="num">' + sv(p.stats[k], known || vis.indexOf(k) >= 0) + '</td>'; }).join('') +
          '<td class="num">' + sv(p.potential, known) + '</td><td class="num">' + (tab === 'teams' ? L.transferFee(p) : G.Player.value(p)).toLocaleString() + '</td><td class="num">~' + L.demand(p) + '</td>' +
          '<td>' + (!known ? '<button class="small" data-act="scout" data-pid="' + p.id + '">🔍</button> ' : '') +
          '<button class="small primary" data-act="negotiate" data-pid="' + p.id + '"' + (tab === 'renew' ? ' data-mode="renew"' : '') + '>' + (tab === 'renew' ? '재계약' : '협상') + '</button></td></tr>';
      }).join('') + '</table>' + (list.length ? '' : '<p class="muted">해당하는 선수가 없습니다.</p>') + '</div>';
    return html;
  }
  function negotiateModal(pid, mode) {
    var p = L.p(pid), dem = L.demand(p);
    var fee = p.teamId && mode !== 'renew' ? L.transferFee(p) : 0;
    modal('<h2>' + (mode === 'renew' ? '재계약' : '영입') + ' 협상 — ' + esc(p.nick) + '</h2>' +
      '<p class="muted">' + G.ROLES[p.role] + ' · ' + p.age + '세 · 현재 연봉 ' + p.salary + '만원</p>' +
      (fee ? '<p>이적료: <b class="gold">' + money(fee) + '</b> (' + teamName(p.teamId) + ')</p>' : '') +
      '<p>에이전트가 알려준 희망 연봉은 <b>약 ' + dem + '만원</b>입니다. 너무 낮으면 거절당해요.</p>' +
      '<div class="row"><label>연봉(만원/시즌) <input type="number" id="off-sal" value="' + dem + '" step="10" min="50" style="width:110px"></label>' +
      '<label>계약 기간 <select id="off-yrs"><option value="1">1년</option><option value="2" selected>2년</option><option value="3">3년</option></select></label></div>' +
      '<p class="muted" id="off-msg"></p>' +
      '<div class="actions"><button data-act="close">취소</button><button class="primary" data-act="offer" data-pid="' + pid + '" data-mode="' + (mode || '') + '">제안하기</button></div>');
  }

  // ---------- 구단 ----------
  function vClub() {
    var st = G.state, u = L.user();
    var salary = u.players.reduce(function (s, id) { return s + L.p(id).salary; }, 0);
    var fac = [['train', '🏋️ 훈련장', '능력치·숙련도 성장 속도 +15%/Lv'], ['dorm', '🛏️ 숙소', '훈련 피로 누적 -8%/Lv']];
    return '<div class="grid2"><div class="card"><h2>💰 재정</h2><table>' +
      '<tr><td>보유 자금</td><td class="num"><b>' + money(st.money) + '</b></td></tr>' +
      '<tr><td>선수단 총 연봉</td><td class="num">' + money(salary) + ' / 시즌 (주당 ' + money(salary / C.SALARY_DIVISOR) + ')</td></tr>' +
      '<tr><td>주간 스폰서 수입</td><td class="num">' + money(C.SPONSOR_BASE + st.fans * C.SPONSOR_PER_FAN + (u.div === 1 ? 150 : 0)) + '</td></tr>' +
      '<tr><td>경기 승리 상금</td><td class="num">' + money(C.WIN_PRIZE[u.div]) + '</td></tr>' +
      '<tr><td>팬 수</td><td class="num">' + st.fans.toLocaleString() + ' (승리 +4%, 패배 -2%)</td></tr></table></div>' +
      '<div class="card"><h2>🏗️ 시설</h2><table>' + fac.map(function (f) {
        var lv = st.facility[f[0]];
        return '<tr><td>' + f[1] + ' <b>Lv.' + lv + '</b><div class="muted" style="font-size:12px">' + f[2] + '</div></td><td class="num">' +
          (lv >= C.FACILITY_MAX ? '<span class="muted">최고 레벨</span>' : '<button data-act="upgrade" data-k="' + f[0] + '">업그레이드 (' + money(L.upgradeCost(f[0])) + ')</button>') + '</td></tr>';
      }).join('') + '</table></div></div>' +
      '<div class="grid2" style="margin-top:14px"><div class="card"><h2>📜 역대 성적</h2><table><tr><th>시즌</th><th>리그</th><th class="num">순위</th><th class="num">전적</th><th>플레이오프</th><th>세계 대회</th><th>1부 우승팀</th></tr>' +
      (st.history.length ? st.history.slice().reverse().map(function (h) {
        return '<tr><td>S' + h.season + '</td><td>' + h.div + '부</td><td class="num">' + h.rank + '위</td><td class="num">' + h.w + '승 ' + h.l + '패</td><td class="' + (h.playoff === '우승' ? 'gold' : '') + '">' + h.playoff + '</td><td class="' + (h.worlds === '우승' ? 'gold' : '') + '">' + h.worlds + '</td><td class="muted">' + esc(h.champ1) + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="muted">아직 기록이 없습니다.</td></tr>') + '</table></div>' +
      '<div class="card"><h2>🗒️ 최근 경기</h2><table>' + (st.matchLog.length ? st.matchLog.slice(0, 15).map(function (m) {
        var tricks = m.plays && m.plays.length ? ' 🎭' + m.plays.filter(function (x) { return x.ok; }).length + '/' + m.plays.length : '';
        return '<tr><td>S' + m.season + ' ' + L.stageName(m.stage) + '</td><td>vs ' + teamName(m.opp) + '</td><td class="num ' + (m.win ? 'green' : 'red') + '">' + (m.win ? '승' : '패') + ' ' + m.score[0] + ':' + m.score[1] + '</td><td class="muted">' + (m.mvp ? 'MVP ' + esc(m.mvp.name) : '') + tricks + '</td></tr>';
      }).join('') : '<tr><td class="muted">아직 경기가 없습니다.</td></tr>') + '</table></div></div>';
  }

  // ---------- 영웅 ----------
  function vHeroes() {
    var st = G.state;
    var notes = st.patchNotes && st.patchNotes.length ? '<p>이번 시즌 패치: ' + st.patchNotes.map(function (n) {
      return '<span class="tag ' + n.type + '">' + G.HERO_BY_ID[n.id].emoji + ' ' + G.HERO_BY_ID[n.id].name + (n.type === 'buff' ? ' ▲' : ' ▼') + '</span>';
    }).join(' ') + '</p>' : '<p class="muted">첫 시즌은 패치가 없습니다. 시즌마다 승률이 높은 영웅은 너프, 낮은 영웅은 버프됩니다.</p>';
    return '<div class="card"><div class="row"><h2>🦸 영웅 도감 (' + G.HEROES.length + ')</h2><span class="spacer"></span><button data-act="tier">📊 티어리스트</button></div>' + notes +
      '<p class="muted">상성: 돌진형 ▶ 원거리형 ▶ 탱커형 ▶ 돌진형 (우위 시 피해 +' + Math.round(C.COUNTER_BONUS * 100) + '%)</p>' +
      '<table><tr><th>영웅</th><th>역할</th><th>유형</th><th class="num">체력</th><th class="num">공격</th><th class="num">사거리</th><th class="num">공속</th><th>스킬</th><th>궁극기</th><th>패치</th><th class="num">픽</th><th class="num">승률</th><th class="num">밴</th></tr>' +
      G.HEROES.map(function (h) {
        var s = G.Hero.stats(h.id, st.heroMods), hs = st.heroStats[h.id] || { picks: 0, wins: 0, bans: 0 };
        return '<tr><td>' + h.emoji + ' <b>' + esc(h.name) + '</b></td><td>' + G.ROLES[h.role] + '</td><td>' + G.ARCH[h.arch] + '</td>' +
          '<td class="num">' + s.hp + (h.armor ? ' <span class="muted">(방어 ' + Math.round(h.armor * 100) + '%)</span>' : '') + '</td><td class="num">' + Math.round(s.atk) + '</td><td class="num">' + h.range + '</td><td class="num">' + h.as + '</td>' +
          '<td style="white-space:normal;font-size:12px">' + skillText(h.skill) + '</td><td style="white-space:normal;font-size:12px">' + skillText(h.ult) + '</td>' +
          '<td>' + patchTag(h.id) + '</td><td class="num">' + hs.picks + '</td><td class="num">' + (hs.picks ? Math.round(hs.wins / hs.picks * 100) + '%' : '-') + '</td><td class="num">' + hs.bans + '</td></tr>';
      }).join('') + '</table></div>';
  }

  // ---------- 설정 ----------
  function vSettings() {
    return '<div class="grid2"><div class="card"><h2>💾 저장</h2><p class="muted">매주 진행할 때마다 브라우저에 자동 저장됩니다. 다른 PC로 옮기려면 파일로 내보내세요.</p>' +
      '<div class="row"><button data-act="save-now">지금 저장</button><button data-act="export">📤 JSON 내보내기</button>' +
      '<input type="file" id="import-file" accept=".json" style="display:none"><button data-act="import-click">📂 불러오기</button></div>' +
      '<p class="muted">시드: ' + G.state.seed + '</p>' +
      '<div class="row" style="margin-top:20px"><button class="danger" data-act="reset">새 게임 (현재 저장 삭제)</button></div></div>' +
      '<div class="card"><h2>🧪 밸런스 점검 (디버그)</h2><p class="muted">무작위 영웅·전술로 전투를 100판 자동 실행해 영웅별 승률과 전술별 승률·점수차 편차를 봅니다. 변칙적 전술은 평균 승률은 비슷하되 편차가 가장 커야 정상입니다.</p>' +
      '<button data-act="debug-sim">100판 돌리기</button><div id="debug-out" style="margin-top:12px"></div></div></div>' +
      '<div class="card"><h2>❓ 도움말</h2><button data-act="help">게임 방법 보기</button></div>';
  }

  function runDebugSim(n) {
    var rng = new G.RNG(Date.now() % 1e9);
    var heroW = {}, tac = {}, plays = { ok: 0, all: 0 };
    for (var i = 0; i < n; i++) {
      var ids = rng.shuffle(G.HEROES.map(function (h) { return h.id; }));
      var sides = [0, 1].map(function (s) {
        return { name: 'T' + s, color: '#888', tactic: rng.pick(G.STYLES), units: [0, 1, 2, 3, 4].map(function (k) {
          return { player: G.Player.generate(rng, 'd' + s + k, 11), heroId: ids[s * 5 + k] };
        }) };
      });
      var r = new G.Battle({ seed: rng.int(1, 1e9), sides: sides, heroMods: G.state.heroMods }).runToEnd().result();
      r.units.forEach(function (u) { var h = heroW[u.heroId] = heroW[u.heroId] || { p: 0, w: 0 }; h.p++; if (u.side === r.winner) h.w++; });
      [0, 1].forEach(function (s) {
        var t = r.startTactics[s], x = tac[t] = tac[t] || { p: 0, w: 0, d: [] };
        x.p++; if (s === r.winner) x.w++; x.d.push(r.score[s] - r.score[1 - s]);
      });
      r.plays.forEach(function (pl) { pl.forEach(function (x) { plays.all++; if (x.ok) plays.ok++; }); });
    }
    var hs = Object.keys(heroW).sort(function (a, b) { return heroW[b].w / heroW[b].p - heroW[a].w / heroW[a].p; });
    var out = '<h3>전술</h3><table><tr><th>전술</th><th class="num">경기</th><th class="num">승률</th><th class="num">점수차 편차</th></tr>' +
      G.STYLES.map(function (k) {
        var x = tac[k]; if (!x) return '';
        var m = x.d.reduce(function (a, b) { return a + b; }, 0) / x.d.length;
        var sd = Math.sqrt(x.d.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / x.d.length);
        return '<tr><td>' + C.TACTICS[k].name + '</td><td class="num">' + x.p + '</td><td class="num">' + Math.round(x.w / x.p * 100) + '%</td><td class="num">' + sd.toFixed(2) + '</td></tr>';
      }).join('') + '</table><p class="muted">변칙 플레이 성공률 ' + (plays.all ? Math.round(plays.ok / plays.all * 100) : 0) + '% (' + plays.all + '회)</p>' +
      '<h3>영웅 승률</h3><table>' + hs.map(function (id) {
        var w = heroW[id].w / heroW[id].p;
        return '<tr><td>' + heroTag(id) + '</td><td style="width:50%">' + bar(w * 100, w > 0.58 ? 'var(--red)' : w < 0.42 ? 'var(--blue)' : '') + '</td><td class="num">' + Math.round(w * 100) + '% (' + heroW[id].p + ')</td></tr>';
      }).join('') + '</table>';
    return out;
  }

  function helpModal() {
    modal('<h2>🎮 게임 방법</h2><ol style="line-height:1.8">' +
      '<li><b>목표</b>: 2부 리그에서 시작해 승격 → 1부 우승 → 세계 대회 우승!</li>' +
      '<li><b>한 주</b> = 경기 1번. 홈에서 <b>경기 준비</b>를 누르면 전술 설정 → 밴픽 → 자동 전투가 진행됩니다.</li>' +
      '<li><b>밴픽</b>: 양 팀 2밴 후 1-2-2-2-2-1 순서로 픽. 선수 슬롯을 고른 뒤 영웅을 누르세요. 숙련도가 높은 영웅일수록 강합니다.</li>' +
      '<li><b>상성</b>: 돌진형 ▶ 원거리형 ▶ 탱커형 ▶ 돌진형. 영웅 카드의 ▲/▼ 표시를 참고하세요.</li>' +
      '<li><b>전술</b>: 공격적 / 균형 / 수비적 / <b>변칙적</b>. 변칙적은 기습·분산 압박·페이크 후퇴를 시도하며, 같은 상대에게 연속으로 쓰면 간파당합니다. 하프타임에 한 번 바꿀 수 있어요.</li>' +
      '<li><b>점수</b>: 킬 1점, 중앙 수호자 처치 ' + C.OBJ_POINTS + '점. 90초 후 점수가 높은 팀 승리 (동점이면 서든데스).</li>' +
      '<li><b>훈련</b>: 선수별로 능력치·영웅 숙련·휴식을 정하세요. 피로 관리가 중요합니다.</li>' +
      '<li><b>오프시즌</b>: 시즌이 끝나면 나이·은퇴·계약 만료·패치·승강이 처리되고 이적시장이 열립니다.</li>' +
      '</ol><div class="actions"><button class="primary" data-act="close">시작하기</button></div>');
  }

  // ---------- 티어리스트 ----------
  function tierModal(idx) {
    var ps = L.patches();
    if (idx == null || idx < 0 || idx >= ps.length) idx = ps.length - 1;
    UI.tierIdx = idx;
    var pt = ps[idx], rows = G.Hero.tierList(pt);
    var tabs = ps.map(function (p, i) {
      return '<button class="small ' + (i === idx ? 'on' : '') + '" data-act="tier-patch" data-i="' + i + '">S' + p.season + ' 패치' + (p.current ? ' (현재)' : '') + '</button>';
    }).join('');
    var notes = pt.notes && pt.notes.length ? pt.notes.map(function (n) {
      return '<span class="tag ' + n.type + '">' + G.HERO_BY_ID[n.id].emoji + ' ' + G.HERO_BY_ID[n.id].name + (n.type === 'buff' ? ' ▲' : ' ▼') + '</span>';
    }).join(' ') : '<span class="muted">변경 없음 (기본 패치)</span>';
    var body = G.TIER.CUTS.map(function (c) {
      var t = c[0], list = rows.filter(function (r) { return r.tier === t; });
      return '<div class="tier-row"><div class="tier-lbl" style="background:' + G.TIER.COLORS[t] + '">' + t + '</div><div class="tier-heroes">' +
        list.map(function (r) {
          var h = G.HERO_BY_ID[r.id];
          var ch = r.change === 'buff' ? '<span class="green">▲</span>' : r.change === 'nerf' ? '<span class="red">▼</span>' : '';
          return '<div class="tier-chip" title="' + esc(skillText(h.skill) + ' / 궁: ' + skillText(h.ult)) + '"><span class="em">' + h.emoji + '</span><div>' +
            '<b>' + esc(h.name) + '</b> ' + ch + '<div class="muted">' + G.ROLES[h.role] + '</div>' +
            '<div class="tier-num">승 ' + (r.wr != null ? Math.round(r.wr * 100) + '%' : '-') + ' · 픽 ' + Math.round(r.pickRate * 100) + '% · 밴 ' + Math.round(r.banRate * 100) + '%</div></div></div>';
        }).join('') + (list.length ? '' : '<span class="muted">-</span>') + '</div></div>';
    }).join('');
    modal('<div class="row"><h2 style="margin:0">📊 영웅 티어리스트</h2><span class="spacer"></span><button data-act="close">닫기</button></div>' +
      '<div class="filters" style="margin-top:12px">' + tabs + '</div>' +
      '<p style="margin:6px 0">패치 노트: ' + notes + '</p>' +
      '<p class="muted" style="font-size:12px;margin-top:0">표본 ' + pt.matches + '경기 (리그 전체). 승률·픽률·밴률과 패치 변경을 반영한 점수로 등급을 매깁니다. ' +
      '경기 수가 적을 때는 시뮬레이션 기반 예상 승률의 비중이 커집니다. ▲▼는 직전 패치 대비 버프/너프.</p>' +
      '<div class="tier-list">' + body + '</div>', true);
  }

  // =====================================================
  // 경기 화면
  // =====================================================
  function startMatch(fx) {
    var st = G.state, u = L.user();
    var side = fx.a === u.id ? 0 : 1;
    var opp = side === 0 ? fx.b : fx.a;
    if (u.starters.length < 5) { toast('선발 선수 5명이 필요합니다.'); return; }
    UI.match = { fx: fx, side: side, opp: opp, stage: 'pre', tactic: st.userPlan.tactic || 'balanced', filter: 'all', speed: st.speed || 1 };
    render();
  }

  function vMatch() {
    var m = UI.match;
    if (m.stage === 'pre') return vPre();
    if (m.stage === 'draft') return vDraft();
    if (m.stage === 'battle') return vBattle();
    if (m.stage === 'result') return vResult();
    return '';
  }

  function vPre() {
    var m = UI.match, st = G.state, u = L.user(), ot = L.t(m.opp);
    var rc = G.Tactics.readCount(st.trickMemory, u.id, m.opp);
    var orders = st.userPlan.orders;
    var focusOpts = [['auto', '자동 (역할별)'], ['carry', '딜러 우선'], ['lowest', '체력 낮은 적'], ['nearest', '가장 가까운 적'], ['support', '서포터 우선']];
    var entryOpts = [['now', '즉시 진입'], ['together', '아군과 함께'], ['late', '늦게 (후속 진입)']];
    var oppPs = ot.starters.map(L.p);
    return '<div class="main" style="margin:0 auto"><div class="row"><h2>⚔️ 경기 준비 — ' + L.stageName(m.fx.stage) + '</h2><span class="spacer"></span><button data-act="back-home">← 홈으로</button></div>' +
      '<div class="grid2"><div class="card"><h3>상대: <span style="color:' + ot.color + '">' + esc(ot.name) + '</span></h3>' +
      '<p class="muted">전력 ' + L.strength(m.opp).toFixed(1) + ' (우리 ' + L.strength(u.id).toFixed(1) + ') · 주 전술 ' + C.TACTICS[ot.style].name + '</p>' +
      '<table><tr><th>선수</th><th>역할</th><th class="num">종합</th><th>주력 영웅</th></tr>' + oppPs.map(function (p) {
        var known = L.isKnown(p.id);
        return '<tr><td>' + esc(p.nick) + '</td><td>' + G.ROLES[p.role] + '</td><td class="num">' + (known ? ovr(p) : '?') + '</td><td>' + (known ? G.Player.bestHeroes(p, 3).map(function (b) { return G.HERO_BY_ID[b.id].emoji; }).join(' ') : '<span class="muted">스카우트 필요</span>') + '</td></tr>';
      }).join('') + '</table></div>' +
      '<div class="card"><h3>선수별 지시</h3><table><tr><th>선수</th><th>집중 대상</th><th>진입 타이밍</th></tr>' +
      u.starters.map(L.p).map(function (p) {
        var o = orders[p.id] || { focus: 'auto', entry: 'now' };
        return '<tr><td><b>' + esc(p.nick) + '</b> <span class="muted">' + G.ROLES[p.role] + '</span></td>' +
          '<td><select data-chg="order" data-pid="' + p.id + '" data-k="focus">' + focusOpts.map(function (x) { return '<option value="' + x[0] + '"' + (o.focus === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></td>' +
          '<td><select data-chg="order" data-pid="' + p.id + '" data-k="entry">' + entryOpts.map(function (x) { return '<option value="' + x[0] + '"' + (o.entry === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></td></tr>';
      }).join('') + '</table></div></div>' +
      '<div class="card"><h3>팀 전술</h3>' + tacticCards(m.tactic, rc) + '</div>' +
      '<div class="row" style="margin-top:14px;justify-content:flex-end"><button data-act="auto-match">⏩ 자동 진행 (결과만)</button><button class="primary" data-act="start-draft">밴픽 시작 ▶</button></div></div>';
  }

  function tacticCards(sel, rc) {
    return '<div class="tactics">' + G.STYLES.map(function (k) {
      var t = C.TACTICS[k];
      var warn = k === 'tricky' && rc > 0 ? '<div class="gold" style="font-size:12px;margin-top:6px">⚠️ 연속 ' + rc + '회 사용 — 간파 위험 (성공 판정 -' + rc * C.TRICK.readPenaltyPerUse + ')</div>' : '';
      return '<div class="tactic ' + (sel === k ? 'sel' : '') + '" data-act="tactic" data-t="' + k + '"><div class="nm">' + t.name + '</div><div class="ds">' + t.desc + '</div>' + warn + '</div>';
    }).join('') + '</div>';
  }

  // ---------- 밴픽 ----------
  function vDraft() {
    var m = UI.match, d = m.draft, cur = G.Draft.current(d);
    var mine = cur && cur.side === m.side;
    var taken = G.Draft.taken(d);
    var free = G.Draft.freePlayers(d, m.side);
    if (!m.selPlayer || !free.some(function (p) { return p.id === m.selPlayer; })) m.selPlayer = free[0] ? free[0].id : null;
    var selP = m.selPlayer ? L.p(m.selPlayer) : null;
    var enemyPicks = d.picks[1 - m.side].map(function (p) { return p.heroId; });
    var myPicks = d.picks[m.side].map(function (p) { return p.heroId; });
    var comp = G.Hero.compScore(myPicks, enemyPicks);
    var tiers = L.currentTiers();

    function sideCol(s) {
      var t = L.t(s === 0 ? m.fx.a : m.fx.b);
      var isMe = s === m.side;
      var picks = d.picks[s];
      var slots = isMe ? d.players[s].map(function (p) {
        var pk = picks.filter(function (x) { return x.playerId === p.id; })[0];
        var sel = !pk && m.selPlayer === p.id && mine && cur.type === 'pick';
        return '<div class="slot ' + (sel ? 'sel' : '') + '" ' + (!pk ? 'data-act="slot" data-pid="' + p.id + '" style="cursor:pointer"' : '') + '><span class="em">' + (pk ? G.HERO_BY_ID[pk.heroId].emoji : '·') + '</span><div><b>' + esc(p.nick) + '</b><div class="muted" style="font-size:11px">' + G.ROLES[p.role] + (pk ? ' · ' + G.HERO_BY_ID[pk.heroId].name + ' (' + Math.round(p.mastery[pk.heroId] || 0) + ')' : '') + '</div></div></div>';
      }).join('') : [0, 1, 2, 3, 4].map(function (i) {
        var pk = picks[i];
        return '<div class="slot"><span class="em">' + (pk ? G.HERO_BY_ID[pk.heroId].emoji : '·') + '</span><div>' + (pk ? '<b>' + esc(L.p(pk.playerId).nick) + '</b><div class="muted" style="font-size:11px">' + G.HERO_BY_ID[pk.heroId].name + '</div>' : '<span class="muted">대기</span>') + '</div></div>';
      }).join('');
      return '<div class="draft-side ' + (s === 0 ? 'blue' : 'red') + '"><h3>' + esc(t.name) + (isMe ? ' (우리)' : '') + '</h3>' +
        '<div class="bans">' + [0, 1].map(function (i) { var b = d.bans[s][i]; return '<div class="ban">' + (b ? G.HERO_BY_ID[b].emoji : '') + '</div>'; }).join('') + '</div>' + slots + '</div>';
    }

    var roles = [['all', '전체']].concat(G.ROLE_ORDER.map(function (r) { return [r, G.ROLES[r]]; }));
    var grid = G.HEROES.filter(function (h) { return m.filter === 'all' || h.role === m.filter; }).map(function (h) {
      var tk = taken[h.id];
      var ctr = '';
      if (enemyPicks.some(function (e) { return G.Hero.beats(h.id, e); })) ctr = '<span class="ctr green">▲</span>';
      else if (enemyPicks.some(function (e) { return G.Hero.beats(e, h.id); })) ctr = '<span class="ctr red">▼</span>';
      var mod = G.state.heroMods[h.id] || 1;
      var patch = mod > 1.001 ? '<span class="patch green">↑</span>' : mod < 0.999 ? '<span class="patch red">↓</span>' : '';
      var ms = selP ? Math.round(selP.mastery[h.id] || 0) : null;
      return '<div class="hero ' + (tk ? 'taken' : '') + '" ' + (!tk && mine ? 'data-act="hero" data-h="' + h.id + '"' : '') + ' title="' + esc(skillText(h.skill) + ' / 궁: ' + skillText(h.ult)) + '">' + ctr + patch +
        '<div class="em">' + h.emoji + '</div><div class="nm">' + esc(h.name) + '</div><div class="rl">' + G.ROLES[h.role] + ' · ' + G.ARCH[h.arch] + '</div>' +
        (ms != null && cur && cur.type === 'pick' ? '<div class="ms" style="color:' + (ms >= 60 ? 'var(--green)' : ms >= 30 ? 'var(--text)' : 'var(--muted)') + '">숙련 ' + ms + '</div>' : '') +
        '<span class="tier-badge" style="background:' + G.TIER.COLORS[tiers[h.id]] + '">' + tiers[h.id] + '</span></div>';
    }).join('');

    var turn = !cur ? '밴픽 완료!' : (mine ? (cur.type === 'ban' ? '🚫 우리 차례 — 밴할 영웅을 고르세요' : '✅ 우리 차례 — ' + (selP ? esc(selP.nick) + '에게 줄 ' : '') + '영웅을 고르세요') : '⏳ 상대가 ' + (cur.type === 'ban' ? '밴' : '픽') + ' 중...');
    return '<div class="main" style="margin:0 auto;max-width:1300px"><div class="row"><h2>🎯 밴픽</h2><span class="muted">전술: ' + C.TACTICS[m.tactic].name + '</span><span class="spacer"></span>' +
      '<span>조합 상성 <b class="' + (comp > 0 ? 'green' : comp < 0 ? 'red' : '') + '">' + (comp > 0 ? '+' : '') + comp + '</b></span>' +
      '<button data-act="tier">📊 티어리스트</button><button data-act="draft-auto">🤖 남은 밴픽 자동</button></div>' +
      '<div class="draft">' + sideCol(0) +
      '<div><div class="turn ' + (mine ? 'mine' : 'theirs') + '">' + turn + '</div><div class="filters">' +
      roles.map(function (r) { return '<button class="small ' + (m.filter === r[0] ? 'on' : '') + '" data-act="draft-filter" data-v="' + r[0] + '">' + r[1] + '</button>'; }).join('') +
      '</div><div class="hero-grid">' + grid + '</div>' +
      '<p class="muted" style="font-size:12px">▲ 상대 픽에 상성 우위 · ▼ 상성 열세 · ↑↓ 패치 버프/너프 · 오른쪽 아래 글자는 현재 패치 티어 · 숙련도는 선택한 선수 기준 · 카드에 마우스를 올리면 스킬 설명</p></div>' +
      sideCol(1) + '</div></div>';
  }

  function draftTick() {
    var m = UI.match;
    if (!m || m.stage !== 'draft') return;
    var d = m.draft;
    if (G.Draft.done(d)) { setTimeout(startBattle, 600); return; }
    var cur = G.Draft.current(d);
    if (cur.side !== m.side) {
      m.draftTimer = setTimeout(function () {
        if (!UI.match || UI.match.stage !== 'draft') return;
        G.Draft.aiAct(d, G.rng);
        render();
        draftTick();
      }, 450);
    }
  }

  // ---------- 전투 ----------
  function startBattle() {
    var m = UI.match;
    if (!m || m.stage !== 'draft') return;
    var oppTactic = L.aiTactic(m.opp, L.user().id);
    var tactics = m.side === 0 ? [m.tactic, oppTactic] : [oppTactic, m.tactic];
    var orders = [{}, {}];
    orders[m.side] = G.state.userPlan.orders;
    m.battle = L.makeBattle(m.fx, m.draft, tactics, orders, true);
    m.stage = 'battle';
    m.logLen = 0;
    render();
  }

  function vBattle() {
    var m = UI.match, b = m.battle;
    return '<div class="main" style="margin:0 auto;max-width:1300px">' +
      '<div class="scoreboard"><div class="l"><div class="team-big blue">' + esc(b.sides[0].name) + '</div><div class="muted" id="tac0"></div></div>' +
      '<div><div class="sc" id="sc">0 : 0</div><div class="tm" id="tm">0:00</div></div>' +
      '<div class="r"><div class="team-big red">' + esc(b.sides[1].name) + '</div><div class="muted" id="tac1"></div></div></div>' +
      '<div class="battle-wrap"><div><canvas id="arena" width="' + C.MAP_W + '" height="' + C.MAP_H + '"></canvas>' +
      '<div class="row" style="margin-top:10px">' + [1, 2, 4].map(function (s) { return '<button class="small ' + (m.speed === s ? 'primary' : '') + '" data-act="speed" data-s="' + s + '">' + s + 'x</button>'; }).join('') +
      '<button class="small" data-act="pause">⏸ 일시정지</button><span class="spacer"></span><button class="small" data-act="skip-battle">⏭ 결과로 건너뛰기</button></div>' +
      '<div class="units-mini" id="units"></div></div>' +
      '<div class="card" style="padding:10px"><h3>경기 로그</h3><div class="log" id="log"></div></div></div></div>';
  }

  function afterMatchRender() {
    var m = UI.match;
    if (m.stage === 'battle') {
      m.view = new G.BattleView(document.getElementById('arena'), m.battle);
      m.logLen = 0;
      updateHud();
      m.view.draw();
      if (!m.raf && !m.paused && !m.battle.halfPending) { m.last = performance.now(); m.acc = 0; m.raf = requestAnimationFrame(loop); }
      if (m.battle.halfPending) halftimeModal();
    }
  }

  function loop(ts) {
    var m = UI.match;
    if (!m || m.stage !== 'battle') return;
    m.raf = null;
    var b = m.battle;
    var dt = Math.min(0.1, (ts - m.last) / 1000);
    m.last = ts;
    if (!m.paused) {
      m.acc += dt * m.speed;
      while (m.acc >= C.TICK && !b.ended && !b.halfPending) { b.step(); m.acc -= C.TICK; }
    }
    m.view.draw();
    updateHud();
    if (b.halfPending) { halftimeModal(); return; }
    if (b.ended) { setTimeout(finishBattle, 1500); return; }
    m.raf = requestAnimationFrame(loop);
  }

  function updateHud() {
    var m = UI.match, b = m.battle;
    var el = document.getElementById('sc'); if (!el) return;
    el.textContent = b.score[0] + ' : ' + b.score[1];
    var t = Math.min(b.time, C.MATCH_TIME), mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    document.getElementById('tm').textContent = (b.overtime ? '연장 ' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss + (b.time < C.HALF_TIME ? ' · 전반' : ' · 후반');
    [0, 1].forEach(function (s) {
      var S = b.sides[s];
      var ok = S.plays.filter(function (p) { return p.ok; }).length;
      document.getElementById('tac' + s).textContent = '전술: ' + C.TACTICS[S.tactic].name + (S.plays.length ? ' · 🎭 ' + ok + '/' + S.plays.length : '') + (S.objBuff > 0 ? ' · 🐉 강화' : '');
    });
    var log = document.getElementById('log');
    if (b.events.length !== m.logLen) {
      for (var i = m.logLen; i < b.events.length; i++) {
        var e = b.events[i];
        var d = document.createElement('div');
        d.className = (e.side >= 0 ? 's' + e.side + ' ' : '') + e.cls;
        d.textContent = Math.floor(e.t) + 's ' + e.text;
        log.insertBefore(d, log.firstChild);
      }
      m.logLen = b.events.length;
    }
    var um = document.getElementById('units');
    um.innerHTML = [0, 1].map(function (s) {
      return '<div>' + b.units.filter(function (u) { return u.side === s; }).map(function (u) {
        return '<div class="um ' + (u.alive ? '' : 'dead') + '"><span class="em">' + u.hero.emoji + '</span><span style="width:70px;overflow:hidden">' + esc(u.name) + '</span>' +
          '<span style="flex:1">' + bar(u.alive ? u.hp / u.maxhp * 100 : 0, s === 0 ? 'var(--blue)' : 'var(--red)') + '</span><span class="muted">' + u.st.k + '/' + u.st.d + '/' + u.st.a + '</span>' +
          (u.alive ? '' : '<span class="muted">' + Math.ceil(u.respawnT) + 's</span>') + '</div>';
      }).join('') + '</div>';
    }).join('');
  }

  function halftimeModal() {
    var m = UI.match, b = m.battle;
    var my = b.score[m.side], their = b.score[1 - m.side];
    var rc = b.sides[m.side].readCount;
    m.halfSel = b.sides[m.side].tactic;
    modal('<h2>⏸️ 하프타임 — ' + b.score[0] + ' : ' + b.score[1] + '</h2><p class="muted">' + (my > their ? '앞서고 있습니다.' : my < their ? '뒤지고 있습니다.' : '동점입니다.') + ' 후반 전술을 한 번 바꿀 수 있습니다. 상대도 전술을 바꿀 수 있어요.</p>' +
      '<div id="half-tactics">' + tacticCards(m.halfSel, rc).replace(/data-act="tactic"/g, 'data-act="half-tactic"') + '</div>' +
      '<div class="actions"><button class="primary" data-act="half-go">후반 시작 ▶</button></div>', true);
  }

  function resumeHalf() {
    var m = UI.match, b = m.battle;
    var oppSide = 1 - m.side;
    var oppT = G.Tactics.halftimeAI(b.sides[oppSide].tactic, b.score[oppSide] - b.score[m.side], G.rng);
    var t = [null, null]; t[m.side] = m.halfSel; t[oppSide] = oppT;
    b.resumeHalf(t[0], t[1]);
    closeModal();
    if (!m.raf) { m.last = performance.now(); m.acc = 0; m.raf = requestAnimationFrame(loop); }
  }

  function skipBattle() {
    var m = UI.match, b = m.battle;
    if (m.raf) cancelAnimationFrame(m.raf); m.raf = null;
    closeModal();
    b.render = false;
    b.runToEnd(function (bt) {
      var t = [null, null], o = 1 - m.side;
      t[o] = G.Tactics.halftimeAI(bt.sides[o].tactic, bt.score[o] - bt.score[m.side], G.rng);
      return t;
    });
    finishBattle();
  }

  function finishBattle() {
    var m = UI.match;
    if (!m || m.stage !== 'battle') return;
    m.result = m.battle.result();
    L.applyResult(m.fx, m.result, m.draft);
    m.stage = 'result';
    save();
    render();
  }

  function vResult() {
    var m = UI.match, r = m.result, b = m.battle;
    var win = r.winner === m.side;
    function teamTable(s) {
      return '<table><tr><th>선수</th><th>영웅</th><th class="num">K</th><th class="num">D</th><th class="num">A</th><th class="num">피해</th><th class="num">받은 피해</th><th class="num">회복</th></tr>' +
        r.units.filter(function (u) { return u.side === s; }).map(function (u) {
          var mvp = r.mvp && r.mvp.playerId === u.playerId;
          return '<tr><td>' + (mvp ? '⭐ ' : '') + '<b>' + esc(u.name) + '</b></td><td>' + heroTag(u.heroId) + '</td><td class="num">' + u.k + '</td><td class="num">' + u.d + '</td><td class="num">' + u.a + '</td>' +
            '<td class="num">' + u.dmg.toLocaleString() + '</td><td class="num">' + u.taken.toLocaleString() + '</td><td class="num">' + u.heal.toLocaleString() + '</td></tr>';
        }).join('') + '</table>';
    }
    function tricks(s) {
      var p = r.plays[s];
      if (!p.length) return '<span class="muted">변칙 플레이 없음</span>';
      var names = { ambush: '기습', split: '분산 압박', fake: '페이크 후퇴' };
      var ok = p.filter(function (x) { return x.ok; }).length;
      return '🎭 전술 성공 <b class="green">' + ok + '</b> / 실패 <b class="red">' + (p.length - ok) + '</b> — ' + p.map(function (x) { return names[x.type] + (x.ok ? '✅' : '❌'); }).join(' ');
    }
    return '<div class="main" style="margin:0 auto;max-width:1100px"><div class="card" style="text-align:center">' +
      '<div style="font-size:40px;font-weight:900" class="' + (win ? 'gold' : 'red') + '">' + (win ? '🏆 승리!' : '패배') + '</div>' +
      '<div class="sc" style="font-size:30px;font-weight:900">' + esc(b.sides[0].name) + ' <span class="blue">' + r.score[0] + '</span> : <span class="red">' + r.score[1] + '</span> ' + esc(b.sides[1].name) + '</div>' +
      '<p class="muted">' + L.stageName(m.fx.stage) + ' · 경기 시간 ' + Math.floor(r.time) + '초 · 수호자 ' + r.obj[0] + ' : ' + r.obj[1] + (r.mvp ? ' · MVP ⭐ ' + esc(r.mvp.name) + ' (' + G.HERO_BY_ID[r.mvp.heroId].name + ')' : '') + '</p></div>' +
      [0, 1].map(function (s) {
        return '<div class="card"><h3 class="' + (s === 0 ? 'blue' : 'red') + '">' + esc(b.sides[s].name) + ' — 전술 ' + C.TACTICS[r.startTactics[s]].name + (r.tactics[s] !== r.startTactics[s] ? ' → ' + C.TACTICS[r.tactics[s]].name : '') + '</h3>' + teamTable(s) + '<p style="margin-bottom:0">' + tricks(s) + '</p></div>';
      }).join('') +
      '<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="primary" data-act="finish-match">계속 ▶</button></div></div>';
  }

  function endMatchAndAdvance() {
    var m = UI.match;
    if (m && m.raf) cancelAnimationFrame(m.raf);
    if (m && m.draftTimer) clearTimeout(m.draftTimer);
    UI.match = null;
    var prevPhase = G.state.phase;
    L.advanceWeek();
    save();
    UI.view = 'home';
    render();
    if (G.state.phase === 'offseason' && prevPhase !== 'offseason') toast('📅 시즌이 끝났습니다! 이적시장이 열렸어요.', 4000);
  }

  // =====================================================
  // 이벤트
  // =====================================================
  var A = {
    'nav': function (el) { UI.view = el.dataset.v; render(); },
    'tab': function (el) { UI.tab[el.dataset.k] = el.dataset.v === 'w' ? 'w' : (isNaN(+el.dataset.v) ? el.dataset.v : +el.dataset.v); render(); },
    'close': closeModal,
    'modal-bg': function (el, e) { if (e.target === el && !(UI.match && UI.match.battle && UI.match.battle.halfPending)) closeModal(); },
    'new-game': function () {
      var name = (document.getElementById('ng-name').value || '신생 게이밍').trim();
      var seed = parseInt(document.getElementById('ng-seed').value, 10) || null;
      L.newGame(name, seed);
      save();
      UI.view = 'home';
      render();
      helpModal();
    },
    'continue': function () { if (G.Save.load()) { render(); toast('불러왔습니다.'); } else toast('저장 파일을 읽지 못했습니다.'); },
    'import-click': function () { document.getElementById('import-file').click(); },
    'save-now': function () { save(); toast('💾 저장했습니다.'); },
    'export': function () { G.Save.exportJSON(); },
    'reset': function () {
      modal('<h2>새 게임</h2><p>현재 저장이 삭제됩니다. 계속할까요? (먼저 JSON으로 내보내 두면 나중에 불러올 수 있어요)</p><div class="actions"><button data-act="close">취소</button><button class="danger" data-act="reset-yes">삭제하고 새로 시작</button></div>');
    },
    'reset-yes': function () { G.Save.clear(); G.state = null; closeModal(); render(); },
    'help': helpModal,
    'debug-sim': function (el) {
      el.disabled = true; el.textContent = '계산 중...';
      setTimeout(function () {
        document.getElementById('debug-out').innerHTML = runDebugSim(100);
        el.disabled = false; el.textContent = '100판 돌리기';
      }, 30);
    },
    // 홈
    'advance': function () { endMatchAndAdvance(); },
    'new-season': function () { L.newSeason(); save(); render(); toast('🚀 새 시즌 개막!'); },
    'prep': function () { var fx = L.userFixture(); if (fx) startMatch(fx); },
    'auto-match': function () {
      var fx = L.userFixture(); if (!fx) return;
      if (L.user().starters.length < 5) { toast('선발 선수 5명이 필요합니다.'); return; }
      var rec = L.simFixture(fx);
      var uid = L.user().id, win = rec.winner === uid;
      var sc = fx.a === uid ? rec.score : [rec.score[1], rec.score[0]];
      UI.match = null;
      L.advanceWeek(); save(); UI.view = 'home'; render();
      toast((win ? '🏆 승리 ' : '패배 ') + sc[0] + ' : ' + sc[1] + ' vs ' + teamName(fx.a === uid ? fx.b : fx.a), 3500);
    },
    // 선수단
    'starter': function (el, e) {
      e.stopPropagation();
      var u = L.user(), pid = el.dataset.pid, i = u.starters.indexOf(pid);
      if (i >= 0) u.starters.splice(i, 1);
      else { if (u.starters.length >= 5) { toast('선발은 5명까지입니다. 먼저 한 명을 후보로 내리세요.'); return; } u.starters.push(pid); }
      save(); render();
    },
    'auto-starters': function () { L.autoStarters(L.user()); save(); render(); },
    'player': function (el) { playerModal(el.dataset.pid); },
    'all-rest': function () { L.user().players.forEach(function (id) { L.p(id).train = 'rest'; }); save(); render(); },
    'all-train': function () {
      var mp = { tank: 'def', fighter: 'atk', mage: 'atk', marksman: 'phys', support: 'team' };
      L.user().players.forEach(function (id) { var p = L.p(id); p.train = mp[p.role]; }); save(); render();
    },
    // 이적시장
    'scout': function (el, e) {
      e.stopPropagation();
      var err = L.scout(el.dataset.pid);
      toast(err || '🔍 스카우트 완료: ' + esc(L.p(el.dataset.pid).nick));
      save(); render();
      if (modalRoot.innerHTML && !err) playerModal(el.dataset.pid);
    },
    'negotiate': function (el, e) { e.stopPropagation(); negotiateModal(el.dataset.pid, el.dataset.mode); },
    'offer': function (el) {
      var pid = el.dataset.pid, sal = Math.max(50, parseInt(document.getElementById('off-sal').value, 10) || 0), yrs = +document.getElementById('off-yrs').value;
      var r = el.dataset.mode === 'renew' ? L.renew(pid, sal, yrs) : L.sign(pid, sal, yrs);
      if (r.ok) { closeModal(); toast('✍️ ' + esc(r.msg)); save(); render(); }
      else document.getElementById('off-msg').innerHTML = '<span class="red">' + esc(r.msg) + '</span>';
    },
    'release': function (el) {
      var p = L.p(el.dataset.pid);
      modal('<h2>방출</h2><p>' + esc(p.nick) + ' 선수를 방출할까요? 위약금 ' + money(L.releaseCost(p)) + '이 듭니다.</p><div class="actions"><button data-act="close">취소</button><button class="danger" data-act="release-yes" data-pid="' + p.id + '">방출</button></div>');
    },
    'release-yes': function (el) { var err = L.release(el.dataset.pid); closeModal(); toast(err || '방출했습니다.'); save(); render(); },
    'sell': function (el) {
      var pid = el.dataset.pid, p = L.p(pid), off = L.sellOffer(pid);
      if (!off) { toast('관심을 보이는 팀이 없습니다.'); return; }
      UI.pendingSell = { pid: pid, offer: off };
      modal('<h2>판매 제안</h2><p><b>' + teamName(off.teamId) + '</b>이(가) ' + esc(p.nick) + ' 선수에게 이적료 <b class="gold">' + money(off.fee) + '</b>을 제안했습니다. (선수 가치 ' + money(G.Player.value(p)) + ')</p>' +
        '<div class="actions"><button data-act="close">거절</button><button class="primary" data-act="sell-yes">수락</button></div>');
    },
    'sell-yes': function () { var s = UI.pendingSell; var err = L.sell(s.pid, s.offer); closeModal(); toast(err || '💸 판매 완료'); save(); render(); },
    'upgrade': function (el) { var err = L.upgrade(el.dataset.k); toast(err || '🏗️ 업그레이드 완료'); save(); render(); },
    // 경기
    'back-home': function () { UI.match = null; render(); },
    'tactic': function (el) { UI.match.tactic = el.dataset.t; G.state.userPlan.tactic = el.dataset.t; render(); },
    'start-draft': function () {
      var m = UI.match;
      m.draft = G.Draft.create([L.sidePlayers(m.fx.a), L.sidePlayers(m.fx.b)], G.state.heroMods);
      m.stage = 'draft';
      render(); draftTick();
    },
    'tier': function () { tierModal(); },
    'tier-patch': function (el) { tierModal(+el.dataset.i); },
    'draft-filter': function (el) { UI.match.filter = el.dataset.v; render(); },
    'slot': function (el) { UI.match.selPlayer = el.dataset.pid; render(); },
    'hero': function (el) {
      var m = UI.match, d = m.draft, cur = G.Draft.current(d);
      if (!cur || cur.side !== m.side) return;
      if (cur.type === 'ban') G.Draft.ban(d, el.dataset.h);
      else G.Draft.pick(d, el.dataset.h, m.selPlayer);
      render(); draftTick();
    },
    'draft-auto': function () {
      var m = UI.match;
      if (m.draftTimer) clearTimeout(m.draftTimer);
      G.Draft.autoAll(m.draft, G.rng);
      render(); draftTick();
    },
    'speed': function (el) { UI.match.speed = +el.dataset.s; G.state.speed = UI.match.speed; UI.match.paused = false; render(); },
    'pause': function (el) {
      var m = UI.match; m.paused = !m.paused;
      el.textContent = m.paused ? '▶ 재개' : '⏸ 일시정지';
    },
    'skip-battle': skipBattle,
    'half-tactic': function (el) {
      UI.match.halfSel = el.dataset.t;
      document.querySelectorAll('#half-tactics .tactic').forEach(function (x) { x.classList.toggle('sel', x.dataset.t === el.dataset.t); });
    },
    'half-go': resumeHalf,
    'finish-match': endMatchAndAdvance
  };

  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var f = A[el.dataset.act];
    if (f) f(el, e);
  }
  app.addEventListener('click', onClick);
  modalRoot.addEventListener('click', onClick);

  var CHG = {
    'train': function (el) { var p = L.p(el.dataset.pid); p.train = el.value; save(); render(); },
    'train-hero': function (el) { L.p(el.dataset.pid).trainHero = el.value; save(); },
    'role-filter': function (el) { UI.roleFilter = el.value; render(); },
    'order': function (el) {
      var o = G.state.userPlan.orders[el.dataset.pid] = G.state.userPlan.orders[el.dataset.pid] || { focus: 'auto', entry: 'now' };
      o[el.dataset.k] = el.value;
    }
  };
  app.addEventListener('change', function (e) {
    if (e.target.id === 'import-file' && e.target.files[0]) {
      G.Save.importFile(e.target.files[0], function (ok) {
        if (ok) { save(); UI.match = null; UI.view = 'home'; render(); toast('📂 불러왔습니다.'); }
        else toast('올바른 저장 파일이 아닙니다.');
      });
      return;
    }
    var el = e.target.closest('[data-chg]');
    if (el && CHG[el.dataset.chg]) CHG[el.dataset.chg](el, e);
  });

  // 시작
  if (G.Save.has() && G.Save.load()) { /* 자동으로 이어하기 */ }
  render();
})();
