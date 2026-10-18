// Cut the full-detail body (xs_body: the lower details drop the elbows and knees and coarsen the orbs) and glow mesh of ex-online XS models into head / upper / arms / lower parts
// by each triangle's dominant bone, normalise to height 1, mark which paint slot each vertex is in (so the game can
// repaint a robot built from mixed parts in one scheme), cut the held weapons too, and write it all as one JS data file.
// usage: node extract-parts.js <models dir> <out.js> name=file ... w:name=file ...
//   name=file    a mech (a_raid.glb ...)       w:name=file   a held weapon (w_a_beam_rifle.glb ...)
const fs = require('fs');
const [, , dir, out, ...pairs] = process.argv;
// the arms are kept apart from the torso so they can swing about the shoulder joint (arm_l / arm_r)
const PART_OF = name => {
  if (name === 'head') return 'head';
  if (/^(arm|elbow|forearm|hand)_l$/.test(name)) return 'armL';
  if (/^(arm|elbow|forearm|hand)_r$/.test(name)) return 'armR';
  if (/^(torso|orb|thruster_|jet_)/.test(name)) return 'upper';
  return 'lower'; // hips, leg, knee, shin, foot, skirt
};
// zones painted apart: 1 chest, 2 head, 3 feet (0 the rest)
const ZONE_OF = name => name === 'torso' ? 1 : name === 'head' ? 2 : /^foot_/.test(name) ? 3 : 0;
// What each base model is painted with (ex-online client/src/unitpaint.ts BASE): main armour, second armour, accent (sRGB).
const WHITE_BLUE = a => [['#e2e5ea', '#c9ced6', '#eef0f3'], ['#34508f'], [a]];
const GREEN = a => [['#7f9d63', '#5b6b45'], ['#3d5234'], [a]];
const BASE = {
  a_raid: [['#a1a9b1'], ['#536171'], ['#08aef6']], a_heavy: WHITE_BLUE('#b8483e'), a_support: WHITE_BLUE('#d9a520'),
  a_sniper: [['#aab1b8'], ['#3b4a5e'], ['#7c838c']], a_aqua: [['#2f66b8'], ['#163a78'], ['#7fb0ea']],
  b_raid: [['#618457'], ['#20351d'], ['#b529e4']], b_aqua_heavy: [['#4c8a52'], ['#2a5c9c'], ['#3f7fd0']], b_heavy: [['#9273c4'], ['#2f2644'], ['#b8483e']], b_support: GREEN('#d9a520'), b_sniper: GREEN('#b8483e'),
};
const lin = c => c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const hexLin = h => [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16) / 255));
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const toSrgbByte = v => { v = Math.min(1, Math.max(0, v)); return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255); };

