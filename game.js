(() => {
const $ = id => document.getElementById(id);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.random() * a.length | 0];
const sleep = ms => new Promise(r => setTimeout(r, FX.reduce ? Math.min(ms, 80) : ms));
const MAKERS = ['ジオ', 'ツイ', 'アナ'], PARTS = ['head', 'upper', 'lower'];
const PNAME = { head: '頭', upper: '上半身', lower: '下半身' }, SNAME = { head: '索敵', upper: '攻撃', lower: '防御' };
const GAMES = 3;
const PERSONAS = {
  bold:    { n: '強気',  d: '一番強いロボットを最初に出したがる。設計も1体に強いカードを集める。', pattern: [0, 1, 2] },
  careful: { n: '慎重',  d: '一番強いロボットを最後まで温存する。設計は3体をそろえて組む。', pattern: [2, 1, 0] },
  tricky:  { n: '策士',  d: '最初に一番弱いロボットを捨て駒にして、2戦目に一番強いロボットを出す。', pattern: [2, 0, 1] },
};
const RANKN = ['最強', '中堅', '最弱'];
const PILOTS = { カイ: 'faces/face05.webp', ミナ: 'faces/face02.webp', ゴウ: 'faces/face03.webp', リン: 'faces/face11.webp', ソウ: 'faces/face09.webp', ユズ: 'faces/face07.webp' };
const MY_FACE = 'faces/face01.webp';
const MY_SCHEMES = ['tricolor', 'azure', 'blaze'], RV_SCHEMES = ['crimson', 'shadow', 'venom'];
const MODEL_KEY = { ジオ: 'geo', ツイ: 'tsui', アナ: 'ana' };
const modelOf = c => MODEL_KEY[c.m] + c.v;
// some lower-body cards are hover legs (ex-online's hover models): the same numbers, legs that float on jets
const HOVER = { geo3: 'geo3h', tsui3: 'tsui3h', tsui2: 'tsui2h', ana1: 'ana1h' };
const partModel = c => (c.part === 'lower' && HOVER[modelOf(c)]) || modelOf(c);
const modelsOf = r => ({ head: r.head && modelOf(r.head), upper: r.upper && modelOf(r.upper), lower: r.lower && partModel(r.lower) });
const weaponOf = r => ROBO && r.upper ? ROBO.WEAPON_NAME[ROBO.WEAPON_OF[modelOf(r.upper)]] : '';

// ---------- rules (as in n416/microtools robot/game.js) ----------
function deck() { const d = { head: [], upper: [], lower: [] }; let n = 0; for (const p of PARTS) for (const m of MAKERS) for (const v of [3, 3, 2, 2, 1, 1]) d[p].push({ id: 'c' + n++, part: p, m, v }); for (const p of PARTS) shuffle(d[p]); return d; }
function stats(r, pilot) {
  if (!r.head || !r.upper || !r.lower) return null;
  const b = r.head.m === r.upper.m && r.upper.m === r.lower.m ? 1 : 0;
  return { s: r.head.v + b + (pilot === 'head'), a: r.upper.v + b + (pilot === 'upper'), d: r.lower.v + b + (pilot === 'lower'), set: !!b };
}
const total = s => s.s + s.a + s.d;
// who shoots first and whether each shot gets through
function fight(p, c) {
  const steps = [];
  if (p.s !== c.s) {
    const f = p.s > c.s ? 'me' : 'cpu', [A, D] = f === 'me' ? [p, c] : [c, p];
    const hit = A.a > D.d; steps.push({ by: f, hit });
    if (!hit) steps.push({ by: f === 'me' ? 'cpu' : 'me', hit: D.a > A.d });
    const last = steps[steps.length - 1];
    return { r: last.hit ? (last.by === 'me' ? 1 : -1) : 0, first: f, steps };
  }
  const hitMe = p.a > c.d, hitCpu = c.a > p.d;
  return { r: hitMe && !hitCpu ? 1 : hitCpu && !hitMe ? -1 : 0, first: 'both', steps: [{ by: 'both', hitMe, hitCpu }] };
}

// ---------- CPU ----------
const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
function allDesigns(hand, pilot) {
  const out = [];
  for (const ph of PERMS) for (const pu of PERMS) for (const pl of PERMS) for (let pi = 0; pi < 3; pi++) {
    const robots = [0, 1, 2].map(k => ({ head: hand.head[ph[k]], upper: hand.upper[pu[k]], lower: hand.lower[pl[k]] }));
    out.push({ robots, pilotAt: pi, st: robots.map((r, k) => stats(r, k === pi ? pilot : null)) });
  }
  return out;
}
const DESIGN = {
  player: st => st.reduce((a, s) => a + total(s), 0) * 10 + Math.min(...st.map(total)),
  bold: st => Math.max(...st.map(total)) * 10 + st.reduce((a, s) => a + total(s), 0),
  careful: st => Math.min(...st.map(total)) * 10 + st.reduce((a, s) => a + total(s), 0),
  tricky: st => { const t = st.map(total).sort((a, b) => b - a); return (t[0] + t[1]) * 10 - t[2]; },
};
function bestDesign(hand, pilot, kind) { let b = null, bv = -1e9; for (const d of allDesigns(hand, pilot)) { const v = DESIGN[kind](d.st) + Math.random() * .01; if (v > bv) { bv = v; b = d; } } return b; }
const ranks = st => [0, 1, 2].sort((a, b) => total(st[b]) - total(st[a]) || a - b);
// The CPU keeps a tally of which of your robots (strongest / middle / weakest) you send in each round.
// The more it has seen, the more often it plays a counter to your habit instead of its own personality.
const READ_NOISE = .15;
const readWeight = () => Math.min(.8, .2 * S.nObs);
function cpuChoose() {
  const g = S.g, avail = [0, 1, 2].filter(i => !g.cpuUsed.includes(i));
  if (Math.random() < READ_NOISE) return { c: pick(avail), mode: 'whim' };
  if (Math.random() < readWeight()) {
    const me = mySt(), myRk = ranks(me);
    const samplePlayer = () => { const used = g.myUsed.slice(), seq = []; for (let r = g.round; r < 3; r++) { const av = [0, 1, 2].filter(i => !used.includes(i)); const w = av.map(i => S.habit[r][myRk.indexOf(i)] * 2 + .5); let x = Math.random() * w.reduce((a, b) => a + b, 0), k = 0; while ((x -= w[k]) > 0) k++; seq.push(av[k]); used.push(av[k]); } return seq; };
    const seqs = Array.from({ length: 24 }, samplePlayer);
    const perms = arr => arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms(arr.filter((_, j) => j !== i)).map(p => [x, ...p]));
    let best = null, bv = -1e9;
    for (const p of perms(avail)) { let v = 0; for (const sq of seqs) sq.forEach((i, r) => v -= fight(me[i], g.cpuSt[p[r]]).r); v += Math.random() * .01; if (v > bv) { bv = v; best = p[0]; } }
    const av = [0, 1, 2].filter(i => !g.myUsed.includes(i));
    const expect = av.sort((a, b) => S.habit[g.round][myRk.indexOf(b)] - S.habit[g.round][myRk.indexOf(a)])[0];
    return { c: best, mode: 'read', expect: myRk.indexOf(expect) };
  }
  const rk = ranks(g.cpuSt), want = rk[PERSONAS[S.persona].pattern[g.round]];
  return { c: avail.includes(want) ? want : avail.sort((a, b) => rk.indexOf(a) - rk.indexOf(b))[0], mode: 'persona' };
}

// ---------- state ----------
let S;
function newSeries() {
  const rivalName = pick(Object.keys(PILOTS));
  S = { games: [], galAt: 0, persona: pick(Object.keys(PERSONAS)), rivalName, rivalFace: PILOTS[rivalName], game: 0, wins: [0, 0, 0], history: [], phase: 'design', guess: null, habit: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], nObs: 0, reads: [0, 0] };
}
function newGame() {
  S.game++;
  const d = deck(), pilots = shuffle(['head', 'head', 'upper', 'upper', 'lower', 'lower']);
  const hand = () => ({ head: d.head.splice(0, 3), upper: d.upper.splice(0, 3), lower: d.lower.splice(0, 3) });
  const myHand = hand(), cpuHand = hand();
  const handSum = h => PARTS.reduce((t, p) => t + h[p].reduce((u, c) => u + c.v, 0), 0);
  const cpu = bestDesign(cpuHand, pilots[1], S.persona);
  S.g = { hand: [...myHand.head, ...myHand.upper, ...myHand.lower], myHandOrig: myHand, pilot: pilots[0], robots: [{}, {}, {}], pilotAt: null,
          cpuPilot: pilots[1], cpu, cpuSt: cpu.st, myUsed: [], cpuUsed: [], round: 0, score: [0, 0], results: [], sel: null, target: 0, dealt: false, cpuHandSum: handSum(cpuHand) };
  bayAnim = [0, 1, 2].map(() => ({ drop: {}, paint: null, painted: false }));
  S.phase = 'design';
}
const mySt = () => S.g.robots.map((r, k) => stats(r, k === S.g.pilotAt ? S.g.pilot : null));
const designDone = () => mySt().every(Boolean) && S.g.pilotAt !== null;

