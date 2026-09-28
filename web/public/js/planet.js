// Planets: every surface is painted procedurally on canvases from 3D noise sampled on the sphere (no seams, no
// downloads) — oceans, continents, ice caps, dunes, lava, gas bands, craters, city lights — then wrapped in clouds and
// a glowing atmosphere. On top sits the PAINT layer: a glossy transparent canvas the crew's splats are drawn into.
import * as THREE from 'three';
import { rng, TYPES, GW, GH, dirToUT } from './universe.js';

// ------------------------------------------------------------------ 3D gradient noise (improved Perlin)
function makeNoise(seed) {
  const r = rng(seed), p = new Uint8Array(512), P = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  for (let i = 0; i < 512; i++) p[i] = P[i & 255];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + t * (b - a);
  const grad = (h, x, y, z) => { h &= 15; const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
  function n3(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u), lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u), lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  }
  function fbm(x, y, z, oct = 5, lac = 2.03, gain = 0.5) { let a = 0.5, f = 1, s = 0; for (let i = 0; i < oct; i++) { s += a * n3(x * f, y * f, z * f); f *= lac; a *= gain; } return s; }
  function ridged(x, y, z, oct = 4) { let a = 0.5, f = 1, s = 0; for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(n3(x * f, y * f, z * f))); f *= 2.1; a *= 0.5; } return s; }
  return { n3, fbm, ridged };
}
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const C = s => hex(s);

// palettes per type
const PAL = {
  terran: { deep: C('#07234f'), shallow: C('#1b5c93'), beach: C('#c9b27c'), low: C('#3f7b2f'), forest: C('#24501f'), dry: C('#8a7a4a'), high: C('#6e5f45'), rock: C('#8a8580'), snow: C('#f4f7fb') },
  desert: { a: C('#d9a86a'), b: C('#b77844'), c: C('#8a5634'), d: C('#e8c890'), snow: C('#f2eee8') },
  ocean: { deep: C('#041d44'), shallow: C('#136fa0'), beach: C('#e0d09a'), low: C('#4f9a3a'), forest: C('#2e6a2a'), snow: C('#f4f7fb') },
  ice: { a: C('#e8f2fa'), b: C('#b8d4ea'), c: C('#7aa4c8'), crack: C('#2a5a8a') },
  jungle: { deep: C('#0a3a4a'), shallow: C('#1a6a6a'), a: C('#1f6a1a'), b: C('#3f9a22'), c: C('#0f4a14'), river: C('#2a6a8a') },
  lava: { a: C('#1a1210'), b: C('#3a2a22'), c: C('#5a4034'), lava: C('#ff5a10'), hot: C('#ffd25a') },
  gas: { a: C('#f0dcb0'), b: C('#d8965a'), c: C('#a8643a'), d: C('#fff4e0'), e: C('#c87a4a') },
  toxic: { deep: C('#2a5a0a'), shallow: C('#8ae02a'), a: C('#4a2a4a'), b: C('#6a3a5a'), c: C('#8a6a4a') },
  barren: { a: C('#8a8886'), b: C('#6a6866'), c: C('#a8a6a2'), d: C('#4a4846') },
  crystal: { a: C('#6a2aa8'), b: C('#a86ae8'), c: C('#3ad8e8'), d: C('#2a1a4a') },
  city: { deep: C('#061a34'), shallow: C('#0e3a60'), a: C('#5a5a5e'), b: C('#7a7a80'), c: C('#3a3a40'), park: C('#3a5a2a'), light: C('#ffd88a') },
};
const GAS_TINTS = [['#f0dcb0', '#d8965a', '#a8643a', '#fff4e0', '#c87a4a'], ['#cfe0f0', '#8aa8d0', '#5a78b0', '#f4f8ff', '#6a8ac0'], ['#f0d0e0', '#c87aa8', '#8a4a7a', '#fff0f8', '#a85a8a'], ['#e0f0c8', '#a8c87a', '#6a8a4a', '#f8fff0', '#88a860']];

/**
 * Paint the planet's surface. Returns canvases: color, bump (height), rough, emissive (or null), clouds (or null).
 * W is the colour width (the height is W/2).
 */
