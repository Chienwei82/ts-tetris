import * as THREE from 'three';
import { ALL_KINDS, CLEAR_TYPE_COLOR, CLEAR_TYPE_LABEL, COLS, DRILL_COLOR, JUNK_COLOR, PIECE_COLORS, VISIBLE_ROWS } from '../game/types.js';
import type { ClearType, Grid, PieceKind, Vec2 } from '../game/types.js';
import { BOARD_D, BOARD_H, BOARD_W, cellToWorld } from './constants.js';
import { INK, blockMaterial, cardboardMaterial, graphPaperMaterial, outlineMaterial, tapeMaterial } from './materials.js';
import { ParticleSystem } from './particles.js';
import { ACTIVE_STIFFNESS, GHOST_STIFFNESS, criticalDamping, isSettled, matchByProximity, stepSpring } from './motionSpring.js';
// Materiales del tablero: `fog: false` en todos — la niebla del fondo es para el
// horizonte y no debe teñir el plano de juego (piezas, panel, fantasmas, guías).
const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, fog: false });
const ghostEdgeMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.7, fog: false });
/** Instanced-render capacity: every visible cell at once. */
const MAX_LOCKED = COLS * VISIBLE_ROWS;
/** Inverted-hull ink outline scale (cut-out edge). */
const HULL_SCALE = 1.07;
/** A locked tile: what the instanced meshes need to place a block and its ink hull. */
interface LockedCell {
  kind: PieceKind;
  /** Hand-placed paper: tiny per-tile tilt, kept across syncs. */
  tilt: number;
  x: number;
  y: number;
}
/** Celda que desaparece al limpiar una fila, ya en coordenadas de mundo. */
export interface ClearedCell {
  kind: PieceKind | 'J';
  x: number;
  y: number;
}
export interface ClearOptions {
  /** Animar los bloques volando (por defecto true). */
  launch?: boolean;
  /** Ráfaga de partículas por bloque (por defecto true). */
  particles?: boolean;
}
/** Especiales: objetos literales (💣/⚡/🔩). Se dibujan como UN sprite grande,
 *  jamas como bloques de pieza con tintes. */
