// Hex area-control prototype rules, AI-vs-AI balance check.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[Math.random() * a.length | 0];
const CFG = Object.assign({ R: 2, ROUNDS: 8, SLOTS: 3, TARGETS: 2, CLIMATE: [3, 6], START: 'mid', DEF_TIE: true }, JSON.parse(process.argv[2] || '{}'));
const N = +(process.argv[3] || 600);
const TR = {
  fur: { g: 'cold', v: [3, 2, 0, -1, -2] }, fat: { g: 'cold', v: [2, 1, 0, 0, -1] }, hiber: { g: 'cold', v: [2, 1, -1, 0, 0] },
  sweat: { g: 'hot', v: [-2, -1, 0, 2, 3] }, thin: { g: 'hot', v: [-2, -1, 0, 1, 1] }, noct: { g: 'hot', v: [-1, 0, 0, 1, 2] },
  burrow: { g: 'mid', v: [1, 0, 0, 0, 1] }, calm: { g: 'mid', v: [-1, 0, 2, 0, -1] }, big: { g: 'mid', v: [-2, 1, 1, 1, -2] }, omni: { g: 'mid', v: [0, 1, 1, 1, 0] },
};
// map
const cells = [];
for (let q = -CFG.R; q <= CFG.R; q++) for (let r = -CFG.R; r <= CFG.R; r++) if (Math.abs(q + r) <= CFG.R) cells.push({ q, r });
const idx = new Map(cells.map((c, i) => [c.q + ',' + c.r, i]));
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const NB = cells.map(c => DIRS.map(([dq, dr]) => idx.get((c.q + dq) + ',' + (c.r + dr))).filter(i => i !== undefined));
// temperature band by row: r = -R (north, cold) .. +R (south, hot), mapped onto 0..4
const baseT = cells.map(c => Math.round((c.r + CFG.R) / (2 * CFG.R) * 4));
let S;
const temp = i => clamp(baseT[i] + S.offset, 0, 4);
const score = (tr, i) => tr.reduce((s, id) => s + TR[id].v[temp(i)], 0);
const applyTrait = (t0, add, rep) => { const t = t0.slice(); if (!add) return t; if (rep) t[t.indexOf(rep)] = add; else t.push(add); return t; };
function offer(tr) { return ['cold', 'hot', 'mid'].map(g => { const c = Object.keys(TR).filter(k => TR[k].g === g && !tr.includes(k)); return c.length ? pick(c) : null; }).filter(Boolean); }
function frontier(owner, p) { const f = new Set(); owner.forEach((o, i) => { if (o === p) NB[i].forEach(j => { if (owner[j] !== p) f.add(j); }); }); return [...f]; }
const count = (owner, p) => owner.reduce((s, o) => s + (o === p), 0);

function resolve(owner, trs, mv) {
  const no = owner.slice();
  const tgt = [new Set(mv[0].targets), new Set(mv[1].targets)];
  const all = new Set([...tgt[0], ...tgt[1]]);
  let contested = false;
  for (const c of all) {
    const a = tgt[0].has(c), b = tgt[1].has(c), sa = score(trs[0], c), sb = score(trs[1], c), o = owner[c];
    if (o === -1) {
      if (a && b) { contested = true; if (sa > sb && sa >= 0) no[c] = 0; else if (sb > sa && sb >= 0) no[c] = 1; }
      else if (a) { if (sa >= 0) no[c] = 0; } else if (b) { if (sb >= 0) no[c] = 1; }
    } else if (o === 1 && a) { contested = true; if (sa >= 0 && (CFG.DEF_TIE ? sa > sb : sa >= sb)) no[c] = 0; }
    else if (o === 0 && b) { contested = true; if (sb >= 0 && (CFG.DEF_TIE ? sb > sa : sb >= sa)) no[c] = 1; }
  }
  // colonies that cannot live on their cell any more die out
  no.forEach((o, i) => { if (o !== -1 && score(trs[o], i) < 0) no[i] = -1; });
  return { no, contested };
}