export function surfaceCanvases(pl, W = 1024) {
  const H = W / 2, N = makeNoise(pl.seed), T = pl.type, r = rng(pl.seed ^ 0x5151);
  const col = document.createElement('canvas'); col.width = W; col.height = H;
  const bmp = document.createElement('canvas'); bmp.width = W; bmp.height = H;
  const cg = col.getContext('2d'), bg = bmp.getContext('2d');
  const ci = cg.createImageData(W, H), bi = bg.createImageData(W, H), cd = ci.data, bd = bi.data;
  const emissive = T === 'lava' || T === 'city' || T === 'toxic';
  let em = null, ed = null, eimg = null;
  if (emissive) { em = document.createElement('canvas'); em.width = W; em.height = H; eimg = em.getContext('2d').createImageData(W, H); ed = eimg.data; }
  const P = PAL[T] || PAL.terran;
  const gasTint = GAS_TINTS[pl.seed % GAS_TINTS.length].map(hex);
  const fq = T === 'gas' ? 1.2 : 1.6 + (pl.R / 200);
  const seaLevel = T === 'ocean' ? 0.12 : T === 'terran' ? 0.0 : T === 'jungle' ? -0.12 : T === 'city' ? -0.04 : T === 'toxic' ? 0.02 : -9;
  const ox = r() * 100, oy = r() * 100, oz = r() * 100;
  // craters for rocky worlds
  const craters = [];
  if (T === 'barren' || T === 'ice' || T === 'desert' && r() < 0.5) {
    const n = T === 'barren' ? 90 : 30;
    for (let i = 0; i < n; i++) { const z = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - z * z); craters.push([s * Math.cos(a), z, s * Math.sin(a), Math.pow(r(), 2.2) * 0.22 + 0.015]); }
  }
  for (let j = 0; j < H; j++) {
    const th = (j + 0.5) / H * Math.PI, st = Math.sin(th), y = Math.cos(th), lat = Math.abs(y);
    for (let i = 0; i < W; i++) {
      const ph = (i + 0.5) / W * Math.PI * 2, x = -Math.cos(ph) * st, z = Math.sin(ph) * st;
      const X = x * fq + ox, Y = y * fq + oy, Z = z * fq + oz;
      let c, h = 0, rough = 0.9, e = null;
      if (T === 'gas') {
        const w = N.fbm(X * 1.5, Y * 1.5, Z * 1.5, 4) * 0.6;
        const band = y * 7 + w * 2.2 + N.fbm(x * 0.8 + ox, y * 9 + oy, z * 0.8, 3) * 0.6;
        const k = (Math.sin(band * 2.1) * 0.5 + 0.5), k2 = Math.sin(band * 5.3 + w * 4) * 0.5 + 0.5;
        c = mix(mix(gasTint[0], gasTint[1], k), mix(gasTint[2], gasTint[3], k2), 0.35 + 0.3 * Math.sin(band));
        const spot = N.n3(X * 3, Y * 3, Z * 3); if (spot > 0.45) c = mix(c, gasTint[4], sstep(0.45, 0.62, spot));
        h = 0.5; rough = 0.55;
      } else {
        const warp = N.fbm(X * 0.7, Y * 0.7, Z * 0.7, 3) * 0.8;
        const n = N.fbm(X + warp, Y + warp, Z + warp, 6);
        const m = N.fbm(X * 1.7 + 30, Y * 1.7, Z * 1.7, 3);
        h = n;
        if (T === 'terran' || T === 'ocean') {
          // blend sea and land over a narrow band so coastlines stay smooth
          const k = Math.max(0, n - seaLevel), wl = sstep(seaLevel - 0.006, seaLevel + 0.006, n);
          const sea = mix(P.deep, P.shallow, sstep(seaLevel - 0.35, seaLevel, n));
          let land = mix(mix(P.low, P.forest, sstep(-0.1, 0.25, m)), T === 'terran' ? P.dry : P.low, sstep(0.1, 0.35, -m) * (1 - lat));
          land = mix(P.beach, land, sstep(0.012, 0.035, k));
          land = mix(land, P.high || land, sstep(0.18, 0.32, k)); land = mix(land, P.rock || land, sstep(0.3, 0.42, k));
          if (k > 0.44) land = mix(land, P.snow, sstep(0.44, 0.52, k));
          c = mix(sea, land, wl); rough = 0.28 + 0.62 * wl; h = Math.max(n, seaLevel);
          const cap = sstep(0.8, 0.9, lat + m * 0.08); if (cap > 0) { c = mix(c, P.snow, cap); rough = mix([rough], [0.6], cap)[0]; }
        } else if (T === 'desert') {
          const dune = Math.sin((x * 40 + N.n3(X * 3, Y * 3, Z * 3) * 6) + y * 12) * 0.5 + 0.5;
          c = mix(mix(P.a, P.d, dune * 0.4), P.b, sstep(-0.05, 0.25, n)); c = mix(c, P.c, sstep(0.25, 0.4, n));
          h = n + dune * 0.05;
          const cap = sstep(0.9, 0.96, lat); if (cap) c = mix(c, P.snow, cap);
        } else if (T === 'ice') {
          const crack = N.ridged(X * 2.5, Y * 2.5, Z * 2.5, 3);
          c = mix(P.a, P.b, sstep(-0.2, 0.3, n)); c = mix(c, P.c, sstep(0.25, 0.45, n));
          if (crack > 0.9) c = mix(c, P.crack, sstep(0.9, 0.98, crack) * 0.8);
          rough = 0.35 + sstep(0, 0.4, n) * 0.4; h = n - (crack > 0.9 ? 0.1 : 0);
        } else if (T === 'jungle') {
          const river = N.ridged(X * 1.3 + 7, Y * 1.3, Z * 1.3, 3);
          const wl = sstep(seaLevel - 0.006, seaLevel + 0.006, n);
          let land = mix(mix(P.a, P.b, sstep(-0.2, 0.3, m)), P.c, sstep(0.1, 0.4, n - seaLevel)); const rv = sstep(0.925, 0.95, river); land = mix(land, P.river, rv * 0.85);
          c = mix(mix(P.deep, P.shallow, sstep(seaLevel - 0.3, seaLevel, n)), land, wl); rough = 0.3 + 0.6 * wl * (1 - rv); h = Math.max(n, seaLevel) - rv * 0.04;
        } else if (T === 'lava') {
          const flow = N.ridged(X * 1.4, Y * 1.4, Z * 1.4, 4);
          c = mix(mix(P.a, P.b, sstep(-0.3, 0.3, n)), P.c, sstep(0.3, 0.5, n));
          const hot = sstep(0.86, 0.97, flow + m * 0.05);
          if (hot > 0) { c = mix(c, mix(P.lava, P.hot, sstep(0.95, 1.02, flow)), hot); e = mix([0, 0, 0], mix(P.lava, P.hot, sstep(0.95, 1.02, flow)), hot); h -= hot * 0.1; rough = 0.9 - hot * 0.5; }
        } else if (T === 'toxic') {
          if (n < seaLevel) { const k = sstep(seaLevel - 0.3, seaLevel, n); c = mix(P.deep, P.shallow, k); e = mix([0, 0, 0], [60, 150, 20], 0.35 + 0.4 * k); rough = 0.25; h = seaLevel; }
          else { c = mix(mix(P.a, P.b, sstep(-0.2, 0.3, m)), P.c, sstep(0.15, 0.4, n - seaLevel)); }
        } else if (T === 'barren') {
          c = mix(mix(P.b, P.a, sstep(-0.3, 0.2, n)), P.c, sstep(0.2, 0.45, n)); c = mix(c, P.d, sstep(0.2, 0.5, -m) * 0.4);
        } else if (T === 'crystal') {
          const q = Math.floor((n + 1) * 7) / 7, fac = N.n3(X * 6, Y * 6, Z * 6);
          c = mix(mix(P.d, P.a, sstep(-0.5, 0.2, q)), P.b, sstep(0.1, 0.5, q)); if (fac > 0.35) c = mix(c, P.c, sstep(0.35, 0.55, fac) * 0.7);
          h = q; rough = 0.22;
        } else if (T === 'city') {
          if (n < seaLevel) { c = mix(P.deep, P.shallow, sstep(seaLevel - 0.3, seaLevel, n)); rough = 0.25; h = seaLevel; }
          else {
            const dens = sstep(-0.1, 0.3, m + (n - seaLevel)), gx = (i % 6 === 0) || (j % 6 === 0), block = ((i / 6 | 0) * 7 + (j / 6 | 0) * 13) % 5;
            c = mix(P.park, mix(P.a, P.b, block / 5), dens); if (gx && dens > 0.3) c = mix(c, P.c, 0.6);
            if (dens > 0.25) { const lit = (gx ? 0.9 : ((i * 31 + j * 17) % 7 === 0) ? 0.7 : 0) * dens; if (lit) e = mix([0, 0, 0], P.light, lit); }
            h = n + (gx ? 0 : dens * 0.05); rough = 0.7;
          }
        }
      }
      // craters: a bowl and a bright rim
      for (let k = 0; k < craters.length; k++) {
        const cr = craters[k], dd = x * cr[0] + y * cr[1] + z * cr[2];
        if (dd < 0.95) continue;
        const ang = Math.acos(Math.min(1, dd)) / cr[3];
        if (ang < 1.25) { const bowl = ang < 1 ? -(1 - ang * ang) * 0.25 : 0, rim = Math.exp(-Math.pow((ang - 1) * 5, 2)) * 0.12; h += (bowl + rim) * cr[3] * 6; c = mix(c, ang < 1 ? mix(c, [40, 40, 40], 0.25) : mix(c, [230, 230, 230], 0.25), 0.6); }
      }
      const o = (j * W + i) * 4;
      cd[o] = c[0]; cd[o + 1] = c[1]; cd[o + 2] = c[2]; cd[o + 3] = 255;
      const hv = clamp(h * 0.9 + 0.5) * 255;
      bd[o] = hv; bd[o + 1] = rough * 255; bd[o + 2] = hv; bd[o + 3] = 255;
      if (ed) { if (e) { ed[o] = e[0]; ed[o + 1] = e[1]; ed[o + 2] = e[2]; } ed[o + 3] = 255; }
    }
  }
  cg.putImageData(ci, 0, 0); bg.putImageData(bi, 0, 0);
  if (em) em.getContext('2d').putImageData(eimg, 0, 0);
  // clouds on worlds with weather
  let clouds = null;
  const cloudy = { terran: 0.52, ocean: 0.42, jungle: 0.35, toxic: 0.55, ice: 0.62, gas: 9, city: 0.55, desert: 0.72, lava: 0.62 }[T];
  if (cloudy && cloudy < 9) {
    const CW = Math.min(1024, W), CH = CW / 2;
    clouds = document.createElement('canvas'); clouds.width = CW; clouds.height = CH;
    const g = clouds.getContext('2d'), img = g.createImageData(CW, CH), d = img.data, M = makeNoise(pl.seed + 7);
    const tint = T === 'toxic' ? [210, 255, 170] : T === 'lava' ? [80, 70, 66] : T === 'desert' ? [255, 236, 210] : [255, 255, 255];
    for (let j = 0; j < CH; j++) {
      const th = (j + 0.5) / CH * Math.PI, st = Math.sin(th), y = Math.cos(th);
      for (let i = 0; i < CW; i++) {
        const ph = (i + 0.5) / CW * Math.PI * 2, x = -Math.cos(ph) * st, z = Math.sin(ph) * st;
        const w = M.fbm(x * 1.2, y * 3 + 4, z * 1.2, 3) * 1.4;
        const v = M.fbm(x * 2.4 + w, y * 4.8 + w, z * 2.4, 5);
        const a = sstep(cloudy - 0.52 + 0.02, cloudy - 0.52 + 0.3, v + 0.02) * 0.95;
        const o = (j * CW + i) * 4; d[o] = tint[0]; d[o + 1] = tint[1]; d[o + 2] = tint[2]; d[o + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
  return { col, bmp, em, clouds };
}

// ------------------------------------------------------------------ materials
function canvasTex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; t.generateMipmaps = true; return t; }
export const SUN = { dir: new THREE.Vector3(1, 0.35, 0.4).normalize() };
/** Patch a material so its emissive glow only shows on the night side (city lights), or is stronger there (lava). */
function nightGlow(mat, dayK = 0) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.sunDir = { value: SUN.dir };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN;').replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWN;\nuniform vec3 sunDir;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(${dayK.toFixed(2)}, 1.0, smoothstep(0.12, -0.18, dot(normalize(vWN), sunDir)));`);
  };
}
function atmosphere(R, color, strength = 1) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) }, sunDir: { value: SUN.dir }, k: { value: strength } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 c; uniform vec3 sunDir; uniform float k; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 V = normalize(cameraPosition - vW); float rim = 1.0 - abs(dot(V, vN)); float day = smoothstep(-0.35, 0.5, dot(vN, sunDir));
        float a = pow(rim, 2.2) * (0.25 + 0.95 * day) * k; vec3 col = mix(c, vec3(1.0, 0.6, 0.4), pow(rim, 6.) * (1.0 - day) * 0.6);
        gl_FragColor = vec4(col * a * 1.6, a); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 96, 48), mat); m.renderOrder = 2;
  // a thin front-side haze so the limb looks thick
  const hz = new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) }, sunDir: { value: SUN.dir }, k: { value: strength } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 c; uniform vec3 sunDir; uniform float k; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 V = normalize(cameraPosition - vW); float rim = 1.0 - max(0., dot(V, vN)); float day = smoothstep(-0.25, 0.6, dot(vN, sunDir));
        float a = pow(rim, 3.0) * 0.85 * day * k; gl_FragColor = vec4(c * a, a); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const h = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 96, 48), hz); h.renderOrder = 3;
  const g = new THREE.Group(); g.add(m, h);
  return g;
}
function ringMesh(pl, R) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 8; const g = c.getContext('2d'), r = rng(pl.seed + 3);
  const base = pl.type === 'gas' ? GAS_TINTS[pl.seed % GAS_TINTS.length][0] : '#b8b0a0';
  for (let x = 0; x < 512; x++) { const a = (0.25 + r() * 0.5) * (Math.sin(x * 0.07) * 0.3 + 0.7) * (x < 30 || x > 490 ? 0.3 : 1) * (x > 300 && x < 318 ? 0.1 : 1); g.fillStyle = base; g.globalAlpha = a; g.fillRect(x, 0, 1, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.RingGeometry(R * 1.35, R * 2.3, 128, 1);
  const pos = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < pos.count; i++) { const l = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (l - R * 1.35) / (R * 0.95), 0.5); }
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, transparent: true, side: THREE.DoubleSide, roughness: 0.8, depthWrite: false }));
  m.rotation.x = -Math.PI / 2 + 0.35; m.rotation.y = 0.2; m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ the paint layer
