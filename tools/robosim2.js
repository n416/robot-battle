// CPU that also reads the player's habit (rank sent per round), on top of its personality.
const src = require('fs').readFileSync(require('path').join(__dirname, 'robosim.js'), 'utf8').split('const N =')[0];
eval(src.replace(/^const /gm, 'var '));
function adaptiveChoice(pers, cpu, me, uMe, uCpu, round, habit, nObs) {
  const avail = [0, 1, 2].filter(i => !uCpu.includes(i));
  if (Math.random() < .15) return avail[Math.random() * avail.length | 0];
  const alpha = Math.min(.8, .2 * nObs);
  if (Math.random() < alpha) {
    // look ahead: sample how the player will send the rest (from their habit), find the CPU order that does best
    const myRk = [0, 1, 2].sort((a, b) => total(me[b]) - total(me[a]));
    const samplePlayer = () => { const used = uMe.slice(), seq = []; for (let r = round; r < 3; r++) { const av = [0, 1, 2].filter(i => !used.includes(i)); const w = av.map(i => habit[r][myRk.indexOf(i)] * 2 + .5); let x = Math.random() * w.reduce((a, b) => a + b, 0), k = 0; while ((x -= w[k]) > 0) k++; seq.push(av[k]); used.push(av[k]); } return seq; };
    const seqs = Array.from({ length: 24 }, samplePlayer);
    const perms = (arr) => arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms(arr.filter((_, j) => j !== i)).map(p => [x, ...p]));
    let best = null, bv = -1e9;
    for (const p of perms(avail)) { let v = 0; for (const sq of seqs) sq.forEach((i, r) => v -= fight(me[i], cpu[p[r]])); v += Math.random() * .01; if (v > bv) { bv = v; best = p[0]; } }
    return best;
  }
  const pr = cpuPolicy(pers, cpu, uCpu, round); // personality (already includes its own noise; fine for a sim)
  return sample(pr);
}
function series(mode) {
  const pers = ['bold', 'careful', 'tricky'][Math.random() * 3 | 0];
  const habit = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; let nObs = 0; const res = [];
  let belief = { bold: 1 / 3, careful: 1 / 3, tricky: 1 / 3 };
  for (let g = 0; g < 3; g++) {
    const d = deck(), pilots = shuffle(['head', 'head', 'upper', 'upper', 'lower', 'lower']);
    const hand = () => ({ head: d.head.splice(0, 3), upper: d.upper.splice(0, 3), lower: d.lower.splice(0, 3) });
    const me = DESIGN.player(designs(hand(), pilots[0])), cpu = DESIGN[pers](designs(hand(), pilots[1]));
    const uMe = [], uCpu = []; let score = 0;
    const myRk = [0, 1, 2].sort((a, b) => total(me[b]) - total(me[a]));
    for (let round = 0; round < 3; round++) {
      const avail = [0, 1, 2].filter(k => !uMe.includes(k));
      let i;
      if (mode === 'random') i = avail[Math.random() * avail.length | 0];
      else if (mode === 'habit') i = avail.sort((a, b) => myRk.indexOf(a) - myRk.indexOf(b))[0];
      else i = bestMove(me, cpu, uMe, uCpu, round, belief).i;
      const c = adaptiveChoice(pers, cpu, me, uMe, uCpu, round, habit, nObs);
      if (mode === 'learn') belief = update(belief, cpu, uCpu, round, c);
      habit[round][myRk.indexOf(i)]++; nObs++;
      score += fight(me[i], cpu[c]); uMe.push(i); uCpu.push(c);
    }
    res.push(score > 0 ? 1 : score === 0 ? .5 : 0);
  }
  return res;
}
const N = 1500;
for (const mode of ['random', 'habit', 'learn']) {
  const t = [0, 0, 0]; for (let i = 0; i < N; i++) series(mode).forEach((r, g) => t[g] += r);
  console.log(mode.padEnd(7), t.map(x => (x / N * 100).toFixed(1) + '%').join('  →  '));
}
