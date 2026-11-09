// 브라우저 없이 전투 엔진을 돌려보는 테스트
//   node tools/sim-test.js [판수] [시드]                      → 영웅·전술 승률, 경기 통계
//   node tools/sim-test.js 120 42 balanced:defensive ...     → 전술 맞대결 승률
var fs = require('fs'), path = require('path'), vm = require('vm');
var ctx = { console: console, Math: Math, Date: Date }; ctx.globalThis = ctx; vm.createContext(ctx);
['data', 'hero', 'player', 'tactics', 'battle', 'sim'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
});
var G = ctx.G, N = +process.argv[2] || 200, rng = new G.RNG(+process.argv[3] || 42);
G.simRandom = function (n, tactics) { return G.Sim.random(n, { rng: rng, tactics: tactics }); };
module.exports = G;
if (require.main === module && process.argv[4]) {
  process.argv.slice(4).forEach(function (pr) {
    var t = pr.split(':'), o = G.simRandom(N, t), a = o.tac[t[0]];
    console.log(t[0] + ' vs ' + t[1] + ': ' + Math.round(a.w / a.p * 100) + '%');
  });
} else if (require.main === module) {
  var o = G.simRandom(N);
  console.log('평균 킬', (o.kills / N).toFixed(1), '포탑', (o.towers / N).toFixed(1), '드래곤', (o.drag / N).toFixed(1), '바론', (o.baron / N).toFixed(2),
    '넥서스 파괴', Math.round(o.nexus / N * 100) + '%', '평균 시간', (o.time / N).toFixed(0) + 's');
  Object.keys(o.heroW).sort(function (a, b) { return o.heroW[b].w / o.heroW[b].p - o.heroW[a].w / o.heroW[a].p; }).forEach(function (k) {
    console.log(G.HERO_BY_ID[k].name.padEnd(6), (o.heroW[k].w / o.heroW[k].p * 100).toFixed(0) + '%', o.heroW[k].p);
  });
  Object.keys(o.tac).forEach(function (k) {
    console.log(k, '승률', (o.tac[k].w / o.tac[k].p * 100).toFixed(0) + '%', '점수차 편차', G.Sim.sd(o.tac[k].diffs).toFixed(2));
  });
  console.log('변칙 성공률', JSON.stringify(o.plays));
}
