import * as THREE from 'three';
import { BOARD_H, CAMERA_FOV } from './constants.js';
import { AmbientConfetti } from './particles.js';
import { outlineMaterial, paperNoiseTex, questionBlockTexture, toonGradient } from './materials.js';
import { THEMES } from './themes.js';

/** Re-paintable sky backdrop: a 4x256 canvas texture used as scene.background. */
export interface SkyPart {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  tex: THREE.CanvasTexture;
}

export interface CloudPart {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  phase: number;
  speed: number;
}

export interface FloaterPart {
  group: THREE.Group;
  y: number;
  phase: number;
}

/** Everything the stage controller needs to re-paint and animate the diorama. */
export interface SceneParts {
  scene: THREE.Scene;
  sky: SkyPart;
  fog: THREE.Fog;
  hills: THREE.Mesh[];
  sunGroup: THREE.Group;
  sunMat: THREE.MeshBasicMaterial;
  rayMat: THREE.MeshBasicMaterial;
  rays: THREE.Group;
  clouds: CloudPart[];
  cloudMat: THREE.MeshBasicMaterial;
  floaters: FloaterPart[];
  confetti: AmbientConfetti;
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  groundMat: THREE.MeshStandardMaterial;
  gridMat: THREE.Material;
}

export interface SceneSetup {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  parts: SceneParts;
}

/** Repaints the vertical paper-sky gradient (top -> horizon) from theme stops. */
export function paintSky(sky: SkyPart, stops: readonly [number, number, number, number]): void {
  const ctx = sky.ctx;
  if (!ctx) return;
  const css = (hex: number): string => '#' + hex.toString(16).padStart(6, '0');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, css(stops[0]));
  g.addColorStop(0.45, css(stops[1]));
  g.addColorStop(0.78, css(stops[2]));
  g.addColorStop(1, css(stops[3]));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  sky.tex.needsUpdate = true;
}

/** Vertical paper-sky gradient (blue top -> warm cream horizon) in the day palette. */
function skyTexture(): SkyPart {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky: SkyPart = { canvas, ctx: canvas.getContext('2d'), tex };
  const day = THEMES[0];
  if (day) paintSky(sky, day.sky);
  return sky;
}

/** Flat cut-paper hill silhouette for the diorama backdrop. */
function hillLayer(color: number, z: number, baseY: number, w: number, h: number, bumps: number): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -8);
  shape.lineTo(-w / 2, 0);
  const seg = w / bumps;
  for (let i = 0; i < bumps; i++) {
    const x0 = -w / 2 + i * seg;
    const peak = h * (0.55 + 0.45 * Math.abs(Math.sin(i * 2.7 + z)));
    const valley = h * 0.16 * Math.sin(i * 1.9);
    shape.quadraticCurveTo(x0 + seg / 2, peak, x0 + seg, valley);
  }
  shape.lineTo(w / 2, -8);
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color }));
  mesh.position.set(0, baseY, z);
  return mesh;
}

/** Puffy paper cloud built from overlapping arcs. */
function cloudGeometry(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-1.7, 0);
  s.absarc(-0.9, 0.12, 0.55, Math.PI, 0, true);
  s.absarc(0.35, 0.3, 0.7, Math.PI, 0, true);
  s.absarc(1.47, 0.08, 0.42, Math.PI, 0, true);
  s.lineTo(-1.7, 0);
  return new THREE.ShapeGeometry(s);
}

/** Voxel "?" block (Mario reference) with ink outline hull. */
function questionBlock(): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(1.7, 1.7, 1.7);
  const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: questionBlockTexture(), gradientMap: toonGradient }));
  const hull = new THREE.Mesh(geo, outlineMaterial());
  hull.scale.setScalar(1.06);
  g.add(mesh, hull);
  return g;
}

export interface SceneOptions {
  /** MSAA; se desactiva en calidad baja (móvil) para ahorrar GPU. */
  antialias?: boolean;
  /** Tamaño del shadow map de la luz clave (mitad en calidad baja). */
  shadowMapSize?: number;
}

/**
 * Crea el diorama. El tamaño del canvas y el aspecto de la cámara los gestiona
 * `ViewportManager` (src/platform/viewport.ts), no esta función.
 */
