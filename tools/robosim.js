// Robot battle rules (from n416/microtools robot/game.js) + CPU personalities. Does reading the personality pay off?
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const MAKERS = ['ジオ', 'ツイ', 'アナ'], PARTS = ['head', 'upper', 'lower'];
const NOISE = +(process.argv[2] || .2);
function deck() { const d = { head: [], upper: [], lower: [] }; for (const p of PARTS) for (const m of MAKERS) for (const v of [3, 3, 2, 2, 1, 1]) d[p].push({ m, v }); for (const p of PARTS) shuffle(d[p]); return d; }
const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
function stats(h, u, l, pilot) { const b = h.m === u.m && u.m === l.m ? 1 : 0; return { s: h.v + b + (pilot === 'head'), a: u.v + b + (pilot === 'upper'), d: l.v + b + (pilot === 'lower') }; }
const total = r => r.s + r.a + r.d;
function designs(hand, pilot) {
  const out = [];
  for (const ph of PERMS) for (const pu of PERMS) for (const pl of PERMS) for (let pi = 0; pi < 3; pi++)
    out.push([0, 1, 2].map(k => stats(hand.head[ph[k]], hand.upper[pu[k]], hand.lower[pl[k]], k === pi ? pilot : null)));
  return out;
}
const DESIGN = {
  // player in the sim: biggest total, then most balanced
  player: ds => best(ds, rs => rs.reduce((a, r) => a + total(r), 0) * 10 + Math.min(...rs.map(total))),
  bold: ds => best(ds, rs => Math.max(...rs.map(total)) * 10 + rs.reduce((a, r) => a + total(r), 0)),
  careful: ds => best(ds, rs => Math.min(...rs.map(total)) * 10 + rs.reduce((a, r) => a + total(r), 0)),
  tricky: ds => best(ds, rs => { const t = rs.map(total).sort((a, b) => b - a); return (t[0] + t[1]) * 10 - t[2]; }),
};
function best(ds, f) { let b = null, bv = -1e9; for (const d of ds) { const v = f(d) + Math.random() * .01; if (v > bv) { bv = v; b = d; } } return b; }
function fight(p, c) {
  if (p.s > c.s) return p.a > c.d ? 1 : c.a > p.d ? -1 : 0;
  if (c.s > p.s) return c.a > p.d ? -1 : p.a > c.d ? 1 : 0;
  const ph = p.a > c.d, ch = c.a > p.d; return ph && !ch ? 1 : ch && !ph ? -1 : 0;
}
// personality = which strength rank it sends each round (0 = strongest)
const PATTERN = { bold: [0, 1, 2], careful: [2, 1, 0], tricky: [2, 0, 1] };
function cpuPolicy(pers, robots, used, round) {
  const avail = [0, 1, 2].filter(i => !used.includes(i));
  const rank = [0, 1, 2].sort((a, b) => total(robots[b]) - total(robots[a]));
  const want = rank[PATTERN[pers][round]];
  const probs = {}; avail.forEach(i => probs[i] = NOISE / avail.length);
  const target = avail.includes(want) ? want : avail.sort((a, b) => rank.indexOf(a) - rank.indexOf(b))[0];
  probs[target] += 1 - NOISE;
  return probs;
}
function sample(probs) { let r = Math.random(); for (const [k, p] of Object.entries(probs)) { r -= p; if (r <= 0) return +k; } return +Object.keys(probs)[0]; }
// expected wins-minus-losses from here, player choosing optimally against a belief over personalities
function bestMove(me, cpu, uMe, uCpu, round, belief) {
  if (round === 3) return { v: 0 };
  let bestV = -1e9, bestI = null;
  for (const i of [0, 1, 2].filter(i => !uMe.includes(i))) {
    let v = 0;
    for (const [pers, w] of Object.entries(belief)) {
      if (!w) continue;
      const pr = cpuPolicy(pers, cpu, uCpu, round);
      for (const [c, p] of Object.entries(pr)) {
        if (!p) continue;
        const nb = update(belief, cpu, uCpu, round, +c);
        v += w * p * (fight(me[i], cpu[+c]) + bestMove(me, cpu, [...uMe, i], [...uCpu, +c], round + 1, nb).v);
      }
    }
    if (v > bestV) { bestV = v; bestI = i; }
  }
  return { v: bestV, i: bestI };
}
function update(belief, cpu, uCpu, round, c) {
  const nb = {}; let s = 0;
  for (const [pers, w] of Object.entries(belief)) { nb[pers] = w * cpuPolicy(pers, cpu, uCpu, round)[c]; s += nb[pers]; }
  for (const k in nb) nb[k] = s ? nb[k] / s : 1 / 3;
  return nb;
}
function game(pers, mode, belief) {
  const d = deck(), pilots = shuffle(['head', 'head', 'upper', 'upper', 'lower', 'lower']);
  const hand = () => ({ head: d.head.splice(0, 3), upper: d.upper.splice(0, 3), lower: d.lower.splice(0, 3) });
  const me = DESIGN.player(designs(hand(), pilots[0])), cpu = DESIGN[pers](designs(hand(), pilots[1]));
  const uMe = [], uCpu = []; let score = 0;
  for (let round = 0; round < 3; round++) {
    let i;
    if (mode === 'random') i = shuffle([0, 1, 2].filter(k => !uMe.includes(k)))[0];
    else if (mode === 'strongestFirst') i = [0, 1, 2].filter(k => !uMe.includes(k)).sort((a, b) => total(me[b]) - total(me[a]))[0];
    else i = bestMove(me, cpu, uMe, uCpu, round, mode === 'oracle' ? { [pers]: 1 } : belief).i;
    const c = sample(cpuPolicy(pers, cpu, uCpu, round));
    if (mode === 'learn') belief = update(belief, cpu, uCpu, round, c);
    score += fight(me[i], cpu[c]); uMe.push(i); uCpu.push(c);
  }
  return { r: score > 0 ? 1 : score === 0 ? .5 : 0, belief };
}
const N = +(process.argv[3] || 3000);
console.log(`noise ${NOISE} (CPU follows its personality ${(1 - NOISE) * 100}% of the time)`);
for (const mode of ['random', 'strongestFirst', 'nobelief', 'learn', 'oracle']) {
  let w = 0, w3 = 0;
  for (let i = 0; i < N; i++) {
    const pers = ['bold', 'careful', 'tricky'][i % 3];
    if (mode === 'learn') { // 3-game series vs the same CPU, belief carries over
      let b = { bold: 1 / 3, careful: 1 / 3, tricky: 1 / 3 };
      for (let g = 0; g < 3; g++) { const o = game(pers, 'learn', b); b = o.belief; if (g === 0) w += o.r; if (g === 2) w3 += o.r; }
    } else w += game(pers, mode === 'nobelief' ? 'belief' : mode, { bold: 1 / 3, careful: 1 / 3, tricky: 1 / 3 }).r;
  }
  console.log(`${mode.padEnd(15)} game1 ${(w / N * 100).toFixed(1)}%` + (mode === 'learn' ? `  game3 ${(w3 / N * 100).toFixed(1)}%` : ''));
}
