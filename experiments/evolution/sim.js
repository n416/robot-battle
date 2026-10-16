// Standalone copy of the game rules in evolution-cards.html, for AI-vs-AI balance checks.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[Math.random() * a.length | 0];
const TR = {
  fur: { g: 'cold', v: [3, 2, 0, -1, -2] }, fat: { g: 'cold', v: [2, 1, 0, 0, -1] }, hiber: { g: 'cold', v: [2, 1, -1, 0, 0] },
  sweat: { g: 'hot', v: [-2, -1, 0, 2, 3] }, thin: { g: 'hot', v: [-2, -1, 0, 1, 1] }, noct: { g: 'hot', v: [-1, 0, 0, 1, 2] },
  burrow: { g: 'mid', v: [1, 0, 0, 0, 1] }, calm: { g: 'mid', v: [-1, 0, 2, 0, -1] }, big: { g: 'mid', v: [-2, 1, 1, 1, -2] }, omni: { g: 'mid', v: [0, 1, 1, 1, 0] },
};
const CFG = Object.assign({ ROUNDS: 6, SLOTS: 3, FIGHT: 1, FOOD_MAX: 3, REGROW: 1, MODE: 'adapt', MOVE: 1 }, JSON.parse(process.argv[2] || '{}'));
const MULT = F => ({ '-4': .25, '-3': .4, '-2': .6, '-1': .8, '0': 1, '1': 1.3, '2': 1.7, '3': 2.2, '4': 2.8, '5': 3.5, '6': 4.5 })[clamp(F, -4, 6)];
const lm = v => Math.log(MULT(v));
let S;
const tempOf = l => clamp(l + S.offset, 0, 4);
const body = (tr, l) => tr.reduce((s, id) => s + TR[id].v[tempOf(l)], 0);
const reach = pos => { const r = []; for (let l = pos - CFG.MOVE; l <= pos + CFG.MOVE; l++) if (l >= 0 && l < 5) r.push(l); return r; };
const applyTrait = (t0, add, rep) => { const t = t0.slice(); if (!add) return t; if (rep) t[t.indexOf(rep)] = add; else t.push(add); return t; };
function landScore(myTr, otherTr, l, F, together) {
  const b = body(myTr, l);
  if (!together) return b + F[l];
  const o = body(otherTr, l);
  if (CFG.MODE === 'split') return b + Math.floor(F[l] / 2) - CFG.FIGHT;
  if (CFG.MODE === 'none') return b - CFG.FIGHT;
  return b > o ? b + F[l] : b - CFG.FIGHT;
}
function offer(p) { return ['cold', 'hot', 'mid'].map(g => { const c = Object.keys(TR).filter(k => TR[k].g === g && !p.traits.includes(k)); return c.length ? pick(c) : null; }).filter(Boolean); }
function traitOpts(p) {
  const o = [{ add: null, rep: null }];
  for (const id of p.hand) { if (p.traits.length < CFG.SLOTS) o.push({ add: id, rep: null }); else for (const r of p.traits) o.push({ add: id, rep: r }); }
  return o;
}
function options(p) { const o = []; for (const t of traitOpts(p)) for (const d of reach(p.pos)) o.push({ t, d, tr: applyTrait(p.traits, t.add, t.rep) }); return o; }

const STRATS = {
  ai(me, op) {
    const F = S.food;
    const opDs = reach(op.pos);
    let pw = opDs.map(d => Math.exp(1.4 * lm(body(op.traits, d) + F[d])));
    const sw = pw.reduce((a, b) => a + b, 0); pw = pw.map(w => w / sw);
    const opts = options(me).map(o => {
      let v = 0;
      opDs.forEach((pd, i) => { const tg = pd === o.d; v += pw[i] * (lm(landScore(o.tr, op.traits, o.d, F, tg)) - .5 * lm(landScore(op.traits, o.tr, pd, F, tg))); });
      return { ...o, v };
    });
    const mx = Math.max(...opts.map(o => o.v)), ws = opts.map(o => Math.exp((o.v - mx) / .15)), tot = ws.reduce((a, b) => a + b, 0);
    let r = Math.random() * tot; for (let i = 0; i < opts.length; i++) { r -= ws[i]; if (r <= 0) return opts[i]; } return opts[opts.length - 1];
  },
  greedy(me) { let best = null; for (const o of options(me)) { const v = body(o.tr, o.d) + S.food[o.d]; if (!best || v > best.v) best = { ...o, v }; } return best; },
  stay(me) { let best = null; for (const o of options(me)) { if (o.d !== me.pos) continue; const v = body(o.tr, o.d) + S.food[o.d]; if (!best || v > best.v) best = { ...o, v }; } return best; },
  passive(me) { return { t: { add: null, rep: null }, d: me.pos, tr: me.traits.slice() }; },
  random(me) { return pick(options(me)); },
};