function moves(owner, p, tr, hand, opts = {}) {
  const tops = [{ add: null, rep: null }];
  for (const id of hand) { if (tr.length < CFG.SLOTS) tops.push({ add: id, rep: null }); else for (const r of tr) tops.push({ add: id, rep: r }); }
  const fr = frontier(owner, p);
  const out = [];
  for (const t of tops) {
    const ntr = applyTrait(tr, t.add, t.rep);
    // keep the 6 frontier cells this body likes most, then all pairs among them
    const cand = fr.slice().sort((a, b) => score(ntr, b) - score(ntr, a)).slice(0, 6);
    const k = Math.min(CFG.TARGETS, cand.length);
    const combos = [];
    if (k === 0) combos.push([]);
    else if (k === 1) cand.forEach(c => combos.push([c]));
    else for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) combos.push([cand[i], cand[j]]);
    for (const targets of combos) out.push({ t, tr: ntr, targets });
  }
  return opts.noEvolve ? out.filter(m => !m.t.add) : out;
}
const net = (owner, p) => count(owner, p) - count(owner, 1 - p);
function evalVs(owner, p, my, op) { const trs = p === 0 ? [my.tr, op.tr] : [op.tr, my.tr]; const mv = p === 0 ? [my, op] : [op, my]; return net(resolve(owner, trs, mv).no, p); }
const idle = tr => ({ t: { add: null, rep: null }, tr, targets: [] });
function soft(arr, val, temp) { const mx = Math.max(...arr.map(val)); const ws = arr.map(x => Math.exp((val(x) - mx) / temp)); const tot = ws.reduce((a, b) => a + b, 0); let r = Math.random() * tot; for (let i = 0; i < arr.length; i++) { r -= ws[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1]; }

const STRATS = {
  greedy(owner, p, me, op) { const ms = moves(owner, p, me.tr, me.hand); return soft(ms, m => evalVs(owner, p, m, idle(op.tr)), .05); },
  passive(owner, p, me, op) { const ms = moves(owner, p, me.tr, me.hand, { noEvolve: true }); return soft(ms, m => evalVs(owner, p, m, idle(op.tr)), .05); },
  random(owner, p, me) { return pick(moves(owner, p, me.tr, me.hand)); },
  ai(owner, p, me, op) {
    const opMs = moves(owner, 1 - p, op.tr, offer(op.tr));
    const samples = Array.from({ length: 10 }, () => soft(opMs, m => evalVs(owner, 1 - p, m, idle(me.tr)), .5));
    const ms = moves(owner, p, me.tr, me.hand);
    return soft(ms, m => samples.reduce((s, o) => s + evalVs(owner, p, m, o), 0) / samples.length, .15);
  },
};

function game(sa, sb, st) {
  S = { offset: 0 };
  const climate = {}; let off = 0;
  for (const r of CFG.CLIMATE) { const d = off <= -1 ? 1 : off >= 1 ? -1 : pick([-1, 1]); off += d; climate[r] = d; }
  let owner = cells.map(() => -1);
  const midRow = cells.map((c, i) => i).filter(i => cells[i].r === 0);
  if (CFG.START === 'three') { for (const k of ['-2,0', '-1,0', '-2,1']) owner[idx.get(k)] = 0; for (const k of ['2,0', '1,0', '2,-1']) owner[idx.get(k)] = 1; }
  else { owner[idx.get(-CFG.R + ',0')] = 0; owner[idx.get(CFG.R + ',0')] = 1; }
  const P = [{ tr: [] }, { tr: [] }];
  for (let round = 1; round <= CFG.ROUNDS; round++) {
    if (climate[round]) { S.offset += climate[round]; owner = owner.map((o, i) => o !== -1 && score(P[o].tr, i) < 0 ? -1 : o); }
    if (!count(owner, 0) || !count(owner, 1)) break;
    P.forEach(p => p.hand = offer(p.tr));
    if (st && st.deep) {
      const mine = moves(owner, 0, P[0].tr, P[0].hand), theirs = moves(owner, 1, P[1].tr, P[1].hand);
      const sampleT = theirs.length > 25 ? Array.from({ length: 25 }, () => pick(theirs)) : theirs;
      const sets = sampleT.map(o => { let bv = -1e9, s = new Set(); mine.forEach((m, i) => { const v = evalVs(owner, 0, m, o); if (v > bv) { bv = v; s = new Set([i]); } else if (v === bv) s.add(i); }); return s; });
      const common = [...sets[0]].filter(i => sets.every(s => s.has(i)));
      st.turns++; if (common.length) st.nobrainer++; st.byR[round] = st.byR[round] || [0, 0]; st.byR[round][0]++; if (common.length) st.byR[round][1]++;
      // how much the best choice depends on the rival: spread between best and worst best-response values
    }
    const ma = STRATS[sa](owner, 0, P[0], P[1]), mb = STRATS[sb](owner, 1, P[1], P[0]);
    P[0].tr = ma.tr; P[1].tr = mb.tr;
    const res = resolve(owner, [P[0].tr, P[1].tr], [ma, mb]);
    if (st) { st.rounds++; if (res.contested) st.contested++; if (ma.t.add) st.evolve++; }
    owner = res.no;
    if (!count(owner, 0) || !count(owner, 1)) break;
  }
  const a = count(owner, 0), b = count(owner, 1);
  if (st) { st.cells += a + b; st.games++; }
  return a > b ? 1 : a === b ? .5 : 0;
}

console.log('config', JSON.stringify(CFG), 'cells', cells.length);
const st = { turns: 0, nobrainer: 0, rounds: 0, contested: 0, evolve: 0, cells: 0, games: 0, deep: true, byR: {}, draws: 0 };
let w = 0; const ND = Math.min(N, 200);
for (let i = 0; i < ND; i++) w += game('ai', 'ai', st);
console.log('迷う余地なし(世代別): ' + Object.entries(st.byR).map(([r, [t, n]]) => `${r}:${(n / t * 100).toFixed(0)}%`).join(' '));
console.log(`ai vs ai: P0 ${(w / ND * 100).toFixed(1)}% | 迷う余地なし ${(st.nobrainer / st.turns * 100).toFixed(1)}% | 争いが起きた世代 ${(st.contested / st.rounds * 100).toFixed(1)}% | 進化した世代 ${(st.evolve / st.rounds * 100).toFixed(1)}% | 終了時の占有マス ${(st.cells / st.games).toFixed(1)}/${cells.length}`);
for (const s of ['greedy', 'passive', 'random']) {
  let a = 0; for (let i = 0; i < N; i++) a += game(s, 'ai');
  console.log(`${s.padEnd(8)} vs ai: ${(a / N * 100).toFixed(1)}%`);
}