// ---------- 3D views: each canvas.robo3d names a view; the loop draws them ----------
let bayAnim = [];
const rigs = new Map();
function rigFor(models, scheme) {
  const k = JSON.stringify([models, scheme]);
  if (!rigs.has(k)) { if (rigs.size > 40) { for (const [kk, r] of rigs) { r.dispose(); rigs.delete(kk); if (rigs.size < 20) break; } } const r = new ROBO.Rig(models, { scheme }); r.base = { up: r.upperPivot.position.y, head: r.headPivot.position.y }; rigs.set(k, r); }
  return rigs.get(k);
}
const views = {};   // id -> () => { rig, yaw }
let viewSeq = 0;
function viewCanvas(fn, cls = '') { if (!ROBO) return ''; const id = 'v' + viewSeq++; views[id] = fn; return `<canvas class="robo3d ${cls}" data-view="${id}" aria-hidden="true"></canvas>`; }
const dropK = t0 => (t0 ? Math.max(0, Math.min(1, (performance.now() - t0) / 380)) : 1);
const bounce = t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; };
function myBayView(k) {
  return () => {
    const g = S.g, r = g.robots[k], A = bayAnim[k];
    if (!r.head && !r.upper && !r.lower) return null;
    const rig = rigFor(modelsOf(r), MY_SCHEMES[k]);
    const off = p => r[p] ? (1 - bounce(dropK(A.drop[p]))) * 1.3 : 0;
    rig.pose({ aim: .12 + Math.sin(performance.now() / 900 + k) * .04, aimL: .05 });   // (first: it sets the upper body's height)
    if (rig.parts.lower) rig.parts.lower.position.y = off('lower');
    rig.upperPivot.position.y = rig.base.up + off('upper');
    rig.headPivot.position.y = rig.base.head + off('head') - (rig.parts.upper ? 0 : 0);
    const complete = r.head && r.upper && r.lower;
    if (complete && A.paint) { const t = Math.min(1, (performance.now() - A.paint) / 1500); rig.setPaint(t); rig.setLights(t >= 1); if (t >= 1) A.painted = true; }
    else if (complete && A.painted) { rig.setPaint(1); rig.setLights(true); }
    else { rig.setPaint(0); rig.setLights(false); }
    return { rig, yaw: -.5 + Math.sin(performance.now() / 2200 + k * 2) * .55 };
  };
}
function paintedView(robot, scheme, phase = 0, opts = {}) {
  return () => {
    const rig = rigFor(modelsOf(robot), scheme); rig.setPaint(1); rig.setLights(true);
    rig.pose({ aim: opts.aim != null ? opts.aim : .15 + Math.sin(performance.now() / 900 + phase) * .04, aimL: .05 });
    rig.parts.lower && (rig.parts.lower.position.y = 0); rig.upperPivot.position.y = rig.base.up; rig.headPivot.position.y = rig.base.head;
    return { rig, yaw: opts.spin ? performance.now() / 1600 : (opts.yaw != null ? opts.yaw : -.5) + Math.sin(performance.now() / 2400 + phase) * .3, frame: opts.frame };
  };
}
let lastDraw = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (!ROBO || now - lastDraw < 30 || document.querySelector('.battleOverlay')) return;
  lastDraw = now;
  document.querySelectorAll('canvas.robo3d').forEach(cv => {
    const r = cv.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || !r.width) return;
    const v = views[cv.dataset.view]; if (!v) return;
    const out = v();
    if (!out) { const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height); return; }
    ROBO.draw(cv, out.rig, out.yaw, out.frame || { cy: .52, dist: 2.4, h: .12 });
  });
}
requestAnimationFrame(loop);

// ---------- title ----------
function titleScreen() {
  if (!ROBO) return;
  const cv = $('titleRobot');
  const robot = { head: { m: 'ジオ', v: 3 }, upper: { m: 'ジオ', v: 3 }, lower: { m: 'ジオ', v: 3 } };
  views.title = () => { const rig = rigFor(modelsOf(robot), 'tricolor'); rig.setPaint(1); rig.setLights(true); const t = performance.now() / 1000; rig.pose({ aim: .55 + Math.sin(t * 1.3) * .35, aimL: .2, lean: Math.sin(t) * .05 }); return { rig, yaw: t * .5, frame: { cy: .55, dist: 2.35, h: .08 } }; };
  cv.dataset.view = 'title';
}

