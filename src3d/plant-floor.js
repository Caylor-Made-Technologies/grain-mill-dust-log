// The plant floor in 3D (lazy chunk with three.js). One tile per area, tinted by its level, a simple
// model of what stands there, and dust piles where it's bad. Tap a tile to open its log.
// Draws on demand: a short camera glide on load, then 0 frames until something changes.
import {
  BoxGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry,
  Raycaster, SRGBColorSpace, Vector2,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createStage } from '../caylor-ui/three/stage.js';

// Same fills as the drawing (app.css .zone-*), so both views read the same.
const LEVEL_COLOR = { good: 0x2a7d5c, watch: 0xa87420, act: 0xa83c3c, none: 0x3a4558 };

function shadowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const steel = () => new MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.42 });
const paint = (c) => new MeshStandardMaterial({ color: c, metalness: 0.2, roughness: 0.55 });

/** A recognisable, very low-poly model for each kind of area. */
function equipment(kind) {
  const g = new Group();
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  switch (kind) {
    case 'mixer': add(new CylinderGeometry(0.3, 0.3, 0.45, 18), steel(), 0, 0.3, 0); add(new ConeGeometry(0.3, 0.2, 18), steel(), 0, 0.62, 0); break;
    case 'silo': add(new CylinderGeometry(0.32, 0.32, 0.9, 18), paint(0xc9ced4), 0, 0.5, 0); add(new ConeGeometry(0.32, 0.18, 18), paint(0xc9ced4), 0, 1.04, 0); break;
    case 'sifter': add(new RoundedBoxGeometry(0.7, 0.32, 0.5, 2, 0.04), paint(0xd7dbe0), 0, 0.26, 0); break;
    case 'conveyor': add(new BoxGeometry(1.2, 0.06, 0.32), paint(0x2b333d), 0, 0.32, 0); for (const x of [-0.5, 0.5]) add(new BoxGeometry(0.05, 0.3, 0.05), steel(), x, 0.15, 0); add(new BoxGeometry(0.22, 0.16, 0.22), paint(0xb88b4a), 0.2, 0.43, 0); break;
    case 'collector': add(new CylinderGeometry(0.28, 0.28, 0.6, 16), paint(0x8a96a3), 0, 0.5, 0); add(new ConeGeometry(0.28, 0.3, 16), paint(0x8a96a3), 0, 0.05, 0).rotation.x = Math.PI; break;
    case 'stairs': for (let i = 0; i < 4; i++) add(new BoxGeometry(0.6, 0.06, 0.18), steel(), 0, 0.1 + i * 0.14, -0.3 + i * 0.18); break;
    case 'overhead': add(new BoxGeometry(1.25, 0.08, 0.08), steel(), 0, 0.85, -0.15); add(new CylinderGeometry(0.07, 0.07, 1.25, 12), paint(0x6b737c), 0, 0.7, 0.2).rotation.z = Math.PI / 2; for (const x of [-0.55, 0.55]) add(new BoxGeometry(0.06, 0.85, 0.06), steel(), x, 0.43, -0.15); break;
    case 'leg': add(new BoxGeometry(0.22, 1.1, 0.22), paint(0xc9ced4), 0, 0.6, 0); add(new BoxGeometry(0.4, 0.2, 0.3), paint(0xc9ced4), 0, 0.12, 0); break;
    case 'motor': add(new CylinderGeometry(0.16, 0.16, 0.38, 16), paint(0x2f5d8a), 0, 0.2, 0).rotation.z = Math.PI / 2; add(new BoxGeometry(0.3, 0.06, 0.24), steel(), 0, 0.03, 0); break;
    case 'panel': add(new RoundedBoxGeometry(0.55, 0.6, 0.18, 2, 0.02), paint(0xb7bec7), 0, 0.33, -0.2); break;
    case 'floor': break;
    default: add(new RoundedBoxGeometry(0.5, 0.3, 0.4, 2, 0.03), paint(0x8a96a3), 0, 0.18, 0);
  }
  return g;
}

/** @returns {{ update(model): void, dispose(): void, frames(): number, stats(): object, workStats(): object }} */
export function mount(canvas, { model, onTap, onLost }) {
  const stage = createStage(canvas, { camera: [4.5, 6.5, 7.5], target: [0, 0, 0.2], fov: 34, onLost });
  const { scene, camera } = stage;
  const root = new Group();
  scene.add(root);
  const tex = shadowTex();
  let tiles = [];

  function fit(m) {
    // Back far enough to see the whole floor, from the front-right and above (like the drawing).
    const span = Math.max(m.size[0], m.size[1] * 1.3);
    const d = 1.6 + span * 0.92;
    return { cam: [d * 0.62, d * 0.66, d * 0.8], at: [0, 0.1, 0.1] };
  }

  function build(m) {
    root.traverse((o) => { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach((x) => x.dispose()); });
    root.clear();
    tiles = [];
    const floor = new Mesh(new PlaneGeometry(m.size[0] + 1.6, m.size[1] + 1.6), new MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    root.add(floor);
    for (const z of m.zones) {
      const color = new Color(LEVEL_COLOR[z.level] ?? LEVEL_COLOR.none);
      const mat = new MeshStandardMaterial({ color: color.clone().multiplyScalar(0.7), emissive: color, emissiveIntensity: 0.12, roughness: 0.9, envMapIntensity: 0.4 });
      const tile = new Mesh(new RoundedBoxGeometry(m.tile[0] - 0.08, 0.08, m.tile[1] - 0.08, 2, 0.03), mat);
      tile.position.set(z.x, 0.04, z.z);
      tile.userData.zone = z.id;
      root.add(tile);
      const eq = equipment(z.kind);
      eq.position.set(z.x, 0.08, z.z);
      eq.traverse((o) => { o.userData.zone = z.id; });
      root.add(eq);
      // Dust left on the floor: a pile per level of dust (0-2), dusty tan.
      for (let i = 0; i < (z.dust || 0); i++) {
        const pile = new Mesh(new ConeGeometry(0.16 + 0.05 * i, 0.1, 10), new MeshStandardMaterial({ color: 0xc9b48a, roughness: 1 }));
        pile.position.set(z.x - 0.5 + i * 0.22, 0.13, z.z + 0.38);
        pile.userData.zone = z.id;
        root.add(pile);
      }
      tiles.push(tile);
    }
    stage.invalidate();
  }

  // Tap (not drag) on a tile or anything standing on it -> open that area's log.
  const ray = new Raycaster();
  const v = new Vector2();
  let down = null;
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down = null; return; }
    down = null;
    const r = canvas.getBoundingClientRect();
    v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v, camera);
    const hit = ray.intersectObjects(root.children, true).find((h) => h.object.userData.zone);
    if (hit) onTap(hit.object.userData.zone);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  build(model);
  const v0 = fit(model);
  camera.position.set(v0.cam[0] * 1.25, v0.cam[1] * 1.3, v0.cam[2] * 1.2);
  stage.flyTo(v0.cam, v0.at, 1200);

  return {
    update(m) { build(m); const f = fit(m); stage.flyTo(f.cam, f.at, 600); },
    dispose() { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); tex.dispose(); stage.dispose(); },
    frames: stage.frames, stats: stage.stats, workStats: stage.workStats,
  };
}
