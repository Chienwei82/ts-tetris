import * as THREE from 'three';
import { PIECE_COLORS } from '../game/types.js';
import type { PieceKind } from '../game/types.js';

/** Ink-brown used for hand-drawn cut-out outlines. */
export const INK = 0x3b2b20;

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');
  return { c, ctx };
}

function toTexture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  return tex;
}

/** Random light/dark specks that read as paper fibres. */
function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(60,40,20,0.06)' : 'rgba(255,255,255,0.10)';
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

/* Paper tile (block faces): lighter frame + halftone inner panel. */
const tile = makeCanvas(256, 256);
{
  const { ctx } = tile;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  // inner "pasted" panel -> leaves a lighter paper frame on every face
  ctx.fillStyle = '#ddd5c4';
  ctx.fillRect(20, 20, 216, 216);
  // soft shadow beneath the top frame edge (layered paper)
  const grad = ctx.createLinearGradient(0, 20, 0, 64);
  grad.addColorStop(0, 'rgba(40,25,10,0.16)');
  grad.addColorStop(1, 'rgba(40,25,10,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(20, 20, 216, 44);
  // halftone dots (comic shading, Color Splash style)
  ctx.fillStyle = 'rgba(40,25,10,0.06)';
  for (let y = 30; y < 230; y += 11) {
    for (let x = 30; x < 230; x += 11) {
      ctx.beginPath();
      ctx.arc(x, y, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  speckle(ctx, 256, 256, 700);
}
const paperTileTex = toTexture(tile.c);

/* Cardboard (frame bars / stage platform). */
const card = makeCanvas(256, 256);
{
  const { ctx } = card;
  ctx.fillStyle = '#c08a58';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 14) {
    ctx.fillStyle = 'rgba(110,68,34,0.12)';
    ctx.fillRect(0, y, 256, 3);
  }
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = Math.random() < 0.55 ? 'rgba(96,60,28,0.18)' : 'rgba(255,235,205,0.16)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
}
const cardboardTex = toTexture(card.c);

/* Graph-paper backing sheet (1 cell = 1 world unit). */
const graph = makeCanvas(200, 400);
{
  const { ctx } = graph;
  ctx.fillStyle = '#f8f1e0';
  ctx.fillRect(0, 0, 200, 400);
  ctx.strokeStyle = 'rgba(96,124,166,0.35)';
  ctx.lineWidth = 1;
  for (let x = 20; x < 200; x += 20) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, 400); ctx.stroke();
  }
  for (let y = 20; y < 400; y += 20) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(200, y + 0.5); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(96,124,166,0.6)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75, 0.75, 198.5, 398.5);
  speckle(ctx, 200, 400, 500);
}
const graphTex = toTexture(graph.c);

/* Washi tape (diagonal stripes tinted per material colour). */
const tape = makeCanvas(128, 128);
{
  const { ctx } = tape;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.save();
  ctx.translate(64, 64);
  ctx.rotate(-Math.PI / 4);
  for (let x = -100; x < 100; x += 24) {
    ctx.fillStyle = 'rgba(40,25,10,0.18)';
    ctx.fillRect(x, -100, 12, 200);
  }
  ctx.restore();
}
const tapeTex = toTexture(tape.c);

/* Generic paper-noise texture (ground / large surfaces). */
export const paperNoiseTex: THREE.CanvasTexture = (() => {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 300; i++) {
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(120,100,70,0.07)' : 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 24, y + (Math.random() - 0.5) * 6);
    ctx.stroke();
  }
  speckle(ctx, 256, 256, 1600);
  return toTexture(c, true);
})();

/** Question block face texture (Mario voxel floater). */
let questionTex: THREE.CanvasTexture | null = null;
export function questionBlockTexture(): THREE.CanvasTexture {
  if (questionTex) return questionTex;
  const { c, ctx } = makeCanvas(128, 128);
  ctx.fillStyle = '#f7b733';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#c07f1c';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 118, 118);
  const rivets: Array<[number, number]> = [[24, 24], [104, 24], [24, 104], [104, 104]];
  for (const [rx, ry] of rivets) {
    ctx.beginPath();
    ctx.arc(rx, ry, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe08a';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#8a5a12';
    ctx.stroke();
  }
  ctx.font = 'bold 76px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 9;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#3b2b20';
  ctx.strokeText('?', 64, 68);
  ctx.fillStyle = '#fff6e0';
  ctx.fillText('?', 64, 68);
  questionTex = toTexture(c);
  return questionTex;
}

/** 4-step gradient for flat, cartoon paper shading. */
export const toonGradient = (() => {
  const steps = new Uint8Array([120, 176, 224, 255]);
  const tex = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

const blockCache = new Map<PieceKind, THREE.MeshToonMaterial>();
export function blockMaterial(kind: PieceKind): THREE.MeshToonMaterial {
  let m = blockCache.get(kind);
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color: PIECE_COLORS[kind],
      map: paperTileTex,
      gradientMap: toonGradient,
      emissive: PIECE_COLORS[kind],
      emissiveIntensity: 0.13
    });
    blockCache.set(kind, m);
  }
  return m;
}

/** Shared ink hull rendered as inverted outline (cut-out edge). */
const inkOutline = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
export function outlineMaterial(): THREE.MeshBasicMaterial {
  return inkOutline;
}

const cardboardMat = new THREE.MeshStandardMaterial({ map: cardboardTex, color: 0xffffff, roughness: 1, metalness: 0 });
export function cardboardMaterial(): THREE.MeshStandardMaterial {
  return cardboardMat;
}

const graphMat = new THREE.MeshStandardMaterial({ map: graphTex, color: 0xffffff, roughness: 1, metalness: 0 });
export function graphPaperMaterial(): THREE.MeshStandardMaterial {
  return graphMat;
}

const tapeCache = new Map<number, THREE.MeshBasicMaterial>();
export function tapeMaterial(color: number): THREE.MeshBasicMaterial {
  let m = tapeCache.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: tapeTex, color, transparent: true, opacity: 0.92,
      depthWrite: false, side: THREE.DoubleSide
    });
    tapeCache.set(color, m);
  }
  return m;
}