function readGlb(file) {
  const b = fs.readFileSync(file);
  const jlen = b.readUInt32LE(12), j = JSON.parse(b.slice(20, 20 + jlen));
  const binStart = 20 + jlen + 8, bin = b.slice(binStart, binStart + b.readUInt32LE(20 + jlen));
  const acc = i => {
    const a = j.accessors[i], v = j.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
    const off = (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || n * C.BYTES_PER_ELEMENT;
    const res = new C(a.count * n);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) res[k * n + c] = new C(bin.buffer.slice(bin.byteOffset + off + k * stride + c * C.BYTES_PER_ELEMENT, bin.byteOffset + off + k * stride + (c + 1) * C.BYTES_PER_ELEMENT))[0];
    if (a.normalized && C === Uint8Array) return Float32Array.from(res, x => x / 255);
    if (a.normalized && C === Uint16Array && a.type !== 'SCALAR') return Float32Array.from(res, x => x / 65535);
    return res;
  };
  return { j, acc };
}
function invTranslation(m) { // inverse of an affine 4x4 (column-major) -> translation of the inverse
  const r = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]], t = [m[12], m[13], m[14]];
  const det = r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1]) - r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0]) + r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]);
  const inv = [
    [(r[1][1] * r[2][2] - r[1][2] * r[2][1]) / det, (r[0][2] * r[2][1] - r[0][1] * r[2][2]) / det, (r[0][1] * r[1][2] - r[0][2] * r[1][1]) / det],
    [(r[1][2] * r[2][0] - r[1][0] * r[2][2]) / det, (r[0][0] * r[2][2] - r[0][2] * r[2][0]) / det, (r[0][2] * r[1][0] - r[0][0] * r[1][2]) / det],
    [(r[1][0] * r[2][1] - r[1][1] * r[2][0]) / det, (r[0][1] * r[2][0] - r[0][0] * r[2][1]) / det, (r[0][0] * r[1][1] - r[0][1] * r[1][0]) / det]];
  return [0, 1, 2].map(i => -(inv[i][0] * t[0] + inv[i][1] * t[1] + inv[i][2] * t[2]));
}
const b64 = ta => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');
// one mesh piece: positions scaled by 1/H, normals as int8, colours as sRGB bytes, optional paint slot/shade/zone bytes
function pack(P, N, C, cn, idx, H, extra, skin) {
  const map = new Map(), pos = [], nor = [], col = [], slot = [], shade = [], zone = [], ind = [], sj = [], sw = [];
  for (const v of idx) {
    if (!map.has(v)) {
      map.set(v, pos.length / 3);
      pos.push(P[v * 3] / H, P[v * 3 + 1] / H, P[v * 3 + 2] / H);
      nor.push(Math.round(N[v * 3] * 127), Math.round(N[v * 3 + 1] * 127), Math.round(N[v * 3 + 2] * 127));
      for (let c = 0; c < 3; c++) col.push(C ? toSrgbByte(C[v * cn + c]) : 150);
      if (extra) { const e = extra(v); slot.push(e[0]); shade.push(e[1]); zone.push(e[2]); }
      if (skin) { const [jj, ww] = skin(v); sj.push(...jj); sw.push(...ww); }
    }
    ind.push(map.get(v));
  }
  const big = pos.length / 3 > 65535;
  // mech parts are about 1.5 high: positions fit in int16 at 1/16384
  const q = !!extra;
  const o = { q, p: b64(q ? Int16Array.from(pos, v => Math.round(v * 16384)) : new Float32Array(pos)), n: b64(new Int8Array(nor)), c: b64(new Uint8Array(col)), i: b64(big ? new Uint32Array(ind) : new Uint16Array(ind)), big };
  if (extra) { o.s = b64(new Uint8Array(slot)); o.h = b64(new Uint8Array(shade)); o.z = b64(new Uint8Array(zone)); }
  if (skin) { o.sj = b64(new Uint8Array(sj)); o.sw = b64(new Uint8Array(sw)); }
  return o;
}


// ---- 4x4 column-major matrices for posing the skeleton
const M4 = {
  id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  // rotation from Euler XYZ (three.js order: R = Rx * Ry * Rz)
  euler(x, y, z) { const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
    const ae = a * e, af = a * f, be = b * e, bf = b * f;
    return [c * e, af + be * d, bf - ae * d, 0, -c * f, ae - bf * d, be + af * d, 0, d, -b * c, a * c, 0, 0, 0, 0, 1]; },
  // the rotation turning unit vector u onto unit vector v (Rodrigues)
  turn(u, v) { const cx = u[1] * v[2] - u[2] * v[1], cy = u[2] * v[0] - u[0] * v[2], cz = u[0] * v[1] - u[1] * v[0], c = u[0] * v[0] + u[1] * v[1] + u[2] * v[2], k = 1 / (1 + c);
    return [cx * cx * k + c, cy * cx * k + cz, cz * cx * k - cy, 0, cx * cy * k - cz, cy * cy * k + c, cz * cy * k + cx, 0, cx * cz * k + cy, cy * cz * k - cx, cz * cz * k + c, 0, 0, 0, 0, 1]; },
  tr: m => [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1],
  pt: (m, p) => [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]),
  dir: (m, p) => [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2]),
};
const norm3 = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
// The stance the XS stand in when shown off (ex-online client/src/models.ts STAND, the "Katoki" stance): legs out at the
// hips with the toes turned out, chest up, chin in, arms a little out and forward, elbows bent. Left is -x.
const STAND = { legs: 0.17, toes: 0.22, chest: 0.07, chin: 0.1, arm: 0.1, out: 0.24, elbow: 0.38 };
// the bones of the lower body the game bends (hips first: the root)
const LEG_BONES = ['hips', 'leg_l', 'knee_l', 'shin_l', 'foot_l', 'leg_r', 'knee_r', 'shin_r', 'foot_r', 'skirt_front_l', 'skirt_front_r', 'skirt_back_l', 'skirt_back_r',
  // the hover legs' jets on the shins and feet (no vertices: their places and turns, -y the way they blow)
  'jet_2', 'jet_3', 'jet_4', 'jet_5', 'jet_6', 'jet_7', 'jet_8', 'jet_9'];
