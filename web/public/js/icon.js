// ?icon=1 — draws the app icon: a googly splattered all over with green and purple paint, in space, with a
// half-painted planet behind it. Screenshot a 1024×1024 viewport of it for mac/icon-1024.png.
import * as THREE from 'three';
import { Googly } from './googly.js';
import { rng } from './universe.js';

function paintedSkin() {
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), r = rng(2027);
  g.fillStyle = '#6fd12e'; g.fillRect(0, 0, W, H);
  // streaks of lighter and darker green so the base coat looks wet
  for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.5 ? 'rgba(170,255,120,.18)' : 'rgba(30,110,20,.18)'; g.beginPath(); g.ellipse(r() * W, r() * H, 30 + r() * 90, 8 + r() * 20, r() * 3, 0, 7); g.fill(); }
  const blob = (x, y, s, col) => {
    g.fillStyle = col; g.beginPath(); g.ellipse(x, y, s, s * 0.9, r() * 3, 0, 7); g.fill();
    for (let k = 0; k < 9; k++) { const a = r() * 6.28, d = s * (0.8 + r() * 0.6), rr = s * (0.12 + r() * 0.28); g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, 7); g.fill(); }
    // drips run down the body
    for (let k = 0; k < 3; k++) { const dx = x + (r() - 0.5) * s * 1.4, w = s * (0.12 + r() * 0.12), len = s * (0.8 + r() * 1.8); g.fillRect(dx - w / 2, y, w, len); g.beginPath(); g.arc(dx, y + len, w * 0.75, 0, 7); g.fill(); }
  };
  const P = ['#9a2cff', '#b04aff', '#7a1ae0'];
  for (let i = 0; i < 11; i++) blob(r() * W, 60 + r() * (H - 180), 34 + r() * 50, P[i % 3]);
  for (let i = 0; i < 26; i++) blob(r() * W, r() * H, 8 + r() * 18, P[i % 3]);
  for (let i = 0; i < 10; i++) blob(r() * W, r() * H, 20 + r() * 30, '#a8ff5a');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

export function drawIcon({ space, ufo, scene, camera, buildPlanet }) {
  document.querySelectorAll('.screen, #hud, #mother, #labels, #toast').forEach(e => e.classList.add('hidden'));
  document.body.style.background = '#000';
  for (const o of scene.children) if (o !== space.sky && !o.isLight) o.visible = false;
  space.sky.visible = true; space.setGalaxy('#6a3ab8', 5); space.sunSprite.visible = false; space.flares.forEach(f => { f.visible = false; });
  space.sunLight.intensity = 3.2; space.sunLight.position.set(6, 9, 10); space.sunLight.target.position.set(0, 1, 0); space.sunLight.castShadow = false;
  const rim = new THREE.DirectionalLight(0xc08aff, 2.6); rim.position.set(-8, 4, -6); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0x8aff6a, 1.4); rim2.position.set(8, -2, -4); scene.add(rim2);
  // the googly
  const gg = new Googly({ color: '#6fd12e', role: 'civ', local: true });
  const mat = new THREE.MeshPhysicalMaterial({ map: paintedSkin(), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
  gg.bodyMesh.material = mat; gg.belly.material = mat;
  for (const a of gg.arms) { a.arm.material = mat; a.hand.material = mat; }
  for (const l of gg.legMeshes) l.material = mat;
  gg.group.position.set(0, -0.2, 0); gg.group.rotation.y = -0.25; scene.add(gg.group);
  // a painted planet in the background
  const pl = { key: 'icon', type: 'terran', R: 40, seed: 99, rings: false };
  const P = buildPlanet(pl, { res: 1024, paintRes: 1024 });
  const r = rng(5);
  for (let i = 0; i < 90; i++) { const z = r() * 2 - 1, a = r() * 6.28, s = Math.sqrt(1 - z * z); P.paint.splat([s * Math.cos(a), z, s * Math.sin(a)], 0.08 + r() * 0.14, i % 2 ? '#7bd13b' : '#b04aff', i + 3, true); }
  P.paint.tex.needsUpdate = true;
  P.group.position.set(26, -34, -80); scene.add(P.group);
  camera.fov = 34; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  camera.position.set(0.6, 1.35, 4.6); camera.up.set(0, 1, 0); camera.lookAt(0.05, 0.92, 0);
  if (space.bloom) space.bloom.strength = 0.22;
  let t = 0;
  const tick = () => {
    t += 1 / 60;
    gg.update(1 / 60, { speed: 0, pose: 'cheer' });
    camera.fov = 30; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    space.sky.position.copy(camera.position);
    space.render(1 / 60);
    if (t < 3) requestAnimationFrame(tick); else window.__iconReady = true;
  };
  window.__iconMode = true;
  tick();
}
