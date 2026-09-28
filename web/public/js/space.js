// The renderer and deep space: thousands of coloured stars, a nebula painted for each galaxy, the system's sun with a
// lens flare, far-away galaxies, a soft bloom on everything that glows, and automatic resolution scaling for speed.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { rng } from './universe.js';
import { SUN } from './planet.js';

function makeNoise2(seed) {
  const r = rng(seed), G = [];
  for (let i = 0; i < 256; i++) { const a = r() * Math.PI * 2; G.push([Math.cos(a), Math.sin(a)]); }
  const P = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  const h = (x, y) => G[P[(P[x & 255] + y) & 255]];
  const f = t => t * t * (3 - 2 * t);
  const n = (x, y) => { const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y; const d = (gx, gy) => { const g = h(X + gx, Y + gy); return g[0] * (fx - gx) + g[1] * (fy - gy); }; const u = f(fx), v = f(fy); return (d(0, 0) * (1 - u) + d(1, 0) * u) * (1 - v) + (d(0, 1) * (1 - u) + d(1, 1) * u) * v; };
  return (x, y, o = 5) => { let s = 0, a = 0.5, fr = 1; for (let i = 0; i < o; i++) { s += a * n(x * fr, y * fr); fr *= 2; a *= 0.5; } return s; };
}