// ---------- input ----------
document.addEventListener('click', async e => {
  const b = e.target.closest('button,[data-pick],[data-bay]'); if (!b) return;
  if (b.id === 'startBtn') { SFX.unlock(); SFX.bgm(true); SFX.play('catapult_1', { vol: .8 }); FX.flash('#fff', 400, .9); $('title').hidden = true; $('game').hidden = false; newSeries(); await vsSplash(); startGame(); return; }
  if (b.id === 'titleRules' || b.id === 'rulesBtn') { SFX.unlock(); openHelp(b.id === 'titleRules' ? 0 : helpForScreen()); return; }
  if (b.id === 'closeRules') { $('rules').hidden = true; return; }
  if (b.dataset.help !== undefined) { showHelp(+b.dataset.help); SFX.tone(660, .04, { type: 'triangle', vol: .06 }); return; }
  if (b.dataset.collection !== undefined) { SFX.unlock(); openCollection(); return; }
  if (b.dataset.colPick !== undefined) { showCollection(+b.dataset.colPick); SFX.play('clamp_2', { vol: .4 }); return; }
  if (b.id === 'closeCollection') { $('collection').hidden = true; return; }
  if (!S || busy) return;
  const g = S.g;
  if (S.phase === 'design') {
    if (b.dataset.card) { await placeCard(b.dataset.card, null, b); return; }
    if (b.dataset.unplace) { e.stopPropagation(); const [k, p] = b.dataset.unplace.split(':'); unplace(+k, p); SFX.play('clamp_2', { vol: .5, rate: .8 }); render(); return; }
    if (b.dataset.board !== undefined) { e.stopPropagation(); const k = +b.dataset.board; if (g.pilotAt === k) { g.pilotAt = null; SFX.play('saberoff_1', { vol: .4 }); render(); } else await boardPilot(k); return; }
    if (b.dataset.bay !== undefined) {
      const k = +b.dataset.bay;
      g.target = k; SFX.tone(660, .05, { type: 'triangle', vol: .08 }); render(); return;
    }
    if (b.id === 'autoBtn') { await autoDesign(); return; }
    if (b.id === 'resetBtn') { g.hand = [...g.myHandOrig.head, ...g.myHandOrig.upper, ...g.myHandOrig.lower]; g.robots = [{}, {}, {}]; g.pilotAt = null; g.target = 0; bayAnim = [0, 1, 2].map(() => ({ drop: {}, paint: null, painted: false })); SFX.play('saberoff_1', { vol: .5 }); render(); return; }
    if (b.id === 'designBtn' && designDone()) { await reveal(); return; }
  }
  if (S.phase === 'battle') {
    if (b.dataset.pick !== undefined) { const k = +b.dataset.pick; if (!g.myUsed.includes(k)) { g.sel = k; SFX.play('beep_1', { vol: .6 }); render(); } return; }
    if (b.id === 'sortieBtn') { await sortie(); return; }
  }
  if (b.id === 'muBtn') { modal('相性表 <small style="font-size:13px;color:var(--muted)">どの組み合わせなら勝てる？</small>', muHTML()); return; }
  if (b.id === 'logBtn') { modal(`${S.rivalName}の出し方の記録`, logHTML()); return; }
  if (b.id === 'nextGameBtn') { if (S.game < GAMES) startGame(); else { S.phase = 'guess'; render(); } return; }
  if (b.dataset.guess) { S.guess = b.dataset.guess; S.phase = 'reveal'; render(); revealFx(); return; }
  if (b.dataset.gal !== undefined) { S.galAt = +b.dataset.gal; $('gallery').innerHTML = galleryHTML(); SFX.play('clamp_2', { vol: .4 }); return; }
  if (b.id === 'shareX') { open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText()) + '&url=' + encodeURIComponent(SHARE_URL), '_blank', 'noopener'); return; }
  if (b.id === 'shareCopy') { const t = shareText() + ' ' + SHARE_URL; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { b.textContent = 'コピーしました！'; }, () => { prompt('コピーしてください', t); }); return; }
  if (b.id === 'againBtn') { newSeries(); await vsSplash(); startGame(); return; }
});
document.addEventListener('keydown', e => { const t = e.target.closest && e.target.closest('[data-pick],[data-bay]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.click(); } });
let busy = false;
const lock = async fn => { busy = true; try { await fn(); } finally { busy = false; } };

// ---------- the VS splash before a series ----------
function vsSplash() {
  return new Promise(res => {
    const d = document.createElement('div'); d.className = 'vsSplash';
    d.innerHTML = `<div class="side me"><img src="${MY_FACE}" alt=""><div class="name"><small>PLAYER</small>あなた</div></div>
      <div class="side rv"><img src="${S.rivalFace}" alt=""><div class="name"><small>RIVAL</small>${S.rivalName}</div></div>
      <div class="vs">VS</div><div class="sub">3本勝負 ― 相手の性格を見抜け ― タップで開始</div>`;
    document.body.append(d);
    SFX.play('thrust_1'); setTimeout(() => SFX.play('thrust_2'), 150); setTimeout(() => { SFX.play('explosion_1', { vol: .7 }); FX.shake(16, 500, d); FX.flash('#ffd23f', 300, .5); }, 480);
    const done = () => { d.style.transition = 'opacity .3s'; d.style.opacity = 0; setTimeout(() => d.remove(), 300); res(); };
    const t = setTimeout(done, 3200);
    d.addEventListener('click', () => { clearTimeout(t); SFX.play('clamp_1'); done(); }, { once: true });
  });
}

// ---------- design: dealing, placing parts, painting, the pilot ----------
async function startGame() {
  newGame(); render();
  await lock(deal);
}
async function deal() {
  const g = S.g;
  FX.stamp(`第${S.game}試合`, { cls: 'gold', sub: '部位カード配布！', ms: 900 }); SFX.play('gacha_down', { vol: .7 });
  await sleep(1000);
  const cards = [...document.querySelectorAll('.hand .pcard')];
  const deckX = innerWidth / 2, deckY = innerHeight * .35;
  cards.forEach(c => { const r = c.getBoundingClientRect(); c.style.transform = `translate(${deckX - r.left - r.width / 2}px,${deckY - r.top - r.height / 2}px) rotate(${(Math.random() - .5) * 40}deg) scale(.6)`; c.style.opacity = 0; c.classList.add('fd'); });
  await sleep(50);
  for (const [i, c] of cards.entries()) {
    c.style.transition = 'transform .38s cubic-bezier(.2,1.2,.4,1), opacity .2s'; c.style.transform = ''; c.style.opacity = 1;
    SFX.play(['gacha_lock_a', 'gacha_lock_b', 'gacha_lock_c', 'gacha_lock_d'][i % 4], { vol: .8 });
    await sleep(110);
  }
  await sleep(350);
  // flip them, the 3s last with a bang
  const order = cards.filter(c => !c.classList.contains('r3') && !c.classList.contains('pilot')).concat(cards.filter(c => c.classList.contains('r3')), cards.filter(c => c.classList.contains('pilot')));
  for (const c of order) {
    c.style.transition = '';
    c.classList.remove('fd'); c.classList.add('flip');
    const [x, y] = FX.center(c);
    if (c.classList.contains('r3')) {
      c.classList.add('pop'); SFX.play('gacha_on', { vol: .55, rate: 1.3 }); SFX.tone(1320, .2, { type: 'triangle', vol: .1 });
      FX.burst(x, y, { n: 36, speed: 10, colors: ['#fff6c8', '#ffd23f', '#ff8a1f'], kind: 'star', size: 5, life: .8, gravity: .15 }); FX.ring(x, y, { color: '#ffd23f', r1: 120, life: .5 });
      FX.popText(x, y - 50, '★★★', '#ffd23f', 26);
      await sleep(330);
    } else if (c.classList.contains('pilot')) {
      SFX.play('techcome_1', { vol: .6 });
      FX.cutin({ side: 'left', face: MY_FACE, title: 'パイロット', text: `${PNAME[g.pilot]}が得意！（${SNAME[g.pilot]}+1）`, cls: 'me', ms: 1300 });
      await sleep(900);
    } else { SFX.tone(700 + Math.random() * 300, .05, { type: 'square', vol: .06 }); FX.burst(x, y, { n: 8, speed: 5, colors: ['#9fe8ff', '#ffffff'], size: 2, life: .4 }); await sleep(90); }
  }
  // the pilot's word on the hand: by the sum of the nine cards (18 on average) and the sets it could make
  await sleep(500);
  const all = [...g.myHandOrig.head, ...g.myHandOrig.upper, ...g.myHandOrig.lower], sum = all.reduce((a, c) => a + c.v, 0);
  const sets = MAKERS.reduce((n, m) => n + Math.min(...PARTS.map(p => g.myHandOrig[p].filter(c => c.m === m).length)), 0);
  const tier = sum >= 21 ? 3 : sum >= 19 ? 2 : sum <= 15 ? 0 : 1;
  const SAY = [['これは勝てないだろ…', 'うわ、弱いカードばっかり…', '厳しいな…読みで勝つしかない。'], ['普通の手札だな。組み方しだいだ。', 'まあまあかな…読みで勝つ！'],
    ['悪くない手札だ。', 'これなら戦える！'], ['これは強そうな手札がきた！', '★3がそろってる…いける！', '最高の配りだ！']];
  const line = pick(SAY[tier]) + (sets >= 2 ? '　セットも組めそう！' : sets === 1 && tier < 3 ? '　1体はセットにできるな。' : '');
  FX.cutin({ side: 'left', face: MY_FACE, title: 'あなた', text: line, cls: 'me', ms: 2000 });
  SFX.play(tier >= 2 ? 'techok_1' : tier === 0 ? 'techfail_1' : 'beep_2', { vol: .5 });
  g.dealt = true;
  render();
}
function cardEl(id) { return document.querySelector(`.pcard[data-card="${id}"]`); }
// fly a copy of the card element to the bay, then drop the part in
async function placeCard(id, bay = null, el = null) {
  const g = S.g, i = g.hand.findIndex(c => c.id === id); if (i < 0) return;
  const c = g.hand[i];
  let k = bay;
  if (k == null) k = !g.robots[g.target][c.part] ? g.target : g.robots.findIndex(r => !r[c.part]);
  if (k < 0) return;
  el = el || cardEl(id);
  const bayEl = document.querySelector(`.bay[data-bay="${k}"]`);
  if (el && bayEl) {
    const r = el.getBoundingClientRect(), br = bayEl.getBoundingClientRect();
    const fly = el.cloneNode(true); fly.classList.add('flyCard'); Object.assign(fly.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', margin: 0 });
    document.body.append(fly);
    requestAnimationFrame(() => { fly.style.transform = `translate(${br.left + br.width / 2 - r.left - r.width / 2}px,${br.top + br.width * .4 - r.top - r.height / 2}px) scale(.5) rotate(20deg)`; fly.style.opacity = .2; });
    setTimeout(() => fly.remove(), 400);
    SFX.play('swing_1', { vol: .5, rate: 1.3 });
  }
  g.robots[k][c.part] = c; g.hand.splice(i, 1);
  bayAnim[k].drop[c.part] = performance.now() + 250;
  if (g.robots[k].head && g.robots[k].upper && g.robots[k].lower) { /* fresh paint after a change */ bayAnim[k].painted = false; bayAnim[k].paint = null; }
  // the next empty bay becomes the target once this one is full
  if (PARTS.every(p => g.robots[g.target][p])) { const n = g.robots.findIndex(r => PARTS.some(p => !r[p])); if (n >= 0) g.target = n; }
  render();
  await sleep(250 + 330);
  const bayNow = document.querySelector(`.bay[data-bay="${k}"] canvas`);
  if (bayNow) { const [x, y] = FX.center(bayNow); FX.burst(x, y + bayNow.getBoundingClientRect().height * .2, { n: 16, speed: 7, colors: ['#ffffff', '#9fe8ff', '#ffd23f'], size: 2.5, life: .5, dir: -Math.PI / 2, spread: 1.4 }); }
  SFX.play(c.part === 'lower' ? 'impact_1' : 'clamp_1', { vol: c.part === 'lower' ? .5 : .8 });
  if (bayEl) FX.shake(4, 200);
  const r = g.robots[k];
  if (r.head && r.upper && r.lower) await completeRobot(k);
}
async function completeRobot(k) {
  const g = S.g, st = mySt()[k], bayEl = document.querySelector(`.bay[data-bay="${k}"]`);
  bayAnim[k].paint = performance.now(); bayAnim[k].painted = false;
  SFX.play('techwork_1', { vol: .6 }); SFX.play('hum_1', { vol: .3 });
  const cv = bayEl && bayEl.querySelector('canvas');
  // sparks run up the robot with the paint line
  if (cv) { const br = cv.getBoundingClientRect(); for (let i = 0; i < 8; i++) setTimeout(() => FX.burst(br.left + br.width / 2 + (Math.random() - .5) * br.width * .3, br.bottom - br.height * (.15 + i * .09), { n: 6, speed: 4, colors: ['#ffffff', ROBO ? ROBO.SCHEMES[MY_SCHEMES[k]].glow : '#fff'], size: 2, life: .4 }), i * 170); }
  await sleep(1450);
  SFX.play('techgreat_1', { vol: .7 });
  if (cv) { const [x, y] = FX.center(cv); FX.burst(x, y, { n: 40, speed: 11, colors: ['#ffffff', '#ffd23f', '#3dd0ff'], kind: 'star', size: 4, life: .8 }); FX.ring(x, y, { color: '#ffffff', r1: 160 }); }
  FX.stamp('COMPLETE!!', { cls: 'gold', sub: `ロボット${k + 1}　索敵${st.s} 攻撃${st.a} 防御${st.d}`, ms: 900 });
  FX.shake(8, 300);
  if (st.set) {
    await sleep(800);
    SFX.play('gacha_on', { vol: .6 }); SFX.fanfare(false);
    FX.stamp('SET BONUS!!', { cls: 'rainbow', sub: '同メーカーで全能力+1', ms: 1000 }); FX.confetti(70);
  }
  render();
}
function unplace(k, part) {
  const g = S.g, c = g.robots[k][part]; if (!c) return;
  g.hand.push(c); delete g.robots[k][part]; bayAnim[k].painted = false; bayAnim[k].paint = null; g.target = k;
}
async function boardPilot(k) {
  const g = S.g;
  g.pilotAt = k;
  render();
  SFX.play('techcome_1', { vol: .6 }); SFX.play('clamp_1', { delay: .3 });
  FX.cutin({ side: 'left', face: MY_FACE, title: `ロボット${k + 1}に搭乗！`, text: `${SNAME[g.pilot]}+1 ― ${pick(['よし、行けるぞ！', '頼むぞ、相棒！', 'この機体で勝つ！'])}`, cls: 'me', ms: 1100 });
  const cv = document.querySelector(`.bay[data-bay="${k}"] canvas`); if (cv) { const [x, y] = FX.center(cv); FX.ring(x, y, { color: '#ffd23f', r1: 140 }); }
  await sleep(600);
}
async function autoDesign() {
  await lock(async () => {
    const g = S.g, d = bestDesign(g.myHandOrig, g.pilot, 'player');
    // take everything back, then put each card into its robot
    g.hand = [...g.myHandOrig.head, ...g.myHandOrig.upper, ...g.myHandOrig.lower]; g.robots = [{}, {}, {}]; g.pilotAt = null;
    bayAnim = [0, 1, 2].map(() => ({ drop: {}, paint: null, painted: false }));
    render();
    for (const p of ['lower', 'upper', 'head']) for (let k = 0; k < 3; k++) {
      const c = d.robots[k][p], i = g.hand.findIndex(x => x.id === c.id);
      const el = cardEl(c.id);
      g.robots[k][p] = c; g.hand.splice(i, 1); bayAnim[k].drop[p] = performance.now() + 200;
      if (el) { const r = el.getBoundingClientRect(); FX.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 6, speed: 4, size: 2 }); }
      SFX.play(p === 'lower' ? 'impact_1' : 'clamp_1', { vol: .5, delay: .2 });
      render(); await sleep(170);
    }
    await sleep(300);
    for (let k = 0; k < 3; k++) { bayAnim[k].paint = performance.now() + k * 250; }
    SFX.play('techwork_1', { vol: .6 }); await sleep(1700);
    SFX.play('techgreat_1', { vol: .7 });
    FX.stamp('ALL COMPLETE!!', { cls: 'gold', ms: 900 });
    const sets = mySt().filter(s => s.set).length;
    if (sets) { await sleep(800); SFX.play('gacha_on', { vol: .6 }); SFX.fanfare(false); FX.stamp('SET BONUS!!', { cls: 'rainbow', sub: `${sets}体が同メーカーで全能力+1`, ms: 1000 }); FX.confetti(70); }
    await sleep(500);
    g.pilotAt = d.pilotAt;
    render();
    await boardPilot(d.pilotAt);
  });
}

// ---------- reveal and battle ----------
async function reveal() {
  await lock(async () => {
    S.phase = 'battle'; S.g.revealing = true;
    SFX.play('techcome_1', { vol: .7 }); SFX.duck(.15, 1.5);
    FX.flash('#fff', 300, .7);
    render();
    FX.stamp('設計図公開！！', { cls: 'red', sub: `${S.rivalName}のロボットが姿を現した`, ms: 1100 });
    const bays = [...document.querySelectorAll('.unit.rv')];
    bays.forEach(b => { b.style.transform = 'translateY(-60px) scale(.8)'; b.style.opacity = 0; });
    await sleep(900);
    for (const b of bays) {
      b.style.transition = 'transform .35s cubic-bezier(.2,1.6,.4,1), opacity .2s'; b.style.transform = ''; b.style.opacity = 1;
      SFX.play('impact_1', { vol: .7 }); FX.shake(8, 250);
      const [x, y] = FX.center(b); FX.burst(x, y + 40, { n: 14, speed: 6, colors: ['#ff5a6e', '#ffffff'], size: 2.5, life: .5 });
      await sleep(320);
    }
    S.g.revealing = false;
    await sleep(300);
    FX.cutin({ side: 'right', face: S.rivalFace, title: S.rivalName, text: pick(['どれから出すか、読めるかな？', 'さあ、勝負だ！', '手加減しないよ！']), cls: 'cpu', ms: 1400 });
    SFX.play('beep_2');
    // your word on the two line-ups: the nine pairings, won minus lost (-9 .. 9); said without holding the screen up
    setTimeout(() => {
    const me = mySt(), edge = me.reduce((a, m) => a + S.g.cpuSt.reduce((b, c) => b + fight(m, c).r, 0), 0);
    const SAY = edge <= -5 ? ['相手強すぎでしょ！ズルだ！', 'え、こんなの勝てるの…？', '設計で負けてる…読みで取り返すしかない！']
      : edge <= -2 ? ['うーん、分が悪いな…', 'ちょっと押されてるか。出す順番が勝負だ。']
      : edge <= 1 ? ['互角か。読み勝負だな。', 'いい勝負になりそうだ。']
      : edge <= 4 ? ['いけそうな気がする！', 'こっちが少し有利か？']
      : ['おっと？何出しても勝てるんじゃ？', '楽勝ムード…いや、油断は禁物！'];
    FX.cutin({ side: 'left', face: MY_FACE, title: 'あなた', text: pick(SAY), cls: 'me', ms: 1900 });
    SFX.play(edge >= 2 ? 'techok_1' : edge <= -2 ? 'techfail_1' : 'beep_1', { vol: .5 });
    }, 1700);
  });
}
async function sortie() {
  await lock(async () => {
    const g = S.g; if (g.sel === null || g.myUsed.includes(g.sel)) return;
    const ch = cpuChoose(), c = ch.c, me = mySt();
    const f = fight(me[g.sel], g.cpuSt[c]);
    const rk = ranks(g.cpuSt), myRk = ranks(me), myRank = myRk.indexOf(g.sel);
    let quote = '';
    if (ch.mode === 'read') {
      const hit = ch.expect === myRank; S.reads[1]++; if (hit) S.reads[0]++;
      quote = hit ? pick([`${RANKN[myRank]}で来ると思ったよ。`, `やっぱりね、${g.round + 1}戦目は${RANKN[myRank]}でしょ。`, 'そのクセ、もう覚えたよ。'])
        : pick([`あれ、${RANKN[ch.expect]}で来ると読んだのに。`, '読みが外れた…！', `${RANKN[myRank]}か、意外だな。`]);
    }
    S.habit[g.round][myRank]++; S.nObs++;
    const mine = g.sel;
    g.myUsed.push(mine); g.cpuUsed.push(c);
    if (f.r > 0) g.score[0]++; else if (f.r < 0) g.score[1]++;
    g.results.push(f.r);
    S.history.push({ game: S.game, round: g.round + 1, cpuRank: rk.indexOf(c), myRank, r: f.r, mode: ch.mode });
    g.sel = null;
    // launch!
    SFX.play('runway_1', { vol: .6 });
    FX.stamp('出撃！！', { cls: 'gold', sub: `ロボット${mine + 1}　発進`, ms: 700 });
    FX.flash('#fff', 300, .6);
    await sleep(800);
    await pickReveal(mine, c, myRank, rk.indexOf(c), quote);
    const spec = {
      title: `第${S.game}試合　${g.round + 1}戦目`,
      me: { models: modelsOf(g.robots[mine]), scheme: MY_SCHEMES[mine], st: me[mine], face: MY_FACE, name: 'あなた', label: `ROBOT ${mine + 1}`, rank: myRank, rankName: RANKN[myRank], weapon: weaponOf(g.robots[mine]), line: pick(['いっけぇーっ！', 'ここで決める！', '頼むぞ、相棒！', '撃ち抜けーっ！']) },
      cpu: { models: modelsOf(g.cpu.robots[c]), scheme: RV_SCHEMES[c], st: g.cpuSt[c], face: S.rivalFace, name: S.rivalName, label: `機体${'ABC'[c]}`, rank: rk.indexOf(c), rankName: RANKN[rk.indexOf(c)], weapon: weaponOf(g.cpu.robots[c]), line: quote || pick(['行くぞ！', '負けないよ！', 'いざ勝負！', '手加減しないからね！']) },
      flow: f,
    };
    g.round++;
    if (window.BATTLE) await BATTLE.play(spec);
    else { FX.stamp(f.r > 0 ? 'YOU WIN!!' : f.r < 0 ? 'LOSE…' : 'DRAW', { cls: f.r > 0 ? 'rainbow' : f.r < 0 ? 'red' : 'blue', ms: 1500 }); await sleep(1600); }
    if (g.round >= 3) { await gameEnd(); return; }
    render();
  });
}
// ---------- the moment the rival's pick is shown: your unit, a face-down card that shakes to a drum roll, then flips ----------
function pickReveal(mine, c, myRank, cpuRank, quote) {
  const g = S.g, me = mySt()[mine], st = g.cpuSt[c];
  const statRow = s => `<div class="rvStats"><span class="s">索敵<b>${s.s}</b></span><span class="a">攻撃<b>${s.a}</b></span><span class="d">防御<b>${s.d}</b></span></div>`;
  const d = document.createElement('div'); d.className = 'pickReveal';
  d.innerHTML = `<div class="prTitle">${S.rivalName}が出したのは…？</div>
    <div class="prRow">
      <div class="prCard me">${viewCanvas(paintedView(g.robots[mine], MY_SCHEMES[mine], 1, { yaw: -.7, aim: 1, frame: { cy: .55, dist: 2.4, h: .06 } }), 'prBot')}<b>ROBOT ${mine + 1}</b>${FX.rank(myRank, RANKN[myRank])}${statRow(me)}</div>
      <div class="prVs">VS</div>
      <div class="prCard rv"><div class="prBack">?</div>${viewCanvas(paintedView(g.cpu.robots[c], RV_SCHEMES[c], 2, { yaw: .7, aim: 1, frame: { cy: .55, dist: 2.4, h: .06 } }), 'prBot')}<b>機体 ${'ABC'[c]}</b>${FX.rank(cpuRank, RANKN[cpuRank])}${statRow(st)}</div>
    </div>
    <div class="prTalk"><img src="${S.rivalFace}" alt=""><span>${quote || pick(['これで行く！', 'さあ、どうだ！', 'これが私の答えだ！', '読めたかな？'])}</span></div>`;
  document.body.append(d);
  let skip = false; d.addEventListener('click', () => (skip = true));
  const wait = ms => new Promise(r => { const t0 = performance.now(); (function k() { if (skip || performance.now() - t0 >= ms) r(); else setTimeout(k, 30); })(); });
  return (async () => {
    SFX.play('clamp_1', { vol: .6 });
    await wait(450);
    // drum roll: beeps closing in, the card shaking harder
    const back = d.querySelector('.prCard.rv');
    for (let i = 0; i < 7 && !skip; i++) { SFX.tone(440 + i * 70, .06, { type: 'square', vol: .08 }); back.style.setProperty('--sh', (2 + i * 1.2) + 'px'); await wait(190 - i * 18); }
    back.classList.add('open'); SFX.play('gacha_on', { vol: .6, rate: 1.2 }); SFX.play('impact_1', { vol: .6 });
    FX.flash('#fff', 260, .6); FX.shake(10, 300, d);
    const [x, y] = FX.center(back); FX.burst(x, y, { n: 40, speed: 11, colors: ['#ffffff', '#ff5a6e', '#ffd23f'], kind: 'star', size: 4, life: .8 }); FX.ring(x, y, { color: '#ff5a6e', r1: 200 });
    await wait(350);
    d.querySelector('.prTalk').classList.add('show'); SFX.play('beep_2', { vol: .6 });
    await wait(skip ? 0 : 1600);
    d.classList.add('out'); await new Promise(r => setTimeout(r, 250)); d.remove();
  })();
}
async function gameEnd() {
  const g = S.g, w = g.score[0] > g.score[1] ? 0 : g.score[1] > g.score[0] ? 1 : 2;
  S.wins[w]++;
  S.games.push(gameRecord());
  keepRobots();
  S.phase = 'gameEnd'; render();
  if (w === 0) { SFX.fanfare(true); SFX.play('techgreat_1'); FX.confetti(220); FX.flash('#ffd23f', 400, .5); setTimeout(() => FX.confetti(120), 900); }
  else if (w === 1) SFX.play('techfail_1');
  else SFX.play('techok_1');
}
// ---------- a game looked back on: the hand, the design, the line-ups, the order you sent them in ----------
function gameRecord() {
  const g = S.g, me = mySt();
  const score = order => g.cpuUsed.reduce((a, c, r) => a + fight(me[order[r]], g.cpuSt[c]).r, 0);   // against the order the rival really used
  const all = PERMS.map(score), opt = bestDesign(g.myHandOrig, g.pilot, 'player');
  return {
    n: S.game, robots: g.robots.map(r => ({ ...r })), pilotAt: g.pilotAt, st: me, score: [...g.score], results: [...g.results],
    actual: score(g.myUsed), best: Math.max(...all), avg: all.reduce((a, b) => a + b, 0) / all.length,
    edge: me.reduce((a, m) => a + g.cpuSt.reduce((b, c) => b + fight(m, c).r, 0), 0),
    myTotal: me.reduce((a, x) => a + total(x), 0), optTotal: opt.st.reduce((a, x) => a + total(x), 0),
    handMe: PARTS.reduce((t, p) => t + g.myHandOrig[p].reduce((u, c) => u + c.v, 0), 0), handCpu: g.cpuHandSum, sets: me.filter(x => x.set).length,
  };
}
// what went well and what did not, and whether luck (the hand, the line-ups) or play (the design, the order) weighed more
function lookBack(G) {
  const good = [], bad = [], dh = G.handMe - G.handCpu;
  if (dh >= 3) good.push(`手札に恵まれた（数字の合計 ${G.handMe} 対 ${G.handCpu}）`); else if (dh <= -3) bad.push(`手札が弱かった（数字の合計 ${G.handMe} 対 ${G.handCpu}）`);
  if (G.myTotal >= G.optTotal) good.push('この手札で組める最善の設計'); else bad.push(`設計に伸びしろ（最善なら合計能力 +${G.optTotal - G.myTotal}）`);
  if (G.sets >= 2) good.push(`SET BONUS を ${G.sets} 体で`);
  if (G.edge >= 3) good.push('組み合わせの相性で有利'); else if (G.edge <= -3) bad.push('組み合わせの相性で不利');
  if (G.actual >= G.best && G.best > G.avg) good.push('出す順番は最善！'); else if (G.actual > G.avg + .2) good.push('出す順番で読み勝ち');
  else if (G.actual < G.avg - .2) bad.push(`出す順番で損（あと ${G.best - G.actual} 勝ぶん良くなる並びがあった）`);
  return { good, bad, luck: dh / 3 + G.edge / 3, play: (G.actual - G.avg) + (G.myTotal - G.optTotal) / 3 };
}
function verdict() {
  const L = S.games.map(lookBack), luck = L.reduce((a, x) => a + x.luck, 0), play = L.reduce((a, x) => a + x.play, 0);
  const won = S.wins[0] > S.wins[1], lost = S.wins[1] > S.wins[0];
  if (!won && !lost) return Math.abs(play) >= Math.abs(luck) ? { k: '出し方', t: play >= 0 ? '出し方は良かった。あと一歩で勝ち越し！' : '出し方を工夫すれば勝ち越せた！' }
    : { k: '運', t: luck >= 0 ? 'せっかくの好条件、勝ちきれず…' : '不利な手札でも引き分けに持ち込んだ！' };
  if (Math.abs(play) >= Math.abs(luck)) return play >= 0 ? { k: '出し方', t: won ? '勝因は出し方。読みと設計で上回った！' : '出し方は良かった。あと一歩！' } : { k: '出し方', t: lost ? '敗因は出し方。運は悪くなかった…' : '運で勝てた。出し方にはまだ伸びしろ。' };
  return luck >= 0 ? { k: '運', t: won ? '運にも助けられた勝利。' : '運は味方だったのに…出し方を見直そう。' } : { k: '運', t: lost ? '運が悪かった。出し方は悪くない！' : '不利な手札をはね返した！' };
}
function revealFx() {
  const ok = S.guess === S.persona;
  if (ok) { SFX.fanfare(true); SFX.play('techgreat_1'); FX.confetti(260); FX.stamp('見抜いた！！', { cls: 'rainbow', ms: 1400 }); }
  else { SFX.play('techfail_1'); FX.stamp('ハズレ…', { cls: 'blue', ms: 1200 }); }
}

// ---------- render ----------
const stars = v => '★'.repeat(v) + '<span style="opacity:.25">' + '★'.repeat(3 - v) + '</span>';
const cardHTML = (c, dealt) => `<button type="button" class="pcard r${c.v}" data-card="${c.id}" aria-label="${c.m} ${PNAME[c.part]} ${c.v}"><span class="mk ${c.m}">${c.m}</span>${ROBO ? `<img src="${ROBO.thumb(partModel(c), c.part)}" alt="">` : ''}<span class="v">${c.v}</span><span class="stars">${stars(c.v)}</span><span class="pt">${PNAME[c.part]}・${SNAME[c.part]}</span>${partModel(c) !== modelOf(c) ? '<span class="hov">HOVER</span>' : ''}</button>`;
const STAT_OF = { head: 's', upper: 'a', lower: 'd' };
function statHTML(s, pilot) {
  return `<div class="stats">${[['索敵', 's'], ['攻撃', 'a'], ['防御', 'd']].map(([n, k]) => { const up = pilot && STAT_OF[pilot] === k;
    return `<div class="stat ${k} ${up ? 'boost' : ''}"><span>${n}</span><b>${s ? s[k] : '−'}</b>${up ? '<i class="plus">+1</i>' : ''}</div>`; }).join('')}</div>`;
}
// the pilot's seat in each robot: tap to put the pilot in (showing what goes up), tap again to take them out
function seatHTML(r, k) {
  const g = S.g, on = g.pilotAt === k, key = STAT_OF[g.pilot], base = stats(r, null);
  const gain = base ? `${SNAME[g.pilot]} ${base[key]}→<b>${base[key] + 1}</b>` : `${SNAME[g.pilot]} +1`;
  if (on) return `<button type="button" class="seat on" data-board="${k}"><img src="${MY_FACE}" alt=""><span>搭乗中<small>${SNAME[g.pilot]}+1　タップで降りる</small></span></button>`;
  return `<button type="button" class="seat ${g.pilotAt === null ? 'free' : ''}" data-board="${k}"><img src="${MY_FACE}" alt=""><span>${g.pilotAt === null ? 'ここに乗せる' : 'ここに乗り換える'}<small>${gain}</small></span></button>`;
}
function slotsHTML(r, k, editable) {
  return `<div class="slots">${PARTS.map(p => { const c = r[p]; if (!c) return `<div class="slotPip"><span class="pn">${PNAME[p]}</span>：空き</div>`;
    const inner = `<span class="chip ${c.m}">${c.m}</span><span class="pn">${PNAME[p]}</span><span class="sv">${c.v}</span>`;
    return editable ? `<button type="button" class="slotPip filled" data-unplace="${k}:${p}" title="手札に戻す">${inner}</button>` : `<div class="slotPip filled">${inner}</div>`; }).join('')}</div>`;
}
function tagsHTML(r, s, o = {}) {
  return `<div class="tags">${s && s.set ? '<span class="tag set">SET +1</span>' : ''}${o.pilot ? `<span class="tag pilot">${o.pilotName || 'パイロット'} ${SNAME[o.pilot]}+1</span>` : ''}${o.rank != null ? `<span class="tag rank">${RANKN[o.rank]}</span>` : ''}${r.upper ? `<span class="tag weapon">${weaponOf(r)}</span>` : ''}</div>`;
}
function seriesHTML() {
  const g = S.g;
  const pips = (n, cls) => `<span class="pips ${cls}">${[0, 1].map(i => `<span class="pip ${i < n ? 'on' : ''}"></span>`).join('')}</span>`;
  return `<span class="gameNo">第${Math.min(S.game, GAMES)}試合<small> / ${GAMES}</small></span><span class="me">あなた ${pips(S.wins[0], 'me')}</span><span>vs</span><span class="rv">${pips(S.wins[1], 'rv')} ${S.rivalName}</span><img src="${S.rivalFace}" alt="">`;
}
function render() {
  const g = S.g, main = $('main');
  $('seriesInfo').innerHTML = seriesHTML();
  $('msg').hidden = false;
  for (const k in views) if (k !== 'title') delete views[k];
  if (S.phase === 'design') {
    const st = mySt();
    $('msg').innerHTML = !g.hand.length && g.pilotAt === null ? `<b>搭乗</b>最後にパイロットを乗せよう。パイロットは<b>${SNAME[g.pilot]}</b>が得意：乗せたロボットの${SNAME[g.pilot]}が+1。各ロボットの「ここに乗せる」を押す。`
      : `<b>設計</b>カードをタップ → 光っているロボットに装着。ロボットをタップで装着先を切りかえ。装着した部位をタップで外す。パイロットは各ロボットの「ここに乗せる」で搭乗。`;
    const handCards = PARTS.flatMap(p => g.hand.filter(c => c.part === p));
    const pilotCard = g.pilotAt === null ? `<div class="pcard pilot" id="pilotCard"><span class="mk">PILOT</span><img src="${MY_FACE}" alt=""><span class="pt">${SNAME[g.pilot]}が得意<br>乗せた機体の${SNAME[g.pilot]}+1<br>↑ 各ロボットの<br>「ここに乗せる」</span></div>` : '';
    main.innerHTML = `
      <section class="panel"><h2>格納庫 <span class="sub">3部位を同じメーカーでそろえると全能力+1</span></h2>
        <div class="bays">${g.robots.map((r, k) => `<div class="bay ${k === g.target ? 'target' : ''}" data-bay="${k}" role="button" tabindex="0">
          <div class="bayHead"><span class="no">ROBOT ${k + 1}</span>${g.pilotAt === k ? '<span class="tag pilot">搭乗中</span>' : ''}</div>
          ${viewCanvas(myBayView(k))}${slotsHTML(r, k, true)}${statHTML(st[k], g.pilotAt === k ? g.pilot : null)}${seatHTML(r, k)}${tagsHTML(r, st[k], {})}</div>`).join('')}</div></section>
      <section class="panel handWrap"><h2>手札 <span class="sub">頭＝索敵　上半身＝攻撃（武器つき）　下半身＝防御</span></h2>
        <div class="hand">${handCards.map(c => cardHTML(c)).join('')}${pilotCard}</div>
        <div class="actions"><button type="button" class="bigBtn ${designDone() ? 'go' : ''}" id="designBtn" ${designDone() ? '' : 'disabled'}>設計完了！</button><button type="button" class="subBtn" id="autoBtn">おまかせ設計</button><button type="button" class="subBtn" id="resetBtn">やり直す</button>
          <div class="hint">${designDone() ? '準備完了！設計完了で、おたがいの設計図が公開されます' : g.hand.length ? `あと${g.hand.length}枚` : 'パイロットを乗せてください'}</div></div></section>`;
    return;
  }
  if (S.phase === 'guess' || S.phase === 'reveal') { renderEnd(main); return; }
  if (S.phase === 'gameEnd') {
    const w = g.score[0] > g.score[1] ? 'win' : g.score[1] > g.score[0] ? 'lose' : 'draw';
    $('msg').hidden = true;
    const rank = r => FX.rank(r, RANKN[r]);
    const res = r => `<span class="resChip ${r > 0 ? 'w' : r < 0 ? 'l' : 'd'}">${r > 0 ? '勝ち' : r < 0 ? '負け' : '引分'}</span>`;
    const recap = S.history.filter(h => h.game === S.game).map(h => `<div class="recap"><span class="rn">${h.round}戦目</span><div class="vsLine">${rank(h.myRank)}<i>vs</i>${rank(h.cpuRank)}</div>${res(h.r)}</div>`).join('');
    main.innerHTML = `<section class="panel result endTop"><div class="big ${w}">${w === 'win' ? 'VICTORY!!' : w === 'lose' ? 'DEFEAT' : 'DRAW'}</div>
      <div class="score"><span class="m">${g.score[0]}</span> ― <span class="r">${g.score[1]}</span></div>
      <div class="recaps">${recap}</div>
      ${stepsHTML()}
      <button type="button" class="bigBtn go" id="nextGameBtn">${S.game < GAMES - 1 ? `第${S.game + 1}試合へ<small>あと${GAMES - S.game}試合で決着</small>` : S.game < GAMES ? '最終戦へ！<small>これで決着</small>' : `${S.rivalName}の性格を当てる<small>いよいよ最後</small>`}</button></section>
      ${hintsHTML()}`;
    return;
  }
  // battle: the sortie deck. Rival units on top, the face-off stage in the middle, your units and the launch button below
  const me = mySt(), rk = ranks(g.cpuSt), myRk = ranks(me);
  // the last round: one unit left each, nothing to choose
  const last = g.round === 2;
  if (last && g.sel === null) g.sel = [0, 1, 2].find(i => !g.myUsed.includes(i));
  $('msg').hidden = true;
  const unit = (side, r, s, k, rank, used, sel, pilot) => {
    const rv = side === 'rv';
    const makers = PARTS.map(p => `<i class="chip ${r[p].m}" title="${PNAME[p]} ${r[p].m} ${r[p].v}"></i>`).join('');
    return `<div class="unit ${rv ? 'rv' : ''} ${used ? 'used' : ''} ${sel ? 'sel' : ''}" ${!rv && !used ? `data-pick="${k}" role="button" tabindex="0"` : ''}>
      <div class="uTop"><span class="no">${rv ? '機体 ' + 'ABC'[k] : 'ROBOT ' + (k + 1)}</span>${FX.rank(rank, RANKN[rank])}</div>
      ${viewCanvas(paintedView(r, rv ? RV_SCHEMES[k] : MY_SCHEMES[k], k + (rv ? 0 : 3), { yaw: rv ? .8 : -.8, aim: sel ? .9 : undefined, frame: { cy: .55, dist: 2.3, h: .06 } }), 'uBot')}
      <div class="uStats"><span class="s"><i>索敵</i><b>${s.s}</b></span><span class="a"><i>攻撃</i><b>${s.a}</b></span><span class="d"><i>防御</i><b>${s.d}</b></span></div>
      <div class="uFoot"><span class="makers">${makers}</span>${s.set ? '<span class="tag set">SET</span>' : ''}${pilot ? '<span class="tag pilot">P</span>' : ''}<span class="wpn">${weaponOf(r)}</span></div>
      ${used ? '<span class="uDone">出撃済</span>' : ''}</div>`;
  };
  const cpuRow = g.cpuSt.map((s, k) => unit('rv', g.cpu.robots[k], s, k, rk.indexOf(k), g.cpuUsed.includes(k), false, g.cpu.pilotAt === k)).join('');
  const myRow = me.map((s, k) => unit('me', g.robots[k], s, k, myRk.indexOf(k), g.myUsed.includes(k), g.sel === k, g.pilotAt === k)).join('');
  const dots = [0, 1, 2].map(i => { const r = g.results[i]; return `<span class="rd ${r === undefined ? (i === g.round ? 'now' : '') : r > 0 ? 'w' : r < 0 ? 'l' : 'd'}">${r === undefined ? i + 1 : r > 0 ? '勝' : r < 0 ? '負' : '分'}</span>`; }).join('');
  const selBot = g.sel !== null
    ? `${viewCanvas(paintedView(g.robots[g.sel], MY_SCHEMES[g.sel], 9, { yaw: -1.0, aim: 1, frame: { cy: .55, dist: 3.0, h: .05 } }), 'stageBot')}
       <div class="stageName me">ROBOT ${g.sel + 1}<small>${weaponOf(g.robots[g.sel])}　索敵${me[g.sel].s} 攻撃${me[g.sel].a} 防御${me[g.sel].d}</small></div>`
    : `<div class="stagePrompt">出撃する機体を<br>選べ！<small>↓ 下のカードをタップ</small></div>`;
  main.innerHTML = `
    <div class="sortie">
      <div class="strip"><div class="stripLabel rv">ENEMY<small>${S.rivalName}</small></div><div class="units">${cpuRow}</div></div>
      <div class="stage">
        <div class="stageSide me">${selBot}</div>
        <div class="stageMid"><div class="roundNo">ROUND ${g.round + 1}</div><div class="vsBig">VS</div><div class="roundDots">${dots}</div>
          <div class="score"><span class="m">${g.score[0]}</span> - <span class="r">${g.score[1]}</span></div>
          <div class="stageBtns"><button type="button" class="chipBtn" id="muBtn">相性表</button><button type="button" class="chipBtn" id="logBtn">記録</button></div></div>
        <div class="stageSide rv"><img class="rvFace" src="${S.rivalFace}" alt=""><div class="qMark">?</div><div class="stageName rv">${S.rivalName}<span class="rvSay">「${rivalSay()}」</span></div></div>
      </div>
      <div class="dock"><div class="stripLabel me">YOUR UNITS</div><div class="units">${myRow}</div>
        <button type="button" class="launchBtn" id="sortieBtn" ${g.sel === null ? 'disabled' : ''}><span>${last ? '最終戦' : '出撃'}</span><small>${last ? '残る1機で決着！' : g.sel === null ? '機体を選択' : 'LAUNCH!'}</small></button></div>
    </div>`;
}
// what the rival says beside its face on the sortie screen: by the units both sides have left, how the pairings go for
// you (won minus lost, over their number); picked once a round
function rivalSay() {
  const g = S.g, key = S.game + ':' + g.round;
  if (g.sayKey === key) return g.say;
  const me = mySt(), mine = [0, 1, 2].filter(i => !g.myUsed.includes(i)), theirs = [0, 1, 2].filter(i => !g.cpuUsed.includes(i));
  let e = 0; for (const i of mine) for (const k of theirs) e += fight(me[i], g.cpuSt[k]).r;
  const x = e / Math.max(1, mine.length * theirs.length);
  const SAY = x >= .55 ? ['・・・ずるい', 'その機体、反則だろ…', '勘弁してくれよ…'] : x >= .22 ? ['ちょっと厳しいか…', 'やるじゃないか'] : x > -.22 ? ['いい勝負になりそうだ', 'どれを出してくる…？']
    : x > -.55 ? ['悪くない手だ', 'こっちが一枚上手かな'] : ['余裕だぜ', '相手にならないな', '本気を出すまでもない'];
  g.sayKey = key; g.say = pick(SAY);
  return g.say;
}
function muHTML() {
  const g = S.g, me = mySt();
  return `<table class="mu"><tr><th></th>${g.cpuSt.map((_, k) => `<th class="rv">機体${'ABC'[k]}</th>`).join('')}</tr>${me.map((s, i) => `<tr><th class="me">ROBOT ${i + 1}</th>${g.cpuSt.map((c, k) => { const r = fight(s, c).r, off = g.myUsed.includes(i) || g.cpuUsed.includes(k); return `<td class="${r > 0 ? 'w' : r < 0 ? 'l' : 'd'} ${off ? 'off' : ''}">${r > 0 ? '勝ち' : r < 0 ? '負け' : '引分'}</td>`; }).join('')}</tr>`).join('')}</table>`;
}
function logHTML() {
  return S.history.length ? `<ul class="log">${S.history.map(h => `<li>第${h.game}試合 ${h.round}戦目：あなた ${RANKN[h.myRank]} ／ ${S.rivalName} <b>${RANKN[h.cpuRank]}</b>（${h.r > 0 ? 'あなたの勝ち' : h.r < 0 ? '相手の勝ち' : '引分'}）</li>`).join('')}</ul>` : '<p class="hint">まだ記録がありません。</p>';
}
function modal(title, html) {
  const d = document.createElement('div'); d.className = 'overlay';
  d.innerHTML = `<div class="dialog"><h2>${title}</h2>${html}<button type="button" class="bigBtn">閉じる</button></div>`;
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('.bigBtn')) d.remove(); });
  document.body.append(d);
}
// ---------- hints after each game: the rival's habit so far, how well each personality fits it, and a word on yours ----------
// where the series is: the three games (done ones with their score), then the guess
function stepsHTML() {
  const done = S.games.length;
  const step = (lab, st, extra = '') => `<span class="step ${st}">${lab}${extra}</span>`;
  return `<div class="steps">${[1, 2, 3].map(n => { const G = S.games[n - 1];
    return step(`第${n}試合`, G ? 'done' : n === done + 1 ? 'next' : '', G ? `<small>${G.score[0]}-${G.score[1]}</small>` : ''); }).join('<i>›</i>')}<i>›</i>${step('性格当て', done === GAMES ? 'next' : '')}</div>`;
}
function hintsHTML() {
  const H = S.history, name = S.rivalName;
  // what each side sent in each round, game by game: one row a round, one badge a game (the same badge again and again is a habit)
  const seq = key => `<div class="seqTable">${[1, 2, 3].map(r => { const row = H.filter(h => h.round === r);
    return `<div class="seqRow"><span class="rn">${r}戦目</span><span class="seq">${row.length ? row.map(h => FX.rank(h[key], RANKN[h[key]])).join('') : '<span class="none">まだ</span>'}</span></div>`; }).join('')}</div>`;
  // how many of the rival's picks each personality would have made
  // each personality: the rank it would send in each round, and how often the rival did send that there
  const games = r => H.filter(h => h.round === r + 1);
  const fit = Object.entries(PERSONAS).map(([k, p]) => ({ n: p.n, cells: p.pattern.map((want, r) => ({ want, hit: games(r).filter(h => h.cpuRank === want).length, of: games(r).length })) }))
    .map(f => ({ ...f, hit: f.cells.reduce((a, c) => a + c.hit, 0), of: f.cells.reduce((a, c) => a + c.of, 0) }));
  const best = Math.max(...fit.map(f => f.hit));
  const bars = `<div class="fitHead"><span></span>${[1, 2, 3].map(r => `<span>${r}戦目</span>`).join('')}<span>一致</span></div>` + fit.map(f => `<div class="fitRow ${f.hit && f.hit === best ? 'top' : ''}"><b>${f.n}</b>
      ${f.cells.map(c => `<span class="cell ${c.of && c.hit === c.of ? 'all' : c.hit ? 'some' : ''}">${FX.rank(c.want, RANKN[c.want])}<small>${c.of ? `${c.of}回中${c.hit}回` : '−'}</small></span>`).join('')}
      <span class="tot"><i style="width:${f.of ? Math.round(f.hit / f.of * 100) : 0}%"></i><em>${f.hit}/${f.of}</em></span></div>`).join('');
  // a word to you: a habit of your own the rival may be reading, else a tip
  const mine = [0, 1, 2].map(r => { const c = S.habit[r], n = c[0] + c[1] + c[2], k = c.indexOf(Math.max(...c)); return { r, k, n, share: n ? c[k] / n : 0 }; }).filter(x => x.n >= 2 && x.share >= .66);
  const TIPS = [`相手の最強に、こちらの最弱をぶつけて捨てるのも手。残りの2戦で勝ち越せばいい。`, `索敵が高い機体は先に撃てる。攻撃が相手の防御を上回るなら、一撃で決まる。`,
    `防御を上回られなければ負けない。防御の高い機体は、引き分け狙いの壁になる。`, `相手も出撃させた順番を覚えている。わざと出し方を変えると、読みを外せる。`];
  const word = mine.length ? `<p class="warn">あなたは<b>${mine[0].r + 1}戦目に${RANKN[mine[0].k]}</b>を出しがちです。${name}に読まれているかもしれません。次は外してみては？</p>` : '';
  const reads = S.reads[1] ? `<p>${name}があなたを読んで出したことが <b>${S.reads[1]}</b> 回あり、そのうち <b>${S.reads[0]}</b> 回当たっています。</p>` : '';
  return `<div class="hints">
    <section class="panel"><h2>${name}の出し方 <span class="sub">左から第1試合、第2試合…</span></h2>${seq('cpuRank')}
      <p class="hint">同じ札が続く所が${name}のクセ。ただしときどき、あなたを読んだり気まぐれで出したりします。</p></section>
    <section class="panel"><h2>あなたの出し方 <span class="sub">${name}はこれを見て読んできます</span></h2>${seq('myRank')}
      <p class="hint">同じ札が続いていたら、次は変えてみると読みを外せます。</p></section>
    <section class="panel"><h2>どの性格っぽい？</h2><p class="hint" style="text-align:left">札はその性格なら出すはずの機体。下は${name}が実際にそれを出した回数。一致が多い性格が怪しい。</p>${bars}</section>
    <section class="panel advice"><h2>ヒント</h2>${word}${reads}<p>${pick(TIPS)}</p></section></div>`;
}
function histHTML() {
  return `<section class="panel"><details class="more" ${S.history.length ? '' : ''}><summary>${S.rivalName}の出し方の記録（性格を見抜く手がかり）</summary>${S.history.length ? `<ul class="log">${S.history.map(h => `<li>第${h.game}試合 ${h.round}戦目：あなた ${RANKN[h.myRank]} ／ ${S.rivalName} <b>${RANKN[h.cpuRank]}</b>（${h.r > 0 ? 'あなたの勝ち' : h.r < 0 ? '相手の勝ち' : '引分'}）</li>`).join('')}</ul>` : '<p class="hint">まだ記録がありません。</p>'}</details></section>`;
}
function renderEnd(main) {
  const p = PERSONAS[S.persona];
  const sw = S.wins[0] > S.wins[1] ? 'win' : S.wins[1] > S.wins[0] ? 'lose' : 'draw';
  const MODE = { persona: '性格どおり', read: 'あなたを読んだ', whim: '気まぐれ' };
  const hist = `<ul class="log">${S.history.map(h => `<li>第${h.game}試合 ${h.round}戦目：あなた ${RANKN[h.myRank]} ／ ${S.rivalName} <b>${RANKN[h.cpuRank]}</b>${S.phase === 'reveal' ? `（${MODE[h.mode]}）` : ''}</li>`).join('')}</ul>`;
  if (S.phase === 'guess') {
    $('msg').innerHTML = `<b>シリーズ ${S.wins[0]} ― ${S.wins[1]}</b>最後に、${S.rivalName}の性格を当てよう！`;
    main.innerHTML = `<section class="panel result"><div class="big ${sw}" style="font-size:clamp(32px,9vw,64px)">${sw === 'win' ? 'SERIES WIN!!' : sw === 'lose' ? 'SERIES LOSE' : 'SERIES DRAW'}</div>
      <h2 style="margin:0;font-family:var(--display);font-weight:400">${S.rivalName}はどんな性格？</h2>
      <div class="persona">${Object.entries(PERSONAS).map(([k, v]) => `<button type="button" class="pbtn" data-guess="${k}"><b>${v.n}</b><span>${v.d}</span></button>`).join('')}</div></section>
      <section class="panel"><h2>出し方の記録</h2>${hist}</section>`;
    return;
  }
  const ok = S.guess === S.persona, v = verdict();
  $('msg').hidden = true;
  const res = r => `<span class="resChip ${r > 0 ? 'w' : r < 0 ? 'l' : 'd'}">${r > 0 ? '勝' : r < 0 ? '負' : '分'}</span>`;
  const cards = S.games.map(G => { const L = lookBack(G), w = G.score[0] > G.score[1] ? 'w' : G.score[1] > G.score[0] ? 'l' : 'd';
    return `<div class="gameCard ${w}"><div class="gcTop"><b>第${G.n}試合</b><span class="gcScore">${G.score[0]} - ${G.score[1]}</span>${G.results.map(res).join('')}</div>
      <div class="gcBars"><span>手札 ${G.handMe}<i>vs</i>${G.handCpu}</span><span>相性 ${G.edge > 0 ? '+' : ''}${G.edge}</span><span>出し方 ${G.actual >= G.best ? '最善' : `最善まで${G.best - G.actual}勝`}</span></div>
      <ul class="gcList">${L.good.map(t => `<li class="good">${t}</li>`).join('')}${L.bad.map(t => `<li class="bad">${t}</li>`).join('')}</ul></div>`; }).join('');
  main.innerHTML = `<section class="panel finale">
      <div class="finHero"><img src="${S.rivalFace}" alt=""><div><div class="big ${ok ? 'win' : 'lose'}">${ok ? '見抜いた！！' : 'ハズレ…'}</div>
        <p>${S.rivalName}の性格は <b class="pName">「${p.n}」</b>　${p.d}</p>
        <p class="sub">性格どおり ${S.history.filter(h => h.mode === 'persona').length} 回 ／ あなたを読んだ ${S.history.filter(h => h.mode === 'read').length} 回（的中 ${S.reads[0]}）／ 気まぐれ ${S.history.filter(h => h.mode === 'whim').length} 回</p></div></div>
      <div class="finScore"><span>シリーズ</span><b class="m">${S.wins[0]}</b><i>-</i><b class="r">${S.wins[1]}</b>${S.wins[2] ? `<span>引分 ${S.wins[2]}</span>` : ''}</div>
      <div class="verdict"><span>勝敗を分けたのは</span><b>${v.k}</b><p>${v.t}</p></div></section>
    <section class="panel"><h2>振り返り <span class="sub">手札＝配られた9枚の数字の合計、相性＝9通りの組み合わせの勝ち越し数、出し方＝相手の出し方に対して、最善の並びと比べて</span></h2><div class="gameCards">${cards}</div></section>
    <section class="panel"><h2>あなたの機体</h2><div id="gallery">${galleryHTML()}</div></section>
    <section class="panel finCta"><div class="shareRow"><button type="button" class="subBtn" id="shareX">𝕏 でシェア</button><button type="button" class="subBtn" id="shareCopy">結果をコピー</button></div>
      <button type="button" class="bigBtn go" id="againBtn">もう一度遊ぶ（別の相手）</button>
      <button type="button" class="subBtn" data-collection>これまでのXSを見る</button>
      <div class="linkRow"><a class="ctaLink" href="https://extendsuit.com/" target="_blank" rel="noopener">本体のサイトを見る ›</a><a class="ctaLink yt" href="https://www.youtube.com/@416gamedev" target="_blank" rel="noopener">開発の状況を見る ›</a></div></section>
    <section class="panel"><details class="more"><summary>出し方の記録</summary>${hist}</details></section>`;
}
// the robots you built, one at a time, turning; arrows and chips to move between them
function galleryHTML() {
  const list = S.games.flatMap(G => G.robots.map((r, k) => ({ r, k, n: G.n, st: G.st[k], pilot: G.pilotAt === k })));
  if (!list.length) return '';
  const i = ((S.galAt % list.length) + list.length) % list.length, x = list[i];
  return `<div class="gal"><button type="button" class="galNav" data-gal="${i - 1}" aria-label="前の機体">‹</button>
      <div class="galStage">${viewCanvas(paintedView(x.r, MY_SCHEMES[x.k], 7, { spin: true, aim: .3, frame: { cy: .55, dist: 2.6, h: .1 } }), 'galBot')}
        <div class="galInfo"><b>第${x.n}試合　ROBOT ${x.k + 1}</b>${x.pilot ? '<span class="tag pilot">搭乗</span>' : ''}${x.st.set ? '<span class="tag set">SET</span>' : ''}
          <span class="wpn">${weaponOf(x.r)}</span>
          <div class="galStats"><span class="s">索敵<b>${x.st.s}</b></span><span class="a">攻撃<b>${x.st.a}</b></span><span class="d">防御<b>${x.st.d}</b></span></div>
          <div class="galParts">${PARTS.map(p => `<span><i class="chip ${x.r[p].m}">${x.r[p].m}</i>${PNAME[p]} ${x.r[p].v}</span>`).join('')}</div></div></div>
      <button type="button" class="galNav" data-gal="${i + 1}" aria-label="次の機体">›</button></div>
    <div class="galChips">${list.map((y, j) => `<button type="button" class="${j === i ? 'on' : ''}" data-gal="${j}">${y.n}-${y.k + 1}</button>`).join('')}</div>`;
}
function shareText() {
  const v = verdict(), ok = S.guess === S.persona;
  return `ロボットバトルで${S.rivalName}と3本勝負！ シリーズ ${S.wins[0]}-${S.wins[1]}、相手の性格「${PERSONAS[S.persona].n}」を${ok ? '見抜いた！' : '見抜けなかった…'} 勝敗を分けたのは「${v.k}」 #ロボットバトル`;
}
const SHARE_URL = 'https://n416.github.io/robot-battle/';

