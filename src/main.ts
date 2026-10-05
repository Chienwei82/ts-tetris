import './styles.css';
import * as THREE from 'three';
import { TetrisEngine } from './game/engine.js';
import { LINES_PER_LEVEL, MAX_LEVEL, PIECE_COLORS, SECONDS_PER_LEVEL } from './game/types.js';
import type { GameEvent, LevelProgress } from './game/types.js';
import { BoardRenderer } from './render/boardRenderer.js';
import { CameraShake, ClearFlash } from './render/effects.js';
import { createScene } from './render/scene.js';
import { createStage } from './render/stage.js';
import { THEMES, themeIndexForLevel } from './render/themes.js';
import { SoundFX } from './audio/sound.js';
import { InputController } from './ui/input.js';
import { HUD } from './ui/hud.js';
import { drawHold, drawNext } from './ui/preview.js';
import { loadEffectsEnabled, saveEffectsEnabled } from './ui/settings.js';
function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error('missing #' + id);
  return e as T;
}
const canvas = el<HTMLCanvasElement>('scene');
const nextCanvas = el<HTMLCanvasElement>('next');
const holdCanvas = el<HTMLCanvasElement>('hold');
const levelRange = el<HTMLInputElement>('level-range');
const levelRangeOut = el<HTMLOutputElement>('level-range-out');
const btnEffects = el<HTMLButtonElement>('btn-effects');
const hud = new HUD();
const sound = new SoundFX();
const { renderer, scene, camera, parts } = createScene(canvas);
const board = new BoardRenderer(scene);
const flash = new ClearFlash(scene, 10);
const shake = new CameraShake();
const stage = createStage(parts, { onThunder: () => sound.play('thunder') });
let lastThemeIdx = 0;
function fmtClock(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}
/** Gauge caption: both clues (lines and clock) so the player knows what fills the bar. */
function gaugeCaption(p: LevelProgress): string {
  if (p.atMax) return 'Nivel máximo alcanzado';
  const into = Math.max(0, Math.min(LINES_PER_LEVEL, engine.lines - (engine.level - 1) * LINES_PER_LEVEL));
  return into + '/' + LINES_PER_LEVEL + ' líneas · ' + fmtClock(engine.levelTime) + '/' + fmtClock(SECONDS_PER_LEVEL);
}
function refreshGauge(): void {
  const p = engine.levelProgress();
  hud.setLevelGauge(p.ratio, gaugeCaption(p), p.atMax ? 'max' : p.source);
}
function stageLabelFor(lv: number): string {
  const t = THEMES[themeIndexForLevel(lv)];
  return t ? t.icon + ' ' + t.name : '';
}
/* Start-level selector: chosen level also previews its stage/weather. */
levelRange.max = String(MAX_LEVEL);
function startLevel(): number {
  const v = Number.parseInt(levelRange.value, 10);
  return Number.isFinite(v) ? Math.min(MAX_LEVEL, Math.max(1, v)) : 1;
}
function refreshLevelOut(): void {
  const lv = startLevel();
  levelRangeOut.textContent = lv + ' · ' + stageLabelFor(lv);
}
levelRange.addEventListener('input', refreshLevelOut);
/* Background-effects toggle: off = classic static diorama (saves every per-frame extra). */
let effectsOn = true;
function applyEffects(on: boolean, immediate = false, persist = true): void {
  effectsOn = on;
  stage.setEffectsEnabled(on, immediate);
  btnEffects.textContent = on ? '✨ Efectos: ON' : '✨ Efectos: OFF';
  btnEffects.setAttribute('aria-pressed', String(on));
  btnEffects.classList.toggle('off', !on);
  if (persist) saveEffectsEnabled(on);
}
btnEffects.addEventListener('click', () => { btnEffects.blur(); sound.unlock(); applyEffects(!effectsOn); });
const unlockAudio = (): void => sound.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
function handleEvent(e: GameEvent): void {
  const kind = engine.active?.kind ?? 'T';
  const hex = PIECE_COLORS[kind];
  switch (e.type) {
    case 'move': sound.play('move'); break;
    case 'rotate': sound.play('rotate'); break;
    case 'hold': sound.play('hold'); break;
    case 'harddrop':
      sound.play('harddrop');
      shake.add(0.35);
      if (e.cells) for (const c of e.cells.slice(0, 4)) {
        const wx = c.x - 5 + 0.5; const wy = c.y - 10 + 0.5;
        board.particles.burst(new THREE.Vector3(wx, wy, 0.5), hex, 4, 1.4, 1.0);
      }
      break;
    case 'lock':
      sound.play('lock');
      shake.add(0.08);
      board.playLock(e.cells ?? [], kind);
      break;
    case 'clear': {
      const n = e.lines ?? 0;
      if (n >= 4) { sound.play('tetris'); hud.toast('¡TETRIS! +' + (e.scoreGained ?? 0)); }
      else { sound.play('clear', n); if (n > 1) hud.toast(n + ' líneas +' + (e.scoreGained ?? 0)); }
      shake.add(0.12 + n * 0.09);
      const rows = e.rows ?? [];
      if (rows.length > 0) {
        const lo = Math.min(...rows); const hi = Math.max(...rows);
        flash.flash(lo, hi - lo + 1);
        board.playClear(rows, engine.grid);
      }
      break;
    }
    case 'combo':
      if ((e.scoreGained ?? 0) > 1) hud.toast('Combo x' + e.scoreGained);
      break;
    case 'levelup': {
      const lv = e.level ?? engine.level;
      sound.play('levelup');
      shake.add(0.4);
      stage.setLevel(lv);
      const idx = themeIndexForLevel(lv);
      const label = stageLabelFor(lv);
      if (idx !== lastThemeIdx) {
        lastThemeIdx = idx;
        hud.toast('Nivel ' + lv + ' — ' + label, 2400);
        hud.levelBanner('NIVEL ' + lv, label);
      } else {
        hud.toast('Nivel ' + lv + ' — ¡más velocidad!', 2200);
        hud.levelBanner('NIVEL ' + lv, '¡más rápido!');
      }
      hud.setStageChip(label);
      break;
    }
    case 'gameover':
      sound.play('gameover');
      shake.add(0.6);
      showGameOver();
      break;
  }
}
const engine = new TetrisEngine({ onEvent: handleEvent });
function refreshPreviews(): void {
  drawNext(nextCanvas, engine.peekNext(1));
  drawHold(holdCanvas, engine.holdKind, engine.canHold);
}
function showStart(): void {
  hud.showOverlay('TETRIS 3D', 'Pulsa <span class="key">Enter</span> o haz clic en Jugar', '', true);
}
function showGameOver(): void {
  const theme = stage.theme();
  hud.showOverlay(
    'FIN DEL JUEGO',
    'Pulsa <span class="key">Enter</span> o <span class="key">R</span> para reintentar',
    '<strong>' + engine.score.toLocaleString('es') + '</strong> pts · Nivel ' + engine.level +
      ' (' + theme.icon + ' ' + theme.name + ') · ' + engine.lines + ' líneas'
  );
}
function startGame(): void {
  const lv = startLevel();
  engine.start(lv);
  board.reset();
  board.setActive(engine.active?.kind ?? 'T', engine.activeCells(), true);
  stage.setLevel(lv, true);
  lastThemeIdx = themeIndexForLevel(lv);
  hud.setStageChip(stageLabelFor(lv));
  hud.hideOverlay();
  hud.setStats(0, lv, 0);
  refreshGauge();
  refreshPreviews();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}