export class Space {
  constructor(canvas, { lq = false, mobile = false } = {}) {
    this.lq = lq; this.mobile = mobile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !lq, powerPreference: 'high-performance', logarithmicDepthBuffer: false });
    this.maxDpr = lq ? 1 : Math.min(mobile ? 1.5 : 1.5, devicePixelRatio || 1);
    this.dprK = 1;
    this.renderer.setPixelRatio(this.maxDpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = !lq; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x020308);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.4, 60000);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environmentIntensity = 0.45;
    // the sun
    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 3.4);
    this.sunLight.castShadow = !lq;
    this.sunLight.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = this.sunLight.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
    this.sunLight.shadow.bias = -0.0005; this.sunLight.shadow.normalBias = 0.05;
    this.scene.add(this.sunLight, this.sunLight.target);
    this.fill = new THREE.HemisphereLight(0x3a4a6a, 0x05060a, 0.28); this.scene.add(this.fill);
    this.sky = new THREE.Group(); this.scene.add(this.sky);
    this.stars = this.makeStars(); this.sky.add(this.stars);
    this.nebula = null; this.sunSprite = null; this.flares = [];
    this.makeSun('#fff2c8');
    this.setGalaxy('#3a5aa8', 1);
    if (!lq) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.55, 0.82);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.frameMs = 16; this.adaptT = 0;
    addEventListener('resize', () => this.resize()); this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.maxDpr * this.dprK);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.2 ? 74 : 62;
    this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(this.maxDpr * this.dprK); this.composer.setSize(w, h); this.bloom.resolution.set(w / 2, h / 2); }
  }
  makeStars() {
    const n = this.lq ? 2500 : 9000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), r = rng(42);
    const tints = [[1, 1, 1], [0.8, 0.88, 1], [1, 0.92, 0.8], [1, 0.8, 0.7], [0.75, 0.85, 1]];
    for (let i = 0; i < n; i++) {
      // more stars along a band (our own galaxy's disc)
      let z = r() * 2 - 1; if (r() < 0.45) z *= 0.18;
      const a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z), R = 20000;
      pos.set([s * Math.cos(a) * R, z * R, s * Math.sin(a) * R], i * 3);
      const t = tints[Math.floor(r() * tints.length)], b = 0.4 + Math.pow(r(), 3) * 1.6;
      col.set([t[0] * b, t[1] * b, t[2] * b], i * 3); size[i] = 1 + Math.pow(r(), 6) * 5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { dpr: { value: this.maxDpr }, t: { value: 0 } },
      vertexShader: 'attribute float size; attribute vec3 color; varying vec3 vC; uniform float dpr; uniform float t; void main(){ vC = color * (0.85 + 0.15 * sin(t * 2. + position.x)); vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * dpr * 1.3; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; void main(){ vec2 d = gl_PointCoord - .5; float a = smoothstep(.5, 0., length(d)); gl_FragColor = vec4(vC * a * 1.4, a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(geo, mat); p.frustumCulled = false; p.renderOrder = -10;
    return p;
  }
  /** Paint a nebula for this galaxy: coloured gas clouds with dark dust lanes and far galaxies. */
  setGalaxy(tint, seed) {
    if (this.nebula) { this.sky.remove(this.nebula); this.nebula.material.map.dispose(); this.nebula.material.dispose(); }
    const W = this.lq ? 512 : 1024, H = W / 2, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data, n = makeNoise2(seed * 7 + 3), n2 = makeNoise2(seed * 13 + 5);
    const base = new THREE.Color(tint), alt = base.clone().offsetHSL(0.12, 0, 0.05), dust = [0, 0, 0];
    const S = 4 / W * 1.0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = i * S * 2, y = j * S * 2;
      const wrap = i / W; // blend the seam
      const v = (n(x, y, 5) * (1 - wrap) + n(x - W * S * 2, y, 5) * wrap);
      const w = n2(x * 1.7, y * 1.7, 4);
      const band = Math.exp(-Math.pow((j / H - 0.5) * 3.2 + v * 0.8, 2));
      let k = Math.max(0, v * 1.6 + 0.2) * band * 0.9;
      const lane = Math.max(0, w * 2.2 - 0.25) * band;
      const cc = base.clone().lerp(alt, Math.max(0, Math.min(1, w + 0.5)));
      const o = (j * W + i) * 4;
      const kk = Math.max(0, k - lane * 0.9) * 0.55;
      d[o] = Math.min(255, cc.r * 255 * kk + dust[0]); d[o + 1] = Math.min(255, cc.g * 255 * kk); d[o + 2] = Math.min(255, cc.b * 255 * kk); d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // a few far-away spiral galaxies
    const r = rng(seed * 31);
    for (let i = 0; i < 5; i++) {
      const x = r() * W, y = H * (0.2 + r() * 0.6), s = 8 + r() * 18, rot = r() * 3;
      g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, 0.35 + r() * 0.4);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, s); gr.addColorStop(0, 'rgba(255,240,220,.9)'); gr.addColorStop(0.25, 'rgba(200,180,255,.35)'); gr.addColorStop(1, 'rgba(120,120,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, s, 0, 7); g.fill();
      g.strokeStyle = 'rgba(210,200,255,.18)'; g.lineWidth = 1.2; for (let a = 0; a < 2; a++) { g.beginPath(); for (let t = 0; t < 12; t += 0.2) { const rr = t * s / 12; g.lineTo(Math.cos(t * 0.8 + a * Math.PI) * rr, Math.sin(t * 0.8 + a * Math.PI) * rr); } g.stroke(); }
      g.restore();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.nebula = new THREE.Mesh(new THREE.SphereGeometry(25000, 64, 32), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.nebula.renderOrder = -20; this.nebula.rotation.set(0.4, seed, 0.2);
    this.sky.add(this.nebula);
  }
  makeSun(color) {
    for (const f of [this.sunSprite, ...this.flares]) if (f) this.sky.remove(f);
    const disc = (inner, outer, a = 1) => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(inner, `rgba(255,250,235,${a * 0.95})`); gr.addColorStop(outer, 'rgba(255,220,160,.12)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc(0.12, 0.35), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    this.sunSprite.scale.setScalar(3800); this.sky.add(this.sunSprite);
    this.flares = [];
    const ringT = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 40, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(160,200,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t; })();
    for (const [k, s, c] of [[0.3, 0.05, '#ffd8a0'], [0.55, 0.09, '#a0c8ff'], [0.8, 0.03, '#ffb0e0'], [1.1, 0.14, '#c8ffd8']]) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringT, color: c, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0.6 }));
      f.userData = { k, s }; f.renderOrder = 50; this.scene.add(f); this.flares.push(f);
    }
    this.sunLight.color.set(color).lerp(new THREE.Color('#ffffff'), 0.5);
  }
  /** Keep the sky centred on the camera; aim the shadow box at the thing we care about (the UFO). */
  frame(dt, focus) {
    const cam = this.camera;
    this.sky.position.copy(cam.position);
    this.stars.material.uniforms.t.value += dt;
    const sd = SUN.dir;
    this.sunSprite.position.copy(sd).multiplyScalar(18000);
    if (focus) { this.sunLight.position.copy(focus).addScaledVector(sd, 200); this.sunLight.target.position.copy(focus); }
    // lens flare: sprites along the line from the sun through the screen centre
    V.copy(this.sunSprite.position).add(this.sky.position).project(cam);
    const on = V.z < 1 && Math.abs(V.x) < 1.3 && Math.abs(V.y) < 1.3;
    for (const f of this.flares) {
      f.visible = false;
      if (!f.visible) continue;
      const k = f.userData.k, x = V.x * (1 - k * 2), y = V.y * (1 - k * 2);
      V2.set(x, y, 0.5).unproject(cam); f.position.copy(V2);
      const dd = V2.distanceTo(cam.position); f.scale.setScalar(dd * f.userData.s * (cam.fov / 60));
      f.material.opacity = 0.28 * Math.max(0, 1 - Math.hypot(V.x, V.y) * 0.6) * (this.sunVisible ?? 1);
    }
  }
  render(dt) {
    const t0 = performance.now();
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
    // automatic resolution: drop the pixel ratio if frames are slow, raise it again when there's room
    this.frameMs += ((performance.now() - t0) + (this.lastGap || 0) * 0 - this.frameMs) * 0.05;
    this.adaptT += dt;
    if (this.adaptT > 2 && !this.fixedRes) {
      this.adaptT = 0;
      const fps = 1 / Math.max(0.001, this.avgDt || dt);
      if (fps < 42 && this.dprK > 0.55) { this.dprK = Math.max(0.55, this.dprK - 0.12); this.resize(); }
      else if (fps > 57 && this.dprK < 1) { this.dprK = Math.min(1, this.dprK + 0.06); this.resize(); }
    }
    this.avgDt = (this.avgDt || dt) * 0.95 + dt * 0.05;
  }
}
const V = new THREE.Vector3(), V2 = new THREE.Vector3();