const PAINT_SHADE = (hexc, k) => { const c = new THREE.Color(hexc); c.offsetHSL(0, 0, k); return '#' + c.getHexString(); };
export class PaintLayer {
  constructor(R, res) {
    this.R = R; this.W = res; this.H = res / 2;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.W; this.canvas.height = this.H;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8; this.tex.wrapS = THREE.RepeatWrapping;
    // glossy wet paint: low roughness and a clearcoat
    this.mat = new THREE.MeshPhysicalMaterial({ map: this.tex, transparent: true, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(R * 1.0015, 192, 96), this.mat); this.mesh.renderOrder = 1; this.mesh.receiveShadow = true;
    this.dirty = true; this.lastUp = 0;
  }
  /** One splat: a blob with droplets, drawn in texture space with the latitude stretch taken into account. */
  splat(d, a, color, seed = 1, big = false) {
    const [u, t] = dirToUT(d[0], d[1], d[2]);
    const g = this.g, W = this.W, H = this.H, r = rng(seed);
    g.globalCompositeOperation = 'source-over';
    const drops = [[0, 0, 1]];
    const n = big ? 14 : 7;
    for (let i = 0; i < n; i++) { const ang = r() * Math.PI * 2, k = 0.7 + r() * 0.55; drops.push([Math.cos(ang) * k, Math.sin(ang) * k, 0.12 + r() * (big ? 0.3 : 0.24)]); }
    for (let i = 0; i < 3; i++) { const ang = r() * Math.PI * 2; drops.push([Math.cos(ang) * 0.45, Math.sin(ang) * 0.45, 0.62]); }
    const base = PAINT_SHADE(color, (r() - 0.5) * 0.08);
    for (const [dx, dy, s] of drops) {
      const ta = t + dy * a / Math.PI, th = ta * Math.PI;
      const sinT = Math.max(0.04, Math.sin(Math.min(Math.PI - 0.001, Math.max(0.001, th))));
      const ry = s * a / Math.PI * H, rx = s * a / (Math.PI * 2) * W / sinT;
      const cx = (u + dx * a / (Math.PI * 2) / sinT) * W, cy = ta * H;
      g.fillStyle = base;
      if (rx > W * 0.5 || cy - ry < 0 || cy + ry > H) { // over a pole: fill the whole cap band
        const top = Math.max(0, cy - ry), bot = Math.min(H, cy + ry);
        g.fillRect(0, top, W, bot - top);
        if (cy - ry < 0) g.fillRect(0, 0, W, Math.max(1, bot));
        if (cy + ry > H) g.fillRect(0, top, W, H - top);
        continue;
      }
      for (const off of [0, -W, W]) { if (cx + off + rx < 0 || cx + off - rx > W) continue; g.beginPath(); g.ellipse(cx + off, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
    }
    this.dirty = true;
  }
  erase(d, a) {
    const [u, t] = dirToUT(d[0], d[1], d[2]), g = this.g, W = this.W, H = this.H;
    const sinT = Math.max(0.04, Math.sin(t * Math.PI)), ry = a / Math.PI * H, rx = Math.min(W, a / (Math.PI * 2) * W / sinT), cx = u * W, cy = t * H;
    g.globalCompositeOperation = 'destination-out';
    for (const off of [0, -W, W]) {
      g.save(); g.translate(cx + off, cy); g.scale(rx / ry, 1);
      const gr = g.createRadialGradient(0, 0, ry * 0.3, 0, 0, ry); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, ry, 0, Math.PI * 2); g.fill(); g.restore();
    }
    g.globalCompositeOperation = 'source-over';
    this.dirty = true;
  }
  /** Redraw everything from the server's paint grid (joining late, or coming back to a planet). */
  fromGrid(grid, colors) {
    const g = this.g, W = this.W, H = this.H, cw = W / GW, ch = H / GH;
    g.clearRect(0, 0, W, H);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const v = grid[j * GW + i]; if (!v) continue;
      g.fillStyle = colors[v] || '#7bd13b';
      g.beginPath(); g.ellipse((i + 0.5) * cw, (j + 0.5) * ch, cw * 0.78, ch * 0.78, 0, 0, Math.PI * 2); g.fill();
    }
    this.dirty = true;
  }
  update(now) { if (this.dirty && now - this.lastUp > 120) { this.tex.needsUpdate = true; this.dirty = false; this.lastUp = now; } }
  dispose() { this.tex.dispose(); this.mat.dispose(); this.mesh.geometry.dispose(); }
}

// close-up detail: a tiling noise that breaks up the surface when you fly low
let detailTex = null;
function detail() {
  if (detailTex) return detailTex;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data, r = rng(4242);
  const L = [8, 16, 32, 64].map(n => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = r(); return { n, a }; });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0, w = 0.5;
    for (const { n, a } of L) { const fx = x / N * n, fy = y / N * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0; const s = t => t * t * (3 - 2 * t); const at = (i, j) => a[((j % n + n) % n) * n + ((i % n + n) % n)]; const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * s(tx), bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * s(tx); v += (top + (bot - top) * s(ty)) * w; w *= 0.5; }
    const o = (y * N + x) * 4; d[o] = d[o + 1] = d[o + 2] = clamp(v / 0.94) * 255; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  detailTex = new THREE.CanvasTexture(c); detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping; detailTex.anisotropy = 8;
  return detailTex;
}
function addDetail(mat, scale) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.detailMap = { value: detail() }; sh.uniforms.detailScale = { value: new THREE.Vector2(scale, scale / 2) };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D detailMap; uniform vec2 detailScale;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat dA = texture2D(detailMap, vMapUv * detailScale).r, dB = texture2D(detailMap, vMapUv * detailScale * 5.3).r;\ndiffuseColor.rgb *= mix(0.78, 1.16, dA * 0.6 + dB * 0.4);');
  };
}

