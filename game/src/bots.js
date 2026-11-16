// Bots: nine fighters, four Dustjacks with the player against five Wardens. Each bot
// walks the waypoint graph, holds or pushes by role, sees and hears, and shoots back
// in bursts with aim error that grows with distance and target speed. No per-frame
// allocation: every vector a bot needs lives on the bot.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMover } from './player.js';
import { WEAPONS, createWeaponState, refillWeapon } from './weapons.js';

const ATK_NAMES = ['Dusty', 'Rook', 'Mira', 'Sable', 'Wick'];
const DEF_NAMES = ['Hale', 'Brink', 'Sol', 'Vera', 'Ash'];
const ATK_LOADOUT = ['kestrel', 'vk47', 'breacher', 'vk47', 'longbow'];
const DEF_LOADOUT = ['vk47', 'breacher', 'vk47', 'kestrel', 'longbow'];
const EYE = 1.5;
const CHEST = 1.15;

function bfs(nodes, from, to) {
  if (from === to) return [to];
  const prev = new Array(nodes.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const cur = queue.shift();
    for (const next of nodes[cur].edges) {
      if (prev[next] !== -1) continue;
      prev[next] = cur;
      if (next === to) {
        const path = [to];
        let node = to;
        while (node !== from) { node = prev[node]; path.unshift(node); }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

export function createBots(G) {
  const mover = createMover(G.world.colliders);
  const atkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.7, metalness: 0.1 });
  const defMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.7, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sand), roughness: 0.8 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.62, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
  const legGeo = new THREE.BoxGeometry(0.18, 0.7, 0.2);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);
  const padGeo = new THREE.BoxGeometry(0.56, 0.1, 0.34);

  const bots = [];
  const eye = new THREE.Vector3();
  const chest = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const moveDir = new THREE.Vector3();

  function buildBody(team, name) {
    const group = new THREE.Group();
    const teamMat = team === 'atk' ? atkMat : defMat;
    const torso = new THREE.Mesh(torsoGeo, teamMat);
    torso.position.y = 1.05;
    const pad = new THREE.Mesh(padGeo, teamMat);
    pad.position.y = 1.38;
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.56;
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.13, 0.35, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.13, 0.35, 0);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.2, 1.15, -0.25);
    group.add(torso, pad, head, legL, legR, gun);
    group.traverse((mesh) => { if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
    torso.userData.part = 'torso';
    head.userData.part = 'head';
    G.scene.add(group);
    return { group, torso, head, legL, legR, gun };
  }

  function makeBot(team, name, index, spawn) {
    const body = buildBody(team, name);
    body.group.position.copy(spawn);
    const bot = {
      id: `bot-${team}-${index}`,
      team,
      name,
      isPlayer: false,
      group: body.group,
      torso: body.torso,
      head: body.head,
      legL: body.legL,
      legR: body.legR,
      pos: body.group.position,
      yaw: team === 'atk' ? Math.PI : 0,
      eye: EYE,
      health: 100,
      armor: false,
      alive: true,
      weapon: null,
      weaponDef: null,
      grenades: { frag: 1, smoke: 0 },
      speed: 0,
      aimDir: new THREE.Vector3(0, 0, team === 'atk' ? -1 : 1),
      state: 'move',
      route: [],
      routeIdx: 0,
      target: null,
      lastSeen: null,
      heard: null,
      skill: 0.45 + G.random() * 0.35,
      scanAt: G.random() * 0.15,
      reactAt: 0,
      burstLeft: 0,
      burstPause: 0,
      strafeDir: 1,
      strafeAt: 0,
      walkPhase: G.random() * 6,
      holdNode: -1,
      role: 'rifle',
      carrier: false,
      plantAt: 0,
      defuseAt: 0,
    };
    body.torso.userData.fighter = bot;
    body.head.userData.fighter = bot;
    return bot;
  }

  function spawnAll() {
    for (const bot of bots) G.scene.remove(bot.group);
    bots.length = 0;
    for (let i = 0; i < 4; i += 1) {
      bots.push(makeBot('atk', ATK_NAMES[i], i, G.world.spawns.atk[i + 1]));
    }
    for (let i = 0; i < 5; i += 1) {
      bots.push(makeBot('def', DEF_NAMES[i], i, G.world.spawns.def[i]));
    }
    return bots;
  }

  function equipForRound(round) {
    for (const bot of bots) {
      const table = bot.team === 'atk' ? ATK_LOADOUT : DEF_LOADOUT;
      const def = WEAPONS[table[(bot.id.charCodeAt(bot.id.length - 1) + round) % table.length]];
      bot.weaponDef = def;
      bot.weapon = createWeaponState(def);
      refillWeapon(bot.weapon);
      bot.armor = round >= 2;
      bot.grenades = { frag: 1, smoke: round >= 2 ? 1 : 0 };
    }
  }

  function resetRound() {
    for (const bot of bots) {
      const spawns = bot.team === 'atk' ? G.world.spawns.atk : G.world.spawns.def;
      const idx = bot.team === 'atk'
        ? (ATK_NAMES.indexOf(bot.name) + 1) % spawns.length
        : DEF_NAMES.indexOf(bot.name) % spawns.length;
      bot.pos.copy(spawns[idx]);
      bot.yaw = bot.team === 'atk' ? Math.PI : 0;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.position.y = 0;
      bot.health = 100;
      bot.alive = true;
      bot.target = null;
      bot.lastSeen = null;
      bot.heard = null;
      bot.state = 'move';
      bot.route = [];
      bot.routeIdx = 0;
      bot.burstLeft = 0;
      bot.burstPause = 0;
      bot.carrier = false;
      bot.plantAt = 0;
      bot.defuseAt = 0;
      if (bot.weapon) refillWeapon(bot.weapon);
    }
  }

  function visibleEnemy(bot) {
    let best = null;
    let bestD = 42;
    eye.copy(bot.pos);
    eye.y += EYE;
    for (const other of G.combatants) {
      if (!other.alive || other.team === bot.team) continue;
      const d = bot.pos.distanceTo(other.pos);
      if (d > bestD) continue;
      chest.copy(other.pos);
      chest.y += CHEST;
      if (!G.world.hasLineOfSight(eye, chest, G.combat.smokePuffs)) continue;
      toTarget.subVectors(chest, eye).normalize();
      const facing = Math.cos(bot.yaw) * -toTarget.z + Math.sin(bot.yaw) * -toTarget.x;
      if (facing < 0.2 && d > 6) continue;
      best = other;
      bestD = d;
    }
    return best;
  }

  function aimAt(bot, target, dt) {
    chest.copy(target.pos);
    chest.y += target.isPlayer ? target.eye * 0.75 : CHEST;
    eye.copy(bot.pos);
    eye.y += EYE;
    toTarget.subVectors(chest, eye);
    const dist = toTarget.length();
    toTarget.divideScalar(dist || 1);
    const error = (1 - bot.skill) * 0.05 + dist * 0.0012 + (target.speed || 0) * 0.004;
    bot.aimDir.set(
      toTarget.x + (G.random() * 2 - 1) * error,
      toTarget.y + (G.random() * 2 - 1) * error * 0.7,
      toTarget.z + (G.random() * 2 - 1) * error,
    ).normalize();
    const wantYaw = Math.atan2(-bot.aimDir.x, -bot.aimDir.z);
    let dy = wantYaw - bot.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    bot.yaw += dy * Math.min(1, dt * 10);
  }

  function moveToward(bot, x, z, dt, speed) {
    moveDir.set(x - bot.pos.x, 0, z - bot.pos.z);
    const dist = moveDir.length();
    if (dist < 0.3) return true;
    moveDir.divideScalar(dist);
    const wantYaw = Math.atan2(-moveDir.x, -moveDir.z);
    let dy = wantYaw - bot.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    bot.yaw += dy * Math.min(1, dt * 8);
    const stepLen = Math.min(speed * dt, dist);
    const nx = bot.pos.x + moveDir.x * stepLen;
    const nz = bot.pos.z + moveDir.z * stepLen;
    if (!mover.overlaps(nx, bot.pos.y, bot.pos.z, 1.72, 0.04)) bot.pos.x = nx;
    if (!mover.overlaps(bot.pos.x, bot.pos.y, nz, 1.72, 0.04)) bot.pos.z = nz;
    bot.speed = speed;
    bot.walkPhase += dt * speed * 2.4;
    return false;
  }

  function followRoute(bot, dt, speed) {
    if (bot.routeIdx >= bot.route.length) return true;
    const node = G.world.nodes[bot.route[bot.routeIdx]];
    if (moveToward(bot, node.x, node.z, dt, speed)) bot.routeIdx += 1;
    return bot.routeIdx >= bot.route.length;
  }

  function planRoute(bot, tx, tz) {
    const from = G.world.nearestNode(bot.pos.x, bot.pos.z);
    const to = G.world.nearestNode(tx, tz);
    bot.route = bfs(G.world.nodes, from, to);
    bot.routeIdx = 0;
  }

  function stepBot(bot, dt) {
    if (!bot.alive) return;
    bot.speed = 0;
    bot.weapon.cooldown = Math.max(0, bot.weapon.cooldown - dt);
    bot.scanAt -= dt;
    if (bot.scanAt <= 0) {
      bot.scanAt = 0.15;
      const seen = visibleEnemy(bot);
      if (seen) {
        if (bot.target !== seen) bot.reactAt = G.time + 0.25 + (1 - bot.skill) * 0.4;
        bot.target = seen;
        bot.lastSeen = { x: seen.pos.x, z: seen.pos.z, time: G.time };
      } else if (bot.target && G.time - (bot.lastSeen ? bot.lastSeen.time : 0) > 2.5) {
        bot.target = null;
      }
      // Hearing: a recent loud noise nearby pulls the bot to look.
      for (const noise of G.noises) {
        if (G.time - noise.time > 1.2) continue;
        if (bot.pos.distanceTo(noise) < noise.radius) {
          bot.heard = { x: noise.x, z: noise.z, time: G.time };
          break;
        }
      }
    }

    const bomb = G.state.bomb;
    if (bot.target) {
      aimAt(bot, bot.target, dt);
      bot.state = 'combat';
      if (G.time >= bot.reactAt) {
        bot.burstPause -= dt;
        if (bot.burstLeft <= 0 && bot.burstPause <= 0) {
          bot.burstLeft = 3 + Math.floor(G.random() * 3);
          bot.burstPause = 0.45 + G.random() * 0.4;
        }
        if (bot.burstLeft > 0 && bot.weapon.mag > 0 && bot.weapon.cooldown <= 0) {
          bot.burstLeft -= 1;
          G.combat.shoot(bot);
        } else if (bot.weapon.mag === 0) {
          bot.weapon.reloadLeft = bot.weaponDef.reload;
        }
        bot.strafeAt -= dt;
        if (bot.strafeAt <= 0) {
          bot.strafeAt = 0.7 + G.random() * 0.8;
          bot.strafeDir = G.random() < 0.5 ? -1 : 1;
        }
        const strafeX = Math.cos(bot.yaw) * bot.strafeDir;
        const strafeZ = -Math.sin(bot.yaw) * bot.strafeDir;
        const nx = bot.pos.x + strafeX * 1.1 * dt;
        const nz = bot.pos.z + strafeZ * 1.1 * dt;
        if (!mover.overlaps(nx, bot.pos.y, bot.pos.z, 1.72, 0.04)) bot.pos.x = nx;
        if (!mover.overlaps(bot.pos.x, bot.pos.y, nz, 1.72, 0.04)) bot.pos.z = nz;
      }
    } else if (bomb.state === 'planted' && bot.team === 'def') {
      // Defenders rush the planted site and defuse.
      if (bot.defuseAt > 0) {
        bot.defuseAt += dt;
        if (bot.defuseAt >= G.combat.BOMB_DEFUSE_SECONDS) {
          bot.defuseAt = 0;
          G.events.onBombDefused(bot);
        }
      } else if (bot.pos.distanceTo(bomb.pos) < 1.6) {
        bot.defuseAt = 0.001;
        bot.state = 'defuse';
      } else {
        if (bot.route.length === 0 || bot.routeIdx >= bot.route.length) planRoute(bot, bomb.pos.x, bomb.pos.z);
        followRoute(bot, dt, 4.4);
        bot.state = 'move';
      }
    } else if (bot.team === 'atk') {
      if (bot.carrier && bomb.state === 'carried') {
        const site = G.state.attackSite;
        const d = Math.hypot(bot.pos.x - site.center.x, bot.pos.z - site.center.z);
        if (d < site.radius * 0.7) {
          bot.state = 'plant';
          bot.plantAt += dt;
          if (bot.plantAt >= G.combat.BOMB_PLANT_SECONDS) {
            bot.plantAt = 0;
            G.events.onBombPlanted(bot, site);
          }
        } else {
          if (bot.route.length === 0 || bot.routeIdx >= bot.route.length) planRoute(bot, site.center.x, site.center.z);
          followRoute(bot, dt, 4.0);
          bot.state = 'move';
        }
      } else if (bomb.state === 'dropped') {
        if (bot.pos.distanceTo(bomb.pos) < 1.2) {
          bomb.state = 'carried';
          bomb.holder = bot;
          bot.carrier = true;
          G.events.onBombPickup(bot);
        } else {
          if (bot.route.length === 0 || bot.routeIdx >= bot.route.length) planRoute(bot, bomb.pos.x, bomb.pos.z);
          followRoute(bot, dt, 4.2);
        }
      } else if (bot.heard && G.time - bot.heard.time < 3) {
        if (bot.route.length === 0 || bot.routeIdx >= bot.route.length) planRoute(bot, bot.heard.x, bot.heard.z);
        if (followRoute(bot, dt, 3.6)) bot.heard = null;
      } else {
        if (bot.route.length === 0) {
          const site = G.state.attackSite;
          const tx = site.center.x + (G.random() * 8 - 4);
          const tz = site.center.z + (G.random() * 6 - 3);
          planRoute(bot, tx, tz);
        }
        followRoute(bot, dt, 3.6);
      }
    } else {
      // Defenders hold: sit at a hold node near a site, peek a neighbour now and then.
      if (bot.holdNode < 0) {
        const site = G.random() < 0.5 ? G.world.sites[0] : G.world.sites[1];
        bot.holdNode = G.world.nearestNode(site.center.x + (G.random() * 6 - 3), site.center.z + (G.random() * 6 - 3));
        planRoute(bot, G.world.nodes[bot.holdNode].x, G.world.nodes[bot.holdNode].z);
      }
      if (bot.routeIdx < bot.route.length) {
        followRoute(bot, dt, 3.4);
      } else if (bot.heard && G.time - bot.heard.time < 3) {
        planRoute(bot, bot.heard.x, bot.heard.z);
        bot.heard = null;
      } else if (G.random() < dt * 0.08) {
        const node = G.world.nodes[bot.holdNode];
        const near = node.edges[Math.floor(G.random() * node.edges.length)];
        if (near !== undefined) planRoute(bot, G.world.nodes[near].x, G.world.nodes[near].z);
      }
      bot.state = 'hold';
    }

    // Walk cycle and facing.
    bot.group.rotation.y = bot.yaw;
    const swing = bot.speed > 0.1 ? Math.sin(bot.walkPhase) * 0.5 : 0;
    bot.legL.rotation.x = swing;
    bot.legR.rotation.x = -swing;
    bot.group.position.y = bot.speed > 0.1 ? Math.abs(Math.sin(bot.walkPhase)) * 0.03 : 0;
    if (bot.weapon.reloadLeft > 0) {
      bot.weapon.reloadLeft = Math.max(0, bot.weapon.reloadLeft - dt);
      if (bot.weapon.reloadLeft === 0) {
        const need = bot.weaponDef.mag - bot.weapon.mag;
        const take = Math.min(need, bot.weapon.reserve);
        bot.weapon.mag += take;
        bot.weapon.reserve -= take;
      }
    }
  }

  return {
    bots,
    spawnAll,
    equipForRound,
    resetRound,
    step(dt) {
      for (const bot of bots) stepBot(bot, dt);
    },
  };
}
