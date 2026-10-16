// Screen effects over the whole page: 2D particle canvas (sparks, confetti, shockwaves), big stamped words, flashes, shake.
window.FX = (() => {
  const cv = document.createElement('canvas');
  cv.id = 'fxCanvas';
  Object.assign(cv.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 60 });
  const layer = document.createElement('div');
  layer.id = 'fxLayer';
  Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 61, overflow: 'hidden' });
  document.body.append(cv, layer);
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function resize() { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  addEventListener('resize', resize); resize();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let P = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  // kinds: spark (streak), dot, star, confetti, ring, glow
  function burst(x, y, o = {}) {
    const n = reduce ? Math.ceil((o.n || 30) / 4) : (o.n || 30), cols = o.colors || ['#fff6c8', '#ffd23f', '#ff8a1f'];
    for (let i = 0; i < n; i++) {
      const a = o.dir != null ? o.dir + rnd(-(o.spread || .6), o.spread || .6) : rnd(0, Math.PI * 2), sp = rnd(o.min || 3, o.speed || 12);
      P.push({ k: o.kind || 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(.5, 1) * (o.life || 0.8), c: cols[i % cols.length],
        s: rnd(.6, 1.4) * (o.size || 3), g: o.gravity == null ? .25 : o.gravity, rot: rnd(0, 6), vr: rnd(-.3, .3), drag: o.drag || .94 });
    }
  }
  function ring(x, y, o = {}) { P.push({ k: 'ring', x, y, life: 0, max: o.life || .5, c: o.color || '#fff', r0: o.r0 || 10, r1: o.r1 || 220, w: o.width || 10 }); }
  function confetti(n = 140) {
    const cols = ['#ff3b5c', '#ffd23f', '#3bd6ff', '#7dff6a', '#c86bff', '#ffffff', '#ff8a1f'];
    for (let i = 0; i < (reduce ? 30 : n); i++) P.push({ k: 'confetti', x: rnd(0, W), y: rnd(-H * .6, -10), vx: rnd(-2, 2), vy: rnd(2, 6), life: 0, max: rnd(2.5, 4), c: cols[i % cols.length], s: rnd(6, 11), g: .06, rot: rnd(0, 6), vr: rnd(-.25, .25), drag: .995 });
  }
  function tick() {
    requestAnimationFrame(tick);
    ctx.clearRect(0, 0, W, H);
    if (!P.length) return;
    const dt = 1 / 60;
    ctx.globalCompositeOperation = 'lighter';
    P = P.filter(p => {
      p.life += dt; if (p.life > p.max) return false;
      const t = p.life / p.max, a = 1 - t;
      if (p.k === 'ring') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = p.c; ctx.globalAlpha = a; ctx.lineWidth = p.w * a + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - t, 3)), 0, 7); ctx.stroke();
        return true;
      }
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.globalAlpha = p.k === 'confetti' ? Math.min(1, a * 3) : a;
      ctx.fillStyle = p.c; ctx.strokeStyle = p.c;
      if (p.k === 'spark') { ctx.lineWidth = p.s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); ctx.stroke(); }
      else if (p.k === 'confetti') { ctx.globalCompositeOperation = 'source-over'; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 2)); ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); ctx.globalCompositeOperation = 'lighter'; }
      else if (p.k === 'star') { star(p.x, p.y, p.s * (1 + t), p.rot); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (p.k === 'glow' ? 1 + t * 2 : 1), 0, 7); ctx.fill(); }
      return p.y < H + 60;
    });
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function star(x, y, r, rot) { ctx.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * .35 : r, a = rot + i * Math.PI / 4; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
  requestAnimationFrame(tick);

  // full-screen colour flash
  function flash(color = '#fff', ms = 260, peak = .85) {
    const d = document.createElement('div');
    Object.assign(d.style, { position: 'absolute', inset: 0, background: color, opacity: peak, transition: `opacity ${ms}ms ease-out` });
    layer.append(d); requestAnimationFrame(() => requestAnimationFrame(() => (d.style.opacity = 0)));
    setTimeout(() => d.remove(), ms + 60);
  }
  // shake an element (default: the whole app)
  function shake(power = 10, ms = 400, el = document.getElementById('game')) {
    if (reduce || !el) return;
    const t0 = performance.now();
    (function step(now) {
      const t = (now - t0) / ms; if (t >= 1) { el.style.transform = ''; return; }
      const k = power * (1 - t) * (1 - t);
      el.style.transform = `translate(${rnd(-k, k)}px,${rnd(-k, k)}px) rotate(${rnd(-k, k) * .06}deg)`;
      requestAnimationFrame(step);
    })(t0);
  }
  // big stamped word in the middle of the screen. cls: 'gold' | 'red' | 'blue' | 'rainbow'
  function stamp(text, o = {}) {
    const d = document.createElement('div');
    d.className = 'fxStamp ' + (o.cls || 'gold');
    d.innerHTML = text + (o.sub ? `<small>${o.sub}</small>` : '');
    if (o.y != null) d.style.top = o.y;
    layer.append(d);
    setTimeout(() => d.classList.add('out'), o.ms || 1100);
    setTimeout(() => d.remove(), (o.ms || 1100) + 500);
    return d;
  }
  // diagonal speed-line banner (cut-in) with an optional portrait
  function cutin(o = {}) {
    const d = document.createElement('div');
    d.className = 'fxCutin ' + (o.side || 'left') + ' ' + (o.cls || '');
    d.innerHTML = `<div class="band"></div>${o.face ? `<img src="${o.face}" alt="">` : ''}<div class="txt"><b>${o.title || ''}</b><span>${o.text || ''}</span></div>`;
    layer.append(d);
    setTimeout(() => d.classList.add('out'), o.ms || 1300);
    setTimeout(() => d.remove(), (o.ms || 1300) + 450);
    return d;
  }
  // number that pops up and floats
  function popText(x, y, text, color = '#ffd23f', size = 28) {
    const d = document.createElement('div');
    d.className = 'fxPop'; d.textContent = text;
    Object.assign(d.style, { left: x + 'px', top: y + 'px', color, fontSize: size + 'px' });
    layer.append(d); setTimeout(() => d.remove(), 1100);
  }
  const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const wait = ms => new Promise(r => setTimeout(r, reduce ? Math.min(ms, 120) : ms));
  return { burst, ring, confetti, flash, shake, stamp, cutin, popText, center, wait, reduce, layer };
})();
