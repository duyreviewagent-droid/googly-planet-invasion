// Googly-Planet Invasion — the browser client: the title, the solo engine (a Room in the page), online UFOs, the
// mothership star map and upgrade shop, flying the saucer around a planet, aiming paint (with the drop worked out for
// you), the gunner seats, the HUD and minimap, phone controls, the victory screen and the 30-second autosave.
import * as THREE from 'three';
import { Space } from './space.js';
import { buildPlanet, miniPlanet, SUN, surfaceCanvases } from './planet.js';
import { UFO, Native, makeTurret, makeFighter, makeScrubber, makeShieldDome, makeStorm, makeGuardian, makeCoin, makeFlag, makePowerup, makeMeteor, goldify, acify, POWER } from './models.js';
import { SKINS } from './googly.js';
import { Room, newPlayer, SHOT_SPEED, GRAV, ALT_MIN, ALT_MAX } from './core.js';
import { GALAXIES, SYSTEMS, TYPES, system, planetByKey, UPGRADES, UPG, upgCost, shipStats, planetOpen, systemOpen, progress, frontier, cleanCampaign, GW, GH, forCells, unrle, dirToUT } from './universe.js';
import { sfx, music, ambience, unlockAudio, setMusic, setSfx, setVolume, audioState, setListener, setKey, audioTest } from './sfx.js';

const Q = new URLSearchParams(location.search);
if (Q.has('shim')) window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = v => '$' + Math.round(v).toLocaleString('en-US');
const store = {
  get(k, d) { try { const v = localStorage.getItem('gpi.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('gpi.' + k, JSON.stringify(v)); } catch { } },
  del(k) { try { localStorage.removeItem('gpi.' + k); } catch { } },
};
const COLORS = ['#7bd13b', '#b04aff', '#2f9bff', '#ffcc00', '#ff8a1a', '#ff3a4a', '#ff6fb5', '#00d8c8', '#f2f2f7', '#3a3a3c', '#a8ff3a', '#6a4aff', '#ff4ad8', '#8a5a2b'];
const HULLS = [
  { c: '#7bd13b', name: 'Alien Green', price: 0 }, { c: '#b04aff', name: 'Grape', price: 0 }, { c: '#c8ccd4', name: 'Classic Silver', price: 8 }, { c: '#2f9bff', name: 'Sky Blue', price: 10 },
  { c: '#ff3a4a', name: 'Red Alert', price: 12 }, { c: '#ffcc00', name: 'Banana', price: 12 }, { c: '#ff6fb5', name: 'Bubblegum', price: 15 }, { c: '#1a1a1e', name: 'Stealth Black', price: 20 },
  { c: '#ff8a1a', name: 'Tangerine', price: 20 }, { c: '#00d8c8', name: 'Teal', price: 25 }, { c: '#e8c060', name: 'Gold', price: 40 }, { c: '#f4f4f8', name: 'Pearl', price: 50 },
];
const gemPrice = s => Math.round(s.price / 20);
const prof = {
  name: store.get('name', ''), color: store.get('color', '#7bd13b'), skin: store.get('skin', 'none'), gems: store.get('gems', 0),
  owned: store.get('owned', ['none']), hulls: store.get('hulls', ['#7bd13b', '#b04aff']), sens: store.get('sens', 1), invy: store.get('invy', false),
};
if (Q.has('gems')) prof.gems = +Q.get('gems');
const isMac = !!window.webkit?.messageHandlers?.gp;
const mobile = matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window || Q.has('touch');
if (mobile) document.body.classList.add('mobile');
const lq = Q.has('lq');
const space = new Space($('view'), { lq, mobile });
const scene = space.scene, camera = space.camera;
const clock = new THREE.Clock();

// ------------------------------------------------------------------ screens
const SCREENS = ['scr-title', 'scr-online', 'scr-shop', 'scr-pause', 'scr-win', 'scr-help'];
let screen = 'scr-title', prevScreen = 'scr-title';
function show(id) { if (id !== screen) prevScreen = screen; screen = id; for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id); }
function toast(t, ms = 2800) { const e = $('toast'); e.innerHTML = t; e.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.opacity = 0, ms); }
function center(t, sub = '', ms = 2600) { const e = $('center'); e.innerHTML = t + (sub ? `<small>${sub}</small>` : ''); e.style.opacity = 1; clearTimeout(center.t); center.t = setTimeout(() => e.style.opacity = 0, ms); }
function note(t, ms = 3000) { const e = $('toast2'); e.innerHTML = t; e.style.opacity = 1; clearTimeout(note.t); note.t = setTimeout(() => e.style.opacity = 0, ms); }
document.querySelectorAll('.back').forEach(b => b.onclick = () => { sfx.click(); if (screen === 'scr-help' && prevScreen === 'scr-pause') return show('scr-pause'); show(view === 'title' ? 'scr-title' : null); });
for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) document.addEventListener(ev, () => unlockAudio(), { capture: true });
if (mobile) {
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  addEventListener('scroll', () => { if (scrollY) scrollTo(0, 0); });
}
let hoverT = 0;
document.addEventListener('mouseover', e => { const b = e.target.closest?.('button, .item, .sw'); if (b && !b.disabled && performance.now() - hoverT > 60) { hoverT = performance.now(); sfx.hover(); } });

// ------------------------------------------------------------------ title
$('nm').value = prof.name;
$('nm').oninput = () => { prof.name = $('nm').value.replace(/[<>&"]/g, '').slice(0, 14); store.set('name', prof.name); sendMe(); };
function drawSwatches() {
  $('swatches').innerHTML = COLORS.map(c => `<div data-c="${c}" style="background:${c}" class="sw ${c === prof.color ? 'on' : ''}"></div>`).join('');
  $('swatches').querySelectorAll('div').forEach(d => d.onclick = () => { prof.color = d.dataset.c; store.set('color', prof.color); sfx.click(); drawSwatches(); lookChanged(); });
}
drawSwatches();
function drawGems() { for (const id of ['t-gems', 's-gems']) $(id).textContent = prof.gems; }
function addGems(n) { prof.gems += n; store.set('gems', prof.gems); drawGems(); }
drawGems();
function soloCamp() { return cleanCampaign(store.get('camp', null)); }
function drawSoloSub() {
  const c = soloCamp(), pr = progress(c);
  $('solo-sub').textContent = pr.done ? `continue your invasion · ${pr.done} of ${pr.total} planets painted · ${money(c.credits)}` : 'just you in your UFO · your universe · starts right away';
  $('b-solo').firstChild.textContent = pr.done ? '▶ PLAY SOLO — CONTINUE' : '▶ PLAY SOLO';
}
drawSoloSub();
function needName() { if (!prof.name.trim()) { $('nm').focus(); toast('Type your name first'); sfx.nope(); return true; } return false; }
$('b-solo').onclick = () => { if (needName()) return; sfx.click(); startSolo(); };
$('b-online').onclick = () => { if (needName()) return; sfx.click(); openOnline(); };
$('b-help').onclick = $('p-help').onclick = $('m-help').onclick = () => { sfx.click(); show('scr-help'); };
$('b-shop').onclick = $('m-shop').onclick = () => { sfx.buy(); openShop(); };
const fsToggle = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => toast('Full screen not available here')); };
$('b-fs').onclick = $('p-fs').onclick = () => { sfx.click(); fsToggle(); };
if (!document.documentElement.requestFullscreen) for (const id of ['b-fs', 'p-fs']) $(id).classList.add('hidden');
function drawAudioBtns() { const a = audioState(); for (const id of ['b-music', 'p-music']) $(id).textContent = a.music ? '♪ Music: on' : '♪ Music: off'; for (const id of ['b-sfx', 'p-sfx']) $(id).textContent = a.sfx ? '🔊 Sound: on' : '🔈 Sound: off'; }
$('b-music').onclick = $('p-music').onclick = () => { setMusic(!audioState().music); drawAudioBtns(); };
$('b-sfx').onclick = $('p-sfx').onclick = () => { setSfx(!audioState().sfx); drawAudioBtns(); sfx.click(); };
drawAudioBtns();
let pendingRoom = (Q.get('room') || '').toUpperCase().slice(0, 4);
function drawInvite() {
  $('invite').classList.toggle('hidden', !pendingRoom);
  $('invite').innerHTML = `You've been invited aboard UFO <b>${esc(pendingRoom)}</b> — type your name and press JOIN`;
  $('b-online').innerHTML = pendingRoom ? `JOIN UFO ${esc(pendingRoom)}<small>your friend's saucer</small>` : 'PLAY ONLINE<small>optional · up to 3 friends ride in your UFO</small>';
}
drawInvite();

// ------------------------------------------------------------------ gem shop: googly skins and UFO paint
let shopTab = 'skins';
function openShop() { show('scr-shop'); drawShop(); }
document.querySelectorAll('#shop-tab button').forEach(b => b.onclick = () => { shopTab = b.dataset.v; sfx.click(); document.querySelectorAll('#shop-tab button').forEach(x => x.classList.toggle('on', x === b)); drawShop(); });
function drawShop() {
  drawGems();
  const g = $('shop-grid');
  if (shopTab === 'skins') {
    g.innerHTML = SKINS.map(s => { const own = prof.owned.includes(s.id), on = prof.skin === s.id, p = gemPrice(s); return `<div class="item ${on ? 'on' : ''} ${own ? '' : 'locked'}" data-id="${s.id}"><i class="sk" style="background:${s.dot(prof.color)}"></i>${esc(s.name)}<small class="${on ? 'eq' : own ? 'own' : 'price'}">${on ? 'WEARING' : own ? 'owned' : '💎 ' + p}</small></div>`; }).join('');
    g.querySelectorAll('.item').forEach(d => d.onclick = () => {
      const s = SKINS.find(x => x.id === d.dataset.id), p = gemPrice(s);
      if (!prof.owned.includes(s.id)) { if (prof.gems < p) { sfx.nope(); toast(`You need 💎 ${p - prof.gems} more gems`); return; } addGems(-p); prof.owned.push(s.id); store.set('owned', prof.owned); sfx.buy(); }
      else sfx.click();
      prof.skin = s.id; store.set('skin', s.id); drawShop(); lookChanged();
    });
  } else {
    const cur = C.camp?.hull || soloCamp().hull;
    g.innerHTML = HULLS.map(h => { const own = prof.hulls.includes(h.c), on = cur === h.c; return `<div class="item ${on ? 'on' : ''} ${own ? '' : 'locked'}" data-c="${h.c}"><i class="sk" style="background:radial-gradient(circle at 35% 30%, #fff 5%, ${h.c} 40%, #000 120%)"></i>${esc(h.name)}<small class="${on ? 'eq' : own ? 'own' : 'price'}">${on ? 'ON YOUR UFO' : own ? 'owned' : '💎 ' + h.price}</small></div>`; }).join('');
    g.querySelectorAll('.item').forEach(d => d.onclick = () => {
      const h = HULLS.find(x => x.c === d.dataset.c);
      if (!prof.hulls.includes(h.c)) { if (prof.gems < h.price) { sfx.nope(); toast(`You need 💎 ${h.price - prof.gems} more gems`); return; } addGems(-h.price); prof.hulls.push(h.c); store.set('hulls', prof.hulls); sfx.buy(); }
      else sfx.click();
      if (C.room && !amHost()) { toast('Only the captain can repaint this UFO — it\'ll be yours when you fly your own'); }
      if (C.room && amHost()) send({ t: 'hull', c: h.c });
      else { const c = soloCamp(); c.hull = h.c; store.set('camp', c); }
      ufo.setHull(h.c); drawShop();
    });
  }
}
$('shop-close').onclick = () => { sfx.click(); show(view === 'title' ? 'scr-title' : null); };

// ------------------------------------------------------------------ connection: a Room in the page for solo, or the server
const C = { id: 0, host: 0, pilot: 0, phase: 'none', players: [], camp: soloCamp(), code: '', solo: true, room: false, pub: false };
let local = null, ws = null, view = 'title';
const amHost = () => C.id === C.host;
const amPilot = () => C.id === C.pilot;
const mySeat = () => C.players.find(p => p.id === C.id)?.seat ?? 0;
const stats = () => shipStats(C.camp.upg);
function makeLocal() {
  const inbox = [];
  const camp = soloCamp();
  if (Q.has('cred')) camp.credits = +Q.get('cred');
  if (Q.has('upg')) { const v = +Q.get('upg'); for (const u of UPGRADES) camp.upg[u.id] = Math.min(u.max, v); }
  if (Q.has('key')) { const pl = planetByKey(Q.get('key')); if (pl) { for (let g = 0; g <= pl.g; g++) for (let s = 0; s < SYSTEMS; s++) if (g * SYSTEMS + s < pl.g * SYSTEMS + pl.s) for (const p of system(g, s).planets) camp.done[p.key] = '#7bd13b'; if (pl.boss) for (const p of system(pl.g, pl.s).planets) if (!p.boss) camp.done[p.key] = '#b04aff'; camp.cur = pl.key; } }
  const r = new Room({ code: 'SOLO', solo: true, camp, out: (p, m) => inbox.push(m) });
  const p = newPlayer({ id: 1, name: prof.name.trim() || 'GOOGLY', color: prof.color, skin: prof.skin });
  local = { room: r, p, inbox };
  r.join(p);
  return local;
}
function startSolo() {
  closeWs();
  makeLocal();
  C.room = false; C.solo = true;
  pump(0);
  sfx.launch();
}
function saveSolo(flash = true) {
  if (!local) return;
  store.set('camp', local.room.saveCamp());
  if (flash) { const e = $('saved'); e.style.opacity = 1; setTimeout(() => e.style.opacity = 0, 1200); }
}
setInterval(() => { if (local) saveSolo(); }, 30000);
addEventListener('beforeunload', () => { if (local) saveSolo(false); });
const soloPaused = () => local && view === 'planet' && (screen === 'scr-pause' || screen === 'scr-help' && prevScreen === 'scr-pause' || document.hidden);
function pump(dt) {
  if (!local) return;
  if (!soloPaused() && dt > 0) local.room.tick(dt);
  for (const m of local.inbox.splice(0)) onMsg(m);
}
setInterval(() => { if (document.hidden && !local) return; }, 1000);

const SERVER = (window.__server || (location.protocol.startsWith('http') ? location.origin : 'https://googly-planet-invasion.onrender.com')).replace(/\/$/, '');
function send(m) {
  if (local) { if (m.t === 'leave') return; if (m.t === 'me') { Object.assign(local.p, { name: m.name, color: m.color, skin: m.skin }); local.room.handle(local.p, m); return; } local.room.handle(local.p, m); return; }
  if (ws?.readyState === 1) ws.send(JSON.stringify(m));
}
function sendMe() { send({ t: 'me', name: prof.name.trim() || 'GOOGLY', color: prof.color, skin: prof.skin }); }
function lookChanged() { sendMe(); if (view === 'title') titleCrew(); }
function connect() {
  if (ws && ws.readyState <= 1) return;
  $('on-status').textContent = 'Connecting to the server… (the first connection can take up to a minute while it wakes up)';
  ws = new WebSocket(SERVER.replace(/^http/, 'ws'));
  ws.onopen = () => { $('on-status').textContent = 'Connected.'; sendMe(); send({ t: 'list' }); if (pendingRoom) { send({ t: 'join', code: pendingRoom }); pendingRoom = ''; drawInvite(); } };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } if (!local) onMsg(m); };
  ws.onclose = () => {
    if (local) return;
    $('on-status').textContent = "Couldn't reach the online server — PLAY SOLO works without it.";
    if (C.room) { C.room = false; toast('Lost connection to the server'); goTitle(); }
  };
}
function closeWs() { if (ws) { ws.onclose = null; try { ws.close(); } catch { } ws = null; } }
setInterval(() => { if (screen === 'scr-online' && !local && ws?.readyState === 1) send({ t: 'list' }); }, 4000);
function openOnline() {
  if (local) { saveSolo(false); local = null; }
  show('scr-online'); connect();
}
$('on-pub').onclick = () => { sfx.click(); send({ t: 'create', public: true, camp: store.get('camp', null) }); };
$('on-priv').onclick = () => { sfx.click(); send({ t: 'create', public: false, camp: store.get('camp', null) }); };
$('on-join').onclick = () => { const c = $('on-code').value.trim().toUpperCase(); if (c.length !== 4) { sfx.nope(); toast('Codes are 4 letters'); return; } sfx.click(); send({ t: 'join', code: c }); };
$('on-code').onkeydown = e => { if (e.key === 'Enter') $('on-join').click(); };
$('on-ref').onclick = () => send({ t: 'list' });
function drawRooms(list) {
  $('rooms').innerHTML = list.length ? list.map(r => `<div class="roomrow"><div><b>${esc(r.name)}</b> <small>${r.n}/${r.max} aboard · ${r.phase === 'planet' ? 'invading ' + esc(r.where || '') : 'at the mothership'} · code ${r.code}</small></div><button class="green mini2" data-c="${r.code}">CLIMB IN</button></div>`).join('') : '<div class="empty">No public UFOs right now — make one!</div>';
  $('rooms').querySelectorAll('button').forEach(b => b.onclick = () => { sfx.click(); send({ t: 'join', code: b.dataset.c }); });
}