function game(sa, sb, stats) {
  S = { offset: 0, climate: {}, food: [0, 0, 0, 0, 0].map(() => 1 + (Math.random() * 3 | 0)) };
  S.food[1] = 2; S.food[3] = 2;
  let off = 0; for (const r of [3, 5]) { const d = off <= -1 ? 1 : off >= 1 ? -1 : pick([-1, 1]); off += d; S.climate[r] = d; }
  const P = [{ pop: 100, traits: [], pos: 1 }, { pop: 100, traits: [], pos: 3 }];
  for (let round = 1; round <= CFG.ROUNDS; round++) {
    if (S.climate[round]) S.offset += S.climate[round];
    P.forEach(p => p.hand = offer(p));
    // no-brainer check for player 0: is one option a best response to every rival option?
    if (stats) {
      const mine = options(P[0]), theirs = options(P[1]);
      const best = theirs.map(t => { let bv = -1e9, set = new Set(); mine.forEach((m, i) => { const v = landScore(m.tr, t.tr, m.d, S.food, m.d === t.d); if (v > bv) { bv = v; set = new Set([i]); } else if (v === bv) set.add(i); }); return set; });
      const common = [...best[0]].filter(i => best.every(s => s.has(i)));
      stats.turns++; if (common.length) stats.nobrainer++;
      const dests = new Set(common.map(i => mine[i].d)); if (common.length && dests.size === 1) stats.nobrainerDest++;
    }
    const ca = STRATS[sa](P[0], P[1]), cb = STRATS[sb](P[1], P[0]);
    const clash = ca.d === cb.d;
    const va = landScore(ca.tr, cb.tr, ca.d, S.food, clash), vb = landScore(cb.tr, ca.tr, cb.d, S.food, clash);
    if (stats) { if (clash) stats.clash++; if (ca.d !== P[0].pos) stats.moves++; if (ca.t.add) stats.evolve++; }
    P[0].traits = ca.tr; P[1].traits = cb.tr; P[0].pos = ca.d; P[1].pos = cb.d;
    P[0].pop = Math.round(P[0].pop * MULT(va)); P[1].pop = Math.round(P[1].pop * MULT(vb));
    if (P[0].pop < 10) P[0].pop = 0; if (P[1].pop < 10) P[1].pop = 0;
    S.food = S.food.map((f, l) => { const k = (ca.d === l) + (cb.d === l); return k ? Math.max(0, f - k) : Math.min(CFG.FOOD_MAX, f + CFG.REGROW); });
    if (!P[0].pop || !P[1].pop) break;
  }
  return P[0].pop > P[1].pop ? 1 : P[0].pop === P[1].pop ? .5 : 0;
}

const N = +(process.argv[3] || 3000);
console.log('config', JSON.stringify(CFG));
const st = { turns: 0, nobrainer: 0, nobrainerDest: 0, clash: 0, moves: 0, evolve: 0 };
let w = 0; for (let i = 0; i < N; i++) w += game('ai', 'ai', st);
console.log(`ai vs ai: P0 wins ${(w / N * 100).toFixed(1)}%  | 迷う余地なし(全ての相手の手に対して同じ最善手) ${(st.nobrainer / st.turns * 100).toFixed(1)}% of turns, 移動先が一択 ${(st.nobrainerDest / st.turns * 100).toFixed(1)}% | 衝突 ${(st.clash / st.turns * 100).toFixed(1)}% | 移動 ${(st.moves / st.turns * 100).toFixed(1)}% | 進化 ${(st.evolve / st.turns * 100).toFixed(1)}%`);
for (const s of ['greedy', 'stay', 'passive', 'random']) {
  let a = 0; for (let i = 0; i < N; i++) a += game(s, 'ai');
  console.log(`${s.padEnd(8)} vs ai: wins ${(a / N * 100).toFixed(1)}%`);
}
