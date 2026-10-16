// The battle scene: a dusk city arena in full screen. Two robots drop in, scan, shoot (each weapon its own way), guard
// or blow up. BATTLE.play(spec) resolves when the player taps after the finish.
window.BATTLE = (() => {
  if (!window.THREE || !window.ROBO) return null;
  const X = 1.7, TAU = Math.PI * 2, V = (x, y, z) => new THREE.Vector3(x, y, z), rnd = (a, b) => a + Math.random() * (b - a);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let R = null, scene, camera, overlay, hud, canvas;
  let clock = 0, timeScale = 1, last = 0, running = false, skipping = false;
  const base = () => (skipping ? 6 : 1);
  const timers = [], tickers = new Set();
  const ease = { lin: t => t, out: t => 1 - Math.pow(1 - t, 3), in: t => t * t * t, io: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, back: t => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2) };
  const tween = (ms, fn = () => {}, e = ease.io) => new Promise(res => timers.push({ t0: clock, d: Math.max(.001, ms / 1000), fn, e, res }));
  const wait = ms => tween(ms);

  // ---------- textures made in code
  function canvasTex(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; }
  let TEX;
  function textures() {
    const glow = canvasTex(128, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.75)'); r.addColorStop(.6, 'rgba(255,255,255,.18)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); });
    const smoke = canvasTex(128, (g, s) => { for (let i = 0; i < 14; i++) { const x = s / 2 + rnd(-22, 22), y = s / 2 + rnd(-22, 22), rr = rnd(18, 40), r = g.createRadialGradient(x, y, 0, x, y, rr); r.addColorStop(0, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); } });
    const spark = canvasTex(64, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.15, 'rgba(255,255,255,.9)'); r.addColorStop(.4, 'rgba(255,255,255,.1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); });
    const windows = canvasTex(256, (g, s) => { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); for (let y = 8; y < s; y += 16) for (let x = 6; x < s; x += 12) if (Math.random() < .35) { g.fillStyle = Math.random() < .7 ? '#ffcf86' : '#9fd8ff'; g.globalAlpha = rnd(.4, 1); g.fillRect(x, y, 6, 7); } g.globalAlpha = 1; });
    windows.wrapS = windows.wrapT = THREE.RepeatWrapping;
    return { glow, smoke, spark, windows };
  }

  // ---------- particles (sprites from a pool)
  const parts = [];
  function sprite(o) {
    let p = parts.find(q => !q.alive);
    if (!p) { if (parts.length > 700) return null; const m = new THREE.SpriteMaterial({ map: TEX.glow, depthWrite: false, transparent: true }); p = { s: new THREE.Sprite(m) }; scene.add(p.s); parts.push(p); }
    const m = p.s.material;
    m.map = o.tex || TEX.glow; m.blending = o.normal ? THREE.NormalBlending : THREE.AdditiveBlending; m.color.set(o.color || '#ffffff'); m.rotation = o.rot || rnd(0, TAU); m.opacity = o.alpha == null ? 1 : o.alpha;
    Object.assign(p, { alive: true, life: 0, max: o.life || .6, pos: o.pos.clone(), vel: o.vel ? o.vel.clone() : V(0, 0, 0), s0: o.size || .3, s1: o.size1 == null ? (o.size || .3) : o.size1, a0: o.alpha == null ? 1 : o.alpha, g: o.g || 0, drag: o.drag || 1, spin: o.spin || 0, fadeIn: o.fadeIn || 0 });
    p.s.visible = true; p.s.position.copy(p.pos); p.s.scale.setScalar(p.s0);
    return p;
  }
  function updateParts(dt) {
    for (const p of parts) {
      if (!p.alive) continue;
      p.life += dt; const t = p.life / p.max;
      if (t >= 1) { p.alive = false; p.s.visible = false; continue; }
      p.vel.multiplyScalar(Math.pow(p.drag, dt * 60)); p.vel.y -= p.g * dt; p.pos.addScaledVector(p.vel, dt);
      p.s.position.copy(p.pos); p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * ease.out(t));
      p.s.material.rotation += p.spin * dt;
      p.s.material.opacity = p.a0 * (p.fadeIn && t < p.fadeIn ? t / p.fadeIn : 1) * (1 - Math.pow(t, 1.6));
    }
  }
  const lights = [];
  function flashLight(pos, color, power = 6, ms = 300) {
    let L = lights.find(l => !l.busy);
    if (!L) { if (lights.length > 5) return; L = { l: new THREE.PointLight(color, 0, 8, 2) }; scene.add(L.l); lights.push(L); }
    L.busy = true; L.l.color.set(color); L.l.position.copy(pos);
    tween(ms, k => (L.l.intensity = power * (1 - k)), ease.out).then(() => { L.l.intensity = 0; L.busy = false; });
  }

  // ---------- effects
  function explosion(pos, big = 1) {
    sprite({ pos, size: .4 * big, size1: 2.2 * big, life: .22, color: '#fff2c8', alpha: .9 });
    for (let i = 0; i < (reduce ? 3 : 7); i++) sprite({ pos: pos.clone().add(V(rnd(-.25, .25), rnd(-.1, .3), rnd(-.25, .25)).multiplyScalar(big)), vel: V(rnd(-.6, .6), rnd(.2, 1.4), rnd(-.6, .6)).multiplyScalar(big), size: .25 * big, size1: rnd(.8, 1.4) * big, life: rnd(.45, .8), color: ['#ff9a2a', '#ff6a14', '#ff4a10', '#ffc040'][i % 4], alpha: .75, drag: .9 });
    for (let i = 0; i < (reduce ? 4 : 10); i++) sprite({ pos: pos.clone().add(V(rnd(-.3, .3), rnd(0, .3), rnd(-.3, .3))), vel: V(rnd(-.5, .5), rnd(.5, 1.3), rnd(-.5, .5)).multiplyScalar(big), size: .4 * big, size1: rnd(1.4, 2.2) * big, life: rnd(1.4, 2.4), color: '#2a2228', normal: true, alpha: .75, tex: TEX.smoke, drag: .95, fadeIn: .1, spin: rnd(-1, 1) });
    for (let i = 0; i < (reduce ? 8 : 34); i++) { const d = V(rnd(-1, 1), rnd(-.1, 1.2), rnd(-1, 1)).normalize(); sprite({ pos, vel: d.multiplyScalar(rnd(3, 8) * big), size: rnd(.05, .11), size1: .02, life: rnd(.4, .9), color: i % 3 ? '#ffd27a' : '#ffffff', g: 9, drag: .96, tex: TEX.spark }); }
    groundRing(V(pos.x, .02, pos.z), '#ffb35a', 2.6 * big, .5);
    flashLight(pos.clone().add(V(0, .4, 0)), '#ffa040', 10 * big, 500);
    shake(.12 * big, 500);
  }
  function groundRing(pos, color, r1 = 2, life = .45) {
    const m = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.copy(pos); scene.add(m);
    tween(life * 1000, k => { m.scale.setScalar(.1 + r1 * k); m.material.opacity = 1 - k; }, ease.out).then(() => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
  }
  function dust(pos, n = 14) {
    for (let i = 0; i < (reduce ? 4 : n); i++) { const a = i / n * TAU; sprite({ pos: pos.clone().add(V(Math.cos(a) * .3, .05, Math.sin(a) * .3)), vel: V(Math.cos(a) * rnd(1.5, 3), rnd(.1, .5), Math.sin(a) * rnd(1.5, 3)), size: .3, size1: rnd(.9, 1.4), life: rnd(.8, 1.3), color: '#8a7a6a', normal: true, alpha: .55, tex: TEX.smoke, drag: .9 }); }
  }
  function sparksAt(pos, color = '#9fe8ff', n = 18, dir = null) {
    for (let i = 0; i < (reduce ? 5 : n); i++) { const d = dir ? dir.clone().add(V(rnd(-.7, .7), rnd(-.4, .9), rnd(-.7, .7))).normalize() : V(rnd(-1, 1), rnd(-.2, 1), rnd(-1, 1)).normalize(); sprite({ pos, vel: d.multiplyScalar(rnd(2.5, 6)), size: rnd(.05, .1), size1: .02, life: rnd(.25, .55), color: i % 2 ? color : '#ffffff', g: 7, tex: TEX.spark }); }
    sprite({ pos, size: .2, size1: .9, life: .18, color });
  }
  function beam(from, to, color, width = 1, life = 380) {
    const dir = to.clone().sub(from), len = dir.length();
    const grp = new THREE.Group();
    const mk = (r, c, o) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false })); grp.add(m); return m; };
    const core = mk(.025 * width, '#ffffff', 1), outer = mk(.075 * width, color, .7), halo = mk(.16 * width, color, .25);
    grp.position.copy(from).addScaledVector(dir, .5); grp.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()); grp.scale.set(1, len, 1);
    scene.add(grp);
    sprite({ pos: from, size: .4 * width, size1: 1.1 * width, life: .25, color });
    return tween(life, k => { const w = k < .15 ? k / .15 : 1 - (k - .15) / .85; grp.scale.set(w * 1.2 + .05, len, w * 1.2 + .05); core.material.opacity = w; outer.material.opacity = .7 * w; halo.material.opacity = .25 * w; }, ease.lin)
      .then(() => { scene.remove(grp); grp.children.forEach(m => { m.geometry.dispose(); m.material.dispose(); }); });
  }
  // a glowing slug flying from a to b in ms (shells, bullets, missiles), leaving smoke
  function projectile(a, b, ms, o = {}) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(o.r || .05, 8, 6), new THREE.MeshBasicMaterial({ color: o.color || '#ffd27a' }));
    head.scale.set(1, 1, o.stretch || 2.5); scene.add(head);
    const glow = sprite({ pos: a, size: o.glow || .35, life: ms / 1000 + .05, color: o.color || '#ffb040' });
    const ctrl = o.arc ? a.clone().lerp(b, .4).add(o.arc) : null, p = V(0, 0, 0), prev = a.clone();
    let acc = 0;
    return tween(ms, k => {
      if (ctrl) { const u = 1 - k; p.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(ctrl, 2 * u * k).addScaledVector(b, k * k); } else p.copy(a).lerp(b, k);
      head.position.copy(p); head.lookAt(p.clone().add(p.clone().sub(prev).normalize().multiplyScalar(-1).negate())); if (glow) { glow.pos.copy(p); }
      acc++; if (o.smoke && acc % 1 === 0) sprite({ pos: p, vel: V(rnd(-.1, .1), rnd(.1, .3), rnd(-.1, .1)), size: .12, size1: .5, life: .7, color: '#cfc8c0', normal: true, alpha: .45, tex: TEX.smoke });
      if (o.trail) sprite({ pos: p, size: .12, size1: .02, life: .2, color: o.color || '#ffb040' });
      prev.copy(p);
    }, o.ease || ease.lin).then(() => { scene.remove(head); head.geometry.dispose(); head.material.dispose(); });
  }
  function shield(pos, facing, color) {
    const grp = new THREE.Group();
    const hex = new THREE.Mesh(new THREE.CircleGeometry(.75, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CircleGeometry(.75, 6)), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending }));
    const inner = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CircleGeometry(.45, 6)), new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending }));
    grp.add(hex, edge, inner); grp.position.copy(pos); grp.rotation.y = facing; scene.add(grp);
    flashLight(pos, color, 5, 400);
    return tween(650, k => { const s = k < .15 ? ease.back(k / .15) : 1; grp.scale.setScalar(s); const a = k < .5 ? 1 : 1 - (k - .5) / .5; hex.material.opacity = .45 * a + (k < .1 ? .5 : 0); edge.material.opacity = a; inner.material.opacity = a; grp.rotation.z = k * .6; }, ease.lin)
      .then(() => { scene.remove(grp); grp.children.forEach(m => { m.geometry.dispose(); m.material.dispose(); }); });
  }
  function slashArc(pos, facing, color) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(.55, .04, 6, 40, Math.PI * 1.1), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const m2 = new THREE.Mesh(new THREE.TorusGeometry(.55, .012, 4, 40, Math.PI * 1.1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const g = new THREE.Group(); g.add(m, m2); g.position.copy(pos); g.rotation.set(0, facing, -.9); scene.add(g);
    return tween(380, k => { g.scale.set(1 + k * .5, 1 + k * .5, 1 + k * 3); m.material.opacity = 1 - k; m2.material.opacity = 1 - k; g.rotation.z = -.9 - k * 1.2; }, ease.out)
      .then(() => { scene.remove(g); [m, m2].forEach(x => { x.geometry.dispose(); x.material.dispose(); }); });
  }

  // ---------- camera with shake
  const cam = { pos: V(0, 2, 8), look: V(0, .6, 0), shakeAmp: 0, shakeT: 0, fov: 42 };
  function shake(a, ms) { if (reduce) return; cam.shakeAmp = Math.max(cam.shakeAmp, a); cam.shakeT = Math.max(cam.shakeT, ms / 1000); }
  function camTo(pos, look, ms, e = ease.io, fov) {
    const p0 = cam.pos.clone(), l0 = cam.look.clone(), f0 = cam.fov;
    if (ms <= 0) { cam.pos.copy(pos); cam.look.copy(look); if (fov) cam.fov = fov; return Promise.resolve(); }
    return tween(ms, k => { cam.pos.lerpVectors(p0, pos, k); cam.look.lerpVectors(l0, look, k); if (fov) cam.fov = f0 + (fov - f0) * k; }, e);
  }
  function applyCam(dt) {
    camera.position.copy(cam.pos);
    if (cam.shakeT > 0) { cam.shakeT -= dt; const a = cam.shakeAmp * Math.max(0, cam.shakeT) * 2; camera.position.add(V(rnd(-a, a), rnd(-a, a), rnd(-a, a))); if (cam.shakeT <= 0) cam.shakeAmp = 0; }
    camera.lookAt(cam.look);
    if (camera.fov !== cam.fov) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  }

  // ---------- the arena (built once)
  function build() {
    canvas = document.createElement('canvas');
    try { R = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (e) { return false; }
    R.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75)); R.outputEncoding = THREE.sRGBEncoding;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.1;
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    TEX = textures();
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x4a3048, .028);
    camera = new THREE.PerspectiveCamera(42, 1, .05, 400);
    // sky: dusk gradient with a low sun
    const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sun: { value: V(-.75, .12, -.65).normalize() } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 sun; varying vec3 vD;
        void main(){ float h = vD.y; vec3 top = vec3(.02,.03,.12), mid = vec3(.22,.08,.28), hor = vec3(1.0,.42,.18);
          vec3 c = mix(hor, mid, smoothstep(0.0, .22, h)); c = mix(c, top, smoothstep(.2, .7, h)); c = mix(c, vec3(.12,.06,.1), smoothstep(0.0,-.2,h));
          float s = max(dot(vD, sun), 0.0); c += vec3(1.0,.55,.25) * pow(s, 18.0) * .9 + vec3(1.0,.85,.6) * pow(s, 400.0) * 4.0;
          gl_FragColor = vec4(c, 1.0); }` }));
    scene.add(sky);
    // stars
    const sg = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 500; i++) { const a = rnd(0, TAU), e = rnd(.25, 1.4); sp.push(Math.cos(a) * Math.cos(e) * 180, Math.sin(e) * 180, Math.sin(a) * Math.cos(e) * 180); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: .7 })));
    scene.add(new THREE.HemisphereLight(0x9a90ff, 0x3a2420, .75));
    const sun = new THREE.DirectionalLight(0xffb27a, 2.4); sun.position.set(-8, 6, -7); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 }); sun.shadow.bias = -.002;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x6ab4ff, .9); fill.position.set(6, 3, 8); scene.add(fill);
    const key = new THREE.DirectionalLight(0xfff0e0, 1.5); key.position.set(-2, 4, 6); scene.add(key);
    // ground
    const loader = new THREE.TextureLoader();
    const tex = (f, srgb) => { const t = loader.load('tex/' + f); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60); if (srgb) t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t; };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ map: tex('asphalt_a.jpg', true), normalMap: tex('asphalt_n.jpg'), roughness: .85, metalness: .1, color: 0x6e6468 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    // the battle pad: glowing rings and a line between the two sides
    const padMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .4, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const [x, c] of [[-X, '#3dc8ff'], [X, '#ff4b5c']]) {
      for (const [r0, r1] of [[.78, .82], [.95, .97]]) { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 64), padMat(c)); m.rotation.x = -Math.PI / 2; m.position.set(x, .012, 0); scene.add(m); }
      const hex = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.2, 6), padMat(c)); hex.rotation.x = -Math.PI / 2; hex.position.set(x, .012, 0); scene.add(hex);
    }
    const line = new THREE.Mesh(new THREE.PlaneGeometry(X * .9, .03), padMat('#ffd23f')); line.rotation.x = -Math.PI / 2; line.position.y = .012; scene.add(line);
    // city blocks all round with lit windows
    const metalT = loader.load('tex/metal_a.jpg'); metalT.encoding = THREE.sRGBEncoding; metalT.wrapS = metalT.wrapT = THREE.RepeatWrapping;
    const boxG = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 70; i++) {
      const a = rnd(0, TAU), d = rnd(11, 45), h = rnd(2, 12) * (d > 25 ? 1.5 : 1), w = rnd(2, 5), dd = rnd(2, 5);
      const wt = TEX.windows.clone(); wt.needsUpdate = true; wt.repeat.set(w / 3, h / 3);
      const b = new THREE.Mesh(boxG, new THREE.MeshStandardMaterial({ map: metalT, color: new THREE.Color().setHSL(rnd(.6, .75), .15, rnd(.12, .25)), roughness: .7, metalness: .4, emissive: 0xffffff, emissiveMap: wt, emissiveIntensity: .9 }));
      b.scale.set(w, h, dd); b.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d); b.rotation.y = rnd(0, TAU); b.castShadow = d < 16; scene.add(b);
      if (Math.random() < .3) { const l = sprite({ pos: V(b.position.x, h + .3, b.position.z), size: .5, life: 1e9, color: Math.random() < .5 ? '#ff3b3b' : '#ffd23f' }); }
    }
    // rocks and rubble near the pad
    const rockM = new THREE.MeshStandardMaterial({ map: loader.load('tex/concretep_a.jpg', t => (t.encoding = THREE.sRGBEncoding)), roughness: .95, color: 0x8a7e80, flatShading: true });
    for (let i = 0; i < 26; i++) {
      const g = new THREE.DodecahedronGeometry(rnd(.15, .6), 0), p = g.attributes.position;
      for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * rnd(.7, 1.3), p.getY(k) * rnd(.5, 1), p.getZ(k) * rnd(.7, 1.3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, rockM), a = rnd(0, TAU), d = rnd(4, 10);
      m.position.set(Math.cos(a) * d, .05, Math.sin(a) * d * .8 - (Math.sin(a) > 0 ? 0 : 1)); m.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); m.castShadow = m.receiveShadow = true; scene.add(m);
    }
    // floating embers
    tickers.add(dt => { if (Math.random() < dt * 6) sprite({ pos: V(rnd(-8, 8), rnd(0, .5), rnd(-6, 3)), vel: V(rnd(-.2, .2), rnd(.3, .8), rnd(-.2, .2)), size: .04, size1: .02, life: rnd(2, 4), color: '#ffb060', tex: TEX.spark, fadeIn: .2 }); });
    return true;
  }
  function resize() { if (!R) return; const w = innerWidth, h = innerHeight; R.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); cam.fov = cam.fov; }
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const rdt = Math.min(.05, (now - last) / 1000 || 0); last = now;
    const dt = rdt * timeScale; clock += dt;
    for (let i = timers.length - 1; i >= 0; i--) { const t = timers[i], k = Math.min(1, (clock - t.t0) / t.d); t.fn(t.e(k)); if (k >= 1) { timers.splice(i, 1); t.res(); } }
    tickers.forEach(f => f(dt, clock));
    updateParts(dt);
    applyCam(rdt);
    R.render(scene, camera);
  }

  // ---------- HUD
  const statBox = (s, side) => `<div class="bStats">${[['索敵', 's'], ['攻撃', 'a'], ['防御', 'd']].map(([n, k]) => `<span data-st="${side}${k}"><i>${n}</i><b>${s[k]}</b></span>`).join('')}</div>`;
  function hudHTML(sp) {
    return `<div class="bPlate me"><img src="${sp.me.face}" alt=""><div><small>${sp.me.label}</small><b>${sp.me.name}</b>${statBox(sp.me.st, 'me')}<em>${sp.me.weapon}</em></div></div>
      <div class="bPlate cpu"><img src="${sp.cpu.face}" alt=""><div><small>${sp.cpu.label}</small><b>${sp.cpu.name}</b>${statBox(sp.cpu.st, 'cpu')}<em>${sp.cpu.weapon}</em></div></div>
      <div class="bRound">${sp.title}</div>
      <button type="button" class="bSkip">スキップ ▶▶</button><div class="bTap" hidden>タップで次へ</div>`;
  }
  const hl = (key, on = true) => { const el = hud.querySelector(`[data-st="${key}"]`); if (el) el.classList.toggle('hot', on); };

  // ---------- one fight
  async function play(sp) {
    if (!R && !build()) return null;
    overlay = document.createElement('div'); overlay.className = 'battleOverlay';
    hud = document.createElement('div'); hud.className = 'bHud'; hud.innerHTML = hudHTML(sp);
    overlay.append(canvas, hud); document.body.append(overlay);
    timeScale = 1; skipping = false; clock = 0; timers.length = 0; cam.fov = 42;
    resize(); addEventListener('resize', resize);
    const skipBtn = hud.querySelector('.bSkip');
    skipBtn.onclick = e => { e.stopPropagation(); skipping = true; timeScale = 6; skipBtn.hidden = true; };
    running = true; last = performance.now(); requestAnimationFrame(frame);

    // the robots: you on the left facing right, the rival on the right facing left
    const mk = (side, s) => {
      const rig = new ROBO.Rig(s.models, { scheme: s.scheme, painted: true }); rig.setLights(true);
      rig.root.position.set(side === 'me' ? -X : X, 0, 0); rig.root.rotation.y = side === 'me' ? -Math.PI / 2 : Math.PI / 2;
      rig.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
      scene.add(rig.root); return rig;
    };
    const A = { me: mk('me', sp.me), cpu: mk('cpu', sp.cpu) };
    const team = { me: '#5ff0ff', cpu: '#ff5a6e' };
    const pose = { me: { aim: 0, aimL: 0, lean: 0, twist: 0 }, cpu: { aim: 0, aimL: 0, lean: 0, twist: 0 } };
    const idle = (dt, t) => { for (const k of ['me', 'cpu']) { const p = pose[k], r = A[k]; if (r.dead) continue; r.pose({ ...p, bob: Math.sin(t * 2.2 + (k === 'me' ? 0 : 1.3)) * .008 }); } };
    tickers.add(idle);
    const other = k => k === 'me' ? 'cpu' : 'me';
    const facing = k => k === 'me' ? 1 : -1;
    const chest = k => A[k].root.position.clone().add(V(0, .62, 0));

    // --- 1. drop in
    SFX.play('catapult_1', { vol: .7 }); SFX.duck(.15, 2);
    for (const k of ['me', 'cpu']) A[k].root.position.y = 7;
    await camTo(V(0, 3.4, 10), V(0, 1.4, 0), 0);
    camTo(V(0, .95, 4.4), V(0, .55, 0), 2100, ease.io);
    const thrusters = (dt) => { for (const k of ['me', 'cpu']) { const r = A[k]; if (r.root.position.y > .02) { const p = r.root.position.clone(); sprite({ pos: p.clone().add(V(rnd(-.08, .08), .05, rnd(-.08, .08))), vel: V(0, -3, 0), size: .28, size1: .05, life: .25, color: team[k] }); sprite({ pos: p.clone().add(V(0, .1, 0)), size: .5, life: .05, color: '#ffffff', alpha: .5 }); } } };
    tickers.add(thrusters);
    SFX.play('jet_1', { vol: .5 });
    await Promise.all(['me', 'cpu'].map((k, i) => wait(i * 250).then(() => tween(1300, e => { A[k].root.position.y = 7 * (1 - e); pose[k].lean = .25 * (1 - e); pose[k].aimL = .5 * (1 - e); }, ease.out)).then(() => {
      A[k].root.position.y = 0; dust(A[k].root.position.clone()); groundRing(A[k].root.position.clone().setY(.03), team[k], 2.2, .5); shake(.1, 350); SFX.play('impact_1', { vol: .8, pan: facing(k) * -.5 });
      return tween(220, e => (pose[k].lean = .2 * Math.sin(e * Math.PI)));
    })));
    tickers.delete(thrusters);
    FX.cutin({ side: 'left', face: sp.me.face, title: sp.me.name, text: sp.me.line, cls: 'me', ms: 1200 });
    await wait(450);
    FX.cutin({ side: 'right', face: sp.cpu.face, title: sp.cpu.name, text: sp.cpu.line, cls: 'cpu', ms: 1200 });
    SFX.play('beep_2');
    await wait(900);
    FX.stamp('FIGHT!!', { cls: 'rainbow', ms: 700 }); SFX.play('clamp_1'); FX.flash('#fff', 180, .5); shake(.08, 300);
    await wait(700);

    // --- 2. scan
    hl('mes'); hl('cpus');
    await camTo(V(0, 1.9, 3.3), V(0, .75, 0), 500);
    for (const k of ['me', 'cpu']) { const hp = A[k].root.position.clone().add(V(0, .92, 0)); for (let i = 0; i < 3; i++) wait(i * 260).then(() => { groundRing(hp, team[k], 1.6, .6); SFX.play('beep_1', { vol: .5, rate: 1 + i * .15, pan: facing(k) * -.6 }); }); }
    await wait(900);
    const sMe = sp.me.st.s, sCpu = sp.cpu.st.s;
    const first = sp.flow.first;
    FX.stamp(first === 'both' ? '同時攻撃！' : first === 'me' ? '先制！' : '先制された！', { cls: first === 'cpu' ? 'red' : 'gold', sub: `索敵 ${sMe} ${sMe > sCpu ? '＞' : sMe < sCpu ? '＜' : '＝'} ${sCpu}`, ms: 1000 });
    SFX.play(first === 'cpu' ? 'techfail_1' : 'techok_1', { vol: .6 });
    await wait(1100);
    hl('mes', false); hl('cpus', false);

    // --- 3. attacks
    const fire = async (k, hit, solo = true) => {
      const cam2 = (...a) => (solo ? camTo(...a) : Promise.resolve());
      const r = A[k], t = other(k), kind = r.kind || 'beam', tgt = chest(t), f = facing(k);
      hl(k + 'a'); hl(t + 'd');
      const shoulder = V(r.root.position.x - f * 1.25, 1.05, 1.1);
      await cam2(shoulder, V(A[t].root.position.x, .65, 0), 450, ease.io, 46);
      const label = `攻撃 ${sp[k].st.a} ${hit ? '＞' : '≦'} 防御 ${sp[t].st.d}`;
      if (kind === 'sword') {
        SFX.play('ignite_1', { vol: .8 });
        await tween(300, e => { pose[k].aim = 1.6 * e; pose[k].lean = -.15 * e; });
        const x0 = r.root.position.x, x1 = A[t].root.position.x - f * .75;
        SFX.play('thrust_1');
        cam2(V((x0 + x1) / 2, 1.0, 2.4), V(A[t].root.position.x, .6, 0), 300);
        await tween(300, e => { r.root.position.x = x0 + (x1 - x0) * e; sprite({ pos: r.root.position.clone().add(V(-f * .2, .5, 0)), vel: V(-f * 3, 0, 0), size: .3, size1: .05, life: .2, color: team[k] }); }, ease.in);
        SFX.play('swing_1');
        await tween(140, e => { pose[k].aim = 1.6 - 1.9 * e; pose[k].lean = .3 * e; });
        slashArc(tgt.clone().add(V(-f * .15, .1, 0)), f > 0 ? 0 : Math.PI, '#ff8a3a');
        await impact(k, t, hit, kind, label);
        await tween(350, e => { r.root.position.x = x1 + (x0 - x1) * e; pose[k].aim = -.3 * (1 - e); pose[k].lean = .3 * (1 - e); });
        return;
      }
      await tween(330, e => { pose[k].aim = e; pose[k].twist = -f * .0 * e; });
      const mz = () => r.muzzleWorld();
      if (kind === 'beam') {
        SFX.play('charge_1', { vol: .45, rate: 1.6 });
        for (let i = 0; i < 8; i++) sprite({ pos: mz().add(V(rnd(-.3, .3), rnd(-.3, .3), rnd(-.3, .3))), vel: V(0, 0, 0), size: .08, size1: .01, life: .35, color: team[k], tex: TEX.spark });
        await wait(380);
        SFX.play('beam_1');
        const end = hit ? tgt : tgt.clone().add(V(-f * .55, .05, 0));
        beam(mz(), end, team[k], 1.1, 420); flashLight(mz(), team[k], 6, 250);
        await tween(70, e => (pose[k].aim = 1 + .12 * Math.sin(e * Math.PI)));
      } else if (kind === 'sniper') {
        sprite({ pos: mz(), size: .05, size1: .25, life: .5, color: '#ff3040' });
        SFX.play('beep_1', { rate: 1.6 }); await wait(420);
        SFX.play('sniper_1');
        sprite({ pos: mz(), size: .6, size1: 1.4, life: .2, color: '#ffe0a0' }); flashLight(mz(), '#ffd080', 8, 200);
        beam(mz(), hit ? tgt : tgt.clone().add(V(-f * .55, .05, 0)), '#ffe9b0', .35, 260);
        await tween(120, e => { pose[k].aim = 1 + .25 * Math.sin(e * Math.PI); pose[k].lean = -.12 * Math.sin(e * Math.PI); });
      } else if (kind === 'gun') {
        for (let i = 0; i < 14; i++) {
          const from = mz();
          sprite({ pos: from, size: .25, size1: .5, life: .06, color: '#ffd27a' });
          if (i % 2 === 0) SFX.play(i % 4 ? 'gun_1' : 'gun_2', { vol: .5 });
          projectile(from, tgt.clone().add(V(-f * (hit ? 0 : .55), rnd(-.12, .12), rnd(-.15, .15))), 120, { r: .025, stretch: 6, color: '#ffe08a', glow: .14 }).then(() => (hit ? sparksAt(tgt.clone().add(V(-f * .1, rnd(-.1, .1), rnd(-.1, .1))), '#ffd27a', 4) : 0));
          pose[k].aim = 1 + rnd(-.03, .06);
          await wait(55);
        }
        await wait(100);
      } else if (kind === 'shell') {
        SFX.play('rocket_1');
        const from = mz(); sprite({ pos: from, size: .6, size1: 1.3, life: .25, color: '#ffb040' }); dust(from.clone().add(V(-f * .3, 0, 0)), 5);
        tween(160, e => { pose[k].aim = 1 + .3 * Math.sin(e * Math.PI); pose[k].lean = -.2 * Math.sin(e * Math.PI); });
        cam2(V(0, 1.0, 2.6), tgt, 380);
        await projectile(from, hit ? tgt : tgt.clone().add(V(-f * .6, 0, 0)), 380, { r: .07, stretch: 2, color: '#ffc060', glow: .5, smoke: true });
      } else if (kind === 'missile') {
        SFX.play('rocket_2'); SFX.play('rocket_1', { delay: .15, vol: .7 });
        cam2(V(0, 1.7, 3.6), tgt.clone().add(V(0, .5, 0)), 500);
        const shots = [];
        for (let i = 0; i < 6; i++) { const from = mz().add(V(0, .05 * i, 0)); shots.push(wait(i * 70).then(() => projectile(from, tgt.clone().add(V(-f * (hit ? .05 : .6), rnd(-.15, .2), rnd(-.25, .25))), 650, { r: .035, stretch: 3, color: '#ffe0b0', glow: .25, smoke: true, arc: V(-f * .2, rnd(1.6, 2.6), rnd(-1.2, 1.2)), ease: ease.in }).then(() => { if (i % 2 === 0 && hit) { sparksAt(tgt, '#ffb040', 6); SFX.play('explosion_2', { vol: .4, rate: 1.3 }); } }))); }
        await Promise.all(shots);
      }
      await impact(k, t, hit, kind, label);
      tween(300, e => (pose[k].aim = 1 - .4 * e));
    };
    // what happens at the target
    const impact = async (k, t, hit, kind, label) => {
      const tgt = chest(t), f = facing(k);
      if (hit) {
        timeScale = base() * .2; // hit stop
        A[t].flash(1.1, '#ffd8a0');
        explosion(tgt.clone().add(V(-f * .2, 0, 0)), kind === 'shell' || kind === 'missile' ? 1.15 : .85);
        SFX.play(kind === 'sword' ? 'saberhit_1' : 'explosion_1', { vol: 1 }); SFX.duck(.1, 1.5);
        FX.flash('#fff', 220, .55); FX.shake(14, 450);
        FX.stamp('HIT!!', { cls: k === 'me' ? 'gold' : 'red', sub: label, ms: 900 });
        await wait(70); timeScale = base();
        tween(500, e => { A[t].flash(1.1 * (1 - e)); pose[t].lean = .45 * Math.sin(e * Math.PI) * (1 - e * .5); A[t].root.position.x += f * .004; });
        await wait(600);
      } else {
        const sp2 = A[t].root.position.clone().add(V(-f * .55, .6, 0));
        shield(sp2, Math.PI / 2, team[t]);
        sparksAt(sp2, team[t], 26, V(-f, .3, 0));
        SFX.play('impact_2', { vol: .9 }); SFX.play('clamp_2', { vol: .7 });
        FX.stamp('GUARD!', { cls: 'blue', sub: label, ms: 900 }); shake(.06, 250);
        tween(250, e => (pose[t].aimL = .9 * Math.sin(e * Math.PI)));
        await wait(950);
      }
      hl(k + 'a', false); hl(t + 'd', false);
    };

    for (const st of sp.flow.steps) {
      if (st.by === 'both') {
        await camTo(V(0, 1.05, 4.0), V(0, .65, 0), 400, ease.io, 44);
        await Promise.all([fire('me', st.hitMe, false), wait(140).then(() => fire('cpu', st.hitCpu, false))]);
        continue;
      }
      await fire(st.by, st.hit);
    }

    // --- 4. finish
    const r = sp.flow.r, winner = r > 0 ? 'me' : r < 0 ? 'cpu' : null, loser = winner && other(winner);
    if (loser) {
      const L = A[loser], lp = L.root.position.clone();
      await camTo(V(lp.x + facing(loser) * -1.7, 1.05, 2.0), lp.clone().add(V(0, .5, 0)), 400);
      timeScale = base() * .45;
      for (let i = 0; i < 4; i++) { explosion(lp.clone().add(V(rnd(-.2, .2), rnd(.3, .9), rnd(-.2, .2))), .55); SFX.play('explosion_2', { vol: .7, rate: rnd(.9, 1.2) }); L.flash(1.2, '#ffb060'); await wait(170); }
      SFX.play('destroyed_1', { vol: 1 }); SFX.duck(.05, 3);
      FX.flash('#ffe9c0', 500, .9); FX.shake(26, 900);
      explosion(lp.clone().add(V(0, .55, 0)), 2.1);
      L.dead = true; L.burn(1); L.flash(0);
      // the head flies off
      const head = L.headPivot, hv = V(rnd(-.8, .8) + facing(winner) * 1.6, 4.5, rnd(-1, 1)), hs = V(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9));
      const hw = new THREE.Vector3(); head.getWorldPosition(hw); scene.attach(head);
      const fall = dt => { if (head.position.y > .05) { hv.y -= 9.8 * dt; head.position.addScaledVector(hv, dt); head.rotation.x += hs.x * dt; head.rotation.y += hs.y * dt; sprite({ pos: head.position, size: .2, size1: .5, life: .5, color: '#3a3036', normal: true, alpha: .6, tex: TEX.smoke }); } else if (!fall.done) { fall.done = true; head.position.y = .05; sparksAt(head.position.clone(), '#ffb040', 12); SFX.play('impact_2', { vol: .6 }); } };
      tickers.add(fall);
      const smoke = dt => { if (Math.random() < dt * 30) sprite({ pos: lp.clone().add(V(rnd(-.25, .25), rnd(.3, .6), rnd(-.25, .25))), vel: V(rnd(-.1, .1), rnd(.6, 1.2), rnd(-.1, .1)), size: .3, size1: 1.4, life: 2.2, color: '#1e1a1e', normal: true, alpha: .6, tex: TEX.smoke, fadeIn: .1 }); if (Math.random() < dt * 8) sprite({ pos: lp.clone().add(V(rnd(-.2, .2), rnd(.2, .7), rnd(-.2, .2))), vel: V(0, rnd(.3, .8), 0), size: .2, size1: .5, life: .5, color: '#ff8a2a' }); };
      tickers.add(smoke);
      await tween(900, e => { L.body.rotation.z = facing(loser) * -1 * 0; L.body.rotation.x = 1.35 * ease.in(e); L.body.position.y = -.05 * e; });
      dust(lp.clone(), 18); SFX.play('impact_1', { vol: 1, rate: .7 }); shake(.15, 400);
      timeScale = base();
      await wait(400);
      // the winner
      const W = A[winner], wp = W.root.position.clone();
      SFX.duck(.3, .1);
      const orbit = tween(3200, e => { const a = -Math.PI / 2 * facing(winner) + (e - .5) * 1.6 * facing(winner); cam.pos.set(wp.x + Math.sin(a) * 2.3 * -1, .9 + e * .4, Math.cos(a) * 2.3); cam.look.copy(wp).add(V(0, .55, 0)); }, ease.io);
      tween(500, e => { pose[winner].aim = 1 + .9 * e; pose[winner].aimL = .3 * e; pose[winner].lean = -.1 * e; });
      if (winner === 'me') {
        await wait(300);
        FX.stamp('YOU WIN!!', { cls: 'rainbow', ms: 2400 }); FX.confetti(180); SFX.play('techgreat_1'); SFX.fanfare(true);
        for (let i = 0; i < 6; i++) wait(i * 250).then(() => { const p = V(rnd(-3, 3), rnd(2, 4), rnd(-3, -1)); sparksAt(p, ['#ff3b5c', '#ffd23f', '#3bd6ff', '#7dff6a'][i % 4], 30); SFX.tone(600 + i * 120, .12, { type: 'triangle', vol: .08 }); });
      } else {
        await wait(300);
        FX.stamp('LOSE…', { cls: 'red', ms: 2400 }); SFX.play('techfail_1');
      }
      await orbit;
    } else {
      await camTo(V(0, 1.0, 4.0), V(0, .6, 0), 600);
      FX.stamp('DRAW', { cls: 'blue', sub: 'おたがい決め手なし', ms: 1800 }); SFX.play('techok_1', { vol: .7 });
      await Promise.all(['me', 'cpu'].map(k => tween(400, e => (pose[k].aim = 1 - e))));
      await wait(1200);
    }
    // --- 5. wait for a tap
    timeScale = 1; skipBtn.hidden = true;
    const tap = hud.querySelector('.bTap'); tap.hidden = false;
    await new Promise(res => { overlay.addEventListener('click', res, { once: true }); });
    SFX.play('clamp_1', { vol: .5 });
    overlay.classList.add('out');
    await new Promise(r => setTimeout(r, 350));
    // clean up
    running = false; removeEventListener('resize', resize);
    tickers.clear(); timers.length = 0;
    tickers.add(dt => { if (Math.random() < dt * 6) sprite({ pos: V(rnd(-8, 8), rnd(0, .5), rnd(-6, 3)), vel: V(rnd(-.2, .2), rnd(.3, .8), rnd(-.2, .2)), size: .04, size1: .02, life: rnd(2, 4), color: '#ffb060', tex: TEX.spark, fadeIn: .2 }); });
    for (const k of ['me', 'cpu']) { scene.remove(A[k].root); scene.remove(A[k].headPivot); A[k].dispose(); }
    parts.forEach(p => { if (p.alive && p.max < 1e8) { p.alive = false; p.s.visible = false; } });
    overlay.remove();
    return true;
  }
  return { play };
})();