// ------------------------------------------------------------------ messages from the game
function onMsg(m) {
  switch (m.t) {
    case 'hello': C.id = m.id; break;
    case 'list': drawRooms(m.rooms); break;
    case 'err': sfx.nope(); toast(esc(m.msg)); break;
    case 'joined':
      C.id = m.id; C.code = m.code; C.solo = m.solo; C.room = !m.solo; sfx.join();
      $('lb-log').innerHTML = ''; $('log').innerHTML = '';
      if (C.room && location.protocol.startsWith('http')) history.replaceState(null, '', '?room=' + m.code);
      break;
    case 'room':
      C.players = m.players; C.host = m.host; C.pilot = m.pilot; C.pub = m.pub; C.code = m.code;
      crewChanged();
      if (m.phase === 'hangar' && view !== 'mother' && view !== 'loading') enterMother();
      break;
    case 'camp': {
      const old = C.camp; C.camp = m.camp;
      if (view === 'mother') { if (old.cur !== m.camp.cur) { const pl = planetByKey(m.camp.cur); if (pl && (pl.g !== viewSys[0] || pl.s !== viewSys[1])) showSystem(pl.g, pl.s); else { refreshSystem(); if (pl) sel = pl; } } else refreshSystem(); drawMother(); }
      ufo.setHull(C.camp.hull);
      break;
    }
    case 'save': store.set('camp', m.camp); if (!local) { const e = $('saved'); e.style.opacity = 1; setTimeout(() => e.style.opacity = 0, 1200); } break;
    case 'bought': sfx.buy(); flashUpg(m.id); if (run) note(`${UPG[m.id].icon} ${UPG[m.id].name} → level ${m.lv}`); break;
    case 'chat': addChat(m); break;
    case 'toast': if (m.k === 'big' && view === 'planet') center(esc(m.text).replace(/!(.*)/, '!<small>$1</small>')); else if (view === 'planet') note(esc(m.text)); else toast(esc(m.text)); break;
    case 'planet': enterPlanet(m); break;
    case 'hangar': if (view === 'planet' || view === 'loading') { leavePlanet(); enterMother(); } break;
    case 'colors': if (run) run.colors = m.c; crewChanged(); break;
    case 'conquer': onConquer(m); break;
    default: if (run) runMsg(m);
  }
}

// ------------------------------------------------------------------ the UFO (shared by every view)
const ufo = new UFO({ hull: C.camp.hull });
scene.add(ufo.group);
function crewChanged() {
  const seats = [null, null, null, null];
  for (const p of C.players) if (p.seat >= 0 && p.seat < 4) seats[p.seat] = p;
  ufo.setCrew(seats);
  if (view === 'mother') drawCrew();
  drawHudCrew();
}
function titleCrew() { ufo.setCrew([{ name: prof.name, color: prof.color, skin: prof.skin }, null, null, null]); }

