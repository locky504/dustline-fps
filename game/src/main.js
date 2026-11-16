// DUSTLINE boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|buy|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { WEAPONS, createWeaponState, createViewModel, refillWeapon, spreadOf } from './weapons.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 22, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const hud = createHud();
const audio = createAudio();
const input = createInput(renderer.domElement, onLockChange);
const player = createPlayer(world.colliders);
const viewModel = createViewModel(camera);

// The game context: every module reads the same object, so state lives in one place.
const G = {
  scene,
  camera,
  world,
  hud,
  audio,
  input,
  player,
  viewModel,
  shot: !!shot,
  time: 0,
  random: shot ? mulberry32(seed) : Math.random,
  noises: [],
  combatants: [],
  hitMeshes: [],
  state: {
    phase: 'menu',
    round: 1,
    score: { atk: 0, def: 0 },
    money: 800,
    roundTime: 100,
    loadout: { primary: null, armor: false, grenades: { frag: 0, smoke: 0 } },
    attackSite: world.sites[0],
    bomb: { state: 'none', holder: null, site: null, pos: new THREE.Vector3(), plantAt: 0, defuseAt: 0, plantedAt: 0, planter: null },
    kills: { atk: 0, def: 0 },
    playerFighter: null,
  },
  events: {},
  shakeAmp: 0,
  shake(amp) { G.shakeAmp = Math.max(G.shakeAmp, amp); },
  onPlayerDeath() { spectateNext(); },
};

const body = player.state;
const playerFighter = {
  id: 'player',
  team: 'atk',
  name: 'YOU',
  isPlayer: true,
  pos: body.position,
  yaw: body.yaw,
  eye: body.eye,
  health: 100,
  armor: false,
  alive: true,
  weapon: createWeaponState(WEAPONS.p9),
  weaponDef: WEAPONS.p9,
  primaryWeapon: null,
  grenades: { frag: 0, smoke: 0 },
  speed: 0,
  aimDir: new THREE.Vector3(0, 0, -1),
};
G.state.playerFighter = playerFighter;

// Invisible hit boxes so bots can shoot the player: raycasts hit them like any mesh.
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), hitMat);
playerTorso.position.y = 1.0;
const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), hitMat);
playerHead.position.y = 1.56;
playerTorso.userData = { fighter: playerFighter, part: 'torso' };
playerHead.userData = { fighter: playerFighter, part: 'head' };
const playerHitGroup = new THREE.Group();
playerHitGroup.add(playerTorso, playerHead);
scene.add(playerHitGroup);

const bots = createBots(G);
G.bots = bots;
const combat = createCombat(G);
G.combat = combat;
const rounds = createRounds(G);
G.rounds = rounds;

G.combatants = [playerFighter, ...bots.spawnAll()];
G.hitMeshes = world.shootables.concat([playerTorso, playerHead]);
for (const bot of bots.bots) G.hitMeshes.push(bot.torso, bot.head);

G.events.onKill = (attacker, victim, headshot) => {
  if (attacker && victim) {
    hud.feed(attacker.name, victim.name, headshot, attacker.team);
    if (attacker.isPlayer) {
      G.state.money += 300;
      hud.setMoney(G.state.money);
    }
  }
  if (victim === G.state.bomb.holder) {
    G.state.bomb.state = 'dropped';
    G.state.bomb.pos.copy(victim.pos);
    G.state.bomb.holder = null;
    const carrier = G.bots.bots.find((b) => b.carrier);
    if (carrier) carrier.carrier = false;
    hud.setBomb('dropped');
  }
  if (victim.team === 'atk') G.state.kills.def += 1;
  else G.state.kills.atk += 1;
};
G.events.onBombPlanted = (planter, site) => {
  const bomb = G.state.bomb;
  bomb.state = 'planted';
  bomb.site = site;
  bomb.pos.copy(planter.pos);
  bomb.plantedAt = G.time;
  bomb.planter = planter;
  if (planter.isPlayer) {
    G.state.money += 300;
    hud.setMoney(G.state.money);
  }
  hud.setBomb('planted', combat.BOMB_TIMER_SECONDS);
  audio.plant();
  G.noises.push({ x: bomb.pos.x, z: bomb.pos.z, time: G.time, radius: 40 });
};
G.events.onBombExploded = () => {
  rounds.endRound('atk', 'bomb');
};
G.events.onBombDefused = () => {
  rounds.endRound('def', 'defuse');
};
G.events.onBombPickup = (bot) => {
  hud.setBomb('carried');
  void bot;
};