function togglePause(): void {
  if (engine.phase === 'playing') {
    engine.pause(); sound.play('pause');
    hud.showOverlay('PAUSA', 'Pulsa <span class="key">P</span> o <span class="key">Enter</span> para continuar', '');
  } else if (engine.phase === 'paused') {
    engine.resume(); hud.hideOverlay();
  }
}
const input = new InputController({
  onLeft: () => { engine.move(-1); },
  onRight: () => { engine.move(1); },
  onDown: () => { engine.moveDown(); },
  onRotateCW: () => { engine.rotate(1); },
  onRotateCCW: () => { engine.rotate(-1); },
  onHardDrop: () => { engine.hardDrop(); },
  onHold: () => { engine.hold(); refreshPreviews(); },
  onPause: () => togglePause(),
  onRestart: () => startGame(),
  onToggleEffects: () => { applyEffects(!effectsOn); },
  onConfirm: () => {
    if (engine.phase === 'ready' || engine.phase === 'gameover') startGame();
    else if (engine.phase === 'paused') togglePause();
  },
  setSoftDrop: (v) => { engine.softDrop = v; }
});
const btnStart = el<HTMLButtonElement>('btn-start');
const btnRestart = el<HTMLButtonElement>('btn-restart');
const btnPause = el<HTMLButtonElement>('btn-pause');
btnStart.addEventListener('click', () => {
  // Drop focus so a later Enter/Space cannot re-trigger the button mid-game.
  btnStart.blur();
  sound.unlock();
  if (engine.phase === 'paused') togglePause();
  else startGame();
});
btnRestart.addEventListener('click', () => { btnRestart.blur(); sound.unlock(); startGame(); });
btnPause.addEventListener('click', () => { btnPause.blur(); togglePause(); });
showStart();
refreshLevelOut();
hud.setStats(0, 1, 0);
refreshGauge();
const firstTheme = THEMES[0];
if (firstTheme) hud.setStageChip(firstTheme.icon + ' ' + firstTheme.name);
refreshPreviews();
applyEffects(loadEffectsEnabled(), true, false);
// three r183 deprecó `Clock`: `Timer` es la API moderna (en el core desde r179).
const timer = new THREE.Timer();
// Page Visibility API: evita deltas gigantes al volver de una pestaña oculta.
timer.connect(document);
let hudAcc = 0;
function animate(): void {
  requestAnimationFrame(animate);
  timer.update();
  const rawDt = Math.min(timer.getDelta(), 0.1);
  const t = timer.getElapsed();
  input.update(rawDt);
  if (engine.phase === 'playing') {
    engine.update(rawDt);
    board.syncLocked(engine.grid);
    if (engine.active) {
      board.setActive(engine.active.kind, engine.activeCells());
      board.setGhost(engine.ghostCells());
    }
  }
  board.update(rawDt);
  stage.update(rawDt);
  flash.update(rawDt);
  const s = shake.update(rawDt);
  const swayX = Math.sin(t * 0.35) * 0.55;
  const swayY = Math.sin(t * 0.27) * 0.35;
  // Board is 10 wide x 20 tall: pull back enough to frame it whole.
  // Slight tilt (camera above look-target) gives depth without hiding rows.
  camera.position.set(swayX + s.x, 0.9 + swayY + s.y, 31.5);
  camera.lookAt(swayX * 0.25, 0.3, 0);
  hudAcc += rawDt;
  if (hudAcc > 0.08) {
    hudAcc = 0;
    hud.setStats(engine.score, engine.level, engine.lines);
    refreshGauge();
    refreshPreviews();
  }
  renderer.render(scene, camera);
}
animate();
