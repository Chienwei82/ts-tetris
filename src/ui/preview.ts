import { PIECE_COLORS } from '../game/types.js';
import type { PieceKind } from '../game/types.js';
import { cellsForRotation } from '../game/pieces.js';
const INK = '#3b2b20';
/** Deterministic micro-tilt per tile so periodic redraws never flicker. */
function tiltFor(kind: PieceKind, i: number): number {
  let h = i * 17;
  for (let k = 0; k < kind.length; k++) h = (h * 31 + kind.charCodeAt(k)) % 97;
  return ((h % 5) - 2) * 0.022;
}
function drawPiece(canvas: HTMLCanvasElement, kind: PieceKind | null, ghost = false): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width; const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!kind) {
    ctx.fillStyle = 'rgba(59,43,32,0.45)';
    ctx.font = '600 16px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('—', W / 2, H / 2 + 5);
    return;
  }
  const cells = cellsForRotation(kind, 0);
  let minX = 99, maxX = -99, minY = 99, maxY = -99;
  for (const c of cells) { minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y); }
  const pw = maxX - minX + 1; const ph = maxY - minY + 1;
  const s = Math.min((W - 18) / pw, (H - 18) / ph);
  const ox = W / 2 - ((pw * s) / 2);
  const oy = H / 2 - ((ph * s) / 2);
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
export function drawNext(canvas: HTMLCanvasElement, kinds: PieceKind[]): void {
  drawPiece(canvas, kinds[0] ?? null);
}
export function drawHold(canvas: HTMLCanvasElement, kind: PieceKind | null, canHold: boolean): void {
  drawPiece(canvas, kind, !canHold);
}
