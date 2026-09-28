// The things in space: the UFO (a chrome saucer with a glass dome, the googly crew sitting inside, its own googly eyes,
// rim lights, the tractor beam and the force shield), paint drones, and the planet's googly defenders — flak turrets,
// fighter jets, paint scrubbers, shield domes, storms and the Guardian — plus the natives, coins and the victory flag.
import * as THREE from 'three';
import { Googly } from './googly.js';

const std = (color, rough = 0.5, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const phys = o => new THREE.MeshPhysicalMaterial(o);
const glow = (color, k = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
function cvTex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

// ------------------------------------------------------------------ googly eyes (a disc with a pupil that rattles around)
export class GooglyEye {
  constructor(r = 0.3, { rim = 0x15151a } = {}) {
    this.node = new THREE.Group(); this.r = r;
    const rimM = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.07, r * 1.07, r * 0.24, 32), std(rim, 0.4)); rimM.rotation.x = Math.PI / 2; this.node.add(rimM);
    const white = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.28, 32), phys({ color: 0xffffff, roughness: 0.12, clearcoat: 1 })); white.rotation.x = Math.PI / 2; this.node.add(white);
    // the clear bubble over the eye
    const bub = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), phys({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.18, clearcoat: 1 })); bub.rotation.x = Math.PI / 2; bub.position.z = r * 0.1; bub.scale.y = 0.35; this.node.add(bub);
    this.pupil = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, r * 0.1, 24), std(0x050505, 0.2)); this.pupil.rotation.x = Math.PI / 2; this.pupil.position.z = r * 0.16; this.node.add(this.pupil);
    this.p = new THREE.Vector2(0, -r * 0.4); this.v = new THREE.Vector2(); this.last = null; this.lastV = new THREE.Vector3();
  }
  /** gravity: world-space "down" for the pupil (toward the planet), strength in m/s² */
  update(dt, down = DOWN, g = 20) {
    const n = this.node; n.getWorldPosition(E); n.getWorldQuaternion(Qt);
    UX.set(1, 0, 0).applyQuaternion(Qt); UY.set(0, 1, 0).applyQuaternion(Qt);
    if (!this.last) { this.last = E.clone(); this.lastV.set(0, 0, 0); }
    const ve = V.copy(E).sub(this.last).divideScalar(Math.max(dt, 1e-3));
    const ae = V2.copy(ve).sub(this.lastV).divideScalar(Math.max(dt, 1e-3)); if (ae.length() > 300) ae.setLength(300);
    this.last.copy(E); this.lastV.copy(ve);
    const a3 = V3.copy(down).multiplyScalar(g).sub(ae.multiplyScalar(0.25)), ax = a3.dot(UX) / this.r * 0.12, ay = a3.dot(UY) / this.r * 0.12;
    const maxD = this.r * 0.48;
    for (let k = 0; k < 3; k++) {
      const h = dt / 3; this.v.x += ax * h; this.v.y += ay * h; this.v.multiplyScalar(1 - 1.8 * h);
      this.p.x += this.v.x * h * this.r * 4; this.p.y += this.v.y * h * this.r * 4;
      const dd = this.p.length(); if (dd > maxD) { const nx = this.p.x / dd, ny = this.p.y / dd; this.p.set(nx * maxD, ny * maxD); const vn = this.v.x * nx + this.v.y * ny; if (vn > 0) { this.v.x -= nx * vn * 1.6; this.v.y -= ny * vn * 1.6; } }
    }
    this.pupil.position.set(this.p.x, this.p.y, this.r * 0.16);
  }
}
const DOWN = new THREE.Vector3(0, -1, 0), V = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), E = new THREE.Vector3(), UX = new THREE.Vector3(), UY = new THREE.Vector3(), Qt = new THREE.Quaternion();