// ---------- help: cards, opened at the one for the screen you are on; the others a tap away ----------
const HELP = [
  { t: 'ロボットバトルとは', b: `<p>部位カードでロボットを3体組み、同じ相手パイロットと<b>3試合</b>戦います。</p>
      <p>相手には<b>性格</b>があり、ロボットを出す順番にクセが出ます。試合を重ねて性格を見抜き、裏をかきましょう。</p>
      <p>ただし相手も<b>あなたのクセを覚えて</b>読んできます。いつも同じ出し方だと、狙い撃ちされます。</p>` },
  { t: '格納庫：ロボットを組む', b: `<p>手札のカードをタップすると、<b>光っているロボット</b>に装着されます。ロボットをタップすると装着先が変わります。</p>
      <ul><li><b>頭</b> → 索敵（先に撃てるか）</li><li><b>上半身</b> → 攻撃（武器つき）</li><li><b>下半身</b> → 防御</li></ul>
      <p>3部位を<b>同じメーカー</b>（ジオ・ツイ・アナ）でそろえると、全能力+1の<b>SET BONUS</b>。</p>
      <p>装着した部位をタップすると手札に戻せます。迷ったら「おまかせ設計」。</p>` },
  { t: '格納庫：パイロットを乗せる', b: `<p>パイロットは1人。<b>得意な能力</b>（索敵・攻撃・防御のどれか）があります。</p>
      <p>各ロボットの<b>「ここに乗せる」</b>を押すと搭乗し、その機体の得意な能力が<b>+1</b>。上がる数字は欄に出ています。</p>
      <p>もう一度押すと降ります。3体とパイロットがそろったら「設計完了！」。</p>` },
  { t: '出撃：どれを出す？', b: `<p>上が相手の3機、下があなたの3機。<b>おたがいの能力は公開</b>されています。</p>
      <p>あなたの機体を1体選んで<b>「出撃」</b>。相手も同時に1体を出し、出撃した機体はその試合ではもう使えません。</p>
      <p>「相性表」で、どの組み合わせなら勝てるかを確かめられます。「記録」には相手の出し方が残ります。</p>` },
  { t: '戦闘の決まり', b: `<ol><li><b>索敵</b>が高いほうが先に攻撃。</li><li><b>攻撃が相手の防御を上回れば撃破</b>。</li><li>防がれたら、相手の反撃。</li><li>索敵が同じなら<b>同時攻撃</b>。</li></ol>
      <p>どちらも撃破できなければ引き分け。3戦して、撃破の多いほうがその試合の勝ち。</p>` },
  { t: '相手の性格を見抜く', b: `<ul><li><b>強気</b>：一番強いロボットを最初に出したがる。</li><li><b>慎重</b>：一番強いロボットを最後まで温存する。</li><li><b>策士</b>：最初に一番弱いのを捨て駒にし、2戦目に一番強いのを出す。</li></ul>
      <p>3試合のあと、相手の性格を当てます。ただし相手も、あなたのクセを読んで出し方を変えてきます。</p>` },
];
let helpAt = 0;
function helpForScreen() {
  if (!S || $('game').hidden) return 0;
  if (S.phase === 'design') return S.g.hand.length ? 1 : 2;
  if (S.phase === 'battle') return 3;
  if (S.phase === 'gameEnd') return 4;
  return 5;
}
function showHelp(i) {
  helpAt = (i + HELP.length) % HELP.length;
  const h = HELP[helpAt];
  $('rules').innerHTML = `<div class="dialog helpCard">
    <div class="helpTop"><span class="helpNo">${helpAt + 1} / ${HELP.length}</span><button type="button" class="helpX" id="closeRules" aria-label="閉じる">×</button></div>
    <h2>${h.t}</h2><div class="helpBody">${h.b}</div>
    <div class="helpNav"><button type="button" class="subBtn" data-help="${helpAt - 1}">‹ 前へ</button>
      <span class="helpDots">${HELP.map((x, k) => `<button type="button" class="${k === helpAt ? 'on' : ''}" data-help="${k}" aria-label="${x.t}"></button>`).join('')}</span>
      <button type="button" class="subBtn" data-help="${helpAt + 1}">次へ ›</button></div></div>`;
}
function openHelp(i) { showHelp(i); $('rules').hidden = false; }
$('rules').addEventListener('click', e => { if (e.target === $('rules')) $('rules').hidden = true; });
// ---------- the robots you have built, kept in this browser: every game's three, with how each one's fight went ----------
const COL_KEY = 'rb-collection', COL_MAX = 300;
function loadCollection() { try { return JSON.parse(localStorage.getItem(COL_KEY) || '[]'); } catch (e) { return []; } }
function keepRobots() {
  const g = S.g, me = mySt(), list = loadCollection(), day = new Date().toISOString().slice(0, 10);
  g.robots.forEach((r, k) => {
    const round = g.myUsed.indexOf(k);
    list.push({ parts: Object.fromEntries(PARTS.map(p => [p, { m: r[p].m, v: r[p].v }])), k, st: me[k], pilot: g.pilotAt === k, rival: S.rivalName, game: S.game, r: round < 0 ? null : g.results[round], day });
  });
  try { localStorage.setItem(COL_KEY, JSON.stringify(list.slice(-COL_MAX))); } catch (e) {}
}
const colPics = {};
function colPic(x) {
  const key = JSON.stringify([x.parts, x.k]);
  if (!colPics[key] && ROBO) { const rig = rigFor(modelsOf(x.parts), MY_SCHEMES[x.k] || 'tricolor'); rig.setPaint(1); rig.setLights(true); rig.pose({ aim: .2 }); colPics[key] = ROBO.snapshot(rig, -.5, { cy: .53, dist: 2.5, h: .1 }); }
  return colPics[key] || '';
}
let colAt = 0;
function openCollection() { colAt = 0; showCollection(0); $('collection').hidden = false; }
function showCollection(i) {
  const list = loadCollection().reverse(), wins = list.filter(x => x.r > 0).length;
  colAt = Math.max(0, Math.min(i, list.length - 1));
  const res = r => r == null ? '' : `<span class="resChip ${r > 0 ? 'w' : r < 0 ? 'l' : 'd'}">${r > 0 ? '勝' : r < 0 ? '負' : '分'}</span>`;
  const x = list[colAt];
  const big = x ? `<div class="colBig">${viewCanvas(paintedView(x.parts, MY_SCHEMES[x.k] || 'tricolor', 5, { spin: true, aim: .3, frame: { cy: .55, dist: 2.6, h: .1 } }), 'galBot')}
      <div class="galInfo"><b>ROBOT ${x.k + 1}</b><span class="colWhen">${x.day}　対 ${x.rival}　第${x.game}試合</span>
        <div>${res(x.r)}${x.pilot ? '<span class="tag pilot">搭乗</span>' : ''}${x.st.set ? '<span class="tag set">SET</span>' : ''}</div>
        <span class="wpn">${weaponOf(x.parts)}</span>
        <div class="galStats"><span class="s">索敵<b>${x.st.s}</b></span><span class="a">攻撃<b>${x.st.a}</b></span><span class="d">防御<b>${x.st.d}</b></span></div>
        <div class="galParts">${PARTS.map(p => `<span><i class="chip ${x.parts[p].m}">${x.parts[p].m}</i>${PNAME[p]} ${x.parts[p].v}</span>`).join('')}</div></div></div>` : '';
  $('collection').innerHTML = `<div class="dialog colDialog"><div class="helpTop"><h2>これまでのXS <span class="sub">${list.length}体（出撃して勝った ${wins}体）</span></h2><button type="button" class="helpX" id="closeCollection" aria-label="閉じる">×</button></div>
    ${list.length ? big + `<div class="colGrid">${list.map((y, j) => `<button type="button" class="colItem ${j === colAt ? 'on' : ''}" data-col-pick="${j}"><img src="${colPic(y)}" alt=""><span class="colStat">${y.st.s}/${y.st.a}/${y.st.d}</span>${res(y.r)}</button>`).join('')}</div>`
      : '<p class="hint" style="text-align:left">まだありません。試合を終えると、組んだロボットがここに並びます。</p>'}</div>`;
}
$('collection').addEventListener('click', e => { if (e.target === $('collection')) $('collection').hidden = true; });
// ---------- the sound control: a button in the corner on every screen (over the battle too), opening sliders ----------
(() => {
  const w = document.createElement('div'); w.className = 'volCtl';
  w.innerHTML = `<button type="button" class="volBtn" aria-label="音量" aria-expanded="false"></button>
    <div class="volPanel" hidden><b>音量</b>
      <label>BGM<input type="range" min="0" max="100" data-vol="bgm"></label>
      <label>効果音<input type="range" min="0" max="100" data-vol="sfx"></label>
      <button type="button" class="volMute"></button></div>`;
  document.querySelector('.hudBtns').prepend(w);   // (battle3d.js lends it to the battle screen while one runs)
  const btn = w.querySelector('.volBtn'), panel = w.querySelector('.volPanel'), mute = w.querySelector('.volMute');
  const ICON = off => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>${off ? '<path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' : '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'}</svg>`;
  const sync = () => { const v = SFX.volume; btn.innerHTML = ICON(SFX.muted || (v.bgm + v.sfx === 0)); mute.textContent = SFX.muted ? '音を出す' : 'すべて消音'; w.querySelectorAll('[data-vol]').forEach(r => (r.value = Math.round(v[r.dataset.vol] * 100))); };
  btn.addEventListener('click', e => { e.stopPropagation(); SFX.unlock(); panel.hidden = !panel.hidden; btn.setAttribute('aria-expanded', String(!panel.hidden)); sync(); });
  w.addEventListener('click', e => e.stopPropagation());
  w.querySelectorAll('[data-vol]').forEach(r => r.addEventListener('input', () => { SFX.setVolume(r.dataset.vol, r.value / 100); if (SFX.muted && r.value > 0) SFX.setMuted(false); sync(); }));
  w.querySelectorAll('[data-vol="sfx"]').forEach(r => r.addEventListener('change', () => SFX.play('beep_1', { vol: .6 })));
  mute.addEventListener('click', () => { SFX.setMuted(!SFX.muted); sync(); });
  document.addEventListener('click', () => { if (!panel.hidden) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
  sync();
})();
titleScreen();
})();