// ------------------------------------------------------------------ title scene: a UFO painting a planet
const titleG = new THREE.Group(); scene.add(titleG);
let titlePlanet = null, titleT = 0;
function buildTitle() {
  const pl = { ...planetByKey('0-0-0'), R: 60, seed: 777, type: 'terran', rings: false };
  titlePlanet = buildPlanet(pl, { res: lq ? 512 : 1024, paintRes: 1024 });
  titleG.add(titlePlanet.group);
  titlePlanet.group.position.set(0, -56, 0); titlePlanet.group.rotation.x = 1.15;
  const r = Math.random;
  for (let i = 0; i < 70; i++) { const z = r() * 2 - 1, a = r() * 6.28, s = Math.sqrt(1 - z * z); titlePlanet.paint.splat([s * Math.cos(a), z, s * Math.sin(a)], 0.06 + r() * 0.1, i % 3 ? '#7bd13b' : '#b04aff', i + 1); }
}
function enterTitle() {
  view = 'title';
  if (!titlePlanet) buildTitle();
  titleG.visible = true; motherG.visible = false; ufo.group.visible = true; ufo.setDrones(0);
  $('hud').classList.add('hidden'); $('mother').classList.add('hidden'); $('labels').innerHTML = '';
  space.setGalaxy('#3a5aa8', 1); space.makeSun('#fff2c8'); space.sunLight.intensity = 3.4; space.sunSprite.visible = true;
  SUN.dir.set(1, 0.35, 0.4).normalize();
  titleCrew(); ufo.setHull(soloCamp().hull);
  music.play('menu'); setKey(0);
  show('scr-title'); drawSoloSub(); drawGems();
}
function updateTitle(dt) {
  titleT += dt;
  const P = titlePlanet.group;
  P.rotation.y += dt * 0.02; if (titlePlanet.clouds) titlePlanet.clouds.rotation.y += dt * 0.008;
  const up = V1.set(0, 1, 0);
  const p = V2.set(Math.sin(titleT * 0.3) * 1.5 + 6, 11 + Math.sin(titleT * 0.7) * 0.8, Math.cos(titleT * 0.23) * 1.5 + 6);
  ufo.update(dt, { p, up, f: V3.set(-0.3, 0, 1).normalize(), v: V4.set(Math.cos(titleT * 0.3) * 3, 0, 0), beamLen: Math.sin(titleT * 0.4) > 0.6 ? 8 : 0 });
  const wide = innerWidth / innerHeight;
  camera.position.set(wide > 1.2 ? -1 : 6, 14, 21); camera.up.set(0, 1, 0); camera.lookAt(wide > 1.2 ? 2.2 : 6, 9.2, 4);
  // every so often the saucer lobs a blob of paint
  if (Math.random() < dt * 0.5 && (titleT < 60 || Math.random() < 0.2)) {
    const d = V5.set(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
    titlePlanet.paint.splat(P.worldToLocal(V6.copy(d).multiplyScalar(60).add(P.position)).normalize().toArray(), 0.04 + Math.random() * 0.05, Math.random() < 0.5 ? prof.color : '#b04aff', Math.random() * 1e6 | 0);
  }
  titlePlanet.paint.update(performance.now());
  space.frame(dt, ufo.group.position);
  ambience.update(dt, { space: 1, engine: 0.2 });
}

// ------------------------------------------------------------------ the mothership: a star system map
const motherG = new THREE.Group(); scene.add(motherG); motherG.visible = false;
let viewSys = [0, 0], sysObjs = [], sel = null, motherT = 0, starObj = null, camTgt = new THREE.Vector3(), camPos = new THREE.Vector3(200, 120, 200), camInit = false;
const starLight = new THREE.PointLight(0xffffff, 0, 0, 0); motherG.add(starLight);
function enterMother() {
  if (view === 'planet') leavePlanet();
  view = 'mother'; releaseLock();
  titleG.visible = false; motherG.visible = true; ufo.group.visible = true;
  $('hud').classList.add('hidden'); $('mother').classList.remove('hidden'); $('loading').classList.add('hidden');
  if (screen !== 'scr-win') show(null);
  ufo.setDrones(0);
  const pl = planetByKey(C.camp.cur) || planetByKey('0-0-0');
  showSystem(pl.g, pl.s);
  music.play('hangar');
  $('m-tab-crew').classList.toggle('hidden', !C.room);
  if (!C.room && mTab === 'crew') setMTab('upg');
  $('m-reset').classList.toggle('hidden', !!C.room);
  drawMother(); drawCrew();
  if (C.room && !amHost()) setMTab('crew');
}
function clearSystem() { for (const o of sysObjs) { motherG.remove(o.g); if (o.orbit) motherG.remove(o.orbit); } sysObjs = []; if (starObj) { motherG.remove(starObj); starObj = null; } $('labels').innerHTML = ''; }
function showSystem(g, s) {
  viewSys = [g, s]; clearSystem(); camInit = false;
  const sys = system(g, s);
  setKey(g);
  space.setGalaxy(GALAXIES[g].tint, g + 1);
  space.sunSprite.visible = false; space.flares.forEach(f => f.visible = false); space.sunLight.intensity = 0;
  starLight.color.set(sys.star.light); starLight.intensity = 6;
  starObj = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(14, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(sys.star.color).multiplyScalar(2.2) }));
  const c = document.createElement('canvas'); c.width = c.height = 256; const gg = c.getContext('2d'); const gr = gg.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, sys.star.color); gr.addColorStop(1, 'rgba(0,0,0,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 256, 256);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); halo.scale.setScalar(110);
  starObj.add(core, halo); motherG.add(starObj);
  const lab = $('labels');
  for (const pl of sys.planets) {
    const size = 3.2 + pl.R / 66;
    const g3 = miniPlanet(pl, C.camp.done[pl.key] || null, C.camp.partial[pl.key]?.pct || 0); g3.scale.setScalar(size);
    motherG.add(g3);
    const orbitR = pl.orbit * 1.2;
    const og = new THREE.RingGeometry(orbitR - 0.25, orbitR + 0.25, 160); const orbit = new THREE.Mesh(og, new THREE.MeshBasicMaterial({ color: 0x8a7aff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })); orbit.rotation.x = -Math.PI / 2; motherG.add(orbit);
    const el = document.createElement('div'); el.className = 'plab'; lab.appendChild(el);
    el.onclick = () => pickPlanet(pl);
    sysObjs.push({ pl, g: g3, orbit, orbitR, size, el });
  }
  refreshSystem();
  const cur = planetByKey(C.camp.cur);
  sel = cur && cur.g === g && cur.s === s ? cur : sys.planets.find(p => !C.camp.done[p.key] && planetOpen(C.camp, p)) || sys.planets[0];
  drawMother();
}
function refreshSystem() {
  for (const o of sysObjs) {
    const done = C.camp.done[o.pl.key], pct = C.camp.partial[o.pl.key]?.pct || 0;
    if (o.done !== done || o.pct !== pct) {
      if (o.done !== undefined) { const ng = miniPlanet(o.pl, done || null, pct); ng.scale.setScalar(o.size); motherG.remove(o.g); motherG.add(ng); o.g = ng; }
      o.done = done; o.pct = pct;
    }
  }
}
function pickPlanet(pl) {
  sfx.click(); sel = pl;
  if (amHost() && planetOpen(C.camp, pl) && !C.camp.done[pl.key]) send({ t: 'pick', key: pl.key });
  drawMother();
}
$('m-prev').onclick = () => { sfx.click(); let k = viewSys[0] * SYSTEMS + viewSys[1] - 1; if (k < 0) return; showSystem(Math.floor(k / SYSTEMS), k % SYSTEMS); };
$('m-next').onclick = () => { sfx.click(); const [fg, fs] = frontier(C.camp); let k = viewSys[0] * SYSTEMS + viewSys[1] + 1; if (k > Math.min(GALAXIES.length * SYSTEMS - 1, fg * SYSTEMS + fs + 1)) { toast('Paint every planet in this system to find the next one'); return; } showSystem(Math.floor(k / SYSTEMS), k % SYSTEMS); };
$('m-go').onclick = () => {
  if (!sel) return;
  if (!amHost()) { toast('The captain launches the invasion'); return; }
  if (C.camp.done[sel.key]) { sfx.nope(); toast('That planet is already yours!'); return; }
  if (!planetOpen(C.camp, sel)) { sfx.nope(); toast(sel.boss ? 'The Guardian waits until every other planet here is painted' : 'This system is locked'); return; }
  sfx.warp(); send({ t: 'pick', key: sel.key }); send({ t: 'go' });
};
let mTab = 'upg';
function setMTab(v) { mTab = v; document.querySelectorAll('#m-tab button').forEach(x => x.classList.toggle('on', x.dataset.v === v)); $('m-upg').classList.toggle('hidden', v !== 'upg'); $('m-crew').classList.toggle('hidden', v !== 'crew'); $('m-more').classList.toggle('hidden', v !== 'more'); drawMother(); }
document.querySelectorAll('#m-tab button').forEach(b => b.onclick = () => { sfx.click(); setMTab(b.dataset.v); });
$('m-reset').onclick = () => { if (!confirm('Start a brand-new universe? Your credits, upgrades and painted planets will be wiped. (Gems and skins stay.)')) return; send({ t: 'reset' }); store.set('camp', cleanCampaign(null)); if (local) local.room.camp = cleanCampaign(null); C.camp = cleanCampaign(null); showSystem(0, 0); drawMother(); toast('A fresh universe. Go get it!'); };
$('m-leave').onclick = () => { sfx.click(); goTitle(); };
function drawMother() {
  if (view !== 'mother') return;
  const sys = system(viewSys[0], viewSys[1]), G = GALAXIES[viewSys[0]], pr = progress(C.camp);
  const open = systemOpen(C.camp, viewSys[0], viewSys[1]);
  $('m-gal').textContent = `${G.name.toUpperCase()} · GALAXY ${viewSys[0] + 1} OF ${GALAXIES.length} · SYSTEM ${viewSys[1] + 1}/${SYSTEMS}`;
  $('m-sys').textContent = sys.name;
  $('m-prog').textContent = `${sys.planets.filter(p => C.camp.done[p.key]).length}/${sys.planets.length} painted here · universe ${pr.done}/${pr.total} (${(pr.pct * 100).toFixed(1)}%)${open ? '' : ' · 🔒 LOCKED'}`;
  $('m-cr').textContent = money(C.camp.credits);
  // the planet card
  if (sel) {
    const p = sel, T = TYPES[p.type], done = C.camp.done[p.key], popen = planetOpen(C.camp, p), part = C.camp.partial[p.key];
    const tags = [done ? '<span class="tagline done">✓ PAINTED</span>' : '', p.boss ? '<span class="tagline boss">☠ GUARDIAN</span>' : '', !popen && !done ? '<span class="tagline lock">🔒 LOCKED</span>' : '', part && !done ? `<span class="tagline part">${part.pct}% painted</span>` : ''].join('');
    $('mi-body').innerHTML = `<div class="ty">${esc(T.name.toUpperCase())} · ${(p.R * 33).toLocaleString()} KM WIDE</div><h3>${esc(p.name)}</h3>${tags}<div class="fl">${esc(T.line)}</div>
      <div class="defs"><span>🔫 Flak turrets</span><b>${p.def.turrets}</b><span>✈️ Fighter jets</span><b>${p.def.fighters}</b><span>🧽 Paint scrubbers</span><b>${p.def.scrubbers}</b><span>🔵 Shield domes</span><b>${p.def.shields}</b><span>⛈ Storms</span><b>${p.def.storms}</b><span>👾 Natives to abduct</span><b>${p.natives}</b></div>
      <div>Paint <b>${Math.round(p.need * 100)}%</b>${p.boss ? ' and beat the <b>Guardian</b>' : ''} · reward <span class="rew">${money(p.reward)}</span></div>`;
    const canGo = amHost() && popen && !done;
    $('m-go').classList.toggle('hidden', !amHost()); $('m-go').disabled = !canGo;
    $('m-go').innerHTML = done ? '✓ ALREADY YOURS' : !popen ? '🔒 LOCKED' : part ? `🛸 BACK TO ${esc(p.name.toUpperCase())}` : '🛸 INVADE!';
    $('m-wait').classList.toggle('hidden', amHost());
  }
  // upgrades
  if (mTab === 'upg') {
    const host = amHost();
    $('m-upg').innerHTML = UPGRADES.map(u => {
      const lv = C.camp.upg[u.id] || 0, max = lv >= u.max, c = max ? 0 : upgCost(u.id, lv), can = host && !max && C.camp.credits >= c;
      const pips = u.max <= 15 ? `<div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>` : `<div class="fx">level ${lv}/${u.max}</div>`;
      return `<div class="up ${max ? 'max' : ''}" id="up-${u.id}"><div class="ic">${u.icon}</div><div><b>${u.name}</b><div class="d">${u.desc}</div><div class="fx">${u.fx(lv)}${max ? '' : ' → ' + u.fx(lv + 1)}</div>${pips}</div><button class="${can ? 'green' : 'grey'}" data-id="${u.id}" ${max ? 'disabled' : ''}>${max ? 'MAX' : money(c)}</button></div>`;
    }).join('');
    $('m-upg').querySelectorAll('button').forEach(b => b.onclick = () => {
      const u = UPG[b.dataset.id], lv = C.camp.upg[u.id] || 0, c = upgCost(u.id, lv);
      if (!amHost()) { sfx.nope(); toast('Only the captain can spend the credits'); return; }
      if (C.camp.credits < c) { sfx.nope(); toast(`You need ${money(c - C.camp.credits)} more — go paint something!`); return; }
      send({ t: 'buy', id: u.id });
    });
  }
  if (mTab === 'more') {
    const s = C.camp.stats;
    $('m-stats').innerHTML = `🪐 Planets painted: <b>${pr.done}</b> of ${pr.total}<br>⭐ Systems taken: <b>${pr.systems}</b> of ${GALAXIES.length * SYSTEMS}<br>☠ Guardians beaten: <b>${s.bosses}</b><br>🎨 Paint blobs fired: <b>${s.splats.toLocaleString()}</b><br>👾 Googlies abducted: <b>${s.abducted.toLocaleString()}</b><br>💥 Defenders knocked out: <b>${s.kills.toLocaleString()}</b><br>💰 Credits earned: <b>${money(s.earned)}</b><br>⏱ Time invading: <b>${Math.floor(s.time / 3600)}h ${Math.floor(s.time / 60) % 60}m</b>`;
  }
}
function flashUpg(id) { drawMother(); const e = $('up-' + id); if (e) { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); } }
function drawCrew() {
  if (!C.room) return;
  $('lb-code').textContent = C.code;
  $('lb-pub').checked = C.pub;
  const seats = ['🛸 PILOT', '🎯 GUNNER', '🎯 GUNNER', '🎯 GUNNER'];
  $('lb-seats').innerHTML = seats.map((s, i) => {
    const p = C.players.find(q => q.seat === i);
    if (!p) return `<div class="seat empty"><span class="dot" style="background:#333"></span> empty seat <span class="tag">${s}</span></div>`;
    return `<div class="seat"><span class="dot" style="background:${esc(p.color)}"></span> ${esc(p.name)}${p.id === C.id ? ' (you)' : ''}${p.id === C.host ? ' 👑' : ''}<span class="tag">${s}</span>${amHost() && i > 0 ? `<button class="blue" data-id="${p.id}">give wheel</button>` : ''}</div>`;
  }).join('');
  $('lb-seats').querySelectorAll('button').forEach(b => b.onclick = () => { sfx.click(); send({ t: 'pilot', id: +b.dataset.id }); });
}
$('lb-copy').onclick = () => {
  const url = (location.protocol.startsWith('http') ? location.origin + location.pathname : SERVER + '/') + '?room=' + C.code;
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Invite link copied!'), () => prompt('Send this link to your friends:', url));
  else prompt('Send this link to your friends:', url);
};
if (navigator.share && mobile) { $('lb-share').classList.remove('hidden'); $('lb-share').onclick = () => navigator.share({ title: 'Googly-Planet Invasion', text: 'Climb into my UFO!', url: SERVER + '/?room=' + C.code }).catch(() => { }); }
$('lb-form').onsubmit = e => { e.preventDefault(); const t = $('lb-msg').value.trim(); if (t) send({ t: 'chat', text: t }); $('lb-msg').value = ''; };
function addChat(m) {
  sfx.chat();
  const line = m.sys ? `<div class="sys">${esc(m.text)}</div>` : `<div><b style="color:${esc(m.color || '#fff')}">${esc(m.from)}:</b> ${esc(m.text)}</div>`;
  $('lb-log').insertAdjacentHTML('beforeend', line); $('lb-log').scrollTop = 1e6;
  $('log').insertAdjacentHTML('beforeend', line); while ($('log').children.length > 7) $('log').firstChild.remove();
}
function updateMother(dt) {
  motherT += dt;
  starObj?.rotateY(dt * 0.05);
  for (const o of sysObjs) {
    const a = o.pl.phase + motherT * (0.02 + 1.2 / o.orbitR);
    o.g.position.set(Math.cos(a) * o.orbitR, Math.sin(a * 0.7) * o.pl.tilt * 6, Math.sin(a) * o.orbitR);
    o.g.children[0].rotation.y += dt * 0.15; if (o.g.userData.clouds) o.g.userData.clouds.rotation.y += dt * 0.18;
    // labels
    V1.copy(o.g.position).add(V2.set(0, o.size * 1.4, 0)).project(camera);
    const vis = V1.z < 1; o.el.style.display = vis ? '' : 'none';
    if (vis) {
      o.el.style.left = ((V1.x + 1) / 2 * innerWidth) + 'px'; o.el.style.top = ((1 - V1.y) / 2 * innerHeight - 30) + 'px';
      const done = C.camp.done[o.pl.key], open = planetOpen(C.camp, o.pl), part = C.camp.partial[o.pl.key];
      o.el.className = 'plab' + (o.pl === sel ? ' sel' : '') + (done ? ' done' : '') + (!open && !done ? ' lock' : '');
      const html = `${esc(o.pl.name)}<small>${done ? '✓ painted' : !open ? '🔒 locked' : part ? part.pct + '% painted' : o.pl.boss ? '☠ Guardian' : TYPES[o.pl.type].name}</small>`;
      if (o.el._h !== html) { o.el.innerHTML = html; o.el._h = html; }
    }
  }
  // camera: look at the chosen planet from its sunny side
  const so = sysObjs.find(o => o.pl === sel) || sysObjs[0];
  if (so) {
    const pp = so.g.position, out = V3.copy(pp).normalize();
    const side = V4.set(-out.z, 0, out.x);
    const want = V5.copy(pp).addScaledVector(out, -so.size * 3.2).addScaledVector(side, so.size * 3.8).add(V6.set(0, so.size * 1.7 + 8, 0));
    const tgt = V7.copy(pp).addScaledVector(side, -so.size * 0.9);
    if (!camInit) { camPos.copy(want).multiplyScalar(1.8); camTgt.copy(tgt); camInit = true; }
    camPos.lerp(want, 1 - Math.exp(-2 * dt)); camTgt.lerp(tgt, 1 - Math.exp(-3 * dt));
    camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(camTgt);
    // the UFO hovers next to it
    const up = V1.set(0, 1, 0);
    ufo.group.scale.setScalar(Math.max(0.35, so.size * 0.12));
    ufo.update(dt, { p: V2.copy(pp).addScaledVector(side, so.size * 2.3).addScaledVector(out, -so.size * 1.1).add(V6.set(0, so.size * 0.9 + Math.sin(motherT) * 0.3, 0)), up, f: V3.copy(side).negate(), v: V4.set(0, 0, 0) });
  }
  space.frame(dt, null);
  ambience.update(dt, { space: 1, engine: 0.1 });
}
$('view').addEventListener('click', e => {
  if (view !== 'mother') return;
  let best = null, bd = 1e9;
  for (const o of sysObjs) { V1.copy(o.g.position).project(camera); if (V1.z > 1) continue; const x = (V1.x + 1) / 2 * innerWidth, y = (1 - V1.y) / 2 * innerHeight; const d = Math.hypot(x - e.clientX, y - e.clientY); if (d < bd) { bd = d; best = o; } }
  if (best && bd < 80) pickPlanet(best.pl);
});

