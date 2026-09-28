# Googly-Planet Invasion

You're a googly in a flying saucer. Shoot paint at planets until 70% of each one is covered, beat the Guardian at the end
of every star system, and take over the whole universe: 10 galaxies × 5 systems × 3–5 planets (199 planets).

- **Play solo**: open the Mac app (or the page) and press PLAY SOLO. It runs entirely in the page, with no server. Your universe autosaves every 30 s.
- **Online**: up to 4 people share one UFO (1 pilot + 3 gunners). Only real people fill the seats — there's no computer crew.
  `cd web && npm install && node server.js`, or deploy with `render.yaml` (Render Blueprint).
- **Mac app**: `mac/build.sh` builds `Googly-Planet Invasion.app` (served over the `gpi://` scheme, so solo works offline).
  Online play uses https://googly-planet-invasion.onrender.com (change it with `GPI_URL` or the app menu).

Tests: `node web/test/sim.mjs 30` (a bot plays the campaign and buys upgrades), `node web/test/lobby.mjs` (server on :8151),
`node web/test/snap.mjs "solo=1&lq=1" out.png` (headless screenshot). Page hooks: `solo=1`, `mother=1`, `key=G-S-P`, `upg=N`,
`cred=N`, `cov=0.5`, `win=1`, `lq=1`, `touch=1`, `dbg=1`, `icon=1`, `audiotest=1`.
