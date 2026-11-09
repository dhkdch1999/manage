// 브라우저 없이 전투 엔진을 돌려보는 테스트: node tools/sim-test.js [판수]
var fs = require('fs'), path = require('path'), vm = require('vm');
var ctx = { console: console, Math: Math, Date: Date, globalThis: null };
ctx.globalThis = ctx; vm.createContext(ctx);
['data', 'hero', 'player', 'tactics', 'battle', 'draft', 'league'].forEach(function (f) {
  var p = path.join(__dirname, '..', 'js', f + '.js');
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f + '.js' });
});
var G = ctx.G, N = +process.argv[2] || 200, rng = new G.RNG(42);
var playS = {}, heroW = {}, tac = {}, totalK = 0, ot = 0;
for (var i = 0; i < N; i++) {
  var ids = rng.shuffle(G.HEROES.map(function (h) { return h.id; }));
  var sides = [0, 1].map(function (s) {
    var t = rng.pick(G.STYLES);
    return { name: 'T' + s, color: s ? '#ff6b6b' : '#4dabf7', tactic: t, units: [0, 1, 2, 3, 4].map(function (k) {
      return { player: G.Player.generate(rng, 'p' + s + k, 11), heroId: ids[s * 5 + k] };
    }) };
  });
  var b = new G.Battle({ seed: rng.int(1, 1e9), sides: sides }).runToEnd();
  var r = b.result();
  totalK += r.score[0] + r.score[1]; if (r.time > 90.3) ot++;
  r.units.forEach(function (u) { var h = heroW[u.heroId] = heroW[u.heroId] || { p: 0, w: 0 }; h.p++; if (u.side === r.winner) h.w++; });
  r.plays.forEach(function (pl) { pl.forEach(function (x) { var k = x.type; playS[k] = playS[k] || [0, 0]; playS[k][1]++; if (x.ok) playS[k][0]++; }); });
  [0, 1].forEach(function (s) { var t = r.startTactics[s]; var x = tac[t] = tac[t] || { p: 0, w: 0, diffs: [] }; x.p++; if (s === r.winner) x.w++; x.diffs.push(r.score[s] - r.score[1 - s]); });
}
console.log('평균 총점', (totalK / N).toFixed(1), '연장', ot);
Object.keys(heroW).sort(function (a, b) { return heroW[b].w / heroW[b].p - heroW[a].w / heroW[a].p; }).forEach(function (k) {
  console.log(G.HERO_BY_ID[k].name.padEnd(6), (heroW[k].w / heroW[k].p * 100).toFixed(0) + '%', heroW[k].p);
});
Object.keys(tac).forEach(function (k) {
  var d = tac[k].diffs, m = d.reduce(function (a, b) { return a + b; }, 0) / d.length;
  var sd = Math.sqrt(d.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / d.length);
  console.log(k, '승률', (tac[k].w / tac[k].p * 100).toFixed(0) + '%', '점수차 편차', sd.toFixed(2));
});
console.log('변칙 성공률', JSON.stringify(playS));
