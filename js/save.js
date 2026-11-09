// =====================================================
// save.js — localStorage 자동 저장 + JSON 내보내기/불러오기
// =====================================================
G.Save = {
  KEY: 'esports-manager-save-v1',
  save: function () {
    if (!G.state) return;
    G.state.rngS = G.rng.s;
    try { localStorage.setItem(G.Save.KEY, JSON.stringify(G.state)); return true; }
    catch (e) { console.warn('저장 실패', e); return false; }
  },
  has: function () {
    try { return !!localStorage.getItem(G.Save.KEY); } catch (e) { return false; }
  },
  load: function () {
    try {
      var raw = localStorage.getItem(G.Save.KEY);
      if (!raw) return false;
      return G.Save.apply(JSON.parse(raw));
    } catch (e) { console.warn('불러오기 실패', e); return false; }
  },
  apply: function (st) {
    if (!st || !st.teams || !st.players) return false;
    G.state = st;
    G.rng = new G.RNG(st.rngS || st.seed || 1);
    G.Player._usedNicks = {};
    Object.keys(st.players).forEach(function (id) { G.Player._usedNicks[st.players[id].nick] = 1; });
    return true;
  },
  clear: function () { try { localStorage.removeItem(G.Save.KEY); } catch (e) { } },
  exportJSON: function () {
    G.state.rngS = G.rng.s;
    var blob = new Blob([JSON.stringify(G.state)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var u = G.state.teams[G.state.userTeamId];
    a.download = 'save_' + u.name.replace(/\s+/g, '_') + '_S' + G.state.season + '.json';
    document.body.appendChild(a); a.click(); a.remove();
  },
  importFile: function (file, done) {
    var r = new FileReader();
    r.onload = function () {
      try { done(G.Save.apply(JSON.parse(r.result))); } catch (e) { done(false); }
    };
    r.readAsText(file);
  }
};