// ------------------------------------------------------------------ an invasion
const planetG = new THREE.Group(); scene.add(planetG);
let run = null;
const shotGeo = new THREE.SphereGeometry(0.55, 14, 10), eshotGeo = new THREE.CapsuleGeometry(0.22, 2.2, 4, 8), plasmaGeo = new THREE.SphereGeometry(1.1, 16, 12);
const paintMats = new Map();
const paintMat = c => { if (!paintMats.has(c)) paintMats.set(c, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.18, clearcoat: 1, emissive: c, emissiveIntensity: 0.25 })); return paintMats.get(c); };
const laserMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a2a).multiplyScalar(3) }), plasmaMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a2a).multiplyScalar(3) }), turretShotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2a0).multiplyScalar(3) });
function orient(obj, up, fwd) { const x = V8.copy(up).cross(fwd).normalize(); const z = V9.copy(x).cross(up).normalize(); M4.makeBasis(x, up, z); obj.quaternion.setFromRotationMatrix(M4); }
function enterPlanet(m) {
  const pl = planetByKey(m.key); if (!pl) return;
  if (run) leavePlanet();
  view = 'loading'; releaseLock();
  $('mother').classList.add('hidden'); $('labels').innerHTML = ''; show(null);
  $('loading').classList.remove('hidden'); $('load-t').textContent = `WARPING TO ${pl.name.toUpperCase()}…`;
  $('load-s').textContent = `${TYPES[pl.type].name} · ${GALAXIES[pl.g].name} · ${system(pl.g, pl.s).name}`;
  // let the loading screen draw before the planet is generated
  setTimeout(() => requestAnimationFrame(() => buildRun(m, pl)), 60);
}
function buildRun(m, pl) {
  const t0 = performance.now();
  motherG.visible = false; titleG.visible = false; planetG.visible = true;
  const sys = system(pl.g, pl.s);
  setKey(pl.g); space.setGalaxy(GALAXIES[pl.g].tint, pl.g + 1); space.makeSun(sys.star.color);
  space.sunSprite.visible = true; space.sunLight.intensity = 3.4; starLight.intensity = 0;
  SUN.dir.set(Math.cos(pl.phase), 0.3 + pl.tilt, Math.sin(pl.phase)).normalize();
  const P = buildPlanet(pl, { res: mobile || lq ? 768 : 2048, paintRes: mobile || lq ? 1024 : pl.R > 90 ? 2048 : 1024 });
  planetG.add(P.group);
  const grid = unrle(m.grid);
  P.paint.fromGrid(grid, m.colors);
  // minimap base: the planet's own colours, shrunk
  const mmBase = document.createElement('canvas'); mmBase.width = 240; mmBase.height = 120;
  const cv = surfaceCanvases({ ...pl }, 256); mmBase.getContext('2d').drawImage(cv.col, 0, 0, 240, 120);
  run = {
    pl, R: pl.R, P, grid, colors: m.colors, cov: m.cov, boss: null, bossHp: m.boss?.hp ?? 0, bossDead: m.bossDead, mmBase, t: 0,
    turrets: new Map(), shields: new Map(), fighters: new Map(), scrubbers: new Map(), natives: new Map(), storms: new Map(), coins: new Map(), shots: new Map(), eshots: new Map(), powerups: new Map(), meteors: new Map(),
    missions: m.missions || [], buffs: [0, 0, 0], combo: 0, comboT: 0,
    ship: { p: new THREE.Vector3(...m.ship.p), f: new THREE.Vector3(...m.ship.f), v: new THREE.Vector3(), hp: m.ship.hp, sh: m.ship.sh, down: 0, beam: false, nuke: 0, tp: new THREE.Vector3(...m.ship.p), tf: new THREE.Vector3(...m.ship.f), lastSnapP: null, estV: new THREE.Vector3() },
    alt: new THREE.Vector3(...m.ship.p).length() - pl.R, tank: m.stats.tank, bombCd: 0, earned: 0, aims: [], firing: [], shake: 0, flags: [], lastPct: Math.floor(m.cov * 100), mmT: 0, sendT: 0,
  };
  const accent = TYPES[pl.type].natives;
  for (const t of m.turrets) { const o = makeTurret(accent); const d = new THREE.Vector3(...t.d); o.position.copy(d).multiplyScalar(pl.R - 0.1); orient(o, d, V1.set(0, 1, 0).cross(d).lengthSq() > 0.01 ? V2.set(0, 1, 0).projectOnPlane(d).normalize() : V2.set(1, 0, 0)); planetG.add(o); run.turrets.set(t.id, { o, d, hp: t.hp }); }
  for (const s of m.shields) { const o = makeShieldDome(pl.R, s.a); const d = new THREE.Vector3(...s.d); o.position.copy(d).multiplyScalar(pl.R * Math.cos(s.a) * 0.999); orient(o, d, V2.set(0, 1, 0).projectOnPlane(d).normalize()); planetG.add(o); run.shields.set(s.id, { o, d, hp: s.hp }); }
  if (pl.boss && !m.bossDead) { run.boss = { o: makeGuardian(accent), p: null, tp: new THREE.Vector3(), hp: m.boss?.hp ?? 1, spin: 0 }; run.boss.o.visible = false; run.boss.o.scale.setScalar(1.6); planetG.add(run.boss.o); }
  ufo.group.scale.setScalar(1); ufo.setDrones(stats().drones);
  $('loading').classList.add('hidden');
  $('hud').classList.remove('hidden'); $('downscr').classList.add('hidden');
  $('cov-need').style.left = (pl.need * 100) + '%';
  $('h-planet').textContent = `${pl.name.toUpperCase()} · ${TYPES[pl.type].name.toUpperCase()}`;
  $('bossbar').classList.toggle('hidden', !run.boss);
  view = 'planet';
  camPitch = -0.62; camYaw = 0; zoom = 19;
  music.play(pl.boss && !m.bossDead ? 'boss' : ['invade1', 'invade2', 'invade3'][(pl.p + pl.s) % 3]);
  if (pl.boss && !m.bossDead) setTimeout(() => { sfx.bossAlert(); center('☠ THE GUARDIAN', 'It guards this system. Paint it until it pops!', 3200); }, 1400);
  drawHudCrew(); drawMissions();
  if (!mobile && !Q.has('shot')) $('clickto').classList.remove('hidden');
  if (Q.has('dbg')) console.log('planet built in', Math.round(performance.now() - t0), 'ms');
}
function leavePlanet() {
  if (!run) return;
  run.P.dispose(); planetG.remove(run.P.group);
  for (const k of ['turrets', 'shields', 'fighters', 'scrubbers', 'natives', 'storms', 'coins', 'shots', 'eshots', 'powerups', 'meteors']) for (const e of run[k].values()) planetG.remove(e.o || e.mesh || e.g?.group || e.n?.group);
  if (run.boss) planetG.remove(run.boss.o);
  for (const f of run.flags) planetG.remove(f);
  for (const p of parts) p.life = 0;
  run = null;
  $('hud').classList.add('hidden'); $('clickto').classList.add('hidden'); releaseLock();
  ufo.setDrones(0);
}
function dirOf(a, i = 0) { return V1.set(a[i], a[i + 1], a[i + 2]); }
function runMsg(m) {
  const R = run.R;
  switch (m.t) {
    case 'snap': {
      const s = m.s, sh = run.ship;
      sh.tp.set(s[0], s[1], s[2]); sh.tf.set(s[3], s[4], s[5]);
      const hpWas = sh.hp; sh.hp = s[6]; sh.sh = s[7]; sh.down = s[8]; sh.srvBeam = !!s[9]; sh.nuke = s[10];
      if (sh.lastSnapP) { const dt = Math.max(0.03, m.tm - sh.lastSnapT); sh.estV.copy(sh.tp).sub(sh.lastSnapP).divideScalar(dt); }
      sh.lastSnapP = (sh.lastSnapP || new THREE.Vector3()).copy(sh.tp); sh.lastSnapT = m.tm;
      void hpWas;
      run.cov = m.cov; C.camp.credits = m.cr;
      run.aims = []; run.firing = [];
      for (const a of m.a) { const p = C.players.find(q => q.id === a[0]); if (!p) continue; run.aims[p.seat] = new THREE.Vector3(a[1], a[2], a[3]); run.firing[p.seat] = !!a[4]; if (a[0] === C.id) { run.tank = a[5]; run.bombCd = a[6]; } }
      syncFighters(m.f); syncScrubbers(m.c); syncNatives(m.n); syncStorms(m.w); syncCoins(m.o); syncPowerups(m.u || []); syncMeteors(m.m || []);
      run.buffs = m.bf || [0, 0, 0]; if (m.cb !== run.combo) { if (m.cb > run.combo) { $('combo').classList.remove('pop'); void $('combo').offsetWidth; $('combo').classList.add('pop'); if (m.cb >= 2) sfx.combo(m.cb); } run.combo = m.cb; } run.comboT = m.cbT || 0;
      if (run.boss) { if (m.b) { run.boss.tp.set(m.b[0], m.b[1], m.b[2]); if (!run.boss.p) run.boss.p = run.boss.tp.clone(); run.boss.hp = m.b[3]; run.boss.spin = m.b[4]; run.boss.o.visible = true; } }
      const pct = Math.floor(m.cov * 100);
      if (pct > run.lastPct && pct % 10 === 0) { sfx.percent(); note(`🎨 ${pct}% painted${pct >= run.pl.need * 100 && run.boss ? ' — now beat the Guardian!' : ''}`); }
      if (pct > run.lastPct) run.lastPct = pct;
      break;
    }
    case 'shot': {
      const col = m.s ? run.colors[m.s] || '#7bd13b' : null;
      const mesh = new THREE.Mesh(shotGeo, m.k === 'turret' ? turretShotMat : paintMat(col));
      mesh.scale.setScalar(m.k === 'bomb' ? 2.6 : m.k === 'drone' ? 0.7 : m.k === 'turret' ? 0.45 : 1);
      const p = new THREE.Vector3(...m.o), v = new THREE.Vector3(...m.v);
      // my own blobs leave from where my cannon is right now (the server copy can be a hair behind)
      const mine = m.k === 'paint' || m.k === 'bomb' ? m.s === mySeat() + 1 : false;
      const off = mine ? seatOrigin(mySeat()).sub(p) : new THREE.Vector3();
      if (off.length() > 12) off.set(0, 0, 0);
      mesh.position.copy(p).add(off); planetG.add(mesh);
      run.shots.set(m.id, { mesh, p, v, g: !!m.g, k: m.k, off, age: 0, col });
      if (m.k === 'paint' || m.k === 'bomb') { if (mine || distToCam(p) < 60) sfx.paint(p.toArray(), m.k === 'bomb'); if (mine) ufo.cannon.position.z = 1.35; }
      else if (m.k === 'drone' && Math.random() < 0.3) sfx.paint(p.toArray());
      else if (m.k === 'turret') sfx.laser(p.toArray());
      if (m.k === 'bomb') sfx.bomb(p.toArray());
      break;
    }
    case 'splat': {
      const d = m.d, big = m.a * R > 30 || m.n, col = m.rb ? '#' + new THREE.Color().setHSL(Math.random(), 1, 0.55).getHexString() : run.colors[m.s] || '#7bd13b';
      run.P.paint.splat(d, m.a, col, (d[0] * 1e5 ^ d[2] * 1e5) | 0, big);
      forCells(d, m.a, k => { run.grid[k] = m.s; });
      const wp = V1.set(d[0], d[1], d[2]).multiplyScalar(R);
      sfx.splat(wp.toArray(), big);
      burst(wp, col, big ? 40 : 8, big ? 16 : 7, V2.set(d[0], d[1], d[2]));
      for (const [id, s] of run.shots) if (s.p.distanceTo(wp) < 6 && s.p.length() <= R + 0.5) { planetG.remove(s.mesh); run.shots.delete(id); }
      break;
    }
    case 'erase': {
      run.P.paint.erase(m.d, m.a);
      forCells(m.d, m.a, k => { run.grid[k] = 0; });
      if (Math.random() < 0.2) sfx.scrub(V1.set(...m.d).multiplyScalar(R).toArray());
      break;
    }
    case 'pop': case 'fizz': {
      const s = run.shots.get(m.id); if (s) { planetG.remove(s.mesh); run.shots.delete(m.id); }
      const p = new THREE.Vector3(...m.p);
      if (m.t === 'fizz') { sfx.fizz(p.toArray()); burst(p, '#8ad8ff', 10, 8); }
      else burst(p, m.s ? run.colors[m.s] : '#fff2a0', 10, 9);
      break;
    }
    case 'hit': {
      const e = entityOf(m.k, m.id); if (e) { e.hp = m.hp; e.flash = 1; }
      if (m.k === 'shield') { const s = run.shields.get(m.id); if (s) s.o.userData.mat.uniforms.flash.value = 1; }
      if (m.k === 'boss' && run.boss) run.boss.hp = m.hp;
      showHit();
      break;
    }
    case 'boom': {
      const p = new THREE.Vector3(...m.p);
      const size = m.k === 'boss' ? 3 : m.k === 'shield' ? 2 : 1;
      explode(p, size); sfx.boom(p.toArray(), size); showHit(true);
      if (m.k === 'turret') { const t = run.turrets.get(m.id); if (t) { planetG.remove(t.o); run.turrets.delete(m.id); } }
      if (m.k === 'shield') { const s = run.shields.get(m.id); if (s) { planetG.remove(s.o); run.shields.delete(m.id); } sfx.shieldDown(); }
      if (m.k === 'fighter') { const f = run.fighters.get(m.id); if (f) { planetG.remove(f.o); run.fighters.delete(m.id); } }
      if (m.k === 'scrubber') { const c = run.scrubbers.get(m.id); if (c) { planetG.remove(c.o); run.scrubbers.delete(m.id); } }
      if (m.k === 'boss' && run.boss) { planetG.remove(run.boss.o); run.boss = null; run.bossDead = true; $('bossbar').classList.add('hidden'); sfx.bossRoar(p.toArray()); run.shake = 1.5; setTimeout(() => music.play(['invade1', 'invade2', 'invade3'][(run?.pl.p || 0) % 3]), 2500); }
      break;
    }
    case 'eshot': {
      const p = new THREE.Vector3(...m.o), v = new THREE.Vector3(...m.v);
      const mesh = new THREE.Mesh(m.big ? plasmaGeo : eshotGeo, m.big ? plasmaMat : laserMat);
      mesh.position.copy(p); if (!m.big) mesh.quaternion.setFromUnitVectors(V1.set(0, 1, 0), V2.copy(v).normalize());
      planetG.add(mesh); run.eshots.set(m.id, { mesh, p, v, age: 0 });
      if (m.big) sfx.laser(p.toArray(), true); else sfx.flak(p.toArray());
      break;
    }
    case 'ehit': { const e = run.eshots.get(m.id); if (e) { planetG.remove(e.mesh); run.eshots.delete(m.id); } break; }
    case 'dmg': {
      run.ship.hp = m.hp; run.ship.sh = m.sh;
      if (m.shield) { sfx.shieldHit(); ufo.hitShield(); }
      else { sfx.shipHit(); run.shake = Math.min(1, run.shake + 0.45); flashV('#ff1a3a', 0.55); burst(run.ship.p, '#ffb070', 8, 10); }
      break;
    }
    case 'down': sfx.down(); explode(run.ship.p, 1.6); $('downscr').classList.remove('hidden'); $('down-p').textContent = `Repairs cost ${money(m.bill)} · back in the fight in 6 seconds…`; run.ship.beam = false; break;
    case 'up': sfx.up(); $('downscr').classList.add('hidden'); center('BACK IN ACTION!', '', 1400); break;
    case 'cash': popCash(m.v, m.why, m.p); break;
    case 'coin': { const c = run.coins.get(m.id); if (c) { planetG.remove(c.o); run.coins.delete(m.id); } sfx.coin(1); run.earned += m.v; popCash(m.v, '', null, true); break; }
    case 'abduct': { const n = run.natives.get(m.id); if (n) { planetG.remove(n.n.group); run.natives.delete(m.id); } if (m.gold) { sfx.gold(); center('✨ GOLDEN GOOGLY!', 'huge payday', 2200); burst(run.ship.p, '#ffd23a', 60, 18); } sfx.abduct(run.ship.p.toArray(), m.id); burst(run.ship.p.clone().addScaledVector(run.ship.p.clone().normalize(), -1.5), '#b8ffb0', 16, 8); break; }
    case 'nuke': {
      sfx.nuke(); flashV('#ffffff', 1); run.shake = 1.2;
      const d = new THREE.Vector3(...m.d).multiplyScalar(R);
      for (let i = 0; i < 6; i++) setTimeout(() => run && burst(d, ['#ff3a4a', '#ff9a1a', '#ffe23a', '#7bd13b', '#2f9bff', '#b04aff'][i], 50, 30, V2.copy(d).normalize()), i * 90);
      center('🌈 RAINBOW NUKE!', '', 1800);
      break;
    }
    case 'spawn': if (m.k === 'fighter' && Math.random() < 0.5) note('✈️ Enemy fighters incoming!', 1800); break;
    case 'dry': sfx.dry(); $('cross').classList.add('dry'); setTimeout(() => $('cross').classList.remove('dry'), 400); if ((run.dryN = (run.dryN || 0) + 1) <= 3) note('🎨 Out of paint — the tank refills by itself (upgrade the Paint Pump!)', 2200); break;
    case 'cd': run.bombCd = m.bomb; break;
    case 'pickup': {
      const u = run.powerups.get(m.id); if (u) { planetG.remove(u.o); run.powerups.delete(m.id); }
      if (m.gone) break;
      const P = POWER[m.k]; sfx.pickup(m.k); run.ship.hp = m.hp; run.ship.sh = m.sh;
      if (u) burst(u.p, '#' + new THREE.Color(P.color).getHexString(), 30, 14);
      center(`${P.icon} ${P.name}`, P.line, 1600); flashV('#' + new THREE.Color(P.color).getHexString(), 0.4);
      if (m.k === 'bomb') run.bombCd = 0;
      break;
    }
    case 'meteor': {
      const me = run.meteors.get(m.id); if (me) { planetG.remove(me.o); run.meteors.delete(m.id); }
      const p = new THREE.Vector3(...m.p);
      if (m.hit) { sfx.meteorSmash(p.toArray()); explode(p, 1.4); }
      else if (m.ship) { sfx.shipHit(); explode(p, 1); }
      else { sfx.boom(p.toArray(), 0.8); burst(p, '#e8e8f0', 30, 14, V2.copy(p).normalize()); if (distToCam(p) < 200) note('☄️ A meteor landed and washed some paint away — shoot them first!', 1800); }
      break;
    }
    case 'mission': {
      const ms = run.missions[m.i]; if (!ms) break;
      ms.got = m.got; if (m.done) { ms.done = true; sfx.mission(); center('✅ MISSION COMPLETE', `${esc(ms.text)} · +${money(m.reward)}`, 2600); }
      drawMissions(m.done ? m.i : -1);
      break;
    }
    case 'event': {
      if (['meteors', 'gold', 'drop', 'ace'].includes(m.k)) sfx.alert();
      if (m.k === 'aceDown') sfx.gold();
      if (m.k === 'goldGone') note('The Golden Googly got away…', 2200);
      if (m.k === 'meteors') run.shake = 0.4;
      break;
    }
    case 'combo': if (m.n === 0 && m.was) { sfx.comboLost(); note(`Combo ended at ×${(1 + Math.min(20, m.was) * 0.1).toFixed(1)}`, 1500); } else if (m.n) center(`×${(1 + Math.min(20, m.n) * 0.1).toFixed(1)} COMBO!`, `${m.n} in a row — keep it going`, 1100); break;
  }
}
function entityOf(k, id) { return k === 'turret' ? run.turrets.get(id) : k === 'fighter' ? run.fighters.get(id) : k === 'scrubber' ? run.scrubbers.get(id) : k === 'shield' ? run.shields.get(id) : null; }
function syncFighters(list) {
  const seen = new Set(), accent = TYPES[run.pl.type].natives;
  for (const a of list) { seen.add(a[0]); let f = run.fighters.get(a[0]); if (!f) { f = { o: makeFighter(accent), p: new THREE.Vector3(a[1], a[2], a[3]), v: new THREE.Vector3(), hp: 1, ace: !!a[8] }; if (f.ace) acify(f.o); planetG.add(f.o); run.fighters.set(a[0], f); } f.tp = new THREE.Vector3(a[1], a[2], a[3]); f.v.set(a[4], a[5], a[6]); f.hp = a[7]; f.snapAt = performance.now(); }
  for (const [id, f] of run.fighters) if (!seen.has(id)) { planetG.remove(f.o); run.fighters.delete(id); }
}
function syncScrubbers(list) {
  const seen = new Set();
  for (const a of list) { seen.add(a[0]); let c = run.scrubbers.get(a[0]); if (!c) { c = { o: makeScrubber(), d: new THREE.Vector3(a[1], a[2], a[3]), h: new THREE.Vector3(a[4], a[5], a[6]), hp: 1 }; planetG.add(c.o); run.scrubbers.set(a[0], c); } c.td = new THREE.Vector3(a[1], a[2], a[3]); c.h.set(a[4], a[5], a[6]); c.hp = a[7]; }
  for (const [id, c] of run.scrubbers) if (!seen.has(id)) { planetG.remove(c.o); run.scrubbers.delete(id); }
}
function syncNatives(list) {
  const seen = new Set(), col = TYPES[run.pl.type].natives;
  for (const a of list) { seen.add(a[0]); let n = run.natives.get(a[0]); if (n && !!a[9] !== n.gold) { planetG.remove(n.n.group); run.natives.delete(a[0]); n = null; } if (!n) { n = { n: new Native(col), d: new THREE.Vector3(a[1], a[2], a[3]), h: new THREE.Vector3(a[4], a[5], a[6]), lift: a[7], st: a[8], spd: 1, gold: !!a[9] }; if (n.gold) goldify(n.n); planetG.add(n.n.group); run.natives.set(a[0], n); } n.td = new THREE.Vector3(a[1], a[2], a[3]); n.h.set(a[4], a[5], a[6]); n.tl = a[7]; if (a[8] === 1 && n.st !== 1 && Math.random() < 0.5) sfx.scream(n.d.clone().multiplyScalar(run.R).toArray()); n.st = a[8]; }
  for (const [id, n] of run.natives) if (!seen.has(id)) { planetG.remove(n.n.group); run.natives.delete(id); }
}
function syncStorms(list) {
  for (const a of list) { let w = run.storms.get(a[0]); if (!w) { w = { o: makeStorm(run.R, Math.min(0.5, 90 / run.R + 0.12)), d: new THREE.Vector3(a[1], a[2], a[3]) }; planetG.add(w.o); run.storms.set(a[0], w); } w.td = new THREE.Vector3(a[1], a[2], a[3]); }
}
function syncPowerups(list) {
  const seen = new Set();
  for (const a of list) { seen.add(a[0]); if (!run.powerups.has(a[0])) { const o = makePowerup(a[4]); const p = new THREE.Vector3(a[1], a[2], a[3]); o.position.copy(p); planetG.add(o); run.powerups.set(a[0], { o, p, k: a[4] }); } }
  for (const [id, u] of run.powerups) if (!seen.has(id)) { planetG.remove(u.o); run.powerups.delete(id); }
}
function syncMeteors(list) {
  const seen = new Set();
  for (const a of list) { seen.add(a[0]); let me = run.meteors.get(a[0]); if (!me) { me = { o: makeMeteor(), p: new THREE.Vector3(a[1], a[2], a[3]), v: new THREE.Vector3(a[4], a[5], a[6]) }; planetG.add(me.o); run.meteors.set(a[0], me); sfx.meteorIn(me.p.toArray()); } else { me.p.lerp(V1.set(a[1], a[2], a[3]), 0.5); } }
  for (const [id, me] of run.meteors) if (!seen.has(id)) { planetG.remove(me.o); run.meteors.delete(id); }
}
function syncCoins(list) {
  const seen = new Set();
  for (const a of list) { seen.add(a[0]); let c = run.coins.get(a[0]); if (!c) { c = { o: makeCoin(), p: new THREE.Vector3(a[1], a[2], a[3]) }; planetG.add(c.o); run.coins.set(a[0], c); } c.tp = new THREE.Vector3(a[1], a[2], a[3]); }
  for (const [id, c] of run.coins) if (!seen.has(id)) { planetG.remove(c.o); run.coins.delete(id); }
}

