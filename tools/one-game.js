// 한 경기 타임라인 출력: node tools/one-game.js [시드]
var fs = require('fs'), path = require('path'), vm = require('vm');
var ctx = { console: console, Math: Math, Date: Date }; ctx.globalThis = ctx; vm.createContext(ctx);
['data', 'hero', 'player', 'tactics', 'battle'].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx); });
var G = ctx.G, seed = +process.argv[2] || 7, rng = new G.RNG(seed), used = {};
function comp() { return G.POS_ORDER.map(function (p) { var c = G.HEROES.filter(function (h) { return h.pos.indexOf(p) >= 0 && !used[h.id]; }); var h = rng.pick(c); used[h.id] = 1; return h.id; }); }
var sides = [0, 1].map(function (s) { var c = comp(); return { name: 'T' + s, color: '#888', tactic: process.argv[3] || 'balanced', units: G.POS_ORDER.map(function (p, k) { return { player: G.Player.generate(rng, 'p' + s + k, 11, { role: p }), heroId: c[k], pos: p }; }) }; });
var b = new G.Battle({ seed: seed, sides: sides }), next = 20;
while (!b.ended) {
  if (b.halfPending) b.resumeHalf(); b.step();
  if (b.time >= next) {
    next += 20;
    console.log('t=' + b.time.toFixed(0), 'K', b.score.join(':'), 'T', b.sides.map(function (s) { return s.towers; }).join(':'),
      '|', Object.keys(b.lanes).map(function (k) { return k + ' ' + b.lanes[k].f.toFixed(2) + (b.lanes[k].atTower ? '*' + b.lanes[k].atTower.side : ''); }).join(' '),
      '|', b.units.map(function (u) { return u.pos.slice(0, 2) + u.side + ':' + (u.alive ? (u.mode || (u.task && u.task.type) || '-') + (u.combatT > 0 ? '!' : '') : 'X'); }).join(' '));
  }
}
console.log(b.events.filter(function (e) { return /포탑 파괴|📣|처치!|넥서스|승리/.test(e.text); }).map(function (e) { return e.t.toFixed(0) + ' ' + e.text; }).join('\n'));
