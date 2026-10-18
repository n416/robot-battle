// Robots in 3D: the parts cut from the ex-online XS models (robot-parts.js) put together into a rig with swinging arms,
// a held weapon and a paint job that sweeps up the body. Also draws the small pictures for the cards and the hangar bays.
window.ROBO = (() => {
  if (!window.THREE || !window.ROBOT_PARTS) return null;
  const RP = ROBOT_PARTS, M = RP.mechs, W = RP.weapons;
  const bytes = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0)).buffer;
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

  // ---- paint schemes: main armour, second armour, accent, chest, head, light colour (sRGB)
  const SCHEMES = {
    tricolor: { n: 'トリコロール', main: '#eceef2', sub: '#2c4fa8', accent: '#f0c832', chest: '#d43a2e', head: '#eceef2', glow: '#3dff9a' },
    azure:    { n: 'アズール',     main: '#3b82e8', sub: '#1a3570', accent: '#ffd23f', chest: '#e6ebf2', head: '#e6ebf2', glow: '#5ff0ff' },
    blaze:    { n: 'ブレイズ',     main: '#ff8a1f', sub: '#30323a', accent: '#ffe066', chest: '#30323a', head: '#ff8a1f', glow: '#ffe14a' },
    crimson:  { n: 'クリムゾン',   main: '#d2463a', sub: '#6e1e1c', accent: '#f0c832', chest: '#a8302a', head: '#d2463a', glow: '#ff5f6e' },
    shadow:   { n: 'シャドウ',     main: '#3a3d48', sub: '#1c1d24', accent: '#ff3b5c', chest: '#c8343c', head: '#3a3d48', glow: '#ff3b5c' },
    venom:    { n: 'ヴェノム',     main: '#8f5ad6', sub: '#33244f', accent: '#b6ff3b', chest: '#2a2a32', head: '#8f5ad6', glow: '#c8ff4a' },
  };
  // the weapon each upper body holds, and how it fights
  const WEAPON_OF = { geo3: 'beam_rifle', geo2: 'bazooka', geo1: 'machine_gun', tsui3: 'heat_sword', tsui2: 'giant_bazooka', tsui1: 'gatling', ana3: 'beam_sniper', ana2: 'sniper_rifle', ana1: 'missile' };
  const WEAPON_KIND = { beam_rifle: 'beam', bazooka: 'shell', machine_gun: 'gun', heat_sword: 'sword', giant_bazooka: 'shell', gatling: 'gun', beam_sniper: 'beam', sniper_rifle: 'sniper', missile: 'missile' };
  const WEAPON_NAME = { beam_rifle: 'ビームライフル', bazooka: 'バズーカ', machine_gun: 'マシンガン', heat_sword: 'ヒートソード', giant_bazooka: 'ジャイアントバズ', gatling: 'ガトリング', beam_sniper: 'ビームスナイパー', sniper_rifle: 'スナイパーライフル', missile: 'ミサイルポッド' };

  // ---- geometry, built once per model part
  const geoCache = {};
  function pieces(model, part) {
    const k = model + ':' + part;
    if (geoCache[k]) return geoCache[k];
    return geoCache[k] = M[model].parts[part].map(sub => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(sub.q ? Float32Array.from(new Int16Array(bytes(sub.p)), v => v / 16384) : new Float32Array(bytes(sub.p)), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(bytes(sub.n)), 3, true));
      const c8 = new Uint8Array(bytes(sub.c)), col = new Float32Array(c8.length);
      for (let i = 0; i < c8.length; i++) col[i] = srgbToLin(c8[i] / 255);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(sub.big ? new Uint32Array(bytes(sub.i)) : new Uint16Array(bytes(sub.i)), 1));
      if (sub.sj) { g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(bytes(sub.sj)), 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(new Uint8Array(bytes(sub.sw)), 4, true)); }
      g.computeBoundingSphere();
      return { g, glow: sub.glow, slot: sub.s && new Uint8Array(bytes(sub.s)), shade: sub.h && new Uint8Array(bytes(sub.h)), zone: sub.z && new Uint8Array(bytes(sub.z)), paints: {} };
    });
  }
  function srgbToLin(c) { return c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  // the colours of a piece painted in a scheme (a second colour attribute; the shader sweeps from one to the other)
  function paintAttr(pc, model, schemeKey) {
    if (pc.paints[schemeKey]) return pc.paints[schemeKey];
    const sc = SCHEMES[schemeKey], base = M[model].base;
    const C = { main: lin(sc.main), sub: lin(sc.sub), accent: lin(sc.accent), chest: lin(sc.chest), head: lin(sc.head) };
    const src = pc.g.getAttribute('color').array, out = new Float32Array(src.length), t = new THREE.Color();
    for (let i = 0; i < src.length / 3; i++) {
      const s = pc.slot ? pc.slot[i] : 255;
      if (s === 255) { out[i * 3] = src[i * 3]; out[i * 3 + 1] = src[i * 3 + 1]; out[i * 3 + 2] = src[i * 3 + 2]; continue; }
      const z = pc.zone[i];
      let c = s === 0 ? (z === 1 ? C.chest : z === 2 ? C.head : C.main) : s === 1 ? C.sub : C.accent;
      // on the raid model the accent is whole armour plates: they take the part's main colour
      if (s === 2 && base === 'a_raid') c = z === 1 ? C.chest : C.main;
      t.copy(c).multiplyScalar(pc.shade[i] / 100);
      out[i * 3] = t.r; out[i * 3 + 1] = t.g; out[i * 3 + 2] = t.b;
    }
    return pc.paints[schemeKey] = new THREE.BufferAttribute(out, 3);
  }
  const wGeo = {};
  function weaponPieces(name) {
    if (wGeo[name]) return wGeo[name];
    return wGeo[name] = W[name].parts.map(sub => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bytes(sub.p)), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(bytes(sub.n)), 3, true));
      const c8 = new Uint8Array(bytes(sub.c)), col = new Float32Array(c8.length);
      for (let i = 0; i < c8.length; i++) col[i] = srgbToLin(c8[i] / 255);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(sub.big ? new Uint32Array(bytes(sub.i)) : new Uint16Array(bytes(sub.i)), 1));
      return { g, glow: sub.glow, metal: sub.metal, rough: sub.rough };
    });
  }

  // ---- body material: vertex colours, swept to the paint colours below uPaintY (world height), a bright seam at the
  // sweep line, a white flash when hit and scorching when beaten
  function bodyMaterial(U) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .5, roughness: .42 });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 paintColor;\nvarying vec3 vPaint;\nvarying float vWY;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvPaint = paintColor;\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uPaintY;\nuniform float uFlash;\nuniform float uBurn;\nuniform vec3 uEdge;\nuniform vec3 uFlashCol;\nvarying vec3 vPaint;\nvarying float vWY;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat pm = step(vWY, uPaintY);\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuse * vPaint, pm);\ndiffuseColor.rgb *= 1.0 - uBurn * 0.75;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat seam = smoothstep(0.035, 0.0, abs(vWY - uPaintY));\ntotalEmissiveRadiance += uEdge * seam * 3.0 + uFlashCol * uFlash;');
    };
    return m;
  }

  // ---- a robot: lower body on the ground, upper body on its waist joint (arms swing at the shoulders), head on the neck
  class Rig {
    constructor(models, opts = {}) {
      this.models = models; this.scheme = opts.scheme || null;
      this.U = { uPaintY: { value: opts.painted ? 50 : -50 }, uFlash: { value: 0 }, uBurn: { value: 0 }, uEdge: { value: lin(this.scheme ? SCHEMES[this.scheme].glow : '#ffffff') }, uFlashCol: { value: new THREE.Color(1, 1, 1) } };
      this.mat = bodyMaterial(this.U);
      this.glowMats = [];
      const root = this.root = new THREE.Group();
      const body = this.body = new THREE.Group(); root.add(body);
      this.parts = {};
      const J = m => M[m].joints;
      const waist = models.lower ? J(models.lower).torso : [0, .72, 0];
      if (models.lower) { this.parts.lower = this.meshes(models.lower, 'lower'); body.add(this.parts.lower); }
      this.upperPivot = new THREE.Group(); this.upperPivot.position.set(...waist); body.add(this.upperPivot); this.upBase = waist[1];
      let neck = [0, .907 - waist[1], 0];
      if (models.upper) {
        const u = models.upper, t = J(u).torso;
        const up = this.parts.upper = this.meshes(u, 'upper'); up.position.set(-t[0], -t[1], -t[2]); this.upperPivot.add(up);
        const arm = (part, jn) => {
          const piv = new THREE.Group(), jp = J(u)[jn]; piv.position.set(jp[0] - t[0], jp[1] - t[1], jp[2] - t[2]);
          const g = this.meshes(u, part); g.position.set(-jp[0], -jp[1], -jp[2]); piv.add(g); this.upperPivot.add(piv);
          return { piv, g };
        };
        const L = arm('armL', 'arm_l'), R = arm('armR', 'arm_r');
        this.armL = L.piv; this.armR = R.piv;
        // the weapon in the right hand: grip at the hand, barrel down the arm (-Z turned to -Y), its top to the front
        this.weaponName = WEAPON_OF[u];
        if (opts.weapon !== false && this.weaponName && J(u).hand_r) {
          const wn = this.weaponName, w = W[wn], wg = new THREE.Group(), hr = J(u).hand_r;
          const big = Math.max(1, Math.min(1.25, 10 / w.len));
          wg.position.set(...hr); wg.scale.setScalar(big / (6 * M[u].H));
          // in the hand's (posed) turn, barrel down the forearm (-Z turned to -Y)
          const hq = J(u).hand_rq ? new THREE.Quaternion(...J(u).hand_rq) : new THREE.Quaternion();
          wg.quaternion.copy(hq).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
          // aiming turns the arm so that the barrel points straight ahead (-Z): the turn from where it points now
          const b0 = new THREE.Vector3(0, 0, -1).applyQuaternion(wg.quaternion).normalize();
          const qa = new THREE.Quaternion().setFromUnitVectors(b0, new THREE.Vector3(0, 0, -1));
          this.aimAngle = 2 * Math.acos(Math.min(1, qa.w)); this.aimAxis = new THREE.Vector3(qa.x, qa.y, qa.z).normalize();
          weaponPieces(wn).forEach(p => {
            const mat = p.glow ? new THREE.MeshBasicMaterial({ color: new THREE.Color(...p.glow).multiplyScalar(1.6), toneMapped: false })
              : new THREE.MeshStandardMaterial({ vertexColors: true, metalness: p.metal, roughness: p.rough });
            if (p.glow) this.glowMats.push(mat);
            wg.add(new THREE.Mesh(p.g, mat));
          });
          const mz = w.muzzle || w.tip || [0, 0, -w.len * .8];
          this.muzzle = new THREE.Object3D(); this.muzzle.position.set(...mz); wg.add(this.muzzle);
          this.bladeTip = new THREE.Object3D(); this.bladeTip.position.set(...(w.tip || mz)); wg.add(this.bladeTip);
          R.g.add(wg); this.weapon = wg;
        }
        const h = J(u).head; neck = [h[0] - t[0], h[1] - t[1], h[2] - t[2]];
      }
      this.headPivot = new THREE.Group(); this.headPivot.position.set(...neck); this.upperPivot.add(this.headPivot);
      if (models.head) { const hm = this.parts.head = this.meshes(models.head, 'head'), hj = J(models.head).head; hm.position.set(-hj[0], -hj[1], -hj[2]); this.headPivot.add(hm); }
      this.kind = this.weaponName ? WEAPON_KIND[this.weaponName] : null;
    }
    meshes(model, part) {
      const grp = new THREE.Group();
      const glowCol = this.scheme ? lin(SCHEMES[this.scheme].glow) : new THREE.Color(...M[model].glow);
      // the lower body bends: its bones (in the stance it was cut in) and skinned meshes
      const skel = part === 'lower' && M[model].bones ? this.legSkeleton(model, grp) : null;
      const add = (geo, mat) => { const m = skel ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat); if (skel) { m.bind(skel, new THREE.Matrix4()); m.frustumCulled = false; } grp.add(m); return m; };
      pieces(model, part).forEach(pc => {
        if (pc.glow) {
          const gm = new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(1.4), toneMapped: false, skinning: !!skel });
          gm.userData.orig = new THREE.Color(...M[model].glow).multiplyScalar(1.4);
          this.glowMats.push(gm); add(pc.g, gm); return;
        }
        let g = pc.g;
        // a copy of the geometry with this rig's paint colours beside the bare ones
        g = new THREE.BufferGeometry();
        for (const name in pc.g.attributes) g.setAttribute(name, pc.g.attributes[name]);
        g.index = pc.g.index; g.boundingSphere = pc.g.boundingSphere;
        g.setAttribute('paintColor', this.scheme ? paintAttr(pc, model, this.scheme) : pc.g.attributes.color);
        if (skel && !this.matSkin) { this.matSkin = bodyMaterial(this.U); this.matSkin.skinning = true; }
        const mesh = add(g, skel ? this.matSkin : this.mat); mesh.castShadow = true;
      });
      return grp;
    }
    legSkeleton(model, grp) {
      const B = M[model].bones, bones = B.map(b => { const bn = new THREE.Bone(); bn.name = b.n; return bn; });
      const world = B.map(b => new THREE.Matrix4().compose(new THREE.Vector3(...b.t), new THREE.Quaternion(...b.q), new THREE.Vector3(1, 1, 1)));
      B.forEach((b, i) => {
        const local = b.p < 0 ? world[i].clone() : new THREE.Matrix4().copy(world[b.p]).invert().multiply(world[i]);
        local.decompose(bones[i].position, bones[i].quaternion, bones[i].scale);
        (b.p < 0 ? grp : bones[b.p]).add(bones[i]);
      });
      grp.updateMatrixWorld(true);
      const by = {}; bones.forEach(b => (by[b.name] = b));
      const len = (a, b) => (by[a] && by[b] ? by[a].getWorldPosition(new THREE.Vector3()).distanceTo(by[b].getWorldPosition(new THREE.Vector3())) : .2);
      // the hover legs' jets (their -y is the way they blow)
      this.jets = bones.filter(b => /^jet_/.test(b.name)); this.hover = !!M[model].hover;
      this.leg = { by, rest: new Map(bones.map(b => [b, { q: b.quaternion.clone(), p: b.position.clone() }])), L1: (len('leg_l', 'shin_l') + len('leg_r', 'shin_r')) / 2, L2: (len('shin_l', 'foot_l') + len('shin_r', 'foot_r')) / 2 };
      return new THREE.Skeleton(bones);
    }
    // the legs: crouch 0..1 bends both knees, stride -1..1 one leg forward and one back (a run / a lunge), kneel 0..1 goes
    // down on the right knee. The feet stay flat and the lowest point (a foot or a knee) on the ground: the hips (and the upper body) come down.
    legs({ crouch = 0, stride = 0, kneel = 0 } = {}) {
      const L = this.leg; if (!L) return;
      for (const [b, r] of L.rest) { b.quaternion.copy(r.q); b.position.copy(r.p); }
      if (this.hover) stride *= .3;   // (hover legs glide: they hardly step)
      const a = crouch * .75;
      const ang = { l: [a + stride * .8 + kneel * 1.25, -2 * a - Math.abs(stride) * .35 - kneel * 1.45], r: [a - stride * .55 - kneel * .25, -2 * a - Math.abs(stride) * .7 - kneel * 1.95] };
      const qx = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0);
      let reach = 0;   // how far below the hips the lowest point (a foot or a knee) is
      for (const s of ['l', 'r']) {
        const [h, k] = ang[s], by = L.by;
        const turn = (n, x) => { if (by[n] && x) by[n].quaternion.multiply(qx.setFromAxisAngle(X, x)); };
        turn('leg_' + s, h); turn('shin_' + s, k); turn('knee_' + s, k / 2); turn('foot_' + s, -(h + k) * .9);
        turn('skirt_front_' + s, Math.max(0, h) * .7); turn('skirt_back_' + s, Math.min(0, h) * .7);
        reach = Math.max(reach, L.L1 * Math.cos(h), L.L1 * Math.cos(h) + L.L2 * Math.cos(h + k));
      }
      const drop = Math.max(0, L.L1 + L.L2 - reach);
      const hips = L.by.hips; if (hips) hips.position.y -= drop;
      this.upperPivot.position.y = this.upBase - drop;
    }
    // paint sweep: t 0..1 brings the paint line from the feet over the head
    setPaint(t) { this.U.uPaintY.value = t <= 0 ? -50 : t >= 1 ? 50 : (-.05 + t * 1.25) * this.root.scale.y + this.root.position.y; }
    // the lights take the scheme's colour once painted
    setLights(painted) { this.glowMats.forEach(m => { if (m.userData.orig && !painted) m.color.copy(m.userData.orig); else if (m.userData.orig && this.scheme) m.color.copy(lin(SCHEMES[this.scheme].glow)).multiplyScalar(1.4); }); }
    flash(v, col) { this.U.uFlash.value = v; if (col) this.U.uFlashCol.value.set(col); }
    burn(v) { this.U.uBurn.value = v; }
    // aim: 0 arm hanging, 1 weapon level to the front
    pose({ aim = 0, aimL = 0, lean = 0, twist = 0, look = 0, bob = 0, swing = 0, crouch = 0, stride = 0, kneel = 0 } = {}) {
      if (this.leg) this.legs({ crouch, stride, kneel });
      if (this.armR) {
        if (this.aimAxis) { this.armR.quaternion.setFromAxisAngle(this.aimAxis, this.aimAngle * aim); if (swing) this.armR.rotateX(swing); }
        else this.armR.rotation.set(aim * Math.PI / 2 + swing, 0, 0);
      }
      if (this.armL) { this.armL.rotation.set(aimL * Math.PI / 2.4, 0, .08 + aimL * .1); }
      this.upperPivot.rotation.set(lean, twist, 0);
      if (!this.headGone) this.headPivot.rotation.set(0, look, 0);   // (once blown off, it tumbles on its own)
      this.body.position.y = bob + (this.hover ? .03 + Math.sin(performance.now() / 420) * .006 : 0);   // (hover legs float)
    }
    muzzleWorld(v = new THREE.Vector3()) { if (!this.muzzle) return this.root.getWorldPosition(v).add(new THREE.Vector3(0, .6, 0)); this.root.updateMatrixWorld(true); return this.muzzle.getWorldPosition(v); }
    dispose() { this.root.traverse(o => { if (o.isMesh && o.geometry.getAttribute('paintColor')) o.geometry.dispose(); }); this.mat.dispose(); if (this.matSkin) this.matSkin.dispose(); }
  }

  // ---- the small renderer shared by every picture on the page
  let renderer = null;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return null; }
  const SIZE = 320;
  renderer.setPixelRatio(1); renderer.setSize(SIZE, SIZE); renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x302830, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(1.5, 2.5, 2.2); scene.add(key);
  const rimA = new THREE.DirectionalLight(0x5fd8ff, 1.3); rimA.position.set(-2.5, 1.2, -1.5); scene.add(rimA);
  const rimB = new THREE.DirectionalLight(0xff8a4a, .8); rimB.position.set(2.5, .5, -2); scene.add(rimB);
  const camera = new THREE.PerspectiveCamera(30, 1, .01, 30);
  function shot(obj, cx, cy, dist, yaw, h = .28) {
    scene.add(obj);
    // yaw 0: in front of the robot (it faces -Z); + swings the camera round to its left
    camera.position.set(cx - Math.sin(yaw) * dist, cy + dist * h, -Math.cos(yaw) * dist); camera.lookAt(cx, cy, 0);
    renderer.render(scene, camera); scene.remove(obj);
  }
  // draw a rig into a 2D canvas, the camera turning round it by yaw
  function draw(canvas, rig, yaw, frame = { cy: .5, dist: 3.2 }) {
    if (canvas.width !== SIZE) { canvas.width = SIZE; canvas.height = SIZE; }
    rig.root.updateMatrixWorld(true);
    shot(rig.root, 0, frame.cy, frame.dist, yaw, frame.h);
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, SIZE, SIZE); ctx.drawImage(renderer.domElement, 0, 0);
  }
  const thumbs = {};
  function thumb(model, part) {
    const k = model + ':' + part; if (thumbs[k]) return thumbs[k];
    const rig = new Rig(part === 'upper' ? { upper: model } : part === 'head' ? { head: model } : { lower: model }, { weapon: part === 'upper' });
    if (rig.weapon) rig.weapon.visible = false;
    const box = new THREE.Box3().setFromObject(rig.root), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    rig.root.position.set(-c.x, -c.y, -c.z);
    if (rig.weapon) { rig.weapon.visible = true; rig.pose({ aim: .7 }); }
    const wrap = new THREE.Group(); wrap.add(rig.root);
    shot(wrap, 0, 0, Math.max(sz.x, sz.y, sz.z * .7) * 2.5, -.6, .25);
    return thumbs[k] = renderer.domElement.toDataURL('image/png');
  }
  return { Rig, SCHEMES, WEAPON_OF, WEAPON_KIND, WEAPON_NAME, draw, thumb, lin };
})();