// ------------------------------------------------------------------ particles: paint droplets, sparks and debris
const PMAX = 900, parts = [];
const partMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshPhysicalMaterial({ roughness: 0.2, clearcoat: 1 }), PMAX);
partMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); partMesh.frustumCulled = false; partMesh.count = 0; scene.add(partMesh);
partMesh.setColorAt(0, new THREE.Color());
for (let i = 0; i < PMAX; i++) parts.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color(), s: 1 });
let partI = 0;
function burst(p, color, n, speed, normal = null) {
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const q = parts[partI = (partI + 1) % PMAX];
    q.life = 0.8 + Math.random() * 0.9; q.p.copy(p);
    q.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
    if (normal) q.v.addScaledVector(normal, speed * (0.4 + Math.random() * 0.8));
    q.c.copy(c).offsetHSL(0, 0, (Math.random() - 0.5) * 0.15); q.s = 0.5 + Math.random() * 1.3;
  }
}
const booms = [];
const boomTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.3, 'rgba(255,190,90,.9)'); gr.addColorStop(0.7, 'rgba(255,80,20,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const boomLight = new THREE.PointLight(0xffa050, 0, 120, 1.5); scene.add(boomLight);
function explode(p, size = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: boomTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.position.copy(p); s.scale.setScalar(2); scene.add(s); booms.push({ s, t: 0, size });
  burst(p, '#ff9a3a', 20 * size, 14 * size); burst(p, '#3a3a40', 14 * size, 10 * size);
  boomLight.position.copy(p); boomLight.intensity = 3000 * size;
}
function updateFx(dt) {
  const R = run?.R || 0;
  let n = 0;
  for (const q of parts) {
    if (q.life <= 0) continue;
    q.life -= dt;
    if (R) { const up = V1.copy(q.p).normalize(); q.v.addScaledVector(up, -GRAV * 0.6 * dt); q.p.addScaledVector(q.v, dt); if (q.p.length() < R + 0.1) { q.p.copy(up).multiplyScalar(R + 0.1); q.v.multiplyScalar(0); q.life = Math.min(q.life, 0.25); } }
    else q.p.addScaledVector(q.v, dt);
    const s = q.s * Math.min(1, q.life * 3);
    M4.makeScale(s, s, s).setPosition(q.p); partMesh.setMatrixAt(n, M4); partMesh.setColorAt(n, q.c); n++;
  }
  partMesh.count = n; partMesh.instanceMatrix.needsUpdate = true; if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;
  for (let i = booms.length - 1; i >= 0; i--) { const b = booms[i]; b.t += dt; b.s.scale.setScalar((3 + b.t * 30) * b.size); b.s.material.opacity = Math.max(0, 1 - b.t / 0.7); if (b.t > 0.7) { scene.remove(b.s); b.s.material.dispose(); booms.splice(i, 1); } }
  boomLight.intensity *= Math.exp(-dt * 6);
}

// ------------------------------------------------------------------ controls
const keys = new Set();
let locked = false, mouseL = false, mouseR = false, camPitch = -0.42, camYaw = 0, zoom = 17, chatOpen = false, showBoard = false;
const touch = { mx: 0, my: 0, fire: false, beam: false, up: false, down: false, boost: false, look: null, lookId: null, stickId: null };
function lock() { if (view !== 'planet' || mobile) return; if (isMac) window.webkit.messageHandlers.gp.postMessage('lock'); else $('view').requestPointerLock?.(); }
function releaseLock() { if (isMac) { if (locked) window.webkit.messageHandlers.gp.postMessage('unlock'); } else if (document.pointerLockElement) document.exitPointerLock(); locked = false; mouseL = mouseR = false; }
window.__look = (dx, dy) => { locked = true; look(dx, dy); };
window.__mouse = (b, down) => { locked = true; $('clickto').classList.add('hidden'); if (b === 0) mouseL = down; if (b === 2) { if (down && !mouseR) bombNow(); mouseR = down; } };
window.__unlocked = () => { locked = false; mouseL = mouseR = false; if (view === 'planet' && !screen) pause(); };
document.addEventListener('pointerlockchange', () => { const was = locked; locked = !!document.pointerLockElement; if (was && !locked && view === 'planet' && !screen && !chatOpen) pause(); if (locked) $('clickto').classList.add('hidden'); });
$('clickto').onclick = () => { $('clickto').classList.add('hidden'); lock(); };
$('view').addEventListener('mousedown', e => { if (view !== 'planet' || mobile) return; if (!locked) { lock(); $('clickto').classList.add('hidden'); return; } });
document.addEventListener('mousedown', e => { if (!locked || isMac) return; if (e.button === 0) mouseL = true; if (e.button === 2) { mouseR = true; bombNow(); } });
document.addEventListener('mouseup', e => { if (isMac) return; if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
document.addEventListener('contextmenu', e => { if (view === 'planet') e.preventDefault(); });
document.addEventListener('mousemove', e => { if (locked && !isMac) look(e.movementX, e.movementY); });
addEventListener('wheel', e => { if (view === 'planet') zoom = Math.max(9, Math.min(40, zoom * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: true });
function look(dx, dy) {
  if (!run || view !== 'planet') return;
  const k = 0.0024 * prof.sens;
  if (amPilot()) yawShip(-dx * k); else camYaw -= dx * k;
  camPitch = Math.max(-1.35, Math.min(0.3, camPitch - dy * k * (prof.invy ? -1 : 1)));
}
function yawShip(a) { if (run.ship.down > 0) return; const up = V1.copy(run.ship.p).normalize(); run.ship.f.applyAxisAngle(up, a).projectOnPlane(up).normalize(); }
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') { e.target.blur(); closeChat(); } if (e.key === 'Enter' && e.target.id === 'chatin') { const t = $('chatin').value.trim(); if (t) send({ t: 'chat', text: t }); $('chatin').value = ''; closeChat(); } return; }
  if (view !== 'planet') { if (e.code === 'Escape' && screen === 'scr-help') show(prevScreen); return; }
  if (e.code === 'Escape') { if (screen === 'scr-pause') resume(); else if (!screen) pause(); return; }
  if (screen) return;
  if (e.code === 'Tab') { e.preventDefault(); showBoard = true; }
  if ((e.code === 'KeyT' || e.code === 'Enter') && C.room) { e.preventDefault(); openChat(); return; }
  if (e.code === 'KeyX') nukeNow();
  if (e.code === 'KeyF' || e.code === 'KeyQ') bombNow();
  keys.add(e.code);
});
addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Tab') showBoard = false; });
addEventListener('blur', () => { keys.clear(); mouseL = mouseR = false; });
function openChat() { chatOpen = true; releaseLock(); $('chatform').classList.remove('hidden'); $('chatin').focus(); }
function closeChat() { chatOpen = false; $('chatform').classList.add('hidden'); $('chatin').blur(); if (view === 'planet' && !screen) lock(); }
function bombNow() { if (!run || run.ship.down > 0) return; const S = stats(); if (!S.bomb) { note('💣 Paint Bombs are an upgrade — buy them at the mothership'); sfx.nope(); return; } if (run.bombCd > 0) { sfx.nope(); return; } const d = aimDir(true); send({ t: 'bomb', d: d.toArray() }); run.bombCd = S.bomb.cd; }
function nukeNow() { if (!run) return; const S = stats(); if (!S.nuke) { note('🌈 The Rainbow Nuke is an upgrade — buy it at the mothership'); sfx.nope(); return; } if (run.ship.nuke < 1) { note(`🌈 Nuke charging… ${Math.round(run.ship.nuke * 100)}% — keep painting`); sfx.nope(); return; } send({ t: 'nuke' }); }
function pause() { if (view !== 'planet') return; keys.clear(); mouseL = mouseR = false; touch.fire = touch.beam = false; show('scr-pause'); $('clickto').classList.add('hidden'); $('p-note').textContent = local ? 'Paused — nothing moves until you press RESUME.' : "Online invasions can't pause — your crew is still flying!"; $('p-retreat').classList.toggle('hidden', !(amHost() || amPilot())); }
function resume() { sfx.click(); show(null); if (!mobile) lock(); }
$('p-resume').onclick = resume;
$('p-retreat').onclick = () => { sfx.click(); show(null); send({ t: 'retreat' }); };
$('p-leave').onclick = () => { sfx.click(); goTitle(); };
$('sens').value = prof.sens; $('sens').oninput = () => { prof.sens = +$('sens').value; store.set('sens', prof.sens); };
$('invy').checked = prof.invy; $('invy').onchange = () => { prof.invy = $('invy').checked; store.set('invy', prof.invy); };
for (const k of ['music', 'sfx', 'amb']) { $('vol-' + k).value = audioState().vol[k]; $('vol-' + k).oninput = () => setVolume(k, +$('vol-' + k).value); }
function goTitle() {
  if (local) { saveSolo(false); local = null; }
  if (C.room) { send({ t: 'leave' }); closeWs(); C.room = false; }
  if (run) leavePlanet();
  C.players = []; C.id = 0; C.host = 0; C.pilot = 0; C.camp = soloCamp();
  clearSystem(); history.replaceState(null, '', location.pathname);
  enterTitle();
}

// touch: the stick, drag-to-look and the buttons
if (mobile) {
  const stick = $('stick'), knob = $('knob');
  const stickAt = t => { const r = stick.getBoundingClientRect(); let x = (t.clientX - r.left) / r.width * 2 - 1, y = (t.clientY - r.top) / r.height * 2 - 1; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } touch.mx = x; touch.my = y; knob.style.transform = `translate(${x * 90}%, ${y * 90}%)`; };
  stick.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; touch.stickId = t.identifier; stickAt(t); }, { passive: false });
  const hold = (id, k, down) => { const b = $(id); b.addEventListener('touchstart', e => { e.preventDefault(); touch[k] = true; b.classList.add('held'); if (down) down(); if (k === 'fire') { touch.lookId = e.changedTouches[0].identifier; touch.look = [e.changedTouches[0].clientX, e.changedTouches[0].clientY]; } }, { passive: false }); b.addEventListener('touchend', e => { e.preventDefault(); touch[k] = false; b.classList.remove('held'); }, { passive: false }); };
  hold('t-fire', 'fire'); hold('t-beam', 'beam'); hold('t-up', 'up'); hold('t-down', 'down'); hold('t-boost', 'boost');
  $('t-bomb').addEventListener('touchstart', e => { e.preventDefault(); bombNow(); }, { passive: false });
  $('t-nuke').addEventListener('touchstart', e => { e.preventDefault(); nukeNow(); }, { passive: false });
  $('t-menu').onclick = () => pause(); $('t-board').onclick = () => { showBoard = !showBoard; };
  $('t-chat').onclick = () => { if (C.room) openChat(); else toast('Chat is for online crews'); };
  $('view').addEventListener('touchstart', e => { if (view !== 'planet') return; e.preventDefault(); const t = e.changedTouches[0]; if (touch.lookId === null) { touch.lookId = t.identifier; touch.look = [t.clientX, t.clientY]; } }, { passive: false });
  document.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.stickId) stickAt(t);
      else if (t.identifier === touch.lookId && touch.look) { look((t.clientX - touch.look[0]) * 2.2, (t.clientY - touch.look[1]) * 2.2); touch.look = [t.clientX, t.clientY]; }
    }
    if (!e.target.closest?.('.card, .panel, #m-upg, #lb-log, #rooms, #shop-grid')) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchend', e => { for (const t of e.changedTouches) { if (t.identifier === touch.stickId) { touch.stickId = null; touch.mx = touch.my = 0; knob.style.transform = ''; } if (t.identifier === touch.lookId) { touch.lookId = null; touch.look = null; } } });
}