export function createScene(canvas: HTMLCanvasElement, opts: SceneOptions = {}): SceneSetup {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.antialias ?? true });
  renderer.shadowMap.enabled = true;
  // PCFShadowMap ya es suave desde r182; PCFSoftShadowMap quedó deprecado.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Sombras bajo demanda: el mapa solo se re-renderiza cuando BoardRenderer
  // detecta movimiento de casters (los personajes/clima no proyectan sombra).
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  // Flat, vivid paper colours — no filmic tone mapping.
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const sky = skyTexture();
  scene.background = sky.tex;
  const fog = new THREE.Fog(0xd5ebf5, 34, 95);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0.9, 31.5);
  camera.lookAt(0, 0.3, 0);

  // Warm, soft studio light (paper diorama under a lamp).
  const hemi = new THREE.HemisphereLight(0xfff4dd, 0xd8c9a8, 0.95);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1d6, 1.5);
  key.position.set(6, 12, 10);
  key.castShadow = true;
  const shadowSize = opts.shadowMapSize ?? 2048;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  key.shadow.camera.left = -10; key.shadow.camera.right = 10;
  key.shadow.camera.top = 14; key.shadow.camera.bottom = -12;
  key.shadow.camera.near = 1; key.shadow.camera.far = 40;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  // Luz de relleno tenue: deja las sombras de la luz clave marcadas y dramáticas.
  const fill = new THREE.DirectionalLight(0xd8ecff, 0.22);
  fill.position.set(-8, 5, 8);
  scene.add(fill);

  // Paper table the diorama sits on.
  paperNoiseTex.repeat.set(20, 20);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xf2e6cc, map: paperNoiseTex, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -BOARD_H / 2 - 0.7;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(160, 40, 0xc9b48d, 0xd8c9a4);
  grid.position.y = -BOARD_H / 2 - 0.68;
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.35;
  scene.add(grid);

  // Layered paper hills on the horizon (far -> near).
  const hills = [
    hillLayer(0xa9cfe0, -46, -13, 170, 17, 7),
    hillLayer(0x8ecb8b, -34, -12.5, 150, 14, 6),
    hillLayer(0x5fae62, -24, -12, 130, 11, 5)
  ];
  for (const h of hills) scene.add(h);

  // Cut-paper sun (or moon) with rays; grouped so themes move/scale/recolour it.
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffd34e, fog: false });
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40), sunMat);
  const rays = new THREE.Group();
  const rayMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, fog: false });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.8), rayMat);
    ray.position.set(Math.cos(a) * 5, Math.sin(a) * 5, 0);
    ray.rotation.z = a + Math.PI / 2;
    rays.add(ray);
  }
  const sunGroup = new THREE.Group();
  sunGroup.add(sunDisc, rays);
  sunGroup.position.set(15, 15, -52);
  scene.add(sunGroup);

  // Paper clouds that gently bob.
  const cloudGeo = cloudGeometry();
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xfffdf4 });
  const cloudSpecs: Array<[number, number, number, number]> = [
    [-19, 12, -30, 2.4], [16.5, 15.5, -34, 3], [-9, 17.5, -42, 2.2], [25, 9.5, -26, 2.6], [-27, 8.5, -24, 2]
  ];
  const clouds = cloudSpecs.map(([x, y, z, s]) => {
    const m = new THREE.Mesh(cloudGeo, cloudMat);
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    scene.add(m);
    return { mesh: m, x, y, phase: Math.random() * Math.PI * 2, speed: 0.4 + Math.random() * 0.4 };
  });

  // Floating voxel question blocks.
  const floaters: { group: THREE.Group; y: number; phase: number }[] = [];
  const floaterSpecs: Array<[number, number, number]> = [
    [-11.5, 6.5, -10], [12.5, 2.5, -13], [-13.5, -3, -16]
  ];
  for (const [x, y, z] of floaterSpecs) {
    const g = questionBlock();
    g.position.set(x, y, z);
    scene.add(g);
    floaters.push({ group: g, y, phase: Math.random() * Math.PI * 2 });
  }

  // Ambient paper confetti.
  const confetti = new AmbientConfetti(150, { x0: -36, x1: 36, y0: -13, y1: 30, z0: -26, z1: -2 });
  scene.add(confetti.points);

  // El resize/orientation lo gestiona ViewportManager (src/platform/viewport.ts).

  const parts: SceneParts = {
    scene, sky, fog, hills, sunGroup, sunMat, rayMat, rays,
    clouds, cloudMat, floaters, confetti,
    hemi, key, fill, groundMat, gridMat
  };
  return { renderer, scene, camera, parts };
}