let spectating = null;
function spectateNext() {
  const alive = G.bots.bots.filter((b) => b.alive && b.team === 'atk');
  if (!alive.length) { spectating = null; return; }
  const idx = spectating ? (alive.indexOf(spectating) + 1) % alive.length : 0;
  spectating = alive[idx];
  hud.setSpectate(true, spectating.name);
}

let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let fovTarget = 74;

hud.setAmmo(playerFighter.weapon.mag, playerFighter.weapon.reserve, playerFighter.weaponDef.name);
hud.setHealth(100, false);
hud.setMoney(800);
hud.setScore(0, 0);
hud.setRound(1);
hud.setTimer(100, false);
hud.setLoadout(G.state.loadout, 'P9 Sidearm');
hud.setGrenades(0, 0);
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (G.state.phase === 'matchEnd') {
    rounds.startMatch();
    playerFighter.alive = true;
    playerFighter.health = 100;
    spectating = null;
    hud.setSpectate(false);
  } else if (G.state.phase === 'menu') {
    rounds.startMatch();
    started = true;
  }
  // startMatch opens the buy menu: stay unlocked so the player can click the
  // cards, and lock again from Deploy / Close / B / a canvas click instead.
  // The overlay used to hide on lock; with no lock on start, hide it here.
  hud.hideOverlay();
  if (document.getElementById('buy-menu').hidden) input.requestLock();
});
hud.onBuy((id) => rounds.buy(id));
// Clicking the world re-locks the pointer (standard FPS behaviour): this is
// the way back in when the buy timer runs out while the player is unlocked.
renderer.domElement.addEventListener('mousedown', () => {
  if (shot) return;
  if (!input.state.locked && (G.state.phase === 'live' || G.state.phase === 'buy')) input.requestLock();
});
document.getElementById('buy-deploy').addEventListener('click', () => {
  hud.showBuy(false);
  input.requestLock();
});
document.getElementById('buy-close').addEventListener('click', () => {
  hud.showBuy(false);
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (G.state.phase === 'live' || G.state.phase === 'buy') {
    // Unlocking to shop is not a pause: keep the buy menu, show no overlay.
    if (!document.getElementById('buy-menu').hidden) return;
    hud.showOverlay('paused');
    hud.showBuy(false);
  }
}

function syncCamera() {
  if (playerFighter.alive) {
    camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
    camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  } else if (spectating) {
    camera.position.set(spectating.pos.x, spectating.pos.y + 1.5, spectating.pos.z);
    camera.rotation.set(0, spectating.yaw, 0, 'YXZ');
  }
  if (G.shakeAmp > 0.001) {
    camera.position.x += (G.random() * 2 - 1) * G.shakeAmp * 0.15;
    camera.position.y += (G.random() * 2 - 1) * G.shakeAmp * 0.15;
    camera.rotation.z += (G.random() * 2 - 1) * G.shakeAmp * 0.01;
    G.shakeAmp *= 0.86;
  }
  playerHitGroup.position.copy(body.position);
}

function switchWeapon(slot) {
  const fighter = playerFighter;
  if (slot === 1 && fighter.primaryWeapon) {
    fighter.weapon = fighter.primaryWeapon;
    fighter.weaponDef = fighter.primaryWeapon.def;
  } else if (slot === 2) {
    if (!fighter.secondaryWeapon) {
      fighter.secondaryWeapon = fighter.weaponDef.id === 'p9' ? fighter.weapon : createWeaponState(WEAPONS.p9);
    }
    fighter.weapon = fighter.secondaryWeapon;
    fighter.weaponDef = WEAPONS.p9;
  } else {
    return;
  }
  viewModel.setWeapon(fighter.weaponDef);
  hud.setAmmo(fighter.weapon.mag, fighter.weapon.reserve, fighter.weaponDef.name);
}

function firePlayer() {
  const fighter = playerFighter;
  if (!combat.shoot(fighter)) {
    if (fighter.weapon.mag === 0) audio.dryClick();
    return;
  }
  player.recoil(0.009 + fighter.weaponDef.kick, (G.random() * 2 - 1) * 0.004);
  viewModel.pullTrigger(fighter.weapon);
  G.noises.push({ x: body.position.x, z: body.position.z, time: G.time, radius: 26 });
  hud.setAmmo(fighter.weapon.mag, fighter.weapon.reserve, fighter.weaponDef.name);
}

function step(dt) {
  G.time += dt;
  const S = G.state;
  if (S.phase === 'buy' || S.phase === 'live' || S.phase === 'roundEnd') {
    rounds.tick(dt);
  }
  if (S.phase === 'live' || S.phase === 'buy') {
    if (playerFighter.alive) {
      if (S.phase === 'live') player.step(dt, input.state.keys);
      viewModel.step(dt, playerFighter.weapon, playerFighter.weaponDef.reload);
      playerFighter.yaw = body.yaw;
      playerFighter.eye = body.eye;
      playerFighter.speed = player.groundSpeed();
    }
    bots.step(dt);
    combat.update(dt);
    combat.bombPosition();
  }
  for (let i = G.noises.length - 1; i >= 0; i -= 1) {
    if (G.time - G.noises[i].time > 2) G.noises.splice(i, 1);
  }
}

function handlePressed() {
  const pressed = input.takePressed();
  if (!pressed.size) return;
  const S = G.state;
  if (pressed.has('KeyB') && S.phase === 'buy') {
    const menu = document.getElementById('buy-menu');
    const opening = menu.hidden;
    hud.showBuy(opening);
    if (!opening) input.requestLock();
    return;
  }
  if (pressed.has('Digit1')) switchWeapon(1);
  if (pressed.has('Digit2')) switchWeapon(2);
  if (pressed.has('KeyQ')) {
    switchWeapon(playerFighter.weaponDef.id === 'p9' && playerFighter.primaryWeapon ? 1 : 2);
  }
  if (pressed.has('KeyR') && playerFighter.alive) {
    const w = playerFighter.weapon;
    if (w.reloadLeft === 0 && w.mag < w.def.mag && w.reserve > 0) {
      w.reloadLeft = w.def.reload;
      audio.reload();
    }
  }
  if (pressed.has('Digit4') && playerFighter.alive) {
    if (combat.throwGrenade(playerFighter, 'frag')) hud.setGrenades(playerFighter.grenades.frag, playerFighter.grenades.smoke);
  }
  if (pressed.has('Digit5') && playerFighter.alive) {
    if (combat.throwGrenade(playerFighter, 'smoke')) hud.setGrenades(playerFighter.grenades.frag, playerFighter.grenades.smoke);
  }
  if (pressed.has('Mouse0') && !playerFighter.alive && spectating) spectateNext();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    const sens = input.state.scoped && playerFighter.weaponDef.zoom ? 0.0011 : 0.0022;
    player.look(look.x, look.y, sens);
    handlePressed();
    if (input.state.firing && playerFighter.alive && G.state.phase === 'live') {
      const w = playerFighter.weapon;
      if (w.def.auto ? w.cooldown <= 0 && w.mag > 0 : input.state.firing) firePlayer();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    fovTarget = input.state.scoped && playerFighter.weaponDef.zoom ? 38 : 74;
    if (Math.abs(camera.fov - fovTarget) > 0.1) {
      camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 12);
      camera.updateProjectionMatrix();
    }
    hud.setScoped(input.state.scoped && playerFighter.weaponDef.zoom);
    hud.setSpread(6 + spreadOf(playerFighter.weaponDef, player.groundSpeed()) * 900);
    hud.setHealth(playerFighter.health, playerFighter.armor);
    hud.setAmmo(playerFighter.weapon.mag, playerFighter.weapon.reserve, playerFighter.weaponDef.name);
    hud.setAlive(rounds.teamAlive('atk'), rounds.teamAlive('def'));
    hud.setGrenades(playerFighter.grenades.frag, playerFighter.grenades.smoke);
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  if (name === 'start') {
    body.position.set(0.6, 0, 12.5);
    body.yaw = Math.PI;
    body.pitch = 0.02;
    settle(20);
    const guard = G.bots.bots.find((b) => b.team === 'def' && b.alive);
    if (guard) {
      guard.pos.set(-4.5, 0, 2.5);
      guard.yaw = 0.6;
      guard.group.rotation.y = 0.6;
    }
    const mate = G.bots.bots.find((b) => b.team === 'atk' && b.alive);
    if (mate) {
      mate.pos.set(5.5, 0, 8);
      mate.yaw = Math.PI - 0.5;
      mate.group.rotation.y = mate.yaw;
    }
    aimAt(new THREE.Vector3(0, 2, -1));
    hud.showOverlay('start');
  } else if (name === 'buy') {
    rounds.startMatch();
    G.state.money = 3200;
    hud.setMoney(3200);
    body.position.set(-2, 0, 12);
    body.yaw = Math.PI + 0.35;
    body.pitch = 0.05;
    settle(20);
    hud.showBuy(true);
  } else if (name === 'play') {
    rounds.startMatch();
    hud.showBuy(false);
    G.state.phase = 'live';
    G.state.roundTime = 83;
    G.state.score = { atk: 2, def: 1 };
    G.state.money = 3200;
    hud.setScore(2, 1);
    hud.setMoney(3200);
    hud.setRound(4);
    hud.setTimer(83, false);
    body.position.set(-6, 0, 7);
    settle(10);
    const enemy = G.bots.bots.find((b) => b.team === 'def' && b.alive);
    if (enemy) {
      enemy.pos.set(-3.5, 0, -2);
      enemy.yaw = 0.3;
      enemy.group.rotation.y = 0.3;
    }
    const mate = G.bots.bots.find((b) => b.team === 'atk' && b.alive);
    if (mate) {
      mate.pos.set(-9, 0, 4);
      mate.yaw = Math.PI + 0.4;
      mate.group.rotation.y = mate.yaw;
    }
    aimAt(new THREE.Vector3(-3.5, 1.2, -2));
    firePlayer();
    settle(12);
    if (enemy) aimAt(new THREE.Vector3(enemy.pos.x, 1.2, enemy.pos.z));
    firePlayer();
    settle(8);
    hud.feed('YOU', 'Hale', false, 'atk');
    hud.setHealth(82, true);
  } else {
    rounds.startMatch();
    hud.showBuy(false);
    G.state.phase = 'roundEnd';
    G.state.score = { atk: 3, def: 2 };
    hud.setScore(3, 2);
    hud.setRound(5);
    hud.setBomb('none');
    hud.setTimer(0, false);
    body.position.set(-6, 0, 6);
    settle(10);
    const dead = G.bots.bots.find((b) => b.team === 'def' && b.alive);
    if (dead) {
      dead.alive = false;
      dead.health = 0;
      dead.pos.set(1, 0, -3);
      dead.group.rotation.x = -Math.PI / 2 * 0.9;
      dead.group.position.y = 0.15;
    }
    aimAt(new THREE.Vector3(0, 1.5, -9));
    hud.showBanner('ROUND WON — WARDENS ELIMINATED', 'Dustjacks 3 — 2 Wardens', 60);
  }
  hud.setAmmo(playerFighter.weapon.mag, playerFighter.weapon.reserve, playerFighter.weaponDef.name);
  hud.setAlive(rounds.teamAlive('atk'), rounds.teamAlive('def'));
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

viewModel.setWeapon(WEAPONS.p9);
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
