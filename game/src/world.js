// DUSTLINE: a dusk desert freight yard, 40 by 32 metres. Two bomb sites, A west and
// B east, three lanes (A, mid, B), a central silo, containers, a truck, crates and
// sandbags for cover. Boxes are both the look and the collision; the waypoint graph
// the bots walk is built from the same floor plan.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WAYPOINTS = [
  [-8, 13], [0, 13], [8, 13],
  [-14, 7], [-5, 7], [5, 7], [14, 7],
  [-18, 1], [-9, 2], [6, 3], [16, 1],
  [-14, -4], [-5, -4], [5, -4], [14, -4],
  [-17, -9], [-13, -9], [-8, -11], [17, -9], [13, -9], [8, -11],
  [-8, -13], [0, -13], [8, -13],
  [-18, 9], [18, 9],
];

function siteTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#241a10';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = color;
  g.lineWidth = 10;
  g.strokeRect(14, 14, 228, 228);
  g.fillStyle = color;
  g.font = 'bold 150px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 128, 138);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.95,
      metalness: 0.03,
    });
  }
  const sandMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sand), roughness: 1, metalness: 0 });
  const rustMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.85, metalness: 0.15 });
  const tealMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.7, metalness: 0.1 });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function flat(w, d, x, z, mat, y = 0.02) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Ground: sand with darker worn patches.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 32), sandMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  flat(10, 6, -8, 4, materials.surface, 0.015);
  flat(9, 5, 9, -3, materials.surface, 0.015);
  flat(7, 4, 0, -11, materials.hairline, 0.015);

  // Perimeter walls, 5 m high.
  box(40.6, 0.4, 32.6, 0, -0.2, 0, materials.canvas);
  box(0.5, 5, 32.6, -20.2, 2.5, 0, materials.surface);
  box(0.5, 5, 32.6, 20.2, 2.5, 0, materials.surface);
  box(40.6, 5, 0.5, 0, 2.5, -16.2, materials.surface);
  box(40.6, 5, 0.5, 0, 2.5, 16.2, materials.surface);

  // Central silo: a rust cylinder on a square base, splitting mid lane.
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 4.6, 20), rustMat);
  silo.position.set(0, 2.3, -1);
  silo.castShadow = true;
  silo.receiveShadow = true;
  group.add(silo);
  colliders.push(new THREE.Box3(new THREE.Vector3(-2.1, 0, -3.1), new THREE.Vector3(2.1, 4.6, 1.1)));
  shootables.push(silo);

  // Site A (west): two stacked containers forming an L, amber ring and sign.
  box(6, 2.6, 2.6, -15.5, 1.3, -12.5, rustMat);
  box(2.6, 2.6, 6, -11.5, 1.3, -13.5, tealMat);
  box(6, 2.6, 2.6, -15.5, 3.9, -12.5, materials.hairline);
  // Site B (east): one container, crates, teal ring and sign.
  box(6, 2.6, 2.6, 15.5, 1.3, -12.5, tealMat);
  box(2.6, 2.6, 2.6, 12.2, 1.3, -14, rustMat);
  box(1.4, 1.4, 1.4, 10.6, 0.7, -11.5, materials.hairline);

  // Truck at mid-east: cab, bed, wheels.
  box(2.2, 1.8, 2.4, 9.5, 0.9, 6.5, rustMat);
  box(2.2, 1.4, 4.6, 9.5, 0.7, 10.2, materials.surface);
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12);
  for (const [wx, wz] of [[8.3, 5.2], [10.7, 5.2], [8.3, 11.4], [10.7, 11.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, materials.canvas);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.45, wz);
    wheel.castShadow = true;
    group.add(wheel);
  }

  // Crates and sandbags: cover the lanes.
  box(1.6, 1.1, 1.6, -6, 0.55, 3.5, materials.hairline);
  box(1.2, 0.9, 1.2, -4.6, 0.45, 4.6, materials.surface);
  box(1.6, 1.1, 1.6, 6, 0.55, -4.5, materials.hairline);
  box(1.2, 0.9, 1.2, 4.8, 0.45, -5.8, materials.surface);
  box(2.2, 1.0, 1.0, -11, 0.5, -0.5, materials.hairline);
  box(2.2, 1.0, 1.0, 12.5, 0.5, 0.5, materials.hairline);
  box(1.0, 1.0, 2.4, -15, 0.5, 6.5, materials.surface);
  box(1.0, 1.0, 2.4, 16, 0.5, 6.5, materials.surface);
  box(3.4, 1.1, 0.8, -2, 0.55, 9.5, materials.hairline);
  box(3.4, 1.1, 0.8, 3, 0.55, -9, materials.hairline);
  box(1.4, 1.4, 1.4, -13.5, 0.7, -4.5, materials.surface);
  box(1.4, 1.4, 1.4, 13.5, 0.7, -4.5, materials.surface);

  // Dead trees: trunk and bare branches, for silhouette.
  for (const [tx, tz] of [[-17.5, 3], [17.5, -6], [-3, 12.5]]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 3.2, 8), materials.hairline);
    trunk.position.set(tx, 1.6, tz);
    trunk.castShadow = true;
    group.add(trunk);
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.6, 6), materials.hairline);
    branch.position.set(tx + 0.4, 3.2, tz);
    branch.rotation.z = 0.7;
    group.add(branch);
    colliders.push(new THREE.Box3(new THREE.Vector3(tx - 0.25, 0, tz - 0.25), new THREE.Vector3(tx + 0.25, 3.2, tz + 0.25)));
  }

  // Site rings and signs.
  const ringGeo = new THREE.RingGeometry(3.6, 4.4, 40);
  const ringA = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  ringA.rotation.x = -Math.PI / 2;
  ringA.position.set(-13, 0.03, -9);
  group.add(ringA);
  const ringB = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.teal), transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  ringB.rotation.x = -Math.PI / 2;
  ringB.position.set(13, 0.03, -9);
  group.add(ringB);
  const signA = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: siteTexture('A', PALETTE.accent) }));
  signA.position.set(-15.5, 3.2, -11.1);
  group.add(signA);
  const signB = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: siteTexture('B', PALETTE.teal) }));
  signB.position.set(15.5, 3.2, -11.1);
  group.add(signB);

  // Distant mesas beyond the walls, fading into the fog.
  const mesaMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a2a1c'), roughness: 1 });
  for (const [mx, mz, mw, mh] of [[-34, -20, 18, 9], [30, -24, 22, 12], [0, -34, 26, 7], [-38, 14, 14, 6], [36, 18, 16, 8]]) {
    const mesa = new THREE.Mesh(new THREE.BoxGeometry(mw, mh, 6), mesaMat);
    mesa.position.set(mx, mh / 2 - 0.5, mz);
    group.add(mesa);
  }

  // Sun disc low on the horizon, dusk light, warm haze.
  const sun = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347'), fog: false }));
  sun.position.set(-26, 7, -30);
  sun.lookAt(0, 2, 0);
  group.add(sun);

  const sky = new THREE.HemisphereLight(new THREE.Color('#8a6a4a'), new THREE.Color(PALETTE.sand), 0.9);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb36b'), 2.4);
  key.position.set(-14, 16, 10);
  key.target.position.set(0, 0, -2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -24;
  key.shadow.camera.right = 24;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7a86a0'), 0.5);
  fill.position.set(12, 10, 12);
  scene.add(fill);

  const ray = new THREE.Ray();
  const rayDir = new THREE.Vector3();
  const rayPoint = new THREE.Vector3();
  const sphere = new THREE.Sphere();

  function segmentBlocked(a, b, blockers) {
    rayDir.subVectors(b, a);
    const dist = rayDir.length();
    if (dist < 0.001) return false;
    rayDir.divideScalar(dist);
    ray.set(a, rayDir);
    ray.far = dist;
    for (const box3 of blockers) {
      if (ray.intersectBox(box3, rayPoint) !== null) return true;
    }
    return false;
  }

  // Waypoint graph: nodes within 11 m and a clear line at eye height link up.
  const eye = new THREE.Vector3();
  const eye2 = new THREE.Vector3();
  const nodes = WAYPOINTS.map(([x, z]) => ({ x, z, edges: [] }));
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > 11) continue;
      eye.set(a.x, 1.2, a.z);
      eye2.set(b.x, 1.2, b.z);
      if (segmentBlocked(eye, eye2, colliders)) continue;
      a.edges.push(j);
      b.edges.push(i);
    }
  }

  const sites = [
    { name: 'A', center: new THREE.Vector3(-13, 0, -9), radius: 4.4 },
    { name: 'B', center: new THREE.Vector3(13, 0, -9), radius: 4.4 },
  ];
  const spawns = {
    atk: [new THREE.Vector3(-6, 0, 13), new THREE.Vector3(-2, 0, 14), new THREE.Vector3(2, 0, 14), new THREE.Vector3(6, 0, 13), new THREE.Vector3(0, 0, 11.5)],
    def: [new THREE.Vector3(-8, 0, -13), new THREE.Vector3(-3, 0, -14), new THREE.Vector3(3, 0, -14), new THREE.Vector3(8, 0, -13), new THREE.Vector3(0, 0, -11.5)],
  };

  return {
    colliders,
    shootables,
    group,
    sites,
    spawns,
    nodes,
    hasLineOfSight(a, b, smoke = null) {
      if (segmentBlocked(a, b, colliders)) return false;
      if (smoke) {
        for (const puff of smoke) {
          sphere.center.copy(puff.center);
          sphere.radius = puff.radius;
          rayDir.subVectors(b, a).normalize();
          ray.set(a, rayDir);
          if (ray.intersectSphere(sphere, rayPoint) !== null) {
            if (rayPoint.distanceTo(a) < a.distanceTo(b)) return false;
          }
        }
      }
      return true;
    },
    nearestNode(x, z) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < nodes.length; i += 1) {
        const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    },
  };
}
