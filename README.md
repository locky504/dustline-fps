# DUSTLINE — a three.js tactical FPS

A round-based tactical first-person shooter in the style Counter-Strike made famous,
built on three.js 0.187.0, running entirely from static files with no build step and
no network request. Single-player against bots.

## The game

A dusk desert freight yard. Two teams of five: the **Dustjacks** attack, the
**Wardens** defend. Each round the Dustjacks push one of two bomb sites (A or B) to
plant a charge; the Wardens hold the sites and defuse. A round is won by eliminating
the other team, detonating the charge, or defusing it; if time expires with no plant,
the defenders take it. First team to 5 rounds wins the match.

Between rounds you earn credits — $300 a kill, $3,250 a round win, $1,900 a loss,
$300 for a plant — and spend them in the buy menu: five weapons (P9 Sidearm, Kestrel
SMG, Breacher-12 shotgun, VK-47 rifle, Longbow DMR), a Kevlar vest, frag and smoke
grenades.

Gunplay is built on accuracy over speed: hitscan shots checked against torso and
head (headshots deal 4x), recoil and spread that punish firing on the move, movement
with acceleration, crouching and collision with the map, so stopping to aim pays.
Bots walk waypoint routes, hold positions, react to gunfire they hear, and shoot back
in bursts.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Click to play (pointer lock). Controls:

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look, click to fire, right mouse to scope (Longbow) |
| R | Reload |
| 1 / 2 / Q | Weapons / quick swap |
| 4 / 5 | Frag / smoke grenade |
| E | Plant / defuse (hold, near the charge) |
| B | Buy menu (buy phase) |
| Ctrl / C | Crouch |
| Space | Jump |

`?shot=start|play|buy|end&seed=N` renders a deterministic frame for screenshots and
sets `window.__shotReady` when it is painted (see `shots.json`).

## Layout

- `game/index.html` — page and HUD
- `game/src/main.js` — boot, fixed 60 Hz loop, screenshot modes
- `game/src/world.js` — the map, colliders, waypoint graph, line of sight
- `game/src/bots.js` — bot AI: routes, holding, hearing, bursts
- `game/src/combat.js` — hitscan, damage, tracers, grenades, the bomb
- `game/src/rounds.js` — round state machine and economy
- `game/src/weapons.js` — the armoury and view models
- `game/src/player.js` — movement and collision
- `game/src/hud.js` — the DOM HUD and buy menu
- `game/src/input.js` — keyboard, mouse, pointer lock
- `game/src/audio.js` — procedural WebAudio effects
- `game/src/palette.js` — the look plan
- `game/vendor/three/` — three.js 0.187.0, vendored byte for byte

`main.ts` hands the entry in: it copies `game/` and `screenshots/` to `/output` and
writes `/output/dossier.json` with `vendor/makefun-threejs.ts`.

## License

MIT — see `LICENSE`. An original game: its own map, art, sounds and names.
