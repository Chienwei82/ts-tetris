/**
 * Verificación de ergonomía del layout táctil (fuera del bundle).
 * Mide las cajas de los botones y del tablero y comprueba:
 *  - HOLD aislada ARRIBA y sin solapar ⇊ (barrido seguro hacia el hard drop).
 *  - ⇊ en la esquina inferior derecha, grande.
 *  - ◀/▶ grandes; jerarquía de tamaños por frecuencia.
 *  - Sin solapes entre botones vecinos.
 * Uso: node tools/touch-layout-check.mjs  (con preview en :4173)
 */
import { chromium } from 'playwright';

const BASE = process.env.SHOT_URL ?? 'http://localhost:4173';
const IDS = ['tc-hold', 'tc-drop', 'tc-left', 'tc-right', 'tc-ccw', 'tc-cw'];

async function measure(page) {
  const boxes = {};
  for (const id of IDS) {
    const b = await page.locator('#' + id).boundingBox();
    boxes[id] = b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
  }
  const canvas = await page.locator('#scene').boundingBox();
  boxes.__canvas = canvas ? { x: Math.round(canvas.x), y: Math.round(canvas.y), w: Math.round(canvas.width), h: Math.round(canvas.height) } : null;
  return boxes;
}

function overlap(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function report(name, boxes, vp) {
  const { 'tc-hold': hold, 'tc-drop': drop, 'tc-left': left, 'tc-right': right, 'tc-ccw': ccw, 'tc-cw': cw } = boxes;
  const checks = [];
  // HOLD aislada: su borde inferior está por encima del borde superior de ⇊ con holgura.
  if (hold && drop) {
    const gap = drop.y - (hold.y + hold.h);
    checks.push([`HOLD⇊ aislados (gap vertical ${gap}px ≥ 20px)`, gap >= 20]);
    // ⇊ en la esquina inferior derecha del VIEWPORT (con margen safe-area ≤ 40px).
    const rightGap = vp.width - (drop.x + drop.w);
    const bottomGap = vp.height - (drop.y + drop.h);
    checks.push([`⇊ en la esquina inf-der (margen der ${rightGap}px, abajo ${bottomGap}px ≤ 40)`, rightGap <= 40 && bottomGap <= 40]);
  }
  if (hold && drop && left && right && ccw && cw) {
    // Jerarquía por frecuencia: hard drop ≥ mover > rotar > hold.
    checks.push([`⇊ es el target más grande`, drop.w >= left.w && drop.w >= ccw.w && drop.w >= hold.w]);
    checks.push([`◀/▶ más grandes que ↺/↻ y que HOLD`, left.w >= ccw.w && left.w > hold.w]);
    checks.push([`↺/↻ mayores que HOLD (acciones de juego > reserva)`, ccw.w > hold.w]);
    checks.push([`targets táctiles cómodos (≥ 40px en todos)`, Math.min(hold.w, drop.w, left.w, right.w, ccw.w, cw.w) >= 40]);
  }
  // Sin solapes entre pares vecinos.
  const pairs = [['tc-hold', 'tc-drop'], ['tc-left', 'tc-right'], ['tc-ccw', 'tc-cw'], ['tc-left', 'tc-ccw'], ['tc-right', 'tc-cw']];
  for (const [a, b] of pairs) checks.push([`sin solape ${a}/${b}`, !overlap(boxes[a], boxes[b])]);
  const ok = checks.every(([, pass]) => pass);
  console.log(`\n=== ${name} (viewport ${vp.width}×${vp.height}) ===`);
  for (const [label, pass] of checks) console.log(` ${pass ? '✓' : '✗'} ${label}`);
  console.log(`  tamaños: hold=${hold?.w} drop=${drop?.w} left=${left?.w} right=${right?.w} ccw=${ccw?.w} cw=${cw?.w}`);
  return ok;
}

const browser = await chromium.launch();
let allOk = true;
try {
  for (const { name, viewport } of [
    { name: 'mobile-portrait 390×844', viewport: { width: 390, height: 844 } },
    { name: 'mobile-landscape 844×390', viewport: { width: 844, height: 390 } },
    { name: 'small-portrait 320×568', viewport: { width: 320, height: 568 } },
  ]) {
    const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
    await ctx.addInitScript(() => { localStorage.setItem('tetris-3d:controls', 'touch'); localStorage.setItem('tetris-3d:fx', '1'); localStorage.setItem('tetris-3d:music', '0'); });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForSelector('#btn-help-close', { state: 'visible' });
    await page.click('#btn-help-close', { force: true });
    await page.click('#btn-start', { force: true });
    await page.waitForTimeout(400);
    // Forzar que los controles táctiles estén visibles por si la detección difiere.
    await page.evaluate(() => { document.getElementById('touch-controls')?.classList.remove('hidden'); });
    const boxes = await measure(page);
    allOk = report(name, boxes, viewport) && allOk;
    await page.screenshot({ path: new URL('../docs/screenshots/_touch-check-' + viewport.width + 'x' + viewport.height + '.png', import.meta.url).pathname, fullPage: false });
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(allOk ? '\n✅ Layout táctil OK en todos los viewports' : '\n❌ Revisar checks fallidos');
process.exit(allOk ? 0 : 1);