// ------------------------------------------------------------------ flying, aiming and shooting
const ray = new THREE.Ray();
function seatOrigin(seat) {
  const s = run.ship, up = V8.copy(s.p).normalize(), f = s.f, rt = V9.copy(f).cross(up);
  if (seat === 0) return s.p.clone().addScaledVector(up, -1.5).addScaledVector(f, 1.2);
  const a = [Math.PI / 2, Math.PI, -Math.PI / 2][seat - 1] || 0;
  return s.p.clone().addScaledVector(up, -0.4).addScaledVector(f, Math.cos(a) * 2.9).addScaledVector(rt, Math.sin(a) * 2.9);
}
let aimTarget = new THREE.Vector3(), aimEnemy = false;
/** Where the crosshair points: the ground, or a defender near the line of sight. */
function findTarget() {
  camera.getWorldDirection(V1); ray.set(camera.position, V1);
  const R = run.R;
  let best = null, bd = 1e9;
  const test = (p, rad) => { const t = V2.copy(p).sub(ray.origin).dot(ray.direction); if (t < 5 || t > 420) return; const d = ray.distanceToPoint(p); const tol = rad + t * 0.02; if (d < tol && t < bd) { bd = t; best = p; } };
  for (const f of run.fighters.values()) test(f.o.position, f.ace ? 5 : 3);
  for (const me of run.meteors.values()) test(me.o.position, 5);
  if (run.boss?.p) test(run.boss.o.position, 16);
  for (const t of run.turrets.values()) test(t.o.position.clone().addScaledVector(t.d, 1.6), 2.6);
  for (const c of run.scrubbers.values()) test(c.o.position.clone().addScaledVector(c.d, 1.2), 2.6);
  // the ground
  const hit = ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), R), V3);
  const gt = hit ? hit.distanceTo(camera.position) : 1e9;
  aimEnemy = !!best && bd < gt;
  if (aimEnemy) aimTarget.copy(best);
  else if (hit) aimTarget.copy(hit);
  else aimTarget.copy(ray.origin).addScaledVector(ray.direction, 400);
  return aimTarget;
}
/** The launch direction that makes a blob land on the target (gravity pulls it toward the planet). */
function aimDir(bomb = false) {
  const O = seatOrigin(mySeat()), T = aimTarget, speed = SHOT_SPEED * (bomb ? 0.8 : 1);
  let t = O.distanceTo(T) / speed, dir = new THREE.Vector3();
  for (let i = 0; i < 3; i++) {
    const mid = V4.copy(O).add(T).multiplyScalar(0.5).normalize();
    const lift = V5.copy(T).addScaledVector(mid, 0.5 * GRAV * t * t);
    dir.copy(lift).sub(O).divideScalar(t).addScaledVector(run.ship.v, -0.6);
    t = lift.distanceTo(O) / speed;
    dir.normalize();
  }
  return dir;
}
function updateShip(dt) {
  const s = run.ship, R = run.R, S = stats();
  if (amPilot()) {
    const up = V1.copy(s.p).normalize(), f = s.f, rt = V2.copy(f).cross(up);
    let fw = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - touch.my;
    let st = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + touch.mx;
    if (keys.has('ArrowLeft') && !keys.has('KeyA')) { st += 1; yawShip(dt * 1.6); } if (keys.has('ArrowRight') && !keys.has('KeyD')) { st -= 1; yawShip(-dt * 1.6); }
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.boost ? 1.65 : 1;
    const beamOn = (keys.has('KeyE') || touch.beam) && s.down <= 0;
    const want = V3.set(0, 0, 0).addScaledVector(f, fw).addScaledVector(rt, st);
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(S.speed * boost * (beamOn ? 0.5 : 1) * (s.down > 0 ? 0 : 1));
    s.v.lerp(want, 1 - Math.exp(-2.4 * dt));
    let climb = (keys.has('Space') || touch.up ? 1 : 0) - (keys.has('KeyC') || keys.has('ControlLeft') || touch.down ? 1 : 0);
    if (s.down > 0) climb = -0.3;
    run.alt = Math.max(ALT_MIN, Math.min(ALT_MAX, run.alt + climb * 18 * dt));
    s.p.addScaledVector(s.v, dt);
    const nu = V4.copy(s.p).normalize();
    s.p.copy(nu).multiplyScalar(R + run.alt);
    s.f.projectOnPlane(nu).normalize(); s.v.projectOnPlane(nu);
    run.sendT -= dt;
    if (run.sendT <= 0 || local) { run.sendT = 0.05; send({ t: 'ship', p: s.p.toArray().map(v => +v.toFixed(2)), f: s.f.toArray().map(v => +v.toFixed(4)), v: s.v.toArray().map(v => +v.toFixed(2)) }); }
    if (beamOn !== s.beam) { s.beam = beamOn; send({ t: 'beam', on: beamOn }); }
  } else {
    // gunners ride along: follow the pilot's saucer smoothly
    s.p.lerp(V1.copy(s.tp).addScaledVector(s.estV, 0.05), 1 - Math.exp(-10 * dt));
    s.f.lerp(s.tf, 1 - Math.exp(-8 * dt)).normalize();
    s.v.lerp(s.estV, 1 - Math.exp(-5 * dt));
    s.beam = s.srvBeam; run.alt = s.p.length() - R;
  }
}
function updateCamera(dt) {
  const s = run.ship, up = V1.copy(s.p).normalize();
  const f = V2.copy(s.f).applyAxisAngle(up, camYaw);
  const rt = V3.copy(f).cross(up).normalize();
  const cf = V4.copy(f).applyAxisAngle(rt, camPitch);
  const shake = run.shake; run.shake = Math.max(0, run.shake - dt * 2);
  // the saucer sits in the lower part of the picture so you can see what's ahead of it
  const camUp = V7.copy(rt).cross(cf).normalize();
  const pos = V5.copy(s.p).addScaledVector(cf, -zoom).addScaledVector(camUp, 1.6 + zoom * 0.3);
  if (shake) pos.add(V6.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake * 0.8));
  // never below the ground
  const minR = run.R + 3; if (pos.length() < minR) pos.setLength(minR);
  camera.position.copy(pos); camera.up.copy(up);
  camera.lookAt(V6.copy(pos).addScaledVector(cf, 50));
}
function updatePlanet(dt) {
  const R = run.R, s = run.ship, S = stats();
  run.t += dt;
  if (!screen && !chatOpen) updateShip(dt); else if (amPilot()) { s.v.multiplyScalar(Math.exp(-3 * dt)); send({ t: 'ship', p: s.p.toArray(), f: s.f.toArray(), v: s.v.toArray() }); }
  else updateShip(dt);
  updateCamera(dt);
  findTarget();
  // the trigger
  const firing = (mouseL || touch.fire) && !screen && !chatOpen && s.down <= 0 && !(amPilot() && s.beam);
  const d = aimDir();
  run.aimSend = (run.aimSend || 0) - dt;
  if (run.aimSend <= 0 || firing !== run.wasFiring) { run.aimSend = local ? 0 : 0.05; send({ t: 'aim', d: d.toArray().map(v => +v.toFixed(4)), f: firing ? 1 : 0 }); run.wasFiring = firing; }
  $('cross').classList.toggle('enemy', aimEnemy);
  // the UFO
  const up = V1.copy(s.p).normalize();
  const beamLen = s.beam ? Math.max(0, run.alt - 1) : 0;
  const aims = run.aims.slice(); aims[mySeat()] = d;
  ufo.update(dt, { p: s.p, up, f: s.f, v: s.v, beamLen, aims, firing: run.firing, shieldFrac: S.shield ? s.sh / S.shield : 0, down: s.down > 0 });
  ufo.cannon.position.z += (1.6 - ufo.cannon.position.z) * Math.min(1, dt * 12);
  if (ufo.drones.length !== S.drones) ufo.setDrones(S.drones);
  // the planet
  if (run.P.clouds) run.P.clouds.rotation.y += dt * 0.004;
  run.P.paint.update(performance.now());
  // paint blobs
  for (const [id, b] of run.shots) {
    b.age += dt;
    if (b.g) b.v.addScaledVector(V2.copy(b.p).normalize(), -GRAV * dt);
    b.p.addScaledVector(b.v, dt);
    b.off.multiplyScalar(Math.exp(-7 * dt));
    b.mesh.position.copy(b.p).add(b.off);
    b.mesh.quaternion.setFromUnitVectors(V3.set(0, 1, 0), V4.copy(b.v).normalize()); b.mesh.scale.y = b.mesh.scale.x * (1 + Math.min(1.2, b.v.length() / 120));
    if (b.p.length() <= R || b.age > 4.2) { planetG.remove(b.mesh); run.shots.delete(id); }
  }
  for (const [id, e] of run.eshots) { e.age += dt; e.p.addScaledVector(e.v, dt); e.mesh.position.copy(e.p); if (e.big) e.mesh.scale.setScalar(1 + Math.sin(e.age * 30) * 0.15); if (e.p.length() <= R || e.age > 3.4) { planetG.remove(e.mesh); run.eshots.delete(id); } }
  // defenders
  const shipW = s.p;
  for (const t of run.turrets.values()) { const h = t.o.userData.head; h.lookAt(shipW); t.o.userData.eye.update(dt, V2.copy(t.d).negate(), 16); t.flash = Math.max(0, (t.flash || 0) - dt * 4); h.children[0].material.emissive?.setScalar(t.flash * 0.6); }
  for (const sd of run.shields.values()) { const u = sd.o.userData; u.mat.uniforms.t.value = run.t; u.mat.uniforms.flash.value = Math.max(0, u.mat.uniforms.flash.value - dt * 3); u.eye.update(dt, V2.copy(sd.d).negate(), 16); }
  for (const f of run.fighters.values()) {
    if (f.tp) { const age = (performance.now() - f.snapAt) / 1000; const tgt = V2.copy(f.tp).addScaledVector(f.v, Math.min(0.2, age)); f.p.lerp(tgt, 1 - Math.exp(-10 * dt)); }
    f.o.position.copy(f.p);
    const fu = V3.copy(f.p).normalize(), fw = V4.copy(f.v).lengthSq() > 1 ? V4.normalize() : V4.copy(shipW).sub(f.p).normalize();
    orient(f.o, fu, fw); f.o.userData.inner.rotation.z = Math.sin(run.t * 2 + f.p.x) * 0.3;
    f.o.userData.flame.scale.setScalar(0.8 + Math.random() * 0.4);
  }
  for (const c of run.scrubbers.values()) {
    if (c.td) c.d.lerp(c.td, 1 - Math.exp(-6 * dt)).normalize();
    c.o.position.copy(c.d).multiplyScalar(R); orient(c.o, c.d, V2.copy(c.h).projectOnPlane(c.d).normalize());
    c.o.userData.brush.rotation.x += dt * 12; c.o.userData.eyes.forEach(e => e.update(dt, V3.copy(c.d).negate(), 16)); c.o.userData.beacon.material.emissiveIntensity = Math.sin(run.t * 10) > 0 ? 4 : 0.5;
  }
  const upS = V5.copy(s.p).normalize();
  for (const n of run.natives.values()) {
    if (n.td) { const was = V2.copy(n.d); const nd = V3.copy(n.d).lerp(n.td, 1 - Math.exp(-6 * dt)).normalize(); n.spd = nd.distanceTo(was) * R / Math.max(dt, 1e-3) / 2; n.d.copy(nd); }
    if (n.tl !== undefined) n.lift += (n.tl - n.lift) * (1 - Math.exp(-6 * dt));
    const vis = n.d.dot(upS) > 0.6; n.n.group.visible = vis; if (!vis) continue;
    n.n.group.position.copy(n.d).multiplyScalar(R + n.lift); orient(n.n.group, n.d, V4.copy(n.h).projectOnPlane(n.d).normalize());
    n.n.update(dt, n.spd, n.st);
  }
  let rain = 0;
  for (const w of run.storms.values()) { if (w.td) w.d.lerp(w.td, 1 - Math.exp(-3 * dt)).normalize(); w.o.position.copy(w.d).multiplyScalar(R); orient(w.o, w.d, V2.set(0, 1, 0).projectOnPlane(w.d).normalize()); const pos = w.o.userData.rain.geometry.attributes.position; for (let i = 0; i < pos.count; i += 2) { let y = pos.getY(i) - dt * 30; if (y < 0) y += 11; pos.setY(i, y); pos.setY(i + 1, y - 1.4); } pos.needsUpdate = true; const dd = w.d.angleTo(upS) * R; rain = Math.max(rain, 1 - dd / 40); }
  if (run.boss?.p) {
    const b = run.boss; b.p.lerp(b.tp, 1 - Math.exp(-4 * dt)); b.o.position.copy(b.p);
    const bu = V2.copy(b.p).normalize(); b.o.up.copy(bu); b.o.lookAt(shipW);
    b.o.userData.ring.rotation.z = b.spin; b.o.userData.eye.update(dt, V3.copy(bu).negate(), 20);
    b.o.userData.core.intensity = 600 + Math.sin(run.t * 6) * 300;
    $('boss-fill').style.width = (b.hp * 100) + '%';
  }
  for (const u of run.powerups.values()) { const U = u.o.userData; U.gem.rotation.y += dt * 2; U.gem.rotation.x += dt * 1.3; U.cage.rotation.y -= dt; U.ring.rotation.z += dt * 3; const uu = V2.copy(u.p).normalize(); u.o.position.copy(u.p).addScaledVector(uu, Math.sin(run.t * 3 + u.p.x) * 0.8); orient(u.o, uu, V3.copy(camera.position).sub(u.p).projectOnPlane(uu).normalize()); }
  for (const me of run.meteors.values()) { me.p.addScaledVector(me.v, dt); me.o.position.copy(me.p); me.o.quaternion.setFromUnitVectors(V2.set(0, 1, 0), V3.copy(me.v).normalize().negate()); me.o.userData.rock.rotation.x += dt * 3; }
  for (const c of run.coins.values()) { if (c.tp) c.p.lerp(c.tp, 1 - Math.exp(-12 * dt)); c.o.position.copy(c.p); c.o.rotation.y += dt * 4; c.o.up.copy(V2.copy(c.p).normalize()); }
  for (const fl of run.flags) { const u = fl.userData, pos = u.cloth.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { const x = u.base[i * 3]; pos.setZ(i, Math.sin(x * 1.3 - run.t * 6) * 0.3 * (x + 3) / 6); } pos.needsUpdate = true; }
  updateFx(dt);
  // sound
  setListener(camera.position.x, camera.position.y, camera.position.z, Math.atan2(-camera.getWorldDirection(V2).x, -V2.z));
  ambience.update(dt, { space: 0.35, engine: Math.min(1, s.v.length() / 40), alt: (run.alt - ALT_MIN) / (ALT_MAX - ALT_MIN), atmo: run.pl.type === 'barren' ? 0.2 : 1, beam: s.beam, rain, alarm: s.hp > 0 && s.hp < stats().hull * 0.25 && s.down <= 0 });
  space.frame(dt, s.p);
  drawHud(dt);
}
function distToCam(p) { return camera.position.distanceTo(p); }

