/**
 * Captura de pantallas para el README (fuera del bundle).
 *
 * Requiere `playwright` instalado localmente (no es dependencia del proyecto):
 *   npm i --no-save playwright && npx playwright install chromium
 *
 * Uso (con el preview de producción ya servido en :4173):
 *   npm run build && npm run preview &
 *   node tools/screenshots.mjs
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.SHOT_URL ?? 'http://localhost:4173';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;

/** Cierra la ayuda, empieza la partida y deja el tablero en un estado creíble. */
async function play(page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#btn-help-close', { state: 'visible' });
  // `force` porque las tarjetas flotan (animación CSS) y Playwright las ve inestables.
  await page.click('#btn-help-close', { force: true });
  await page.click('#btn-start', { force: true });
  await page.waitForTimeout(500);
  // Unas cuantas piezas colocadas a mano para que se vea una partida real.
  const keys = [
    'ArrowLeft', 'Space', 'ArrowRight', 'Space', 'ArrowUp', 'Space',
    'ArrowLeft', 'ArrowLeft', 'Space', 'ArrowRight', 'ArrowUp', 'Space', 'Space'
  ];
  for (const k of keys) {
    await page.keyboard.press(k);
    await page.waitForTimeout(160);
  }
  await page.waitForTimeout(800);
}

async function shot(browser, { name, viewport, deviceScaleFactor = 1, isMobile = false }) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor,
    isMobile,
    hasTouch: isMobile,
    reducedMotion: 'no-preference'
  });
  await ctx.addInitScript((mode) => {
    localStorage.setItem('tetris-3d:controls', mode);
    localStorage.setItem('tetris-3d:fx', '1');
    localStorage.setItem('tetris-3d:music', '0');
  }, isMobile ? 'touch' : 'desktop');
  const page = await ctx.newPage();
  await play(page);
  await page.screenshot({ path: OUT + name, type: 'jpeg', quality: 85 });
  await ctx.close();
  console.log('✓', name);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  await shot(browser, { name: 'desktop.jpg', viewport: { width: 1280, height: 800 } });
  await shot(browser, { name: 'mobile-portrait.jpg', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  await shot(browser, { name: 'mobile-landscape.jpg', viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true });
} finally {
  await browser.close();
}