const STAND_ROT = {
  leg_l: [0, STAND.toes, -STAND.legs], leg_r: [0, -STAND.toes, STAND.legs],
  foot_l: [0, 0, STAND.legs], foot_r: [0, 0, -STAND.legs],
  torso: [STAND.chest, 0, 0], head: [-STAND.chin, 0, 0],
  arm_l: [STAND.arm, 0, -STAND.out], arm_r: [STAND.arm, 0, STAND.out],
  forearm_l: [STAND.elbow, 0, 0], forearm_r: [STAND.elbow, 0, 0], elbow_l: [STAND.elbow / 2, 0, 0], elbow_r: [STAND.elbow / 2, 0, 0],
};
const result = { mechs: {}, weapons: {} };
for (const pair of pairs) {
  let [name, file] = pair.split('=');
  // name=file.glb:lower keeps only the lower body (the hover legs are the hover models' only new part)
  const onlyLower = file.endsWith(':lower'); if (onlyLower) file = file.slice(0, -6);
  const { j, acc } = readGlb(dir + '/' + file);
  if (name.startsWith('w:')) { // ---- weapon: grip at the origin, barrel along -Z, in XS-editor units (6 m each)
    const parts = [];
    let len = 0;
    for (const node of j.nodes) {
      if (node.mesh == null) continue;
      const prim = j.meshes[node.mesh].primitives[0], A = prim.attributes, mat = j.materials[prim.material] || {};
      const P = acc(A.POSITION), N = acc(A.NORMAL), C = A.COLOR_0 != null ? acc(A.COLOR_0) : null, I = acc(prim.indices);
      const cn = A.COLOR_0 != null && j.accessors[A.COLOR_0].type === 'VEC4' ? 4 : 3;
      const amin = j.accessors[A.POSITION].min, amax = j.accessors[A.POSITION].max;
      len = Math.max(len, ...[0, 1, 2].map(k => amax[k] - amin[k]));
      const glow = /^glow/.test(mat.name || '') ? (mat.emissiveFactor || [1, 1, 1]).map(v => +v.toFixed(3)) : null;
      const pbr = mat.pbrMetallicRoughness || {};
      const piece = pack(P, N, C, cn, I, 1);
      piece.glow = glow; piece.metal = +(pbr.metallicFactor ?? .6).toFixed(2); piece.rough = +(pbr.roughnessFactor ?? .45).toFixed(2);
      if (!C) piece.base = (pbr.baseColorFactor || [.6, .6, .6]).slice(0, 3).map(v => +v.toFixed(3));
      parts.push(piece);
    }
    const at = n => { const nd = j.nodes.find(x => x.name === n); if (!nd) return null; const t = nd.matrix ? nd.matrix.slice(12, 15) : nd.translation || [0, 0, 0]; return t.map(v => +v.toFixed(4)); };
    result.weapons[name.slice(2)] = { len: +len.toFixed(3), muzzle: at('muzzle'), tip: at('blade_tip'), parts };
    console.log('weapon', name, file, 'len', len.toFixed(2), 'muzzle', at('muzzle'), 'pieces', parts.length);
    continue;
  }
  const base = file.replace('.glb', '').replace(/_hover$/, '');
  const root = j.nodes[j.scenes[0].nodes[0]];
  // models without extras.height: use the head height ratio of the ones that have it (head joint at 0.907 of the body height)
  const skin = j.skins[0], jointNames = skin.joints.map(i => j.nodes[i].name), ibm = acc(skin.inverseBindMatrices);
  const hk = jointNames.indexOf('head');
  const H = (root.extras && root.extras.height) || invTranslation(ibm.slice(hk * 16, hk * 16 + 16))[1] / 0.907;
  const jointPos = {};
  jointNames.forEach((n, k) => { const p = invTranslation(ibm.slice(k * 16, k * 16 + 16)); jointPos[n] = p.map(v => +(v / H).toFixed(4)); });
  // the paint table of this base model: linear colour -> [slot, shade beside the slot's first colour]
  const table = (BASE[base] || []).flatMap((shades, k) => { const first = hexLin(shades[0]); return shades.map(h => { const from = hexLin(h); return { from, k, shade: lum(from) / lum(first) }; }); });
  // ---- pose the skeleton: STAND, and the orbs turned to hang down and out from their docks (their barrels, the bone's
  // -y, point up and out on these models; hanging down they read better [依頼主: 下向きに出る物の方が映える])
  const parentOf = {}; j.nodes.forEach((n, i) => (n.children || []).forEach(c => (parentOf[c] = i)));
  const localOf = n => n.matrix ? n.matrix.slice() : (() => { const t = n.translation || [0, 0, 0], m = M4.id(); m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; return m; })();
  const bindW = [], poseW = [];
  const worldOf = (i, posed) => {
    const cache = posed ? poseW : bindW; if (cache[i]) return cache[i];
    const n = j.nodes[i], par = parentOf[i] != null ? worldOf(parentOf[i], posed) : M4.id();
    let m = M4.mul(par, localOf(n));
    if (posed && STAND_ROT[n.name]) m = M4.mul(m, M4.euler(...STAND_ROT[n.name]));
    if (posed && /^orb_\d+$/.test(n.name)) {
      // the barrel's way in the bind pose, turned to point down (the same out and back)
      const bw = worldOf(i, false), d = norm3(M4.dir(bw, [0, -1, 0])), want = norm3([d[0], -Math.abs(d[1]), d[2]]);
      m = M4.mul(m, M4.turn([0, -1, 0], norm3(M4.dir(M4.tr(bw), want))));
    }
    return (cache[i] = m);
  };
  const nodeIdx = nm => j.nodes.findIndex(n => n.name === nm);
  // skinning matrices per joint of a skin: posed world * inverse bind
  const skinMats = si => { const sk = j.skins[si], ib = acc(sk.inverseBindMatrices); return sk.joints.map((ni, k) => M4.mul(worldOf(ni, true), Array.from(ib.slice(k * 16, k * 16 + 16)))); };
  const posedOf = (P, N, J, W, mats) => {
    const P2 = new Float32Array(P.length), N2 = new Float32Array(N.length);
    for (let v = 0; v < P.length / 3; v++) {
      const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], n = [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]], ap = [0, 0, 0], an = [0, 0, 0];
      for (let k = 0; k < 4; k++) { const w = W[v * 4 + k]; if (!w) continue; const m = mats[J[v * 4 + k]], q = M4.pt(m, p), r = M4.dir(m, n); for (let c = 0; c < 3; c++) { ap[c] += w * q[c]; an[c] += w * r[c]; } }
      P2.set(ap, v * 3); N2.set(norm3(an), v * 3);
    }
    return [P2, N2];
  };
  // the feet back on the ground after the legs went out
  let ground = 0;
  {
    const node = j.nodes.find(n => n.name === 'xs_body'), A = j.meshes[node.mesh].primitives[0].attributes;
    const [P2] = posedOf(acc(A.POSITION), acc(A.NORMAL), acc(A.JOINTS_0), acc(A.WEIGHTS_0), skinMats(node.skin));
    ground = Infinity; for (let v = 1; v < P2.length; v += 3) ground = Math.min(ground, P2[v]);
  }
  const posedJoint = nm => { const i = nodeIdx(nm); if (i < 0) return null; const p = M4.pt(worldOf(i, true), [0, 0, 0]); return [p[0] / H, (p[1] - ground) / H, p[2] / H].map(v => +v.toFixed(4)); };
  // the right hand's turn (for the held weapon): quaternion of its posed world rotation
  const quatOf = m => {
    const t = m[0] + m[5] + m[10]; let x, y, z, w;
    if (t > 0) { const s = 0.5 / Math.sqrt(t + 1); w = 0.25 / s; x = (m[6] - m[9]) * s; y = (m[8] - m[2]) * s; z = (m[1] - m[4]) * s; }
    else if (m[0] > m[5] && m[0] > m[10]) { const s = 2 * Math.sqrt(1 + m[0] - m[5] - m[10]); w = (m[6] - m[9]) / s; x = 0.25 * s; y = (m[4] + m[1]) / s; z = (m[8] + m[2]) / s; }
    else if (m[5] > m[10]) { const s = 2 * Math.sqrt(1 + m[5] - m[0] - m[10]); w = (m[8] - m[2]) / s; x = (m[4] + m[1]) / s; y = 0.25 * s; z = (m[9] + m[6]) / s; }
    else { const s = 2 * Math.sqrt(1 + m[10] - m[0] - m[5]); w = (m[1] - m[4]) / s; x = (m[8] + m[2]) / s; y = (m[9] + m[6]) / s; z = 0.25 * s; }
    return [x, y, z, w].map(v => +v.toFixed(5)); };
  const handQ = nodeIdx('hand_r') < 0 ? null : quatOf(worldOf(nodeIdx('hand_r'), true));
  // the lower body keeps its bones (in the posed stance) so the game can bend the legs: each bone's parent in the list,
  // place and turn; vertices weighted to bones off the list (the torso) go to the hips
  const LEG = LEG_BONES.filter(n => nodeIdx(n) >= 0);
  const bones = LEG.map(n => { const i = nodeIdx(n), m = worldOf(i, true); let par = parentOf[i]; while (par != null && !LEG.includes(j.nodes[par].name)) par = parentOf[par];
    const t = M4.pt(m, [0, 0, 0]); return { n, p: par == null ? -1 : LEG.indexOf(j.nodes[par].name), t: [t[0] / H, (t[1] - ground) / H, t[2] / H].map(v => +v.toFixed(4)), q: quatOf(m) }; });
  const parts = { head: [], upper: [], armL: [], armR: [], lower: [] };
  let glow = null;
  for (const nodeName of ['xs_body', 'xs_glow_1']) {
    const node = j.nodes.find(n => n.name === nodeName); if (!node) continue;
    const prim = j.meshes[node.mesh].primitives[0], A = prim.attributes;
    const C = acc(A.COLOR_0), J = acc(A.JOINTS_0), W = acc(A.WEIGHTS_0), I = acc(prim.indices);
    const [P, N] = posedOf(acc(A.POSITION), acc(A.NORMAL), J, W, skinMats(node.skin));
    for (let v = 1; v < P.length; v += 3) P[v] -= ground;
    const cn = j.accessors[A.COLOR_0].type === 'VEC4' ? 4 : 3;
    // each mesh has its own skin, with its own joint order
    const names = node.skin != null ? j.skins[node.skin].joints.map(i => j.nodes[i].name) : jointNames;
    const domBone = v => { let b = 0; for (let k = 1; k < 4; k++) if (W[v * 4 + k] > W[v * 4 + b]) b = k; return names[J[v * 4 + b]]; };
    const isGlow = nodeName !== 'xs_body';
    if (isGlow) { const m = j.materials[prim.material]; glow = (m.emissiveFactor || [1, 1, 1]).map(v => +v.toFixed(3)); }
    const memo = new Map();
    const extra = isGlow ? null : v => {
      const r = C[v * cn], g = C[v * cn + 1], b = C[v * cn + 2], key = r + ',' + g + ',' + b;
      if (!memo.has(key)) memo.set(key, table.findIndex(e => Math.abs(e.from[0] - r) + Math.abs(e.from[1] - g) + Math.abs(e.from[2] - b) < 0.02));
      const t = memo.get(key);
      return t < 0 ? [255, 100, 0] : [table[t].k, Math.round(Math.min(2.5, table[t].shade) * 100), ZONE_OF(domBone(v))];
    };
    const buckets = { head: [], upper: [], armL: [], armR: [], lower: [] };
    for (let t = 0; t < I.length; t += 3) {
      const ps = [PART_OF(domBone(I[t])), PART_OF(domBone(I[t + 1])), PART_OF(domBone(I[t + 2]))];
      const part = ps[0] === ps[1] || ps[0] === ps[2] ? ps[0] : ps[1] === ps[2] ? ps[1] : ps[0];
      buckets[part].push(I[t], I[t + 1], I[t + 2]);
    }
    const legOf = names.map(n => Math.max(0, LEG.indexOf(n)));
    const skin = v => {
      const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0], acc4 = new Map();
      for (let k = 0; k < 4; k++) { const w = W[v * 4 + k]; if (w > 0) { const b = legOf[J[v * 4 + k]]; acc4.set(b, (acc4.get(b) || 0) + w); } }
      [...acc4].sort((a, b) => b[1] - a[1]).slice(0, 4).forEach(([b, w], k) => { jj[k] = b; ww[k] = Math.round(w * 255); });
      const sum = ww.reduce((a, b) => a + b, 0); if (sum !== 255) ww[0] += 255 - sum;
      return [jj, ww];
    };
    for (const part of Object.keys(buckets)) {
      if (!buckets[part].length) continue;
      const o = pack(P, N, C, cn, buckets[part], H, extra, part === 'lower' ? skin : null);
      o.glow = isGlow;
      parts[part].push(o);
    }
  }
  // nodes that are not skin joints (hand_r): compose the bind-pose TRS of the node and its parents
  const parent = {}; j.nodes.forEach((n, i) => (n.children || []).forEach(c => (parent[c] = i)));
  const rotate = (q, v) => { const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; };
  const nodeWorld = i => { let p = [0, 0, 0]; for (let k = i; k != null; k = parent[k]) { const n = j.nodes[k]; if (n.matrix) { const m = n.matrix; p = [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]); continue; } const s = n.scale || [1, 1, 1]; p = p.map((v, c) => v * s[c]); if (n.rotation) p = rotate(n.rotation, p); const t = n.translation || [0, 0, 0]; p = p.map((v, c) => v + t[c]); } return p; };
  const xsIdx = j.nodes.findIndex(n => n.name === 'xs');
  for (const n of ['hand_r']) if (!jointPos[n]) { const i = j.nodes.findIndex(x => x.name === n); if (i >= 0) { const w = nodeWorld(i), r = xsIdx >= 0 && j.nodes[xsIdx].translation || [0, 0, 0]; jointPos[n] = w.map((v, c) => +((v) / H).toFixed(4)); } }
  const J0 = posedJoint;
  result.mechs[name] = { base, H: +H.toFixed(4), joints: { hips: J0('hips'), torso: J0('torso'), head: J0('head'), arm_l: J0('arm_l'), arm_r: J0('arm_r'), hand_r: J0('hand_r'), hand_rq: handQ, forearm_l: J0('forearm_l') }, bones, glow, parts };
  if (onlyLower) { for (const k of ['head', 'upper', 'armL', 'armR']) delete parts[k]; result.mechs[name].hover = true; }
  console.log(name, file, 'H', H.toFixed(3), 'hand_r', J0('hand_r'), Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length])), 'paint table', table.length);
}
fs.writeFileSync(out, '// generated by tools/extract-parts.js from ex-online public/models: XS bodies (xs_body + glow) posed in the STAND stance and split into parts, and held weapons\nwindow.ROBOT_PARTS = ' + JSON.stringify(result) + ';\n');
console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
