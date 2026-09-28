// Headless campaign: a bot pilot flies the UFO, paints, shoots turrets, uses the beam and buys upgrades between planets.
// node test/sim.mjs [planets=12] [crew=1] [skill=1]   → one line per planet (time, deaths, credits, upgrades)
import { Room, newPlayer, SHOT_SPEED, GRAV } from '../public/js/core.js';
import { UPGRADES, upgCost, planetByKey } from '../public/js/universe.js';
import { cellOf } from '../public/js/core.js';
const N = +(process.argv[2] || 12), CREW = +(process.argv[3] || 1), SKILL = +(process.argv[4] || 1);
const len = a => Math.hypot(...a), nrm = a => { const l = len(a) || 1; return a.map(v => v / l); };
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k), sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mul = (a, k) => a.map(v => v * k), cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const tangent = (v, u) => sub(v, mul(u, dot(v, u)));
let deaths = 0;
const room = new Room({ solo: CREW === 1, out: (p, m) => { if (m.t === 'down' && p.id === 1) deaths++; } });
const crew = [];
for (let i = 0; i < CREW; i++) { const p = newPlayer({ id: i + 1, name: 'BOT' + i, color: ['#7bd13b', '#b04aff', '#2f9bff', '#ffcc00'][i] }); room.join(p); crew.push(p); }
// aim so a blob lands on the ground point tp (solve the drop roughly by aiming a bit higher)
function aimAt(o, tp, R) { const d = len(sub(tp, o)), t = d / SHOT_SPEED; return nrm(add(sub(tp, o), nrm(o), 0.5 * GRAV * t * t * 0.9)); }
function buy() {
  for (let loop = 0; loop < 40; loop++) {
    const opts = UPGRADES.filter(u => (room.camp.upg[u.id] || 0) < u.max).map(u => ({ id: u.id, c: upgCost(u.id, room.camp.upg[u.id] || 0) })).sort((a, b) => a.c - b.c);
    if (!opts.length || opts[0].c > room.camp.credits) return;
    room.handle(crew[0], { t: 'buy', id: opts[0].id });
  }
}
console.log('planet            R   time  deaths  credits   upgrades');
for (let n = 0; n < N; n++) {
  buy();
  const key = room.camp.cur, pl = planetByKey(key);
  room.handle(crew[0], { t: 'go' });
  deaths = 0;
  const dt = 1 / 30; let t = 0, tgt = null, retarget = 0;
  while (room.phase === 'planet' && t < 1800) {
    const r = room.run, s = r.ship, R = r.R, up = nrm(s.p);
    // pilot: fly toward unpainted ground; shoot turrets first when close
    retarget -= dt;
    if (!tgt || retarget <= 0) {
      retarget = 3; let best = null, bd = 1e9;
      for (let k = 0; k < 60; k++) { const z = Math.random() * 2 - 1, a = Math.random() * 6.28, q = Math.sqrt(1 - z * z); const d = [q * Math.cos(a), z, q * Math.sin(a)]; const [ci] = cellOf(d); if (r.grid[ci] || r.shieldMask[ci]) continue; const dd = 1 - dot(d, up); if (dd < bd) { bd = dd; best = d; } }
      tgt = best || up;
    }
    const want = nrm(tangent(sub(tgt, up), up));
    const S = room.stats();
    s.f = nrm(add(s.f, want, 0.08)); s.f = nrm(tangent(s.f, up));
    s.v = mul(s.f, S.speed * 0.7 * SKILL);
    s.p = mul(nrm(add(s.p, s.v, dt)), R + 20);
    const turret = r.turrets.map(t2 => ({ t2, d: len(sub(mul(t2.d, R + 1.4), s.p)) })).filter(x => x.d < 150).sort((a, b) => a.d - b.d)[0];
    const fighter = r.fighters.filter(f => f.alive).map(f => ({ f, d: len(sub(f.p, s.p)) })).filter(x => x.d < 130).sort((a, b) => a.d - b.d)[0];
    crew.forEach((p, i) => {
      let tp;
      if (r.boss && len(sub(r.boss.p, s.p)) < 200 && i % 2 === 0) tp = r.boss.p;
      else if (fighter && i === 1) tp = fighter.f.p;
      else if (turret && i === 0 && Math.random() < 0.7) tp = mul(turret.t2.d, R + 1.4);
      else tp = mul(nrm(add(add(up, s.f, (15 + Math.random() * 45) / R), cross(s.f, up), (Math.random() - 0.5) * 70 / R)), R);
      const o = room.seatOrigin(p.seat);
      const aim = aimAt(o, tp, R); const miss = (1 - SKILL) * 0.08;
      p.aim = nrm(add(aim, [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5], miss)); p.fire = true;
      if (S.bomb && p.bombCd <= 0) room.bomb(p, p.aim);
    });
    s.beam = r.natives.some(n => n.st < 2 && dot(n.d, up) > Math.cos(S.beam.r / R * 1.5)) && Math.random() < 0.7;
    if (S.nuke && s.nuke >= 1) room.nuke(crew[0]);
    room.tick(dt); t += dt;
  }
  const lv = UPGRADES.map(u => room.camp.upg[u.id] || 0).join('');
  console.log(`${(key + ' ' + pl.name).padEnd(17).slice(0, 17)} ${String(pl.R).padStart(3)} ${(t / 60).toFixed(1).padStart(5)}m ${String(deaths).padStart(5)}  ${String(Math.round(room.camp.credits)).padStart(8)}   ${lv}${room.phase === 'planet' ? '  (GAVE UP)' : ''}`);
  if (room.phase === 'planet') room.endRun(false);
  for (let k = 0; k < 400 && room.phase !== 'hangar'; k++) room.tick(1 / 30);
}
