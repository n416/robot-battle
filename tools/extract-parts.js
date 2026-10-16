// Cut the mid-detail body (xs_body_lod1) and glow mesh of ex-online XS models into head / upper / lower parts
// by each triangle's dominant bone, normalise to height 1, and write them as one JS data file.
// usage: node extract-parts.js <models dir> <out.js> name=file ...
const fs = require('fs');
const [, , dir, out, ...pairs] = process.argv;
const PART_OF = name => {
  if (name === 'head') return 'head';
  if (/^(torso|arm_|elbow_|forearm_|orb)/.test(name)) return 'upper';
  return 'lower'; // hips, leg, knee, shin, foot, skirt
};
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
const result = {};
for (const pair of pairs) {
  const [name, file] = pair.split('=');
  const { j, acc } = readGlb(dir + '/' + file);
  const root = j.nodes[j.scenes[0].nodes[0]];
  // models without extras.height: use the head height ratio of the ones that have it (head joint at 0.907 of the body height)
  const skin0 = j.skins[0], ibm0 = acc(skin0.inverseBindMatrices), hk = skin0.joints.findIndex(i => j.nodes[i].name === 'head');
  const H = (root.extras && root.extras.height) || invTranslation(ibm0.slice(hk * 16, hk * 16 + 16))[1] / 0.907;
  const skin = j.skins[0], jointNames = skin.joints.map(i => j.nodes[i].name);
  const ibm = acc(skin.inverseBindMatrices);
  const jointPos = {};
  jointNames.forEach((n, k) => { const p = invTranslation(ibm.slice(k * 16, k * 16 + 16)); jointPos[n] = p.map(v => +(v / H).toFixed(4)); });
  const parts = { head: [], upper: [], lower: [] };
  let glow = null;
  for (const nodeName of ['xs_body_lod1', 'xs_glow_1']) {
    const node = j.nodes.find(n => n.name === nodeName); if (!node) continue;
    const prim = j.meshes[node.mesh].primitives[0], A = prim.attributes;
    const P = acc(A.POSITION), N = acc(A.NORMAL), C = acc(A.COLOR_0), J = acc(A.JOINTS_0), W = acc(A.WEIGHTS_0), I = acc(prim.indices);
    const cn = j.accessors[A.COLOR_0].type === 'VEC4' ? 4 : 3;
    const dom = v => { let b = 0; for (let k = 1; k < 4; k++) if (W[v * 4 + k] > W[v * 4 + b]) b = k; return PART_OF(jointNames[J[v * 4 + b]]); };
    const isGlow = nodeName !== 'xs_body_lod1';
    if (isGlow) { const m = j.materials[prim.material]; glow = (m.emissiveFactor || [1, 1, 1]).map(v => +v.toFixed(3)); }
    const buckets = { head: [], upper: [], lower: [] };
    for (let t = 0; t < I.length; t += 3) {
      const ps = [dom(I[t]), dom(I[t + 1]), dom(I[t + 2])];
      const part = ps[0] === ps[1] || ps[0] === ps[2] ? ps[0] : ps[1] === ps[2] ? ps[1] : ps[0];
      buckets[part].push(I[t], I[t + 1], I[t + 2]);
    }
    for (const part of Object.keys(buckets)) {
      const idx = buckets[part]; if (!idx.length) continue;
      const map = new Map(), pos = [], nor = [], col = [], ind = [];
      for (const v of idx) {
        if (!map.has(v)) {
          map.set(v, pos.length / 3);
          pos.push(P[v * 3] / H, P[v * 3 + 1] / H, P[v * 3 + 2] / H);
          nor.push(Math.round(N[v * 3] * 127), Math.round(N[v * 3 + 1] * 127), Math.round(N[v * 3 + 2] * 127));
          // vertex colours are linear; store as sRGB bytes
          for (let c = 0; c < 3; c++) col.push(Math.round(Math.pow(Math.min(1, Math.max(0, C[v * cn + c])), 1 / 2.2) * 255));
        }
        ind.push(map.get(v));
      }
      parts[part].push({ glow: isGlow, p: b64(new Float32Array(pos)), n: b64(new Int8Array(nor)), c: b64(new Uint8Array(col)), i: b64(pos.length / 3 > 65535 ? new Uint32Array(ind) : new Uint16Array(ind)), big: pos.length / 3 > 65535 });
    }
  }
  result[name] = { joints: { hips: jointPos.hips, torso: jointPos.torso, head: jointPos.head }, glow, parts };
  console.log(name, file, 'H', H, 'head joint', jointPos.head, 'torso', jointPos.torso, Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length])));
}
fs.writeFileSync(out, '// generated from ex-online public/models (xs_body_lod1 + glow), split into head / upper / lower\nwindow.ROBOT_PARTS = ' + JSON.stringify(result) + ';\n');
console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