const SPECIAL_ICON: Record<string, string> = { bomb: '💣', bolt: '⚡', drill: '🔩', chatarra: '🧱' };
function specialIconTexture(emoji: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const ctx = cv.getContext('2d');
  if (ctx) {
    // Sombra suave de recorte: el objeto "flota" sobre el tablero de papel.
    ctx.shadowColor = 'rgba(30,20,12,0.45)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
    ctx.font = '196px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 128, 128);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const scratchMatrix = new THREE.Matrix4();
const scratchQuat = new THREE.Quaternion();
const scratchPos = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
/** Distancia² a partir de la cual un bloque se teletransporta (pieza nueva). */
const TELEPORT_DIST_SQ = 9;
/** Un texto flotante de bonificación animado en 3D. */
interface ClearTextSprite {
  mesh: THREE.Sprite;
  life: number;      // 0 = recién nacido, 1 = terminado
  maxLife: number;
  vy: number;        // velocidad vertical de ascenso
  startScale: number;
}

/** Crea una CanvasTexture con texto estilizado (papercraft, contorno de tinta). */
function clearTextTexture(text: string, colorHex: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  if (ctx) {
    // Fondo transparente; el texto pega sobre el mundo 3D.
    ctx.clearRect(0, 0, 512, 128);
    // Contorno de tinta (estilo cómic/papercraft).
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.strokeText(text, 256, 64);
    // Relleno de color.
    const c = new THREE.Color(colorHex);
    ctx.fillStyle = `#${c.getHexString()}`;
    ctx.fillText(text, 256, 64);
    // Brillo superior para dar volumen al papel.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.fillText(text, 256, 60);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** Un muelle de la pieza activa: física 2D + el mesh que dibuja. */
interface ActiveSpring {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mesh: THREE.Group;
}
/** Estado físico guardado de un muelle reciclado (el mesh ya volvió al pool). */
interface PooledSpring {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
/** Un muelle fantasma: física 2D + el mesh translúcido que dibuja. */
interface GhostSpring {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mesh: THREE.Group;
}
export class BoardRenderer {
  group = new THREE.Group();
  particles = new ParticleSystem();
  private geo = new THREE.BoxGeometry(0.92, 0.92, 0.92);
  private ghostGeo = new THREE.BoxGeometry(0.86, 0.86, 0.5);
  private ghostEdgeGeo = new THREE.EdgesGeometry(this.ghostGeo);
  /** Locked tiles by cell key; rendered as one InstancedMesh per piece kind. */
  private lockedState = new Map<number, LockedCell>();
  private lockIMeshes = new Map<PieceKind, THREE.InstancedMesh>();
  private hullIMesh = new THREE.InstancedMesh(this.geo, outlineMaterial(), MAX_LOCKED);
  /** Temporary hail cells. */
  private hailState = new Set<number>();
  private hailIMesh = new THREE.InstancedMesh(this.geo, new THREE.MeshToonMaterial({ color: 0x9ec8ff, emissive: 0x9ec8ff, emissiveIntensity: 0.18, fog: false }), MAX_LOCKED);
  /** Drill-red cells left by the taladro. */
  private drillState = new Set<number>();
  private drillIMesh = new THREE.InstancedMesh(this.geo, new THREE.MeshToonMaterial({ color: DRILL_COLOR, emissive: DRILL_COLOR, emissiveIntensity: 0.25, fog: false }), MAX_LOCKED);
  /** Bloques de chatarra que deja la pieza desventajosa del Caos. */
  private junkState = new Set<number>();
  private readonly junkBlockMaterial = new THREE.MeshToonMaterial({ color: JUNK_COLOR, fog: false });
  private junkIMesh = new THREE.InstancedMesh(this.geo, new THREE.MeshToonMaterial({ color: JUNK_COLOR, fog: false }), MAX_LOCKED);
  /** Guía luminosa de la zona de impacto del powerup activo (bomba/rayo/taladro). */
  private guideIMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.94, 0.94, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.3, depthWrite: false, fog: false }),
    MAX_LOCKED
  );
  private guideOn = false;
  /** Reloj cosmético compartido por la guía, el icono y el granizo. */
  private fxClock = 0;
  /** Caída animada del granizo: clave de celda -> progreso 0..1. */
  private hailFall = new Map<number, number>();
  private specialKind: string | null = null;
  private specialBaseScale = 1;
  private specialBaseY = 0;
  private specialClock = 0;
  private seenScratch = new Set<number>();
  private activeGroup = new THREE.Group();
  private ghostGroup = new THREE.Group();
  private clearingRows = new Map<number, { t: number; meshes: THREE.Group[] }>();
  private lockAnims: { mesh: THREE.Group; t: number; row: number }[] = [];
  private fogMesh: THREE.Mesh | null = null;
  private specialIcon: THREE.Sprite | null = null;
  /** Fantasma del powerup: el mismo icono, translúcido, marca la zona de aterrizaje. */
  private ghostSpecial: THREE.Sprite | null = null;
  private iconTex = new Map<string, THREE.CanvasTexture>();
  private fogOn = false;
  /** Textos flotantes de bonificación ("DOBLE", "TRIPLE", "TETRIS", "COMBO xN"). */
  private clearTexts: ClearTextSprite[] = [];
  private readonly clearTextMats = new Map<ClearType, THREE.SpriteMaterial>();
  /** Pieza activa animada por muelle: un muelle por bloque + sus objetivos. */
  private activeSprings: ActiveSpring[] = [];
  private activeTargets: Array<{ x: number; y: number }> = [];
  /** Pool de estados físicos (el mesh vuelve al pool ciego `pullFree`). */
  private activePool: PooledSpring[] = [];
  /** true mientras algún bloque de la pieza aún viaja a su celda. */
  private activeGliding = false;
  /** Fantasma del tetromino: mismos muelles, más rígidos, con su pool. */
  private ghostSprings: GhostSpring[] = [];
  private ghostTargets: Array<{ x: number; y: number }> = [];
  private ghostPool: THREE.Group[] = [];
  private ghostGliding = false;
  private pullFree: THREE.Group[] = [];
  /** True when shadow-casting geometry changed since the last `update()`. */
  private shadowDirty = true;
  constructor(scene: THREE.Scene) {
    this.buildFrame();
    this.buildLockedMeshes();
    this.hailIMesh.count = 0;
    this.hailIMesh.castShadow = true;
    this.hailIMesh.receiveShadow = true;
    this.hailIMesh.frustumCulled = false;
    this.group.add(this.hailIMesh);
    this.drillIMesh.count = 0;
    this.drillIMesh.castShadow = true;
    this.drillIMesh.receiveShadow = true;
    this.drillIMesh.frustumCulled = false;
    this.group.add(this.drillIMesh);
    this.junkIMesh.count = 0;
    this.junkIMesh.castShadow = true;
    this.junkIMesh.receiveShadow = true;
    this.junkIMesh.frustumCulled = false;
    this.group.add(this.junkIMesh);
    this.guideIMesh.count = 0;
    this.guideIMesh.frustumCulled = false;
    this.guideIMesh.renderOrder = 6;
    this.group.add(this.guideIMesh);
    this.group.add(this.activeGroup, this.ghostGroup);
    this.group.add(this.particles.points);
    // Materiales de sprite por tipo de clear (texto dibujado en canvas).
    for (const ct of ['single', 'double', 'triple', 'tetris'] as ClearType[]) {
      const tex = clearTextTexture(CLEAR_TYPE_LABEL[ct], CLEAR_TYPE_COLOR[ct]);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
      mat.color.setHex(CLEAR_TYPE_COLOR[ct]);
      this.clearTextMats.set(ct, mat);
    }
    scene.add(this.group);
  }
  /**
   * Locked tiles render as one InstancedMesh per piece kind (7 draw calls) plus a
   * single shared ink-hull mesh: O(1) draw calls instead of O(blocks).
   */
  private buildLockedMeshes(): void {
    for (const kind of ALL_KINDS) {
      const im = new THREE.InstancedMesh(this.geo, blockMaterial(kind), MAX_LOCKED);
      im.count = 0;
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.lockIMeshes.set(kind, im);
      this.group.add(im);
    }
    const hull = this.hullIMesh;
    hull.count = 0;
    hull.frustumCulled = false;
    this.group.add(hull);
  }
  /** Rewrites every instance matrix from `lockedState` (runs only on board changes). */
  private rebuildLocked(): void {
    for (const im of this.lockIMeshes.values()) im.count = 0;
    this.hullIMesh.count = 0;
    for (const cell of this.lockedState.values()) {
      const im = this.lockIMeshes.get(cell.kind);
      if (!im) continue;
      scratchQuat.setFromAxisAngle(AXIS_Z, cell.tilt);
      scratchPos.set(cell.x, cell.y, 0);
      scratchScale.set(1, 1, 1);
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
      im.setMatrixAt(im.count, scratchMatrix);
      im.count++;
      scratchScale.setScalar(HULL_SCALE);
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
      this.hullIMesh.setMatrixAt(this.hullIMesh.count, scratchMatrix);
      this.hullIMesh.count++;
    }
    for (const im of this.lockIMeshes.values()) im.instanceMatrix.needsUpdate = true;
    this.hullIMesh.instanceMatrix.needsUpdate = true;
    this.shadowDirty = true;
  }

  private rebuildHail(): void {
    this.hailIMesh.count = 0;
    for (const k of this.hailState) {
      const col = k % COLS;
      const row = Math.floor(k / COLS);
      const p = cellToWorld(col, row);
      const fall = this.hailFall.get(k);
      let y = p.y;
      let scale = 1;
      if (fall !== undefined) {
        // Cae del cielo acelerando y se asienta con un pequeño estirón.
        const e = fall * fall;
        y += (1 - e) * 8;
        scale = 0.7 + 0.3 * fall;
      }
      scratchPos.set(p.x, y, 0);
      scratchQuat.identity();
      scratchScale.set(scale, scale, scale);
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
      this.hailIMesh.setMatrixAt(this.hailIMesh.count, scratchMatrix);
      this.hailIMesh.count++;
    }
    this.hailIMesh.instanceMatrix.needsUpdate = true;
    this.shadowDirty = true;
  }

  /** Chispas de hielo y gotas cuando el granizo se derrite. */
  private burstHailMelt(key: number): void {
    const col = key % COLS;
    const row = Math.floor(key / COLS);
    const p = cellToWorld(col, row);
    this.particles.burst(new THREE.Vector3(p.x, p.y, 0.7), 0xdcefff, 7, 2.6, 2.4);
    this.particles.burst(new THREE.Vector3(p.x, p.y - 0.2, 0.6), 0x8fc6ef, 4, 1.8, 1.6);
  }

  private rebuildDrill(): void {
    this.drillIMesh.count = 0;
    for (const k of this.drillState) {
      const col = k % COLS;
      const row = Math.floor(k / COLS);
      const p = cellToWorld(col, row);
      scratchMatrix.makeTranslation(p.x, p.y, 0.46);
      this.drillIMesh.setMatrixAt(this.drillIMesh.count, scratchMatrix);
      this.drillIMesh.count++;
    }
    this.drillIMesh.instanceMatrix.needsUpdate = true;
  }
  private rebuildJunk(): void {
    this.junkIMesh.count = 0;
    for (const k of this.junkState) {
      const col = k % COLS;
      const row = Math.floor(k / COLS);
      const p = cellToWorld(col, row);
      scratchMatrix.makeTranslation(p.x, p.y, 0.46);
      this.junkIMesh.setMatrixAt(this.junkIMesh.count, scratchMatrix);
      this.junkIMesh.count++;
    }
    this.junkIMesh.instanceMatrix.needsUpdate = true;
    this.shadowDirty = true;
  }
  private makeJunkBlock(): THREE.Group {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(this.geo, this.junkBlockMaterial);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const outline = new THREE.Mesh(this.geo, outlineMaterial());
    outline.scale.setScalar(1.07);
    g.add(mesh, outline);
    g.userData.kind = 'J';
    return g;
  }
  /** Bloque fantasma: caja translúcida con borde de tinta (se recicla en `ghostPool`). */
  private makeGhostBlock(): THREE.Group {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(this.ghostGeo, ghostMat);
    const edge = new THREE.LineSegments(this.ghostEdgeGeo, ghostEdgeMat);
    g.add(mesh, edge);
    return g;
  }
  private makeBlock(kind: PieceKind): THREE.Group {
    let g = this.pullFree.pop();
    // Recycled blocks carry the previous kind/material: always re-colorize.
    if (g) { g.visible = true; g.scale.setScalar(1); g.rotation.set(0, 0, 0); this.colorize(g, kind); return g; }
    g = new THREE.Group();
    const mesh = new THREE.Mesh(this.geo, blockMaterial(kind));
    mesh.castShadow = true; mesh.receiveShadow = true;
    const outline = new THREE.Mesh(this.geo, outlineMaterial());
    outline.scale.setScalar(1.07);
    g.add(mesh, outline);
    g.userData.kind = kind;
    return g;
  }
  private colorize(g: THREE.Group, kind: PieceKind): void {
    const mesh = g.children[0] as THREE.Mesh;
    if (g.userData.kind !== kind) mesh.material = blockMaterial(kind);
    g.userData.kind = kind;
  }
  private buildFrame(): void {
    const card = cardboardMaterial();
    const ink = outlineMaterial();
    // box + inverted-hull ink outline (paper cut-out edge)
    const mkBar = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), card);
      bar.position.set(x, y, z);
      bar.castShadow = true; bar.receiveShadow = true;
      const hull = new THREE.Mesh(bar.geometry, ink);
      hull.scale.set((w + 0.09) / w, (h + 0.09) / h, (d + 0.09) / d);
      bar.add(hull);
      this.group.add(bar);
    };
    const T = 0.62; // cardboard bar thickness
    const pw = BOARD_W + 2 * T;
    const ph = BOARD_H + 2 * T;
    mkBar(T, ph, 1.5, -BOARD_W / 2 - T / 2, 0, -0.1);
    mkBar(T, ph, 1.5, BOARD_W / 2 + T / 2, 0, -0.1);
    mkBar(pw, T, 1.5, 0, BOARD_H / 2 + T / 2, -0.1);
    mkBar(pw, T, 1.5, 0, -BOARD_H / 2 - T / 2, -0.1);
    // washi tape holding the frame corners down
    const tape = (x: number, y: number, rot: number, color: number): void => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), tapeMaterial(color));
      m.position.set(x, y, 0.78);
      m.rotation.z = rot;
      this.group.add(m);
    };
    tape(-BOARD_W / 2 - T / 2 - 0.25, BOARD_H / 2 + 0.2, -0.35, 0xe04e39);
    tape(BOARD_W / 2 + T / 2 + 0.25, BOARD_H / 2 + 0.2, 0.35, 0x4d9de0);
    tape(-BOARD_W / 2 - T / 2 - 0.25, -BOARD_H / 2 - 0.2, 0.35, 0x58b368);
    tape(BOARD_W / 2 + T / 2 + 0.25, -BOARD_H / 2 - 0.2, -0.35, 0xffc93c);
    // cardboard stage platform
    const floorW = BOARD_W + 2.4;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(floorW, 0.5, 3.6), card);
    floor.position.set(0, -BOARD_H / 2 - T - 0.25, 0.5);
    floor.castShadow = true; floor.receiveShadow = true;
    const floorHull = new THREE.Mesh(floor.geometry, ink);
    floorHull.scale.set((floorW + 0.09) / floorW, 1.18, 3.69 / 3.6);
    floor.add(floorHull);
    this.group.add(floor);
    // graph-paper backing sheet with ink outline
    const back = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), graphPaperMaterial());
    back.position.set(0, 0, -BOARD_D / 2 - 0.02);
    back.receiveShadow = true;
    const backEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(back.geometry),
      new THREE.LineBasicMaterial({ color: INK, fog: false })
    );
    backEdge.position.z = 0.01;
    back.add(backEdge);
    this.group.add(back);
  }
  /**
   * Panel de fondo translúcido (efectos ON: el diorama se ve a través del
   * tablero, con las sombras de los bloques recortadas contra el fondo) u
   * opaco (OFF: sin blending ni ordenación, más barato). El marco de cartón y
   * la plataforma permanecen sólidos siempre.
   */
  setBackdropTranslucent(on: boolean): void {
    const mat = graphPaperMaterial();
    mat.transparent = on;
    mat.opacity = on ? 0.42 : 1;
    mat.depthWrite = !on;
    mat.needsUpdate = true;
  }
  /** Numeric cell key: no string garbage in the hot paths. */
  key(col: number, row: number): number { return col + row * COLS; }
  syncLocked(grid: Grid): void {
    // While a clear animation plays, the engine grid already collapsed but the
    // old blocks are still flying — skip syncing until the animation finishes.
    if (this.clearingRows.size > 0) return;
    const seen = this.seenScratch;
    seen.clear();
    const seenHail = new Set<number>();
    let changed = false;
    let hailChanged = false;
    const seenDrill = new Set<number>();
    let drillChanged = false;
    const seenJunk = new Set<number>();
    let junkChanged = false;
    for (let r = 0; r < VISIBLE_ROWS; r++) {
      const row = grid[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const v = row[c] as PieceKind | 'G' | 'R' | 'J' | 0;
        const k = this.key(c, r);
        if (v === 0 || v === undefined || v === 'G' || v === 'R' || v === 'J') {
          if (v === 'J') {
            seenJunk.add(k);
            if (!this.junkState.has(k)) { this.junkState.add(k); junkChanged = true; }
          }
          if (v === 'G') {
            seenHail.add(k);
            if (!this.hailState.has(k)) { this.hailState.add(k); this.hailFall.set(k, 0); hailChanged = true; }
          }
          if (v === 'R') {
            seenDrill.add(k);
            if (!this.drillState.has(k)) { this.drillState.add(k); drillChanged = true; }
          }
          continue;
        }
        seen.add(k);
        const cell = this.lockedState.get(k);
        if (!cell) {
          const p = cellToWorld(c, r);
          this.lockedState.set(k, { kind: v, tilt: (Math.random() - 0.5) * 0.05, x: p.x, y: p.y });
          changed = true;
        } else if (cell.kind !== v) {
          cell.kind = v;
          changed = true;
        }
      }
    }
    for (const k of this.lockedState.keys()) {
      if (!seen.has(k)) { this.lockedState.delete(k); changed = true; }
    }
    for (const k of this.hailState) {
      if (!seenHail.has(k)) {
        this.hailState.delete(k);
        this.hailFall.delete(k);
        this.burstHailMelt(k);
        hailChanged = true;
      }
    }
    for (const k of this.junkState) {
      if (!seenJunk.has(k)) { this.junkState.delete(k); junkChanged = true; }
    }
    if (changed) this.rebuildLocked();
    if (hailChanged) this.rebuildHail();
    if (drillChanged) this.rebuildDrill();
    if (junkChanged) this.rebuildJunk();
  }

  setActive(kind: PieceKind, cells: Vec2[], instant = false, special: string | null = null): void {
    // Powerup: es un objeto literal (💣/⚡/🔩), no una pieza. Sin bloques: solo
    // el sprite grande sobre su huella (el fantasma marca donde caera).
    if (special) {
      for (const s of this.activeSprings) this.recycleActiveSpring(s);
      this.activeSprings.length = 0;
      this.activeTargets.length = 0;
      this.activeGliding = false;
      this.updateSpecialIcon(special, cells);
      this.shadowDirty = true;
      return;
    }
    this.updateSpecialIcon(null, cells);
    // La pieza se sigue por BLOQUE (muelles con identidad estable), no por
    // clave de celda: `update()` integra los muelles y produce el
    // deslizamiento visible. El emparejamiento por cercanía evita que los
    // bloques se crucen al rotar.
    this.reconcileActive(cells, kind, instant);
    this.activeGliding = this.activeSprings.length > 0;
    this.shadowDirty = true;
  }

  /**
   * Núcleo de la animación fluida: mantiene un muelle por bloque de la pieza,
   * emparejado con su objetivo por cercanía (`matchByProximity`), con meshes
   * de un pool ciego al orden. Cada muelle HEREDA su velocidad: una ráfaga
   * DAS/ARR encadena el movimiento sin pararse en cada celda.
   * Teletransporte (spawn, hold, pieza nueva: objetivo a >3 celdas) = snap
   * exacto, sin vuelo; lo cercano desliza con el muelle.
   */
  private reconcileActive(cells: Vec2[], kind: PieceKind, instant: boolean): void {
    const targets = cells.map((c) => cellToWorld(c.x, c.y));
    const fromX = this.activeSprings.map((s) => s.x);
    const fromY = this.activeSprings.map((s) => s.y);
    const assign = matchByProximity(fromX, fromY, targets.map((t) => t.x), targets.map((t) => t.y));
    const owned = this.activeSprings.splice(0, this.activeSprings.length);
    const claimed = new Set<number>();
    const next: ActiveSpring[] = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i] ?? { x: 0, y: 0 };
      // El muelle más cercano al destino, con desempate a favor del greedy:
      // el deslizamiento encadenado (DAS/ARR) no se frena en cada celda.
      let best: ActiveSpring | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      let bestIdx = -1;
      for (let o = 0; o < owned.length; o++) {
        if (claimed.has(o)) continue;
        const m = owned[o];
        if (!m) continue;
        const pref = assign[o] === i ? -0.0001 : 0;
        const dx = m.x - t.x;
        const dy = m.y - t.y;
        const d = dx * dx + dy * dy + pref;
        if (d < bestD) { bestD = d; best = m; bestIdx = o; }
      }
      const s: ActiveSpring = best ?? this.takeActiveSpring(t.x, t.y);
      if (bestIdx >= 0) claimed.add(bestIdx);
      this.colorize(s.mesh, kind);
      if (!s.mesh.visible) s.mesh.visible = true;
      if (instant) {
        s.x = t.x; s.y = t.y; s.vx = 0; s.vy = 0;
      } else {
        const dx = s.x - t.x; const dy = s.y - t.y;
        if (dx * dx + dy * dy > TELEPORT_DIST_SQ) {
          // Teletransporte: la pieza nueva aparece en su celda, no vuela.
          s.x = t.x; s.y = t.y; s.vx = 0; s.vy = 0;
        }
      }
      s.mesh.position.set(s.x, s.y, 0.15);
      if (!this.activeGroup.children.includes(s.mesh)) this.activeGroup.add(s.mesh);
      this.activeTargets[i] = t;
      next.push(s);
    }
    // Sobrantes al pool (apagados pero con su velocidad guardada).
    for (let o = 0; o < owned.length; o++) {
      if (claimed.has(o)) continue;
      const m = owned[o];
      if (m) this.recycleActiveSpring(m);
    }
    this.activeSprings.push(...next);
    this.activeTargets.length = next.length;
  }

  /** Saca un muelle del pool (o lo crea) ya situado en su objetivo. */
  private takeActiveSpring(x: number, y: number): ActiveSpring {
    const s = this.activePool.pop();
    const mesh = this.makeBlock('I');
    this.activeGroup.add(mesh);
    mesh.position.set(x, y, 0.15);
    if (s) return { x, y, vx: 0, vy: 0, mesh };
    return { x, y, vx: 0, vy: 0, mesh };
  }

  /** Devuelve un muelle al pool: apaga el mesh pero conserva su velocidad. */
  private recycleActiveSpring(s: ActiveSpring): void {
    this.activeGroup.remove(s.mesh);
    this.pullFree.push(s.mesh);
    s.mesh.visible = false;
    this.activePool.push({ x: s.x, y: s.y, vx: s.vx, vy: s.vy });
  }
  /** El objeto literal del powerup: sprite grande centrado en su huella. */
  private updateSpecialIcon(special: string | null, cells: Vec2[]): void {
    if (!special || cells.length === 0) {
      if (this.specialIcon) this.specialIcon.visible = false;
      this.specialKind = null;
      return;
    }
    let tex = this.iconTex.get(special);
    if (!tex) {
      tex = specialIconTexture(SPECIAL_ICON[special] ?? '?');
      this.iconTex.set(special, tex);
    }
    if (!this.specialIcon) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false });
      this.specialIcon = new THREE.Sprite(mat);
      this.specialIcon.renderOrder = 30;
      this.group.add(this.specialIcon);
    } else {
      const mat = this.specialIcon.material as THREE.SpriteMaterial;
      mat.map = tex;
      mat.needsUpdate = true;
    }
    const f = this.footprint(cells);
    // El objeto cubre su huella con holgura: se ve como lo que es, no como pieza.
    if (this.specialKind !== special) {
      this.specialKind = special;
      this.specialClock = 0;
    }
    this.specialBaseScale = f.span + 0.6;
    this.specialBaseY = f.y;
    this.specialIcon.scale.setScalar(this.specialBaseScale);
    this.specialIcon.position.set(f.x, f.y, 1.6);
    this.specialIcon.visible = this.activeGroup.visible;
  }
  /** Centro (mundo) y tamaño de celda de la huella de un conjunto de celdas. */
  private footprint(cells: Vec2[]): { x: number; y: number; span: number } {
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const c of cells) {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
    const q = cellToWorld((minX + maxX) / 2, (minY + maxY) / 2);
    return { x: q.x, y: q.y, span: Math.max(maxX - minX + 1, maxY - minY + 1) };
  }
  /** Fantasma del powerup: el mismo emoji, translúcido, centrado en la huella de
   *  aterrizaje (guía propia e intuitiva, en vez de las cajas del tetromino). */
  private updateGhostSpecial(special: string | null, cells: Vec2[]): void {
    if (!special || cells.length === 0) {
      if (this.ghostSpecial) this.ghostSpecial.visible = false;
      return;
    }
    let tex = this.iconTex.get(special);
    if (!tex) {
      tex = specialIconTexture(SPECIAL_ICON[special] ?? '?');
      this.iconTex.set(special, tex);
    }
    if (!this.ghostSpecial) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.42, depthTest: false, depthWrite: false, fog: false });
      this.ghostSpecial = new THREE.Sprite(mat);
      this.ghostSpecial.renderOrder = 8; // sobre el fondo, bajo el icono activo (30)
      this.group.add(this.ghostSpecial);
    } else {
      const mat = this.ghostSpecial.material as THREE.SpriteMaterial;
      mat.map = tex;
      mat.needsUpdate = true;
    }
    const f = this.footprint(cells);
    this.ghostSpecial.scale.setScalar(f.span + 0.6);
    this.ghostSpecial.position.set(f.x, f.y, 0.15);
    this.ghostSpecial.visible = true;
  }
  setFog(on: boolean): void {
    if (on === this.fogOn) return;
    this.fogOn = on;
    if (on && !this.fogMesh) {
      const geo = new THREE.PlaneGeometry(BOARD_W + 1.4, BOARD_H / 2 + 0.6);
      const mat = new THREE.MeshBasicMaterial({ color: 0xf7efdb, transparent: true, opacity: 0.45, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, BOARD_H / 4 + 0.2, 2.6);
      mesh.renderOrder = 5;
      this.fogMesh = mesh;
      this.group.add(mesh);
    }
    if (this.fogMesh) this.fogMesh.visible = on;
    this.shadowDirty = true;
  }
  setGhost(cells: Vec2[], special: string | null = null): void {
    // Powerup: su guía es el icono translúcido sobre la huella, NO las cajas del
    // tetromino — así el fantasma corresponde al objeto que realmente cae.
    if (special) {
      for (const s of this.ghostSprings) this.recycleGhostSpring(s);
      this.ghostSprings.length = 0;
      this.ghostTargets.length = 0;
      this.ghostGliding = false;
      this.updateGhostSpecial(special, cells);
      return;
    }
    this.updateGhostSpecial(null, cells);
    // El fantasma también desliza: mismos muelles que la pieza (más rígidos),
    // emparejados por cercanía para que no se crucen al rotar.
    const targets = cells.map((c) => cellToWorld(c.x, c.y));
    const fromX = this.ghostSprings.map((s) => s.x);
    const fromY = this.ghostSprings.map((s) => s.y);
    const assign = matchByProximity(fromX, fromY, targets.map((t) => t.x), targets.map((t) => t.y));
    const owned = this.ghostSprings.splice(0, this.ghostSprings.length);
    const claimed = new Set<number>();
    const next: GhostSpring[] = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i] ?? { x: 0, y: 0 };
      let best: GhostSpring | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      let bestIdx = -1;
      for (let o = 0; o < owned.length; o++) {
        if (claimed.has(o)) continue;
        const m = owned[o];
        if (!m) continue;
        const pref = assign[o] === i ? -0.0001 : 0;
        const dx = m.x - t.x;
        const dy = m.y - t.y;
        const d = dx * dx + dy * dy + pref;
        if (d < bestD) { bestD = d; best = m; bestIdx = o; }
      }
      const s: GhostSpring = best ?? this.takeGhostSpring(t.x, t.y);
      if (bestIdx >= 0) claimed.add(bestIdx);
      if (!s.mesh.visible) s.mesh.visible = true;
      const dx = s.x - t.x; const dy = s.y - t.y;
      if (dx * dx + dy * dy > TELEPORT_DIST_SQ) {
        s.x = t.x; s.y = t.y; s.vx = 0; s.vy = 0;
      }
      s.mesh.position.set(s.x, s.y, -0.05);
      if (!this.ghostGroup.children.includes(s.mesh)) this.ghostGroup.add(s.mesh);
      this.ghostTargets[i] = t;
      next.push(s);
    }
    for (let o = 0; o < owned.length; o++) {
      if (claimed.has(o)) continue;
      const m = owned[o];
      if (m) this.recycleGhostSpring(m);
    }
    this.ghostSprings.push(...next);
    this.ghostTargets.length = next.length;
    this.ghostGliding = next.length > 0;
  }

  /** Saca un muelle fantasma del pool (o lo crea) ya situado en su objetivo. */
  private takeGhostSpring(x: number, y: number): GhostSpring {
    const mesh = this.ghostPool.pop() ?? this.makeGhostBlock();
    if (!this.ghostGroup.children.includes(mesh)) this.ghostGroup.add(mesh);
    mesh.visible = true;
    mesh.position.set(x, y, -0.05);
    return { x, y, vx: 0, vy: 0, mesh };
  }

  /** Devuelve un muelle fantasma al pool. */
  private recycleGhostSpring(s: GhostSpring): void {
    this.ghostGroup.remove(s.mesh);
    s.mesh.visible = false;
    this.ghostPool.push(s.mesh);
  }
  /**
   * Guía de la zona de impacto del powerup activo. `rows` (bomba) se pinta como
   * bandas completas; el resto, celda a celda. Es una capa aditiva sobre el
   * papel: comunica el efecto exacto antes de soltar la pieza.
   */
  setSpecialGuide(guide: { kind: string; rows: number[]; cells: Vec2[] } | null): void {
    if (!guide) {
      this.guideOn = false;
      this.guideIMesh.count = 0;
      return;
    }
    const mat = this.guideIMesh.material as THREE.MeshBasicMaterial;
    const color = guide.kind === 'bomb' ? 0xff7a2a : guide.kind === 'bolt' ? 0xffd21e : guide.kind === 'chatarra' ? 0xb08a5a : 0xff4d3d;
    mat.color.setHex(color);
    this.guideIMesh.count = 0;
    if (guide.kind === 'bomb' && guide.rows.length > 0) {
      for (const y of guide.rows) {
        for (let x = 0; x < COLS; x++) this.pushGuideCell(x, y);
      }
    } else {
      for (const c of guide.cells) this.pushGuideCell(c.x, c.y);
    }
    this.guideIMesh.instanceMatrix.needsUpdate = true;
    this.guideOn = this.guideIMesh.count > 0;
  }

  private pushGuideCell(x: number, y: number): void {
    if (y < 0 || y >= VISIBLE_ROWS) return;
    const p = cellToWorld(x, y);
    // Delante de los bloques (cara visible en z≈0.46): la marca se lee encima.
    scratchMatrix.makeTranslation(p.x, p.y, 0.52);
    this.guideIMesh.setMatrixAt(this.guideIMesh.count, scratchMatrix);
    this.guideIMesh.count++;
  }

  playLock(cells: Vec2[], kind: PieceKind): void {
    for (const c of cells) {
      if (c.y < 0 || c.y >= VISIBLE_ROWS) continue;
      const g = this.makeBlock(kind);
      const p = cellToWorld(c.x, c.y);
      g.position.set(p.x, p.y, 0.4);
      this.group.add(g);
      this.lockAnims.push({ mesh: g, t: 0, row: c.y });
      this.particles.burst(new THREE.Vector3(p.x, p.y, 0.5), PIECE_COLORS[kind], 6, 1.6, 1.2);
    }
    this.shadowDirty = true;
  }
  /**
   * Limpia las filas y devuelve las celdas que desaparecieron (mundo + tipo),
   * para que el render pueda lanzar escombros sin conocer el estado interno.
   * Con `launch: false` no crea bloques voladores y con `particles: false`
   * omite la ráfaga de scraps: los escombros sustituyen ambos efectos.
   */
  playClear(rows: number[], opts: ClearOptions = {}): ClearedCell[] {
    const launch = opts.launch ?? true;
    const spawnParticles = opts.particles ?? true;
    const cleared: ClearedCell[] = [];
    for (const r of rows) {
      const meshes: THREE.Group[] = [];
      // Materialize the row's instances as regular blocks so they can fly away.
      for (let c = 0; c < COLS; c++) {
        const k = this.key(c, r);
        if (this.junkState.has(k)) {
          const p = cellToWorld(c, r);
          cleared.push({ kind: 'J', x: p.x, y: p.y });
          if (launch) {
            const g = this.makeJunkBlock();
            g.position.set(p.x, p.y, 0);
            this.group.add(g);
            meshes.push(g);
          }
          this.junkState.delete(k);
          continue;
        }
        const cell = this.lockedState.get(k);
        if (!cell) continue;
        cleared.push({ kind: cell.kind, x: cell.x, y: cell.y });
        if (launch) {
          const g = this.makeBlock(cell.kind);
          g.position.set(cell.x, cell.y, 0);
          g.rotation.z = cell.tilt;
          this.group.add(g);
          meshes.push(g);
        }
        this.lockedState.delete(k);
      }
      // The piece that just locked is still animating in `lockAnims`: let those
      // blocks explode with the row instead of fading out on their own.
      for (let i = this.lockAnims.length - 1; i >= 0; i--) {
        const a = this.lockAnims[i];
        if (!a || a.row !== r) continue;
        const kind = (a.mesh.userData.kind as PieceKind | undefined) ?? 'I';
        cleared.push({ kind, x: a.mesh.position.x, y: a.mesh.position.y });
        if (launch) {
          meshes.push(a.mesh);
        } else {
          this.group.remove(a.mesh);
          this.pullFree.push(a.mesh);
          a.mesh.visible = false;
        }
        this.lockAnims.splice(i, 1);
      }
      // A second clear on the same row index while the first animates would
      // overwrite the entry and orphan its meshes: recycle them first.
      const prev = this.clearingRows.get(r);
      if (prev) for (const m of prev.meshes) { this.group.remove(m); this.pullFree.push(m); m.visible = false; }
      if (launch) this.clearingRows.set(r, { t: 0, meshes });
      else this.clearingRows.delete(r);
      // One scrap burst per block, tinted with the block's own color: the engine
      // grid has already collapsed when this runs, so it cannot be trusted.
      if (spawnParticles) {
        for (const m of meshes) {
          const kind = m.userData.kind as PieceKind | 'J' | undefined;
          const hex = kind === 'J' ? JUNK_COLOR : kind ? PIECE_COLORS[kind] : 0xffffff;
          this.particles.burst(new THREE.Vector3(m.position.x, m.position.y, 0.6), hex, 7, 3.2, 3.4);
        }
      }
    }
    this.rebuildLocked();
    this.rebuildJunk();
    return cleared;
  }
  /**
   * Muestra un texto flotante 3D sobre las filas limpiadas ("DOBLE", "TRIPLE",
   * "TETRIS") y opcionalmente "COMBO xN". El texto asciende y se desvanece.
   */
  showClearText(clearType: ClearType, rows: number[], comboCount: number): void {
    if (rows.length === 0) return;
    const cx = COLS / 2 - 0.5;
    const cy = Math.min(...rows) + rows.length / 2 - 0.5;
    const mat = this.clearTextMats.get(clearType);
    if (!mat) return;
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(cx, cy - VISIBLE_ROWS / 2 + 0.5, 1.2);
    // Tamaño mayor para TETRIS y COMBO.
    const baseScale = clearType === 'tetris' || comboCount >= 2 ? 1.1 : 0.9;
    sprite.scale.set(baseScale * 1.6, baseScale * 0.4, 1);
    sprite.visible = false; // se activa en el primer frame de update
    this.group.add(sprite);
    this.clearTexts.push({
      mesh: sprite,
      life: 0,
      maxLife: 1.4,
      vy: 1.6,
      startScale: baseScale,
    });
    // Si hay combo activo, añade un segundo texto "COMBO xN" un poco más arriba.
    if (comboCount >= 2) {
      const comboMat = this.clearTextMats.get('tetris'); // reusa color tetris para combo
      if (comboMat) {
        const csprite = new THREE.Sprite(comboMat);
        // Re-textura el canvas con "COMBO xN".
        const tex = clearTextTexture(`COMBO x${comboCount}`, CLEAR_TYPE_COLOR.tetris);
        (csprite.material as THREE.SpriteMaterial).map = tex;
        csprite.position.set(cx, cy - VISIBLE_ROWS / 2 + 1.6, 1.2);
        csprite.scale.set(1.3 * 1.6, 1.3 * 0.4, 1);
        csprite.visible = false;
        this.group.add(csprite);
        this.clearTexts.push({
          mesh: csprite,
          life: 0,
          maxLife: 1.4,
          vy: 1.6,
          startScale: 1.3,
        });
      }
    }
  }
  /** Advances animations; returns true when shadow-casting geometry moved. */
  update(dt: number): boolean {
    let moved = this.shadowDirty;
    this.shadowDirty = false;
    // Pieza activa: muelle crítico con velocidad heredada. Los pasos laterales
    // encadenados (DAS/ARR) fluyen como un deslizamiento tenso y continuo, sin
    // "teletransporte" entre celdas y sin sobrepasar el objetivo.
    if (this.activeSprings.length > 0) {
      const stiffness = ACTIVE_STIFFNESS;
      const damping = criticalDamping(stiffness);
      let gliding = false;
      for (let i = 0; i < this.activeSprings.length; i++) {
        const s = this.activeSprings[i];
        const t = this.activeTargets[i];
        if (!s || !t) continue;
        const px = s.x; const py = s.y;
        stepSpring(s, t.x, t.y, dt, stiffness, damping);
        s.mesh.position.set(s.x, s.y, 0.15);
        if (!isSettled(s, t.x, t.y)) {
          gliding = true;
          moved = true; // el bloque viaja: la sombra debe actualizarse
        } else {
          s.x = t.x; s.y = t.y; s.vx = 0; s.vy = 0;
          s.mesh.position.set(t.x, t.y, 0.15);
          // El snap final también mueve geometría con sombra (una vez).
          if (px !== t.x || py !== t.y) moved = true;
        }
      }
      this.activeGliding = gliding;
    }
    // Fantasma: mismos muelles, algo más rígidos (sigue a la pieza de cerca).
    if (this.ghostSprings.length > 0) {
      const stiffness = GHOST_STIFFNESS;
      const damping = criticalDamping(stiffness);
      let gliding = false;
      for (let i = 0; i < this.ghostSprings.length; i++) {
        const s = this.ghostSprings[i];
        const t = this.ghostTargets[i];
        if (!s || !t) continue;
        stepSpring(s, t.x, t.y, dt, stiffness, damping);
        s.mesh.position.set(s.x, s.y, -0.05);
        if (!isSettled(s, t.x, t.y)) gliding = true;
        else { s.x = t.x; s.y = t.y; s.vx = 0; s.vy = 0; s.mesh.position.set(t.x, t.y, -0.05); }
      }
      this.ghostGliding = gliding;
      if (gliding) moved = true;
    }
    if (this.lockAnims.length > 0) moved = true;
    for (let i = this.lockAnims.length - 1; i >= 0; i--) {
      const a = this.lockAnims[i];
      if (!a) continue;
      a.t += dt * 5;
      const k = Math.min(1, a.t);
      a.mesh.position.z = 0.4 * (1 - k);
      a.mesh.scale.setScalar(1 + 0.25 * Math.sin(k * Math.PI));
      if (k >= 1) { this.group.remove(a.mesh); this.pullFree.push(a.mesh); a.mesh.visible = false; this.lockAnims.splice(i, 1); }
    }
    if (this.clearingRows.size > 0) moved = true;
    for (const [r, c] of this.clearingRows) {
      c.t += dt * 4;
      const k = Math.min(1, c.t);
      for (let i = 0; i < c.meshes.length; i++) {
        const m = c.meshes[i] as THREE.Group;
        m.position.x += Math.sin(i * 3.1 + r) * dt * 6;
        m.position.y += dt * (4 + i * 0.2);
        m.rotation.z += dt * 6;
        m.scale.setScalar(Math.max(0.001, 1 - k));
      }
      if (k >= 1) {
        for (const m of c.meshes) { this.group.remove(m); this.pullFree.push(m); m.visible = false; }
        this.clearingRows.delete(r);
      }
    }
    // Textos flotantes de bonificación: ascienden, hacen pop inicial y se desvanecen.
    if (this.clearTexts.length > 0) {
      moved = true;
      let alive = 0;
      for (let i = 0; i < this.clearTexts.length; i++) {
        const t = this.clearTexts[i];
        if (!t) continue;
        const m = t.mesh;
        if (!m) continue;
        t.life += dt / t.maxLife;
        const k = Math.min(1, t.life);
        // Pop inicial: 0 → 1.25 → 1 en el primer 20 % de la vida.
        const pop = k < 0.2 ? (k / 0.2) * 1.25 : 1.25 - (k - 0.2) / 0.8 * 0.25;
        m.scale.setScalar(t.startScale * pop * 1.6);
        m.position.y += t.vy * dt;
        const a = (t.mesh.material as THREE.SpriteMaterial);
        a.opacity = Math.max(0, 1 - k);
        m.visible = k < 1;
        if (k < 1) {
          this.clearTexts[alive++] = t;
        } else {
          this.group.remove(m);
          m.visible = false;
        }
      }
      this.clearTexts.length = alive;
    }
    this.fxClock += dt;
    // Guía del powerup: pulso lento de opacidad (avisa de la zona del efecto).
    if (this.guideOn) {
      const gmat = this.guideIMesh.material as THREE.MeshBasicMaterial;
      gmat.opacity = 0.34 + 0.16 * (0.5 + 0.5 * Math.sin(this.fxClock * 6));
    }
    // Icono del powerup: flota, late y gira (el taladro rota como una broca).
    if (this.specialIcon?.visible) {
      this.specialClock += dt;
      this.specialIcon.position.y = this.specialBaseY + Math.sin(this.specialClock * 5) * 0.16;
      this.specialIcon.scale.setScalar(this.specialBaseScale * (1 + 0.045 * Math.sin(this.specialClock * 7)));
      const smat = this.specialIcon.material as THREE.SpriteMaterial;
      smat.rotation = this.specialKind === 'drill' ? this.specialClock * 2.6 : Math.sin(this.specialClock * 3) * 0.14;
    }
    if (this.ghostSpecial?.visible) {
      const gmat = this.ghostSpecial.material as THREE.SpriteMaterial;
      gmat.opacity = 0.3 + 0.16 * (0.5 + 0.5 * Math.sin(this.fxClock * 4));
    }
    // Granizo: caída desde el cielo, impacto y brillo de hielo.
    if (this.hailFall.size > 0) {
      for (const [k, t] of this.hailFall) {
        const nt = t + dt / 0.42;
        if (nt >= 1) {
          this.hailFall.delete(k);
          const col = k % COLS;
          const row = Math.floor(k / COLS);
          const p = cellToWorld(col, row);
          this.particles.burst(new THREE.Vector3(p.x, p.y + 0.3, 0.7), 0xdcefff, 6, 2.4, 2.2);
        } else {
          this.hailFall.set(k, nt);
        }
      }
      this.rebuildHail();
      moved = true;
    }
    if (this.hailState.size > 0) {
      const hmat = this.hailIMesh.material as THREE.MeshToonMaterial;
      hmat.emissiveIntensity = 0.16 + 0.16 * (0.5 + 0.5 * Math.sin(this.fxClock * 3));
    }
    this.particles.update(dt);
    return moved;
  }
  get busyClearing(): boolean { return this.clearingRows.size > 0; }
  /** Animaciones de deslizamiento activas: la app fuerza un render aunque no haya cambio lógico. */
  get animating(): boolean {
    return this.activeGliding || this.ghostGliding || this.guideOn || this.hailFall.size > 0 || this.hailState.size > 0
      || (this.specialIcon?.visible ?? false) || (this.ghostSpecial?.visible ?? false)
      || this.clearTexts.length > 0;
  }
  reset(): void {
    const recycle = (g: THREE.Group): void => {
      this.group.remove(g); this.pullFree.push(g); g.visible = false;
    };
    this.lockedState.clear();
    this.rebuildLocked();
    this.hailState.clear();
    this.rebuildHail();
    this.drillState.clear();
    this.rebuildDrill();
    this.junkState.clear();
    this.rebuildJunk();
    this.guideOn = false;
    this.guideIMesh.count = 0;
    this.hailFall.clear();
    this.specialKind = null;
    // Meshes mid clear/lock animation are no longer in `lockedState`: without
    // this they would stay in the scene forever after a restart.
    for (const [, c] of this.clearingRows) for (const m of c.meshes) recycle(m);
    this.clearingRows.clear();
    for (const a of this.lockAnims) recycle(a.mesh);
    this.lockAnims.length = 0;
    this.activeGroup.visible = true;
    if (this.specialIcon) this.specialIcon.visible = false;
    if (this.ghostSpecial) this.ghostSpecial.visible = false;
    this.setFog(false);
    this.activePool.length = 0;
    for (const s of this.activeSprings) this.recycleActiveSpring(s);
    this.activeSprings.length = 0;
    this.activeTargets.length = 0;
    this.activeGliding = false;
    for (const s of this.ghostSprings) this.recycleGhostSpring(s);
    this.ghostSprings.length = 0;
    this.ghostTargets.length = 0;
    this.ghostGliding = false;
    this.ghostPool.length = 0;
    this.activeGroup.clear();
    this.ghostGroup.clear();
    // Reciclar textos flotantes pendientes.
    for (const t of this.clearTexts) { this.group.remove(t.mesh); t.mesh.visible = false; }
    this.clearTexts.length = 0;
    this.shadowDirty = true;
  }
}