// ------------------------------------------------------------------ a whole planet
export function buildPlanet(pl, { res = 1024, paintRes = 2048 } = {}) {
  const R = pl.R, G = new THREE.Group();
  const cv = surfaceCanvases(pl, res);
  const map = canvasTex(cv.col), bump = canvasTex(cv.bmp, false);
  const mat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: pl.type === 'gas' ? 0 : 2.2, roughnessMap: bump, roughness: 1, metalness: pl.type === 'crystal' ? 0.25 : 0 });
  if (cv.em) { mat.emissiveMap = canvasTex(cv.em); mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = pl.type === 'city' ? 1.6 : pl.type === 'lava' ? 2.2 : 0.9; nightGlow(mat, pl.type === 'city' ? 0 : 0.45); }
  if (pl.type !== 'gas') addDetail(mat, Math.round(R / 3));
  const surface = new THREE.Mesh(new THREE.SphereGeometry(R, 192, 96), mat); surface.receiveShadow = true;
  G.add(surface);
  const paint = new PaintLayer(R, paintRes); G.add(paint.mesh);
  let clouds = null;
  if (cv.clouds) {
    const ct = canvasTex(cv.clouds);
    clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 128, 64), new THREE.MeshStandardMaterial({ map: ct, alphaMap: null, transparent: true, depthWrite: false, roughness: 1, opacity: 0.92 }));
    clouds.renderOrder = 4; G.add(clouds);
  }
  const atmo = atmosphere(R, TYPES[pl.type].atmo, pl.type === 'barren' ? 0.25 : pl.type === 'gas' ? 1.2 : 1); G.add(atmo);
  if (pl.rings) G.add(ringMesh(pl, R));
  return { group: G, surface, paint, clouds, atmo, R, dispose() { G.traverse(o => { o.geometry?.dispose(); if (o.material) { for (const k of ['map', 'bumpMap', 'emissiveMap', 'roughnessMap']) o.material[k]?.dispose?.(); o.material.dispose(); } }); paint.dispose(); } };
}
/** A small planet for the star-system map, with the crew's paint on it if it's conquered (or partly). */
const miniCache = new Map();
export function miniPlanet(pl, doneColor = null, pct = 0) {
  const key = pl.key + (doneColor || '') + pct;
  let cv = miniCache.get(pl.key);
  if (!cv) { cv = surfaceCanvases(pl, 256); miniCache.set(pl.key, cv); }
  const col = document.createElement('canvas'); col.width = 256; col.height = 128; const g = col.getContext('2d'); g.drawImage(cv.col, 0, 0);
  if (doneColor || pct) {
    const r = rng(pl.seed + 11), n = doneColor ? 90 : Math.round(pct * 1.3);
    g.fillStyle = doneColor || '#7bd13b';
    for (let i = 0; i < n; i++) { const x = r() * 256, y = 12 + r() * 104, s = 6 + r() * 12; g.beginPath(); g.ellipse(x, y, s * 1.3, s, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(x - 256, y, s * 1.3, s, 0, 0, 7); g.fill(); }
  }
  const mat = new THREE.MeshStandardMaterial({ map: canvasTex(col), roughness: 0.8 });
  if (cv.em) { mat.emissiveMap = canvasTex(cv.em); mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 1; nightGlow(mat, pl.type === 'city' ? 0 : 0.45); }
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  void key;
  const G = new THREE.Group(); G.add(m);
  G.add(atmosphere(1, TYPES[pl.type].atmo, pl.type === 'barren' ? 0.25 : 0.9));
  if (pl.rings) G.add(ringMesh(pl, 1));
  if (cv.clouds) { const cm = new THREE.Mesh(new THREE.SphereGeometry(1.02, 48, 24), new THREE.MeshStandardMaterial({ map: canvasTex(cv.clouds), transparent: true, depthWrite: false })); G.add(cm); G.userData.clouds = cm; }
  G.userData.surface = m;
  return G;
}