// ------------------------------------------------------------------ the UFO
const hullTex = cvTex(1024, 256, (g, w, h) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},255,0.03)`; g.fillRect(Math.random() * w, Math.random() * h, 3, 1); }
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2;
  for (let i = 0; i < 24; i++) { const x = i / 24 * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (const y of [40, 90, 150, 200]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,.5)'; for (let i = 0; i < 48; i++) for (const y of [36, 86, 146, 196]) { g.beginPath(); g.arc(i / 48 * w + 10, y, 2, 0, 7); g.fill(); }
});
hullTex.wrapS = THREE.RepeatWrapping;
export const SEATS = [[0, 0.1, 0.75], [-0.85, 0.1, -0.1], [0, 0.1, -0.85], [0.85, 0.1, -0.1]];   // pilot at the front
export class UFO {
  constructor({ hull = '#7bd13b' } = {}) {
    this.group = new THREE.Group();
    this.body = new THREE.Group(); this.group.add(this.body);
    // saucer profile (radius, height), bottom to top
    const prof = [[0.01, -0.95], [0.9, -0.92], [1.5, -0.78], [2.6, -0.45], [3.5, -0.08], [3.62, 0.02], [3.5, 0.14], [2.7, 0.42], [1.9, 0.6], [0.01, 0.62]].map(([x, y]) => new THREE.Vector2(x, y));
    this.hullMat = phys({ color: hull, metalness: 0.5, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, map: hullTex });
    const saucer = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), this.hullMat); saucer.castShadow = true; saucer.receiveShadow = true; this.body.add(saucer);
    const chrome = phys({ color: 0xdfe6ee, metalness: 1, roughness: 0.12, clearcoat: 1 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(3.56, 0.1, 10, 96), chrome); band.rotation.x = Math.PI / 2; band.position.y = 0.03; this.body.add(band);
    // rim lights
    this.lights = [];
    for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; const l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), glow(0xffffff, 2.5)); l.position.set(Math.cos(a) * 3.3, -0.12, Math.sin(a) * 3.3); this.body.add(l); this.lights.push(l); }
    // underside: the engine ring and the beam emitter
    this.engine = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.16, 12, 64), glow(0x7af0ff, 3)); this.engine.rotation.x = Math.PI / 2; this.engine.position.y = -0.86; this.body.add(this.engine);
    this.emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.18, 32), glow(0xb8ffb0, 1.2)); this.emitter.position.y = -0.95; this.body.add(this.emitter);
    // the paint cannon under the nose, and three gunner turrets on the rim
    const gun = std(0x2a2c32, 0.35, 0.7);
    this.cannon = new THREE.Group(); const cb = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.4, 16), gun); cb.rotation.x = Math.PI / 2; cb.position.z = 0.5; this.cannon.add(cb);
    this.cannonTip = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.16, 16), glow(hull, 1)); this.cannonTip.rotation.x = Math.PI / 2; this.cannonTip.position.z = 1.2; this.cannon.add(this.cannonTip);
    this.cannon.position.set(0, -0.8, 1.6); this.body.add(this.cannon);
    this.turrets = [];
    for (const a of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const t = new THREE.Group(); t.position.set(Math.sin(a) * 2.9, 0.08, Math.cos(a) * 2.9);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), chrome); t.add(ball);
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.9, 10), gun); br.rotation.x = Math.PI / 2; br.position.z = 0.45; t.add(br);
      t.visible = false; this.body.add(t); this.turrets.push(t);
    }
    // the dome and the crew
    this.domeMat = phys({ color: 0xcfefff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.22, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2.2 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.95, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), this.domeMat); dome.position.y = 0.5; dome.renderOrder = 5; this.body.add(dome);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.08, 48), std(0x24262c, 0.6, 0.3)); floor.position.y = 0.55; this.body.add(floor);
    const console_ = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.5, 20), std(0x30323a, 0.4, 0.6)); console_.position.set(0, 0.8, 0.1); this.body.add(console_);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.04), glow(0x3affb0, 1.2)); screen.position.set(0, 1.12, 0.25); screen.rotation.x = -0.5; this.body.add(screen);
    this.crew = [null, null, null, null];
    // the saucer's own googly eyes, on the nose
    this.eyes = [];
    for (const s of [-1, 1]) { const e = new GooglyEye(0.46); e.node.position.set(s * 0.62, 0.52, 2.62); e.node.rotation.set(-0.42, s * 0.22, 0); this.body.add(e.node); this.eyes.push(e); }
    // the beam and the shield bubble
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 }, c: { value: new THREE.Color(0xb8ffb0) }, k: { value: 0 } },
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform float t; uniform vec3 c; uniform float k; varying vec2 vU; void main(){ float r = 0.55 + 0.45 * sin(vU.y * 40. + t * 8.); float edge = pow(1.0 - abs(vU.x * 2. - 1.), 0.6); float a = (0.18 + 0.2 * r) * (0.4 + 0.6 * vU.y) * k; gl_FragColor = vec4(c * (1.2 + r * 0.6), a); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 1, 40, 1, true), this.beamMat); this.beam.visible = false; this.group.add(this.beam);
    this.shieldMat = new THREE.ShaderMaterial({
      uniforms: { k: { value: 0 }, c: { value: new THREE.Color(0x5ab8ff) } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float k; uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.5); gl_FragColor = vec4(c * 1.6, (f * 0.8 + 0.06) * k); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(4.4, 32, 16), this.shieldMat); this.shield.scale.y = 0.62; this.group.add(this.shield);
    this.spot = new THREE.PointLight(0xb8ffb0, 0, 40, 1.6); this.spot.position.y = -2; this.group.add(this.spot);
    this.t = 0; this.shieldK = 0; this.beamK = 0; this.bank = 0; this.pitch = 0;
    this.drones = [];
  }
  setHull(c) { this.hullMat.color.set(c); this.cannonTip.material.color.set(c); this.cannonTip.material.emissive.set(c); }
  /** crew: [{name, color, skin} | null] × 4 — only real people, no computer crew */
  setCrew(list) {
    for (let i = 0; i < 4; i++) {
      const c = list[i], key = c ? c.color + c.skin + c.name : '';
      if (this.crew[i]?.key === key) continue;
      if (this.crew[i]) this.body.remove(this.crew[i].g.group);
      this.crew[i] = null;
      if (i > 0) this.turrets[i - 1].visible = !!c;
      if (!c) continue;
      const g = new Googly({ color: c.color, skin: c.skin, role: 'civ', local: true });
      g.group.scale.setScalar(0.78); const [x, y, z] = SEATS[i]; g.group.position.set(x, 0.55 + y, z);
      g.group.rotation.y = i === 0 ? 0 : Math.atan2(x, z);
      this.body.add(g.group); this.crew[i] = { g, key };
    }
  }
  setDrones(n) {
    while (this.drones.length < n) {
      const d = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), phys({ color: 0xe8eef5, metalness: 0.9, roughness: 0.2, clearcoat: 1 })); d.add(b);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 6, 24), glow(0x7af0ff, 2)); ring.rotation.x = Math.PI / 2; d.add(ring);
      const e = new GooglyEye(0.26); e.node.position.set(0, 0.05, 0.44); d.add(e.node); d.userData.eye = e;
      d.castShadow = true; this.group.parent?.add(d); this.drones.push(d);
    }
    while (this.drones.length > n) { const d = this.drones.pop(); d.parent?.remove(d); }
  }
  hitShield() { this.shieldK = 1; }
  /**
   * p: position, up: away from the planet, f: heading. v: velocity (for banking). beamLen: metres to the ground (0 = off).
   * aims: per seat world directions for the turrets.
   */
  update(dt, { p, up, f, v, beamLen = 0, aims = [], firing = [], shieldFrac = 0, down = false }) {
    this.t += dt;
    this.group.position.copy(p);
    const rt = V.copy(f).cross(up).normalize();
    const fwdSpeed = v ? v.dot(f) : 0, side = v ? v.dot(rt) : 0;
    this.bank += ((down ? 0.6 : -side * 0.018) - this.bank) * (1 - Math.exp(-4 * dt));
    this.pitch += ((down ? 0.4 : fwdSpeed * 0.01) - this.pitch) * (1 - Math.exp(-4 * dt));
    M4.makeBasis(V6.copy(up).cross(f).normalize(), up, f); this.group.quaternion.setFromRotationMatrix(M4);
    // hover wobble, bank into turns
    this.body.rotation.set(this.pitch + Math.sin(this.t * 1.3) * 0.02, 0, -this.bank + Math.sin(this.t * 0.9) * 0.025);
    this.body.position.y = Math.sin(this.t * 1.7) * 0.15;
    this.body.rotation.y = down ? this.t * 3 : 0;
    for (let i = 0; i < this.lights.length; i++) { const k = (Math.sin(this.t * 6 - i * 0.9) * 0.5 + 0.5); this.lights[i].material.emissiveIntensity = 0.5 + k * 3; this.lights[i].material.emissive.setHSL((i / this.lights.length + this.t * 0.1) % 1, 0.8, 0.55); }
    this.engine.material.emissiveIntensity = 2 + Math.sin(this.t * 20) * 0.3 + Math.min(2, Math.abs(fwdSpeed) * 0.05);
    this.beamK += ((beamLen > 0 ? 1 : 0) - this.beamK) * (1 - Math.exp(-6 * dt));
    this.beam.visible = this.beamK > 0.02;
    if (this.beam.visible) { const L = Math.max(2, beamLen); this.beam.scale.set(1, L, 1); this.beam.position.set(0, -1 - L / 2, 0); this.beamMat.uniforms.t.value = this.t; this.beamMat.uniforms.k.value = this.beamK; const w = 1; this.beam.geometry.parameters.radiusBottom = w; }
    this.spot.intensity = this.beamK * 400;
    this.emitter.material.emissiveIntensity = 1.2 + this.beamK * 4;
    this.shieldK = Math.max(0, this.shieldK - dt * 2.5);
    this.shieldMat.uniforms.k.value = Math.max(this.shieldK, shieldFrac > 0 ? 0.08 : 0);
    this.shield.visible = this.shieldMat.uniforms.k.value > 0.01;
    // gunners' turrets point where their people aim
    for (let i = 1; i < 4; i++) {
      const t = this.turrets[i - 1], a = aims[i]; if (!t.visible || !a) continue;
      V3.copy(a); this.body.worldToLocal(V3.add(t.getWorldPosition(V4))); t.lookAt(V3);
    }
    // crew animation
    for (let i = 0; i < 4; i++) { const c = this.crew[i]; if (!c) continue; c.g.update(dt, { speed: 0, pose: firing[i] ? 'aim' : 'sit' }); }
    this.eyes.forEach(e => e.update(dt, V5.copy(up).negate(), 22));
    // drones circle the saucer
    this.drones.forEach((d, i) => {
      const a = this.t * 1.4 + i * Math.PI * 2 / this.drones.length;
      d.position.copy(p).addScaledVector(f, Math.cos(a) * 6).addScaledVector(rt, Math.sin(a) * 6).addScaledVector(up, 1.5 + Math.sin(this.t * 3 + i) * 0.4);
      M4.makeBasis(V6.copy(up).cross(f).normalize(), up, f); d.quaternion.setFromRotationMatrix(M4); d.rotateY(a);
      d.userData.eye.update(dt, V5.copy(up).negate(), 20);
    });
  }
}
const M4 = new THREE.Matrix4(), V4 = new THREE.Vector3(), V5 = new THREE.Vector3(), V6 = new THREE.Vector3();

// ------------------------------------------------------------------ a little native googly (cheap: no arms)
const bodyGeo = new THREE.CapsuleGeometry(0.42, 0.55, 6, 14), footGeo = new THREE.SphereGeometry(0.2, 10, 8), eyeGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 18), pupGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12);
const eyeW = phys({ color: 0xffffff, roughness: 0.1, clearcoat: 1 }), eyeP = std(0x050505, 0.2), eyeR = std(0x111111, 0.5);
const nativeMats = new Map();
export class Native {
  constructor(color) {
    this.group = new THREE.Group(); this.inner = new THREE.Group(); this.group.add(this.inner);
    if (!nativeMats.has(color)) nativeMats.set(color, phys({ color, roughness: 0.3, clearcoat: 0.7 }));
    const m = nativeMats.get(color);
    this.b = new THREE.Mesh(bodyGeo, m); this.b.position.y = 0.95; this.b.castShadow = true; this.inner.add(this.b);
    this.feet = [];
    for (const s of [-1, 1]) { const f = new THREE.Mesh(footGeo, std(0x222222, 0.5)); f.scale.set(1, 0.6, 1.4); f.position.set(s * 0.2, 0.12, 0.05); this.inner.add(f); this.feet.push(f); }
    this.pupils = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Group(); e.position.set(s * 0.17, 1.28, 0.36); e.rotation.y = s * 0.3;
      const r = new THREE.Mesh(eyeGeo, eyeR); r.rotation.x = Math.PI / 2; r.scale.setScalar(1.08); e.add(r);
      const w = new THREE.Mesh(eyeGeo, eyeW); w.rotation.x = Math.PI / 2; w.position.z = 0.01; e.add(w);
      const p = new THREE.Mesh(pupGeo, eyeP); p.rotation.x = Math.PI / 2; p.position.z = 0.045; e.add(p);
      this.inner.add(e); this.pupils.push({ p, x: 0, y: -0.05, vx: 0, vy: 0 });
    }
    this.group.scale.setScalar(1.25);
    this.t = Math.random() * 10;
  }
  /** st: 0 walking, 1 floating up the beam */
  update(dt, speed, st) {
    this.t += dt;
    const w = st === 1 ? 0 : speed;
    this.inner.position.y = Math.abs(Math.sin(this.t * 9)) * 0.12 * Math.min(1, w);
    this.feet[0].position.z = 0.05 + Math.sin(this.t * 9) * 0.2 * Math.min(1, w); this.feet[1].position.z = 0.05 - Math.sin(this.t * 9) * 0.2 * Math.min(1, w);
    this.inner.rotation.z = st === 1 ? Math.sin(this.t * 5) * 0.4 : Math.sin(this.t * 9) * 0.06 * w;
    this.inner.rotation.x = st === 1 ? this.t * 2 : 0;
    for (const e of this.pupils) {
      const ay = st === 1 ? Math.sin(this.t * 7) * 8 : -12 + Math.abs(Math.sin(this.t * 9)) * 30 * Math.min(1, w), ax = st === 1 ? Math.cos(this.t * 6) * 8 : Math.sin(this.t * 4.5) * 6 * w;
      e.vx += ax * dt; e.vy += ay * dt; e.vx *= 1 - 2 * dt; e.vy *= 1 - 2 * dt; e.x += e.vx * dt; e.y += e.vy * dt;
      const d = Math.hypot(e.x, e.y); if (d > 0.09) { e.x *= 0.09 / d; e.y *= 0.09 / d; e.vx *= -0.4; e.vy *= -0.4; }
      e.p.position.set(e.x, e.y, 0.045);
    }
  }
}

// ------------------------------------------------------------------ defenders
const metal = std(0x5a606a, 0.45, 0.8), dark = std(0x24262c, 0.5, 0.6);
export function makeTurret(accent) {
  const G = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.1, 0.9, 20), metal); base.position.y = 0.45; base.castShadow = true; base.receiveShadow = true; G.add(base);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.12, 8, 32), glow(0xff3a2a, 1.5)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.9; G.add(ring);
  const head = new THREE.Group(); head.position.y = 1.6; G.add(head);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 16), phys({ color: accent, roughness: 0.3, clearcoat: 0.8 })); dome.castShadow = true; head.add(dome);
  const eye = new GooglyEye(0.62); eye.node.position.set(0, 0.25, 0.9); eye.node.rotation.x = -0.2; head.add(eye.node);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 0.2), dark); brow.position.set(0, 0.95, 0.8); brow.rotation.x = -0.4; head.add(brow);
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.8, 12), dark); b.rotation.x = Math.PI / 2; b.position.set(s * 0.75, -0.2, 1.1); b.castShadow = true; head.add(b); const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 12), glow(0xff5a2a, 2)); tip.rotation.x = Math.PI / 2; tip.position.set(s * 0.75, -0.2, 2.02); head.add(tip); }
  G.userData = { head, eye, ring };
  return G;
}
export function makeFighter(accent) {
  const G = new THREE.Group(), inner = new THREE.Group(); G.add(inner);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.2, 6, 16), phys({ color: 0xe8e8ec, metalness: 0.6, roughness: 0.3, clearcoat: 1 })); body.rotation.x = Math.PI / 2; body.castShadow = true; inner.add(body);
  const wingG = new THREE.BoxGeometry(4.2, 0.1, 1.1);
  const wing = new THREE.Mesh(wingG, phys({ color: accent, roughness: 0.35, clearcoat: 0.8 })); wing.position.set(0, 0, -0.3); wing.castShadow = true; inner.add(wing);
  for (const s of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.8), phys({ color: accent, roughness: 0.35 })); fin.position.set(s * 2.05, 0.3, -0.5); inner.add(fin); const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow(s < 0 ? 0xff2a2a : 0x2aff5a, 3)); l.position.set(s * 2.12, 0, -0.3); inner.add(l); }
  const cock = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), phys({ color: 0x9ad8ff, roughness: 0.05, transparent: true, opacity: 0.45, clearcoat: 1 })); cock.position.set(0, 0.35, 0.5); cock.scale.set(1, 0.8, 1.3); inner.add(cock);
  const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), phys({ color: accent, roughness: 0.3 })); pilot.position.set(0, 0.35, 0.45); inner.add(pilot);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 12), eyeW); e.rotation.x = Math.PI / 2; e.position.set(s * 0.1, 0.45, 0.74); inner.add(e); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), eyeP); p.rotation.x = Math.PI / 2; p.position.set(s * 0.1, 0.42, 0.76); inner.add(p); }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 12), new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); flame.rotation.x = -Math.PI / 2; flame.position.z = -2.1; inner.add(flame);
  G.userData = { inner, flame };
  return G;
}
export function makeScrubber(accent) {
  const G = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 3), phys({ color: 0xf2d24a, roughness: 0.4, clearcoat: 0.6 })); body.position.y = 1; body.castShadow = true; G.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.25, 3.02), std(0x222222, 0.6)); stripe.position.y = 0.75; G.add(stripe);
  for (const s of [-1, 1]) { const tread = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 3.2), dark); tread.position.set(s * 1.3, 0.38, 0); tread.castShadow = true; G.add(tread); }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.8, 16), phys({ color: 0x5ab8ff, roughness: 0.1, transparent: true, opacity: 0.7, clearcoat: 1 })); tank.rotation.x = Math.PI / 2; tank.position.set(0, 1.9, -0.4); G.add(tank);
  const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.6, 16), std(0x3a7aff, 0.95)); brush.rotation.z = Math.PI / 2; brush.position.set(0, 0.5, 1.8); brush.castShadow = true; G.add(brush);
  for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 0.12), std(0x9ad8ff, 0.9)); b.rotation.x = i / 12 * Math.PI; brush.add(b); b.rotation.set(0, 0, 0); b.position.set(0, 0, 0); b.rotation.y = i / 12 * Math.PI; b.rotation.z = Math.PI / 2; }
  const eyes = [];
  for (const s of [-1, 1]) { const e = new GooglyEye(0.36); e.node.position.set(s * 0.5, 1.75, 1.2); G.add(e.node); eyes.push(e); }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glow(0xff8a1a, 3)); beacon.position.set(0, 2.9, -0.4); G.add(beacon);
  void accent;
  G.userData = { brush, eyes, beacon };
  return G;
}
export function makeShieldDome(R, a) {
  const rad = Math.sin(a) * R * 1.02, G = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, k: { value: 1 }, flash: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float t; uniform float k; uniform float flash; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.2); vec3 q = normalize(vP) * 18.;
        float hexl = abs(sin(q.x + t * .3) * sin(q.y * 1.1) * sin(q.z * 0.9 - t * .2)); float lines = smoothstep(0.92, 1.0, 1. - hexl);
        vec3 col = mix(vec3(0.35, 0.7, 1.0), vec3(1.0, 0.5, 1.0), flash); gl_FragColor = vec4(col * 1.4, (f * 0.7 + lines * 0.35 + 0.05 + flash * 0.4) * k); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(rad, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), mat); G.add(dome);
  const py = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.4, 6, 12), metal); py.position.y = 3; py.castShadow = true; G.add(py);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 14), glow(0x5ab8ff, 3)); orb.position.y = 6.6; G.add(orb);
  const eye = new GooglyEye(0.6); eye.node.position.set(0, 6.6, 1.05); G.add(eye.node);
  G.userData = { mat, orb, eye };
  return G;
}
export function makeStorm(R, a) {
  const G = new THREE.Group(), rad = Math.sin(a) * R;
  const tex = cvTex(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(70,74,84,.95)'); gr.addColorStop(0.6, 'rgba(60,64,74,.55)'); gr.addColorStop(1, 'rgba(50,54,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
  const m = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, color: 0x9a9eaa });
  for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(m); const ang = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * rad * 0.9; s.position.set(Math.cos(ang) * rr, 11 + Math.random() * 3, Math.sin(ang) * rr); const k = rad * (0.35 + Math.random() * 0.3); s.scale.set(k, k * 0.6, 1); G.add(s); }
  // rain streaks
  const n = 300, pos = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) { const ang = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * rad * 0.8, x = Math.cos(ang) * rr, z = Math.sin(ang) * rr, y = Math.random() * 11; pos.set([x, y, z, x, y - 1.4, z], i * 6); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9ab8d8, transparent: true, opacity: 0.35, depthWrite: false })); G.add(rain);
  G.userData = { rain };
  return G;
}
export function makeGuardian(accent) {
  const G = new THREE.Group(), inner = new THREE.Group(); G.add(inner);
  const plate = cvTex(512, 256, (g, w, h) => { g.fillStyle = '#6a707a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 6, 2); } g.strokeStyle = 'rgba(20,20,26,.7)'; g.lineWidth = 3; for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(8, 48, 32), phys({ map: plate, color: 0xcfd4dc, metalness: 0.8, roughness: 0.35, clearcoat: 0.5 })); ball.castShadow = true; inner.add(ball);
  const eq = new THREE.Mesh(new THREE.TorusGeometry(8.1, 0.5, 10, 64), dark); eq.rotation.x = Math.PI / 2; inner.add(eq);
  const eye = new GooglyEye(4.2, { rim: 0x2a0a0a }); eye.node.position.set(0, 1.2, 6.6); eye.node.rotation.x = -0.1; inner.add(eye.node);
  const iris = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.2, 32), glow(0xff2a2a, 2.5)); iris.position.z = 0.7; eye.pupil.add(iris); iris.rotation.x = -Math.PI / 2;
  for (const s of [-1, 1]) { const brow = new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 1.2), dark); brow.position.set(s * 2.3, 6.1, 5.2); brow.rotation.set(-0.5, 0, s * 0.35); inner.add(brow); }
  const ring = new THREE.Group(); inner.add(ring);
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(12.5, 0.45, 10, 96), phys({ color: accent, metalness: 0.6, roughness: 0.3, clearcoat: 1 })); ring.add(ringM);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3, 10), metal); sp.position.set(Math.cos(a) * 13.5, Math.sin(a) * 13.5, 0); sp.rotation.z = a - Math.PI / 2; ring.add(sp); const l = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), glow(0xff5a2a, 3)); l.position.set(Math.cos(a + 0.3) * 12.5, Math.sin(a + 0.3) * 12.5, 0.5); ring.add(l); }
  ring.rotation.x = Math.PI / 2 - 0.4;
  const core = new THREE.PointLight(0xff4a2a, 800, 80, 1.8); inner.add(core);
  G.userData = { inner, eye, ring, core };
  return G;
}
const coinGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.16, 24), coinMat = phys({ color: 0xffc83a, metalness: 1, roughness: 0.22, clearcoat: 1, emissive: 0x6a4a00, emissiveIntensity: 0.4 });
export function makeCoin() { const m = new THREE.Mesh(coinGeo, coinMat); m.rotation.x = Math.PI / 2; const g = new THREE.Group(); g.add(m); g.userData.m = m; return g; }
export function makeFlag(color) {
  const G = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 12, 10), phys({ color: 0xdfe6ee, metalness: 1, roughness: 0.15 })); pole.position.y = 6; pole.castShadow = true; G.add(pole);
  const tex = cvTex(256, 160, (g, w, h) => { g.fillStyle = color; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; for (const x of [95, 165]) { g.beginPath(); g.arc(x, 80, 34, 0, 7); g.fill(); } g.fillStyle = '#111'; for (const x of [95, 165]) { g.beginPath(); g.arc(x + 6, 92, 15, 0, 7); g.fill(); } g.strokeStyle = '#111'; g.lineWidth = 6; for (const x of [95, 165]) { g.beginPath(); g.arc(x, 80, 34, 0, 7); g.stroke(); } });
  const geo = new THREE.PlaneGeometry(6, 3.8, 16, 6);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 })); cloth.position.set(3.1, 9.9, 0); cloth.castShadow = true; G.add(cloth);
  G.userData = { cloth, base: geo.attributes.position.array.slice() };
  return G;
}

// ------------------------------------------------------------------ power-ups, paint meteors
export const POWER = {
  rapid: { color: 0xff5a2a, icon: '⚡', name: 'RAPID FIRE', line: 'double speed, free paint' },
  rainbow: { color: 0xff4ad8, icon: '🌈', name: 'RAINBOW PAINT', line: 'giant rainbow splats' },
  repair: { color: 0x3aff7a, icon: '🔧', name: 'REPAIR KIT', line: 'hull and shield fixed' },
  cash: { color: 0xffd23a, icon: '💰', name: 'DOUBLE CASH', line: 'everything pays ×2' },
  bomb: { color: 0x5ab8ff, icon: '💣', name: 'RELOAD', line: 'full tank, bomb ready' },
  nuke: { color: 0xb04aff, icon: '☢️', name: 'NUKE CHARGE', line: '+50% rainbow nuke' },
};
const iconTex = new Map();
function emojiTex(e) { if (iconTex.has(e)) return iconTex.get(e); const t = cvTex(128, 128, (g, w) => { g.font = '96px "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, w / 2, w / 2 + 6); }); iconTex.set(e, t); return t; }
export function makePowerup(k) {
  const P = POWER[k] || POWER.rapid, G = new THREE.Group();
  const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), phys({ color: P.color, emissive: P.color, emissiveIntensity: 1.6, roughness: 0.1, metalness: 0.3, clearcoat: 1, transparent: true, opacity: 0.85 }));
  const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(2.9, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(P.color).multiplyScalar(2), wireframe: true, transparent: true, opacity: 0.35 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.14, 8, 48), glow(P.color, 3)); ring.rotation.x = Math.PI / 2;
  const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(P.icon), depthWrite: false, transparent: true })); icon.scale.setScalar(4); icon.position.y = 5;
  const light = new THREE.PointLight(P.color, 300, 40, 1.8);
  G.add(gem, cage, ring, icon, light);
  G.userData = { gem, cage, ring };
  return G;
}
export function makeMeteor() {
  const G = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(3, 1), pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(pos, i); v.multiplyScalar(0.8 + Math.random() * 0.4); pos.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  const hue = Math.random();
  const rock = new THREE.Mesh(geo, std(0x3a3430, 0.95)); rock.castShadow = true; G.add(rock);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 1, 0.55).multiplyScalar(2.5) })); G.add(core);
  core.scale.setScalar(1.05); rock.scale.setScalar(1.12);
  const trail = new THREE.Mesh(new THREE.ConeGeometry(2.6, 26, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 1, 0.6).multiplyScalar(1.8), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  trail.position.y = 13; G.add(trail);
  G.userData = { rock, trail, hue };
  return G;
}
const goldMat = phys({ color: 0xffc83a, metalness: 1, roughness: 0.15, clearcoat: 1, emissive: 0x6a4a00, emissiveIntensity: 0.6 });
/** A native googly made of solid gold, with sparkles. */
export function goldify(nat) {
  nat.b.material = goldMat;
  const l = new THREE.PointLight(0xffd23a, 200, 30, 1.8); l.position.y = 2; nat.group.add(l);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('✨'), depthWrite: false, transparent: true })); sp.scale.setScalar(2.4); sp.position.y = 2.6; nat.group.add(sp);
  nat.group.scale.setScalar(1.6);
}
export function acify(fighterGroup) {
  fighterGroup.scale.setScalar(1.8);
  fighterGroup.traverse(o => { if (o.isMesh && o.material?.color && o.material.clearcoat !== undefined && o.material.opacity === 1 && !o.material.transparent) { o.material = o.material.clone(); o.material.color.set(0x1a1a1e); } });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.12, 6, 32), glow(0xffa82a, 3)); ring.rotation.x = Math.PI / 2; fighterGroup.add(ring);
}
