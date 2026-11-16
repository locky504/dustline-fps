// Combat: hitscan shooting, damage, tracers, grenades and the bomb. It owns no round
// rules: kills, plants and explosions are reported to G.events, and rounds.js decides
// what a round is worth. All hot-loop math reuses module-level temporaries.
import * as THREE from 'three';
import { spreadOf } from './weapons.js';

const BOMB_PLANT_SECONDS = 3.5;
const BOMB_DEFUSE_SECONDS = 5;
const BOMB_TIMER_SECONDS = 35;
const FRAG_RADIUS = 9;
const FRAG_FUSE = 1.4;

const tmpDir = new THREE.Vector3();
const tmpOrigin = new THREE.Vector3();
const tmpEnd = new THREE.Vector3();
const tmpEye = new THREE.Vector3();
const tmpChest = new THREE.Vector3();
const tmpVel = new THREE.Vector3();
const pelletDir = new THREE.Vector3();
const pelletEnd = new THREE.Vector3();

export function createCombat(G) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 140;

  // Tracer pool: stretched boxes, no allocation while firing.
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracerGeo = new THREE.BoxGeometry(0.025, 0.025, 1);
  const tracers = [];
  for (let i = 0; i < 10; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat.clone());
    mesh.visible = false;
    G.scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerNext = 0;

  // Impact dust pool.
  const puffGeo = new THREE.SphereGeometry(0.12, 8, 6);
  const puffs = [];
  for (let i = 0; i < 8; i += 1) {
    const mesh = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xc8a06a, transparent: true, opacity: 0, depthWrite: false }));
    mesh.visible = false;
    G.scene.add(mesh);
    puffs.push({ mesh, life: 0 });
  }
  let puffNext = 0;

  const grenades = [];
  const smokePuffs = [];
  const smokeGeo = new THREE.SphereGeometry(1, 12, 10);
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xb8b0a2, transparent: true, opacity: 0.5, depthWrite: false });

  // The bomb: a small box with a blinking light, carried, dropped or planted.
  const bombGroup = new THREE.Group();
  const bombBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.16, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2e2416, roughness: 0.6, metalness: 0.4 }),
  );
  const bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xd4543c }),
  );
  bombLight.position.set(0.12, 0.1, 0);
  bombGroup.add(bombBody, bombLight);
  bombGroup.visible = false;
  G.scene.add(bombGroup);

  function spawnTracer(from, to) {
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % tracers.length;
    tmpDir.subVectors(to, from);
    const len = tmpDir.length();
    t.mesh.position.copy(from).addScaledVector(tmpDir, 0.5);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, len);
    t.mesh.visible = true;
    t.mesh.material.opacity = 0.85;
    t.life = 0.07;
  }

  function spawnPuff(at) {
    const p = puffs[puffNext];
    puffNext = (puffNext + 1) % puffs.length;
    p.mesh.position.copy(at);
    p.mesh.visible = true;
    p.mesh.material.opacity = 0.7;
    p.life = 0.35;
  }

  function eyeOf(fighter) {
    tmpEye.copy(fighter.pos);
    tmpEye.y += fighter.eye;
    return tmpEye;
  }

  function chestOf(fighter) {
    tmpChest.copy(fighter.pos);
    tmpChest.y += 1.15;
    return tmpChest;
  }

  function shoot(shooter) {
    const w = shooter.weapon;
    if (!w || w.mag <= 0 || w.cooldown > 0 || w.reloadLeft > 0) return false;
    // Shot captures run before the first render, so matrices may be stale:
    // refresh them once per shot so the ray tests where the meshes really are.
    G.scene.updateMatrixWorld(true);
    w.mag -= 1;
    w.cooldown = w.def.fireGap;
    w.flash = 0.06;
    w.kick = 0.055;
    const pellets = w.def.pellets || 1;
    const origin = eyeOf(shooter);
    const base = tmpDir;
    if (shooter.isPlayer) {
      G.camera.getWorldDirection(base);
    } else {
      base.copy(shooter.aimDir);
    }
    let hitSomething = false;
    for (let p = 0; p < pellets; p += 1) {
      const spread = spreadOf(w.def, shooter.speed || 0);
      pelletDir.set(
        base.x + (G.random() * 2 - 1) * spread,
        base.y + (G.random() * 2 - 1) * spread,
        base.z + (G.random() * 2 - 1) * spread,
      ).normalize();
      raycaster.set(origin, pelletDir);
      const hits = raycaster.intersectObjects(G.hitMeshes, false);
      // The ray starts inside the shooter's own head sphere: skip the shooter
      // and take the first other surface, so a teammate still blocks a shot.
      let hit = null;
      for (const h of hits) {
        if (h.object.userData.fighter === shooter) continue;
        hit = h;
        break;
      }
      const end = hit ? hit.point : pelletEnd.copy(origin).addScaledVector(pelletDir, w.def.range);
      spawnTracer(origin, end);
      if (!hit) continue;
      hitSomething = true;
      const fighter = hit.object.userData.fighter;
      if (fighter && fighter.alive && fighter.team !== shooter.team) {
        const part = hit.object.userData.part || 'torso';
        const mult = part === 'head' ? w.def.headMul : 1;
        damage(fighter, w.def.damage * mult, part, shooter);
      } else if (!fighter) {
        spawnPuff(hit.point);
      }
    }
    if (shooter.isPlayer) G.audio.shot(w.def.id);
    return hitSomething;
  }

  function damage(target, amount, part, attacker) {
    if (!target.alive) return false;
    let final = amount;
    if (target.armor) final *= 0.5;
    target.health -= final;
    if (target.isPlayer) {
      G.hud.damageFlash();
      G.audio.hurt();
    } else if (attacker && attacker.isPlayer) {
      G.hud.hitMarker(false, G.shot ? 4000 : 90);
      G.audio.hit();
    }
    if (target.health > 0) return false;
    target.health = 0;
    target.alive = false;
    target.deathAt = G.time;
    if (target.group) {
      target.group.rotation.x = -Math.PI / 2 * 0.9;
      target.group.position.y = 0.15;
    }
    if (attacker && attacker.isPlayer) {
      G.hud.hitMarker(true, G.shot ? 4000 : 90);
      G.audio.kill();
    }
    if (target.isPlayer) G.onPlayerDeath();
    G.events.onKill(attacker, target, part === 'head');
    return true;
  }

  function throwGrenade(fighter, kind) {
    if (fighter.grenades[kind] <= 0) return false;
    fighter.grenades[kind] -= 1;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: kind === 'frag' ? 0x3a2f22 : 0x9aa0a8, roughness: 0.6, metalness: 0.3 }),
    );
    mesh.castShadow = true;
    const origin = eyeOf(fighter);
    mesh.position.copy(origin);
    G.scene.add(mesh);
    tmpVel.copy(fighter.aimDir);
    if (fighter.isPlayer) G.camera.getWorldDirection(tmpVel);
    tmpVel.multiplyScalar(13);
    tmpVel.y += 3.5;
    grenades.push({ mesh, kind, vel: tmpVel.clone(), fuse: FRAG_FUSE, owner: fighter });
    if (fighter.isPlayer) G.audio.beep();
    return true;
  }

  function explodeFrag(at, owner) {
    G.audio.explosion();
    G.shake(0.5);
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    flash.position.copy(at);
    G.scene.add(flash);
    let life = 0.4;
    const grow = () => {
      life -= 1 / 60;
      flash.scale.setScalar(1 + (0.4 - life) * 18);
      flash.material.opacity = Math.max(0, life / 0.4);
      if (life > 0) requestAnimationFrame(grow);
      else { G.scene.remove(flash); flash.material.dispose(); }
    };
    grow();
    for (const fighter of G.combatants) {
      if (!fighter.alive) continue;
      const d = fighter.pos.distanceTo(at);
      if (d > FRAG_RADIUS) continue;
      const amount = 120 * (1 - d / FRAG_RADIUS) + 20;
      damage(fighter, amount, 'torso', owner);
    }
  }

  function burstSmoke(at) {
    for (let i = 0; i < 12; i += 1) {
      const mesh = new THREE.Mesh(smokeGeo, smokeMat.clone());
      const angle = G.random() * Math.PI * 2;
      const r = G.random() * 2.4;
      mesh.position.set(at.x + Math.cos(angle) * r, 0.9 + G.random() * 1.2, at.z + Math.sin(angle) * r);
      mesh.scale.setScalar(0.2);
      G.scene.add(mesh);
      smokePuffs.push({ mesh, center: mesh.position.clone(), radius: 1.9, age: 0, life: 14 });
    }
  }

  function pointInColliders(p) {
    for (const c of G.world.colliders) {
      if (p.x >= c.min.x && p.x <= c.max.x && p.y >= c.min.y && p.y <= c.max.y && p.z >= c.min.z && p.z <= c.max.z) return true;
    }
    return false;
  }

  function update(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.mesh.material.opacity = Math.max(0, p.life / 0.35) * 0.7;
      p.mesh.scale.setScalar(1 + (0.35 - p.life) * 3);
      if (p.life <= 0) p.mesh.visible = false;
    }
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 12 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const p = g.mesh.position;
      if (p.y < 0.12) { p.y = 0.12; g.vel.y *= -0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
      if (pointInColliders(p) || g.fuse <= 0) {
        if (g.kind === 'frag') explodeFrag(p.clone(), g.owner);
        else burstSmoke(p.clone());
        G.scene.remove(g.mesh);
        grenades.splice(i, 1);
      }
    }
    for (let i = smokePuffs.length - 1; i >= 0; i -= 1) {
      const s = smokePuffs[i];
      s.age += dt;
      const grow = Math.min(1, s.age / 2);
      s.mesh.scale.setScalar(0.2 + grow * 1.7);
      s.radius = 0.4 + grow * 1.7;
      if (s.age > s.life - 3) s.mesh.material.opacity = Math.max(0, (s.life - s.age) / 3) * 0.5;
      if (s.age >= s.life) {
        G.scene.remove(s.mesh);
        s.mesh.material.dispose();
        smokePuffs.splice(i, 1);
      }
    }
    // Bomb blink and timer.
    const bomb = G.state.bomb;
    if (bomb.state === 'planted') {
      const left = BOMB_TIMER_SECONDS - (G.time - bomb.plantedAt);
      const blink = Math.sin(G.time * (left < 10 ? 18 : 7)) > 0;
      bombLight.material.color.setHex(blink ? 0xff3020 : 0x551510);
      if (left <= 0) {
        bomb.state = 'exploded';
        explodeFrag(bomb.pos.clone(), bomb.planter);
        G.events.onBombExploded();
      }
    }
    if (bomb.state === 'carried' || bomb.state === 'dropped') {
      bombLight.material.color.setHex(Math.sin(G.time * 3) > 0 ? 0xe8a33d : 0x554411);
    }
  }

  function bombPosition() {
    const bomb = G.state.bomb;
    if (bomb.state === 'carried' && bomb.holder) {
      bombGroup.position.copy(bomb.holder.pos);
      bombGroup.position.y = 1.0;
      bombGroup.visible = true;
    } else if (bomb.state === 'dropped' || bomb.state === 'planted' || bomb.state === 'planting' || bomb.state === 'defusing') {
      bombGroup.position.copy(bomb.pos);
      bombGroup.position.y = bomb.state === 'planted' ? 0.1 : 0.3;
      bombGroup.visible = true;
    } else {
      bombGroup.visible = false;
    }
  }

  return {
    shoot,
    damage,
    throwGrenade,
    update,
    bombPosition,
    smokePuffs,
    BOMB_PLANT_SECONDS,
    BOMB_DEFUSE_SECONDS,
    BOMB_TIMER_SECONDS,
  };
}
