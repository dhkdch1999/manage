// 여러 시즌 자동 진행 테스트: node tools/season-test.js [시즌 수]
var fs = require('fs'), path = require('path'), vm = require('vm');
var ctx = { console: console, Math: Math, Date: Date }; ctx.globalThis = ctx; vm.createContext(ctx);
['data', 'hero', 'player', 'tactics', 'battle', 'draft', 'league', 'save'].forEach(function (f) {
  var p = path.join(__dirname, '..', 'js', f + '.js');
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f + '.js' });
});
var G = ctx.G, L = G.League, N = +process.argv[2] || 3;
L.newGame('테스트팀', 1234);
for (var s = 0; s < N; s++) {
  var guard = 0;
  while (G.state.phase !== 'offseason' && guard++ < 40) L.advanceWeek();
  var h = G.state.history[G.state.history.length - 1];
  console.log('시즌', h.season, h.div + '부', h.rank + '위', h.w + '승' + h.l + '패', 'PO', h.playoff, '| 1부 우승', h.champ1, '| 세계', h.worldChamp, '| 자금', G.state.money);
  var err = L.canStartSeason(); if (err) console.log('!!', err);
  G.state.pendingRenewals.slice().forEach(function (id) { var p = L.p(id); L.renew(id, L.demand(p) + 50, 2); });
  L.newSeason();
}
var json = JSON.stringify(G.state); console.log('저장 크기', (json.length / 1024).toFixed(0) + 'KB', '선수 수', Object.keys(G.state.players).length);
console.log(G.state.news.slice(0, 6).map(function (n) { return n.text; }).join('\n'));
