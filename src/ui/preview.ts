import { PIECE_COLORS } from '../game/types.js';
import type { PieceKind } from '../game/types.js';
import type { SpecialKind } from '../game/engine.js';
import { cellsForRotation } from '../game/pieces.js';
const INK = '#3b2b20';
/** Deterministic micro-tilt per tile so periodic redraws never flicker. */
function tiltFor(kind: PieceKind, i: number): number {
  let h = i * 17;
  for (let k = 0; k < kind.length; k++) h = (h * 31 + kind.charCodeAt(k)) % 97;
  return ((h % 5) - 2) * 0.022;
}
interface Rect { x: number; y: number; w: number; h: number }
/**
 * Cell size for a `pw x ph` piece inside `rect`: the `rect.h / 2.5` cap keeps
 * 1-row pieces (I) from dwarfing the 2-row ones in the queue.
 */
function fitCell(pw: number, ph: number, rect: Rect): number {
  return Math.min((rect.w - 18) / pw, (rect.h - 18) / ph, rect.h / 2.5);
}
/** El powerup literal: el objeto (💣/⚡/🔩) en grande, nunca la forma del tetromino. */
function drawSpecialObject(ctx: CanvasRenderingContext2D, rect: Rect, special: string): void {
  const size = Math.round(Math.min(rect.w, rect.h) * 0.58);
  ctx.save();
  ctx.font = size + 'px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Sombra suave de recorte: el objeto "flota" sobre el papel.
  ctx.shadowColor = 'rgba(30,20,12,0.4)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  ctx.fillText(SPECIAL_EMOJI[special] ?? '?', rect.x + rect.w / 2, rect.y + rect.h / 2 + 10);
  ctx.restore();
}

function drawPieceIn(ctx: CanvasRenderingContext2D, kind: PieceKind | null, rect: Rect, ghost = false): void {
  ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
  if (!kind) {
    ctx.fillStyle = 'rgba(59,43,32,0.45)';
    ctx.font = '600 16px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('—', rect.x + rect.w / 2, rect.y + rect.h / 2 + 5);
    return;
  }
  const cells = cellsForRotation(kind, 0);
  let minX = 99, maxX = -99, minY = 99, maxY = -99;
  for (const c of cells) { minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y); }
  const pw = maxX - minX + 1; const ph = maxY - minY + 1;
  const s = fitCell(pw, ph, rect);
  const ox = rect.x + rect.w / 2 - (pw * s) / 2;
  const oy = rect.y + rect.h / 2 - (ph * s) / 2;
  const hex = '#' + PIECE_COLORS[kind].toString(16).padStart(6, '0');
  cells.forEach((c, i) => {
    const x = ox + (c.x - minX) * s;
    const y = oy + (maxY - c.y) * s;
    const r = 5;
    ctx.save();
    ctx.translate(x + s / 2, y + s / 2);
    ctx.rotate(tiltFor(kind, i));
    ctx.translate(-(x + s / 2), -(y + s / 2));
    // lifted-paper drop shadow
    ctx.fillStyle = 'rgba(59,43,32,0.25)';
    ctx.beginPath(); ctx.roundRect(x + 2.5, y + 3.5, s - 4, s - 4, r); ctx.fill();
    if (ghost) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.roundRect(x + 1, y + 1, s - 4, s - 4, r); ctx.fill();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(59,43,32,0.8)';
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = hex;
      ctx.beginPath(); ctx.roundRect(x + 1, y + 1, s - 4, s - 4, r); ctx.fill();
      // inner pasted paper panel
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.beginPath(); ctx.roundRect(x + 5, y + 5, s - 12, s - 12, 3); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.roundRect(x + 1, y + 1, s - 4, s - 4, r); ctx.stroke();
    }
    ctx.restore();
  });
}
const SPECIAL_BADGE: Record<string, { color: string; label: string }> = {
  bomb: { color: '#e04e39', label: '💣 BOMBA · 2 FILAS' },
  bolt: { color: '#ffd23f', label: '⚡ RAYO · 4 BLOQUES' },
  drill: { color: '#f2953a', label: '🔩 TALADRO · 2 FILAS' }
};
const SPECIAL_EMOJI: Record<string, string> = { bomb: '💣', bolt: '⚡', drill: '🔩' };
/** Chip con el nombre/emoji del especial sobre la primera ranura del preview. */
function drawSpecialBadge(ctx: CanvasRenderingContext2D, rect: Rect, special: SpecialKind): void {
  const info = SPECIAL_BADGE[special];
  if (!info) return;
  const w = Math.min(rect.w - 10, 168);
  const h = 22;
  const x = rect.x + (rect.w - w) / 2;
  const y = rect.y + 6;
  ctx.save();
  ctx.fillStyle = info.color;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 7); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(info.label, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}
/** Next-queue preview: up to 3 upcoming pieces, the closest one in the big slot. */
export function drawNext(canvas: HTMLCanvasElement, kinds: PieceKind[], special: SpecialKind | null = null): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const shown = kinds.slice(0, 3);
  if (shown.length === 0) {
    drawPieceIn(ctx, null, { x: 0, y: 0, w: canvas.width, h: canvas.height });
    return;
  }
  const firstH = shown.length === 1 ? canvas.height : canvas.height * 0.4;
  const restH = shown.length > 1 ? (canvas.height - firstH) / (shown.length - 1) : 0;
  shown.forEach((kind, i) => {
    const rect = i === 0
      ? { x: 0, y: 0, w: canvas.width, h: firstH }
      : { x: 0, y: firstH + (i - 1) * restH, w: canvas.width, h: restH };
    if (i === 0 && special) drawSpecialObject(ctx, rect, special);
    else drawPieceIn(ctx, kind, rect);
    if (i === 0 && special) drawSpecialBadge(ctx, rect, special);
  });
}
export function drawHold(canvas: HTMLCanvasElement, kind: PieceKind | null, canHold: boolean, special: SpecialKind | null = null): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rect = { x: 0, y: 0, w: canvas.width, h: canvas.height };
  if (kind && special) drawSpecialObject(ctx, rect, special);
  else drawPieceIn(ctx, kind, rect, !canHold);
  if (kind && special) drawSpecialBadge(ctx, rect, special);
}
/** Standalone piece icon used by the help screen. */
export function drawPieceIcon(canvas: HTMLCanvasElement, kind: PieceKind): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  drawPieceIn(ctx, kind, { x: 0, y: 0, w: canvas.width, h: canvas.height });
}
