import * as THREE from 'three';
import { ALL_KINDS, COLS, PIECE_COLORS, VISIBLE_ROWS } from '../game/types.js';
import type { Grid, PieceKind, Vec2 } from '../game/types.js';
import { BOARD_D, BOARD_H, BOARD_W, cellToWorld } from './constants.js';
import { INK, blockMaterial, cardboardMaterial, graphPaperMaterial, outlineMaterial, tapeMaterial } from './materials.js';
import { ParticleSystem } from './particles.js';
const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false });
const ghostEdgeMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.7 });
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
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const scratchMatrix = new THREE.Matrix4();
const scratchQuat = new THREE.Quaternion();
const scratchPos = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
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
  private seenScratch = new Set<number>();
  private activeGroup = new THREE.Group();
  private ghostGroup = new THREE.Group();
  private clearingRows = new Map<number, { t: number; meshes: THREE.Group[] }>();
  private lockAnims: { mesh: THREE.Group; t: number; row: number }[] = [];
  private activeMeshes = new Map<number, THREE.Group>();
  private activeTarget = new Map<number, THREE.Vector3>();
  private pullFree: THREE.Group[] = [];
  /** True when shadow-casting geometry changed since the last `update()`. */
  private shadowDirty = true;
  constructor(scene: THREE.Scene) {
    this.buildFrame();
    this.buildLockedMeshes();
    this.group.add(this.activeGroup, this.ghostGroup);
    this.group.add(this.particles.points);
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
    mesh.material = blockMaterial(kind);
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
      new THREE.LineBasicMaterial({ color: INK })
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
    let changed = false;
    for (let r = 0; r < VISIBLE_ROWS; r++) {
      const row = grid[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const v = row[c] as PieceKind | 0;
        if (v === 0 || v === undefined) continue;
        const k = this.key(c, r);
        seen.add(k);
        const cell = this.lockedState.get(k);
        if (!cell) {
          const p = cellToWorld(c, r);
          // hand-placed paper: tiny random tilt per locked tile
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
    if (changed) this.rebuildLocked();
  }

  setActive(kind: PieceKind, cells: Vec2[], instant = false): void {
    const wanted = new Map<number, Vec2>();
    for (const c of cells) wanted.set(this.key(c.x, c.y), c);
    // Remove meshes whose cell no longer exists (Map iteration tolerates deletes).
    for (const [k, m] of this.activeMeshes) {
      if (!wanted.has(k)) {
        this.activeGroup.remove(m);
        this.pullFree.push(m);
        m.visible = false;
        this.activeMeshes.delete(k);
        this.activeTarget.delete(k);
      }
    }
    // Add / update meshes keyed by cell so blocks track their own target.
    for (const [k, c] of wanted) {
      let m = this.activeMeshes.get(k);
      if (!m) {
        m = this.makeBlock(kind);
        this.activeGroup.add(m);
        this.activeMeshes.set(k, m);
      } else if (m.userData.kind !== kind) this.colorize(m, kind);
      const p = cellToWorld(c.x, c.y);
      const target = new THREE.Vector3(p.x, p.y, 0.15);
      this.activeTarget.set(k, target);
      if (instant) m.position.copy(target);
      else if (m.position.lengthSq() === 0) m.position.copy(target);
    }
    this.shadowDirty = true;
  }
  setGhost(cells: Vec2[]): void {
    while (this.ghostGroup.children.length > cells.length) {
      const m = this.ghostGroup.children.pop() as THREE.Group;
      if (m) this.ghostGroup.remove(m);
    }
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i] as Vec2;
      let m = this.ghostGroup.children[i] as THREE.Group | undefined;
      if (!m) {
        m = new THREE.Group();
        const mesh = new THREE.Mesh(this.ghostGeo, ghostMat);
        const edge = new THREE.LineSegments(this.ghostEdgeGeo, ghostEdgeMat);
        m.add(mesh, edge);
        this.ghostGroup.add(m);
      }
      const p = cellToWorld(c.x, c.y);
      m.position.set(p.x, p.y, -0.05);
    }
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
  playClear(rows: number[]): void {
    for (const r of rows) {
      const meshes: THREE.Group[] = [];
      // Materialize the row's instances as regular blocks so they can fly away.
      for (let c = 0; c < COLS; c++) {
        const k = this.key(c, r);
        const cell = this.lockedState.get(k);
        if (!cell) continue;
        const g = this.makeBlock(cell.kind);
        g.position.set(cell.x, cell.y, 0);
        g.rotation.z = cell.tilt;
        this.group.add(g);
        meshes.push(g);
        this.lockedState.delete(k);
      }
      // The piece that just locked is still animating in `lockAnims`: let those
      // blocks explode with the row instead of fading out on their own.
      for (let i = this.lockAnims.length - 1; i >= 0; i--) {
        const a = this.lockAnims[i];
        if (!a || a.row !== r) continue;
        meshes.push(a.mesh);
        this.lockAnims.splice(i, 1);
      }
      // A second clear on the same row index while the first animates would
      // overwrite the entry and orphan its meshes: recycle them first.
      const prev = this.clearingRows.get(r);
      if (prev) for (const m of prev.meshes) { this.group.remove(m); this.pullFree.push(m); m.visible = false; }
      this.clearingRows.set(r, { t: 0, meshes });
      // One scrap burst per block, tinted with the block's own color: the engine
      // grid has already collapsed when this runs, so it cannot be trusted.
      for (const m of meshes) {
        const kind = m.userData.kind as PieceKind | undefined;
        const hex = kind ? PIECE_COLORS[kind] : 0xffffff;
        this.particles.burst(new THREE.Vector3(m.position.x, m.position.y, 0.6), hex, 7, 3.2, 3.4);
      }
    }
    this.rebuildLocked();
  }
  /** Advances animations; returns true when shadow-casting geometry moved. */
  update(dt: number): boolean {
    let moved = this.shadowDirty;
    this.shadowDirty = false;
    const speed = 1 - Math.pow(0.0001, dt);
    for (const [k, g] of this.activeMeshes) {
      const t = this.activeTarget.get(k);
      if (!t) continue;
      g.position.lerp(t, Math.min(1, speed * 1.4));
      if (g.position.distanceToSquared(t) > 1e-6) moved = true;
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
    this.particles.update(dt);
    return moved;
  }
  get busyClearing(): boolean { return this.clearingRows.size > 0; }
  reset(): void {
    const recycle = (g: THREE.Group): void => {
      this.group.remove(g); this.pullFree.push(g); g.visible = false;
    };
    this.lockedState.clear();
    this.rebuildLocked();
    // Meshes mid clear/lock animation are no longer in `lockedState`: without
    // this they would stay in the scene forever after a restart.
    for (const [, c] of this.clearingRows) for (const m of c.meshes) recycle(m);
    this.clearingRows.clear();
    for (const a of this.lockAnims) recycle(a.mesh);
    this.lockAnims.length = 0;
    this.activeTarget.clear();
    for (const [, m] of this.activeMeshes) recycle(m);
    this.activeMeshes.clear();
    this.activeGroup.clear();
    this.ghostGroup.clear();
    this.shadowDirty = true;
  }
}