// ------------------------------------------------------------------ HUD
function drawHud(dt) {
  const s = run.ship, S = stats();
  const cov = run.cov * 100;
  $('cov-fill').style.width = Math.min(100, cov) + '%';
  $('cov-t').textContent = `${cov.toFixed(1)}% painted · need ${Math.round(run.pl.need * 100)}%${run.boss ? ' + Guardian' : ''}`;
  $('h-cr').textContent = money(C.camp.credits);
  const bar = (id, v, max, low = 0.25) => { const e = $(id); e.querySelector('i').style.width = (max ? Math.max(0, Math.min(1, v / max)) * 100 : 0) + '%'; e.querySelector('b').textContent = Math.max(0, Math.round(v)); e.classList.toggle('low', max && v / max < low); };
  $('b-sh').classList.toggle('hidden', !S.shield);
  bar('b-sh', s.sh, S.shield, 0); bar('b-hp', s.hp, S.hull); bar('b-tank', run.tank, S.tank, 0.15);
  const ab = (id, state, frac) => { const e = $(id); e.classList.toggle('off', state === 'off'); e.classList.toggle('ready', state === 'ready'); e.classList.toggle('on', state === 'on'); e.querySelector('i').style.height = (frac * 100) + '%'; };
  ab('ab-bomb', !S.bomb ? 'off' : run.bombCd <= 0 ? 'ready' : '', S.bomb ? 1 - run.bombCd / S.bomb.cd : 0);
  ab('ab-beam', !amPilot() ? 'off' : s.beam ? 'on' : 'ready', s.beam ? 1 : 0);
  ab('ab-nuke', !S.nuke ? 'off' : s.nuke >= 1 ? 'ready' : '', s.nuke || 0);
  if (mobile) { $('t-bomb').classList.toggle('off', !S.bomb || run.bombCd > 0); $('t-nuke').classList.toggle('ready', s.nuke >= 1); $('t-nuke').classList.toggle('off', !S.nuke); $('t-beam').classList.toggle('hidden', !amPilot()); for (const id of ['t-up', 't-down', 't-boost']) $(id).classList.toggle('hidden', !amPilot()); }
  $('cross').style.setProperty('--pc', prof.color);
  $('role').innerHTML = C.room ? (amPilot() ? '<b>🛸 PILOT</b> — you fly the saucer' : `<b>🎯 GUNNER</b> — ${esc(C.players.find(p => p.id === C.pilot)?.name || '')} is flying`) : '<b>🛸 SOLO</b> — just you in your UFO';
  $('role').classList.toggle('hidden', !C.room && run.t > 20);
  $('keys').textContent = run.t < 40 ? (amPilot() ? 'WASD fly · mouse steer & aim · Space up · C down · Shift boost · Click paint · Right-click bomb · E beam · X nuke · Esc menu' : 'Mouse aim · Click paint · Right-click bomb · X nuke · Tab crew · T chat') : '';
  $('h-earn').textContent = `+${money(run.earned)} this planet`;
  const bf = [['rapid', run.buffs[0]], ['rainbow', run.buffs[1]], ['cash', run.buffs[2]]].filter(b => b[1] > 0);
  const bh = bf.map(([k, t]) => `<div class="buff" style="--bc:#${new THREE.Color(POWER[k].color).getHexString()}">${POWER[k].icon} ${POWER[k].name}<i>${Math.ceil(t)}s</i></div>`).join('');
  if ($('buffs')._h !== bh) { $('buffs').innerHTML = bh; $('buffs')._h = bh; }
  const cb = $('combo'); cb.classList.toggle('on', run.combo >= 2);
  if (run.combo >= 2) { cb.querySelector('b').textContent = '×' + (1 + Math.min(20, run.combo) * 0.1).toFixed(1); cb.querySelector('i').style.transform = `scaleX(${Math.max(0, run.comboT / 7)})`; }
  run.mmT -= dt; if (run.mmT <= 0) { run.mmT = 0.25; drawMinimap(); }
  $('board').classList.toggle('hidden', !showBoard);
  if (showBoard) $('board').innerHTML = `<table><tr><th>CREW</th><th>SEAT</th></tr>${C.players.map(p => `<tr class="${p.id === C.id ? 'me' : ''}"><td><span class="dot" style="background:${esc(p.color)}"></span> ${esc(p.name)}</td><td>${p.seat === 0 ? '🛸 pilot' : '🎯 gunner'}</td></tr>`).join('')}</table><p class="tiny">${esc(run.pl.name)} · ${run.turrets.size} turrets left · ${run.shields.size} shield domes · ${run.natives.size} natives around</p>`;
}
function drawMissions(flash = -1) {
  if (!run) return;
  $('missions').innerHTML = '<div class="mh">MISSIONS · bonus cash</div>' + run.missions.map((m, i) => `<div class="ms ${m.done ? 'done' : ''} ${i === flash ? 'flash' : ''}">${esc(m.text)}<b>${m.done ? '+' + money(m.reward) : m.k === 'speed' ? m.got + '/' + m.n + '%' : m.got + '/' + m.n}</b></div>`).join('');
}
function drawHudCrew() { $('crew').innerHTML = C.room ? C.players.slice().sort((a, b) => a.seat - b.seat).map(p => `<div class="cm ${p.id === C.id ? 'me' : ''}"><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}<span class="st">${p.seat === 0 ? '🛸 pilot' : '🎯 gunner'}</span></div>`).join('') : ''; }
const mmImg = document.createElement('canvas'); mmImg.width = GW; mmImg.height = GH;
function drawMinimap() {
  const c = $('mm'), g = c.getContext('2d'), W = c.width, H = c.height;
  g.drawImage(run.mmBase, 0, 0, W, H);
  const ig = mmImg.getContext('2d'), img = ig.createImageData(GW, GH), d = img.data;
  const cols = run.colors.map(x => x ? new THREE.Color(x) : null);
  for (let k = 0; k < run.grid.length; k++) { const v = run.grid[k]; if (!v) continue; const cc = cols[v] || cols[1]; d[k * 4] = cc.r * 255; d[k * 4 + 1] = cc.g * 255; d[k * 4 + 2] = cc.b * 255; d[k * 4 + 3] = 235; }
  ig.putImageData(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(mmImg, 0, 0, W, H);
  const pt = v => { const [u, t] = dirToUT(v.x, v.y, v.z); return [u * W, t * H]; };
  const dot = (v, col, r) => { const [x, y] = pt(v); g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  g.lineWidth = 1.5;
  for (const sd of run.shields.values()) { const [x, y] = pt(sd.d); g.strokeStyle = '#6ac8ff'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.stroke(); }
  for (const w of run.storms.values()) dot(w.d, '#8a8a9aaa', 6);
  for (const t of run.turrets.values()) dot(t.d, '#ff3a2a', 2.2);
  for (const sc of run.scrubbers.values()) dot(sc.d, '#ffe23a', 2.6);
  for (const f of run.fighters.values()) dot(V1.copy(f.p).normalize(), '#ff8a8a', 2);
  if (run.boss?.p) dot(V1.copy(run.boss.p).normalize(), '#ff2a2a', 5);
  for (const u of run.powerups.values()) dot(V1.copy(u.p).normalize(), '#5affff', 3.2);
  for (const me of run.meteors.values()) dot(V1.copy(me.p).normalize(), '#ffffff', 2.2);
  for (const n of run.natives.values()) if (n.gold) { const [x, y] = pt(n.d); g.font = '16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('⭐', x, y); }
  for (const f of run.fighters.values()) if (f.ace) dot(V1.copy(f.p).normalize(), '#ffa82a', 4.5);
  const sp = V1.copy(run.ship.p).normalize(); const [x, y] = pt(sp);
  g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.stroke();
}
let hitT = 0;
function showHit(kill = false) { sfx.hitmark(kill); const e = $('hitm'); e.style.opacity = 1; clearTimeout(hitT); hitT = setTimeout(() => e.style.opacity = 0, kill ? 260 : 120); }
function flashV(col, k) { const v = $('vign'); v.style.setProperty('--vc', col); v.style.transition = 'none'; v.style.opacity = k; requestAnimationFrame(() => { v.style.transition = 'opacity .6s'; v.style.opacity = 0; }); if (col === '#ffffff') { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = 0.8; requestAnimationFrame(() => { f.style.transition = 'opacity 1.2s'; f.style.opacity = 0; }); } }
let popAcc = 0, popAccT = 0;
function popCash(v, why, p, coin = false) {
  if (run && !coin) run.earned += v;
  if (!why && !coin) { popAcc += v; if (performance.now() - popAccT < 900) return; v = popAcc; popAcc = 0; popAccT = performance.now(); }
  let x = innerWidth / 2 + (Math.random() - 0.5) * 80, y = innerHeight * 0.42;
  if (p) { V1.set(p[0], p[1], p[2]).project(camera); if (V1.z < 1) { x = (V1.x + 1) / 2 * innerWidth; y = (1 - V1.y) / 2 * innerHeight - 30; } }
  const e = document.createElement('div'); e.className = 'pop' + (coin ? ' gold' : '') + (v > 500 ? ' big' : '');
  e.textContent = `+${money(v)}${why ? ' ' + why : ''}`; e.style.left = x + 'px'; e.style.top = y + 'px';
  $('pops').appendChild(e); setTimeout(() => e.remove(), 1500);
}

// ------------------------------------------------------------------ conquest
function onConquer(m) {
  sfx.conquer(); music.play('win');
  const mine = m.players.find(p => p.id === C.id);
  addGems(m.gems); setTimeout(() => sfx.gem(), 1400);
  if (run) {
    const up = V1.copy(run.ship.p).normalize();
    const flag = makeFlag(m.color); flag.position.copy(up).multiplyScalar(run.R); orient(flag, up, V2.copy(run.ship.f)); planetG.add(flag); run.flags.push(flag);
    for (let i = 0; i < 10; i++) setTimeout(() => run && burst(V3.copy(run.ship.p).addScaledVector(V4.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 30), COLORS[i % COLORS.length], 40, 20), i * 250);
    center('PLANET CONQUERED!', `${esc(m.name)} is yours`, 3000);
    releaseLock();
  }
  if (local) saveSolo(false);
  setTimeout(() => {
    $('w-flag').innerHTML = '🏳️‍🌈'.replace('🏳️‍🌈', `<span style="display:inline-block;width:80px;height:50px;border-radius:6px;background:${esc(m.color)};box-shadow:0 0 20px ${esc(m.color)}"></span>`);
    $('w-title').textContent = m.finale ? 'YOU OWN THE WHOLE UNIVERSE!' : m.galDone ? 'GALAXY CONQUERED!' : m.sysDone ? 'STAR SYSTEM CONQUERED!' : 'PLANET CONQUERED!';
    $('w-sub').innerHTML = `${esc(m.name)} is now covered in paint · ${Math.round(m.cov * 100)}% · ${Math.floor(m.time / 60)}m ${Math.floor(m.time % 60)}s`;
    $('w-take').innerHTML = `+${money(m.reward)} bonus · 💎 +${m.gems} gems`;
    $('w-list').innerHTML = `<div class="stand head"><span>CREW</span><span class="r">PAINTED</span><span class="r">EARNED</span><span class="r">KOs</span><span class="r">ABDUCTED</span></div>` + m.players.map(p => `<div class="stand"><span class="n"><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}</span><span class="r">${p.pct}%</span><span class="r">${money(p.earned)}</span><span class="r">${p.kills}</span><span class="r">${p.abducted}</span></div>`).join('');
    const extra = m.finale ? 'Every galaxy is yours. The googlyverse is painted. You are the greatest invader of all time!' : m.galDone ? `${esc(m.galaxy)} is all yours! Next stop: ${esc(m.nextGalaxy)}.` : m.sysDone ? 'Every planet in this system is painted — the next system is open!' : '';
    $('w-extra').classList.toggle('hidden', !extra); $('w-extra').innerHTML = extra;
    void mine;
    $('w-t').textContent = 'Back to the mothership in a moment…';
    show('scr-win');
  }, 2600);
}

// ------------------------------------------------------------------ the loop
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3(), V5 = new THREE.Vector3(), V6 = new THREE.Vector3(), V7 = new THREE.Vector3(), V8 = new THREE.Vector3(), V9 = new THREE.Vector3(), M4 = new THREE.Matrix4();
let fps = 60, profT = [0, 0, 0];
function frame() {
  requestAnimationFrame(frame);
  if (window.__iconMode) return;
  const dt = Math.min(0.05, clock.getDelta());
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  const t0 = performance.now();
  if (view === 'planet' && run) updatePlanet(dt);
  const t1 = performance.now();
  pump(dt);
  if (view === 'title') updateTitle(dt);
  else if (view === 'mother') updateMother(dt);
  else if (view === 'loading') space.frame(dt, null);
  if (view !== 'planet') updateFx(dt);
  const t2 = performance.now();
  space.render(dt);
  if (screen === 'scr-win' && view === 'mother') { /* the victory card stays until the map shows */ }
  if (Q.has('dbg')) { profT = [t1 - t0, t2 - t1, performance.now() - t2]; $('keys').textContent = `${fps.toFixed(0)} fps · update ${profT[0].toFixed(1)} · pump ${profT[1].toFixed(1)} · render ${profT[2].toFixed(1)} ms · dpr ${(space.maxDpr * space.dprK).toFixed(2)}`; }
}
// the victory card closes itself when the map comes back
const _enterMother = enterMother;
enterMother = function () { _enterMother(); if (screen === 'scr-win') setTimeout(() => { if (screen === 'scr-win') show(null); }, 1200); };

// ------------------------------------------------------------------ test hooks (?solo=1&key=0-0-2&cov=0.6 …)
window.__gpi = { setZoom(z, p) { zoom = z; if (p !== undefined) camPitch = p; }, get run() { return run; }, get C() { return C; }, get local() { return local; }, space, ufo, send, pause, prof, get view() { return view; }, touch, keys };
enterTitle();
requestAnimationFrame(frame);
if (Q.has('icon')) import('./icon.js').then(m => m.drawIcon({ space, ufo, scene, camera, buildPlanet, prof }));
else if (Q.has('audiotest')) audioTest((n, r) => console.log(n, JSON.stringify(r))).then(r => { window.__audio = r; });
else if (Q.has('solo')) {
  if (!prof.name) prof.name = 'VINCE';
  startSolo();
  if (Q.has('mother')) { /* stay on the map */ }
  else setTimeout(() => {
    send({ t: 'go' });
    const cov = +Q.get('cov') || 0;
    if (cov) setTimeout(() => { const R = local.room.run; if (!R) return; const n = Math.round(cov * 2600); for (let i = 0; i < n; i++) { const z = Math.random() * 2 - 1, a = Math.random() * 6.28, q = Math.sqrt(1 - z * z); local.room.paint([q * Math.cos(a), z, q * Math.sin(a)], 0.07, 1, local.p); } }, 300);
    if (Q.has('ev')) setTimeout(() => { const R = local.room.run; if (R) { local.room.startEvent(Q.get('ev')); R.puT = 0; } }, 1500);
    if (Q.has('win')) setTimeout(() => { const R = local.room.run; if (R) { R.bossDead = true; R.boss = null; R.paintedW = 1e9; } }, 3000);
  }, 400);
}
if (Q.has('hud') && Q.get('hud') === '0') document.body.classList.add('nohud');
