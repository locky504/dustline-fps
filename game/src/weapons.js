// The armoury: five original weapons, two grenades and a vest. Numbers are the whole
// balance: damage, head multiplier, magazine, fire gap, reload, spread while still
// and while moving, range, kick and price. main.js and combat.js read these; nothing
// else in the game hard-codes a weapon number.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: { id: 'p9', name: 'P9 Sidearm', price: 0, damage: 34, headMul: 4, mag: 12, reserve: 48, fireGap: 0.16, auto: false, reload: 1.4, spreadStill: 0.004, spreadMove: 0.03, range: 60, kick: 0.006, tracer: '#ffd27a' },
  kestrel: { id: 'kestrel', name: 'Kestrel SMG', price: 1500, damage: 26, headMul: 4, mag: 25, reserve: 100, fireGap: 0.075, auto: true, reload: 1.8, spreadStill: 0.008, spreadMove: 0.045, range: 45, kick: 0.005, tracer: '#ffd27a' },
  vk47: { id: 'vk47', name: 'VK-47 Rifle', price: 2700, damage: 36, headMul: 4, mag: 30, reserve: 90, fireGap: 0.1, auto: true, reload: 2.0, spreadStill: 0.0025, spreadMove: 0.03, range: 80, kick: 0.011, tracer: '#ffd27a' },
  breacher: { id: 'breacher', name: 'Breacher-12', price: 1200, damage: 11, pellets: 8, headMul: 2, mag: 6, reserve: 24, fireGap: 0.85, auto: false, reload: 2.6, spreadStill: 0.03, spreadMove: 0.06, range: 28, kick: 0.03, tracer: '#ffb36b' },
  longbow: { id: 'longbow', name: 'Longbow DMR', price: 4750, damage: 88, headMul: 4, mag: 5, reserve: 15, fireGap: 1.1, auto: false, reload: 2.8, spreadStill: 0.001, spreadMove: 0.05, range: 120, kick: 0.035, zoom: true, tracer: '#ffe9b0' },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300 },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300 },
};

export const ARMOR = { id: 'armor', name: 'Kevlar Vest', price: 650 };

export const BUY_ORDER = ['p9', 'kestrel', 'breacher', 'vk47', 'longbow'];

// A weapon's live state: magazine, reserve, cooldown, reload timer, view-model kick.
export function createWeaponState(def) {
  return { def, mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };
}

export function refillWeapon(state) {
  state.mag = state.def.mag;
  state.reserve = state.def.reserve;
  state.cooldown = 0;
  state.reloadLeft = 0;
  state.flash = 0;
  state.kick = 0;
}

export function spreadOf(def, speed) {
  const moving = Math.min(1, speed / 5.2);
  return def.spreadStill + moving * def.spreadMove;
}

// The first-person view model: one rifle-shaped group per weapon, rebuilt when the
// weapon changes. Shared geometries keep the heap flat; only the group is swapped.
const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.3 });

function box(w, h, d, x, y, z, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

function buildModel(def) {
  const model = new THREE.Group();
  if (def.id === 'p9') {
    model.add(box(0.05, 0.07, 0.24, 0, 0, -0.1, bodyMat));
    model.add(box(0.045, 0.1, 0.06, 0, -0.06, 0.04, gripMat));
  } else if (def.id === 'kestrel') {
    model.add(box(0.07, 0.08, 0.34, 0, 0, -0.08, bodyMat));
    model.add(box(0.04, 0.04, 0.3, 0, 0.02, -0.3, gripMat));
    model.add(box(0.05, 0.12, 0.05, 0, -0.08, 0.02, gripMat));
  } else if (def.id === 'breacher') {
    model.add(box(0.09, 0.09, 0.44, 0, 0, -0.1, gripMat));
    model.add(box(0.05, 0.05, 0.42, 0, 0.03, -0.3, bodyMat));
    model.add(box(0.06, 0.1, 0.12, 0, -0.07, 0.06, bodyMat));
  } else if (def.id === 'longbow') {
    model.add(box(0.07, 0.08, 0.52, 0, 0, -0.14, bodyMat));
    model.add(box(0.05, 0.05, 0.05, 0, 0.07, -0.1, accentMat));
    model.add(box(0.04, 0.04, 0.34, 0, 0.025, -0.42, gripMat));
    model.add(box(0.05, 0.09, 0.2, 0, -0.05, 0.14, gripMat));
  } else {
    model.add(box(0.09, 0.1, 0.42, 0, 0, -0.08, bodyMat));
    model.add(box(0.045, 0.045, 0.4, 0, 0.025, -0.38, gripMat));
    model.add(box(0.075, 0.08, 0.22, 0, -0.02, 0.24, gripMat));
    model.add(box(0.03, 0.04, 0.1, 0, 0.06, -0.12, accentMat));
  }
  model.position.set(0.24, -0.2, -0.42);
  return model;
}

export function createViewModel(camera) {
  let model = null;
  let current = '';
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  return {
    setWeapon(def) {
      if (def.id === current) return;
      if (model) camera.remove(model);
      model = buildModel(def);
      camera.add(model);
      current = def.id;
    },
    step(dt, state, reloadTime) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.kick += (0 - state.kick) * Math.min(1, dt * 14);
      if (!model) return;
      model.position.z = -0.42 + state.kick;
      model.rotation.x = state.kick * 2.2;
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 30;
      flashLight.intensity = state.flash > 0 ? 18 : 0;
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        model.rotation.x = -0.55 * Math.min(1, (reloadTime - state.reloadLeft) * 2);
        if (state.reloadLeft === 0) {
          const need = state.def.mag - state.mag;
          const take = Math.min(need, state.reserve);
          state.mag += take;
          state.reserve -= take;
        }
      }
    },
    pullTrigger(state) {
      state.cooldown = state.def.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
  };
}
