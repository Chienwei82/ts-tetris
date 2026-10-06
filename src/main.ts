import './styles.css';
import * as THREE from 'three';
import { TetrisEngine } from './game/engine.js';
import { stackHeight } from './game/board.js';
import { LINES_PER_LEVEL, MAX_LEVEL, PIECE_COLORS, SECONDS_PER_LEVEL, VISIBLE_ROWS } from './game/types.js';
import type { GameEvent, LevelProgress, PieceKind } from './game/types.js';
import { BoardRenderer } from './render/boardRenderer.js';
import { cellToWorld } from './render/constants.js';
import { CameraShake, ClearFlash } from './render/effects.js';
import { frameFor } from './render/framing.js';
import type { Frame } from './render/framing.js';
import { createScene } from './render/scene.js';
import type { SceneOptions } from './render/scene.js';
import { createStage } from './render/stage.js';
import { THEMES, themeIndexForLevel } from './render/themes.js';
import { SoundFX } from './audio/sound.js';
import { IntensityTracker } from './audio/intensityTracker.js';
import type { IntensitySignals } from './audio/intensityTracker.js';
import { MusicDirector } from './audio/musicDirector.js';
import { pickCuratedSeed } from './audio/musicPatterns.js';
import { detectDevice } from './platform/device.js';
import { ViewportManager } from './platform/viewport.js';
import { InputManager } from './ui/inputManager.js';
import { ModeSelect } from './ui/modeSelect.js';
import { HUD } from './ui/hud.js';
import { drawHold, drawNext, drawPieceIcon } from './ui/preview.js';
import { loadEffectsEnabled, loadMusicEnabled, saveEffectsEnabled, saveMusicEnabled } from './ui/settings.js';
import { initAnalytics } from './analytics.js';
function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error('missing #' + id);
  return e as T;
}
/* Vercel Analytics + Speed Insights (mode auto: solo envía datos en producción). */
initAnalytics();
const canvas = el<HTMLCanvasElement>('scene');
const nextCanvas = el<HTMLCanvasElement>('next');
const holdCanvas = el<HTMLCanvasElement>('hold');
const levelRange = el<HTMLInputElement>('level-range');
const levelRangeOut = el<HTMLOutputElement>('level-range-out');
const btnEffects = el<HTMLButtonElement>('btn-effects');
const btnMusic = el<HTMLButtonElement>('btn-music');
const hud = new HUD();
const sound = new SoundFX();
/* Música procedural: el juego solo aporta intensidad; el audio se gestiona solo. */
const music = new MusicDirector();
const intensity = new IntensityTracker();
const device = detectDevice();
/* Calidad reducida en móvil: sin MSAA y shadow map más barato. */
const quality: SceneOptions = device.kind === 'desktop' ? {} : { antialias: false, shadowMapSize: 1024 };
const { renderer, scene, camera, parts } = createScene(canvas, quality);
/* Tamaño, aspecto y pixel ratio centralizados fuera de la lógica de escena. */
new ViewportManager(renderer, camera, canvas);
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
  const label = on ? '✨ Efectos: ON' : '✨ Efectos: OFF';
  const labelEl = btnEffects.querySelector('.bb-label');
  if (labelEl) labelEl.textContent = label.replace('✨', '');
  else btnEffects.textContent = label;
  btnEffects.setAttribute('aria-pressed', String(on));
  btnEffects.classList.toggle('off', !on);
  if (persist) saveEffectsEnabled(on);
}
btnEffects.addEventListener('click', () => { btnEffects.blur(); sound.unlock(); applyEffects(!effectsOn); });
/* Music toggle: off = fade-out + AudioContext suspend (sin CPU) y preferencia guardada. */
let musicOn = true;
function applyMusic(on: boolean, persist = true): void {
  musicOn = on;
  if (on) music.enable(); else music.disable();
  const labelEl = btnMusic.querySelector('.bb-label');
  const label = on ? ' Música: ON' : ' Música: OFF';
  if (labelEl) labelEl.textContent = label;
  else btnMusic.textContent = (on ? '🎵' : '🔇') + label;
  btnMusic.setAttribute('aria-pressed', String(on));
  btnMusic.classList.toggle('off', !on);
  if (persist) saveMusicEnabled(on);
}
btnMusic.addEventListener('click', () => { btnMusic.blur(); sound.unlock(); music.unlock(); applyMusic(!musicOn); });
const unlockAudio = (): void => { sound.unlock(); music.unlock(); };
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
// Cobertura extra para WebViews/iOS antiguos donde pointerdown no activa el audio.
window.addEventListener('touchend', unlockAudio, { once: true });
// Pestaña oculta: silencia y suspende el AudioContext (cero CPU de audio).
document.addEventListener('visibilitychange', () => { music.setHidden(document.hidden); });
function handleEvent(e: GameEvent): void {
  const kind = engine.active?.kind ?? 'T';
  const hex = PIECE_COLORS[kind];
  switch (e.type) {
    case 'move': sound.play('move'); break;
    case 'rotate': sound.play('rotate'); break;
    case 'hold': sound.play('hold'); break;
    case 'harddrop':
      sound.play('harddrop');
      intensity.event('harddrop');
      shake.add(0.35);
      if (e.cells) for (const c of e.cells.slice(0, 4)) {
        const p = cellToWorld(c.x, c.y);
        board.particles.burst(new THREE.Vector3(p.x, p.y, 0.5), hex, 4, 1.4, 1.0);
      }
      break;
    case 'lock':
      sound.play('lock');
      shake.add(0.08);
      board.playLock(e.cells ?? [], kind);
      break;
    case 'clear': {
      const n = e.lines ?? 0;
      intensity.event(n >= 4 ? 'tetris' : 'clear');
      if (n >= 4) { sound.play('tetris'); hud.toast('¡TETRIS! +' + (e.scoreGained ?? 0)); }
      else { sound.play('clear', n); if (n > 1) hud.toast(n + ' líneas +' + (e.scoreGained ?? 0)); }
      shake.add(0.12 + n * 0.09);
      const rows = e.rows ?? [];
      if (rows.length > 0) {
        const lo = Math.min(...rows); const hi = Math.max(...rows);
        flash.flash(lo, hi - lo + 1);
        board.playClear(rows);
      }
      break;
    }
    case 'combo':
      intensity.event('combo');
      if ((e.scoreGained ?? 0) > 1) hud.toast('Combo x' + e.scoreGained);
      break;
    case 'levelup': {
      const lv = e.level ?? engine.level;
      sound.play('levelup');
      intensity.event('levelup');
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
      music.resolveEnding();
      shake.add(0.6);
      showGameOver();
      break;
  }
}
const engine = new TetrisEngine({ onEvent: handleEvent });
function refreshPreviews(): void {
  drawNext(nextCanvas, engine.peekNext(3));
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
  // Reinicio/nueva partida: la música vuelve a la calma con una canción nueva
  // elegida entre las semillas curadas (la semilla se loguea para reproducirla).
  intensity.reset();
  const musicSeed = pickCuratedSeed(Date.now() ^ Math.imul(lv, 2654435761));
  console.info('[música] semilla de la canción:', musicSeed);
  music.start(musicSeed);
  lastThemeIdx = themeIndexForLevel(lv);
  hud.setStageChip(stageLabelFor(lv));
  hud.hideOverlay();
  hud.setStats(0, lv, 0);
  refreshGauge();
  refreshPreviews();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}
/** La música sigue al juego: pausa y pantalla de ayuda silencian con fade. */
function syncMusicPause(): void {
  music.setPaused(engine.phase === 'paused' || helpOpen);
}
function togglePause(): void {
  if (helpOpen) return;
  if (engine.phase === 'playing') {
    engine.pause(); sound.play('pause'); input.releaseAll();
    hud.showOverlay('PAUSA', 'Pulsa <span class="key">P</span> o <span class="key">Enter</span> para continuar', '');
  } else if (engine.phase === 'paused') {
    engine.resume(); hud.hideOverlay();
  }
  syncMusicPause();
}
/* Help screen: shown at startup and toggled with H. Opening it during play
   auto-pauses the game so the player can read without losing the piece. */
let helpOpen = false;
let helpAutoPaused = false;
const helpOverlay = el<HTMLDivElement>('help-overlay');
function toggleHelp(): void {
  if (!helpOpen) {
    helpOpen = true;
    helpAutoPaused = engine.phase === 'playing';
    if (helpAutoPaused) engine.pause();
    input.releaseAll();
    helpOverlay.classList.remove('hidden-overlay');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  } else {
    helpOpen = false;
    helpOverlay.classList.add('hidden-overlay');
    if (helpAutoPaused && engine.phase === 'paused') engine.resume();
    helpAutoPaused = false;
  }
  syncMusicPause();
}
const input = new InputManager({
  onLeft: () => { engine.move(-1); },
  onRight: () => { engine.move(1); },
  onDown: () => { engine.moveDown(); },
  onRotateCW: () => { engine.rotate(1); },
  onRotateCCW: () => { engine.rotate(-1); },
  onHardDrop: () => { engine.hardDrop(); },
  onHold: () => { engine.hold(); refreshPreviews(); },
  onPause: () => { if (helpOpen) toggleHelp(); else togglePause(); },
  onRestart: () => { if (!helpOpen) startGame(); },
  onToggleEffects: () => { applyEffects(!effectsOn); },
  onToggleMusic: () => { applyMusic(!musicOn); },
  onConfirm: () => {
    if (helpOpen) { toggleHelp(); return; }
    if (engine.phase === 'ready' || engine.phase === 'gameover') startGame();
    else if (engine.phase === 'paused') togglePause();
  },
  onHelp: () => toggleHelp(),
  setSoftDrop: (v) => { engine.softDrop = v; }
}, el<HTMLDivElement>('touch-controls'));
/* Modo de controles: elección guardada > detección fiable > pantalla de selección. */
const modeSelect = new ModeSelect({
  root: el<HTMLDivElement>('mode-overlay'),
  profile: device,
  onChoose: (mode) => {
    input.setMode(mode);
    document.body.classList.toggle('touch', mode === 'touch');
  },
  onOpenChange: (open) => { input.setEnabled(!open); }
});
modeSelect.resolve();
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
const btnHelp = el<HTMLButtonElement>('btn-help');
btnHelp.addEventListener('click', () => { btnHelp.blur(); sound.unlock(); toggleHelp(); });
const btnHelpClose = el<HTMLButtonElement>('btn-help-close');
btnHelpClose.addEventListener('click', () => { btnHelpClose.blur(); sound.unlock(); toggleHelp(); });
const btnMode = el<HTMLButtonElement>('btn-mode');
btnMode.addEventListener('click', () => {
  btnMode.blur();
  sound.unlock();
  // Cambiar de controles en caliente: pausa para no perder la pieza.
  if (engine.phase === 'playing') {
    engine.pause();
    input.releaseAll();
    hud.showOverlay('PAUSA', 'Pulsa <span class="key">P</span> o <span class="key">Enter</span> para continuar', '');
    syncMusicPause();
  }
  modeSelect.show();
});
for (const canvas of document.querySelectorAll<HTMLCanvasElement>('.piece-icon')) {
  const kind = canvas.dataset.piece as PieceKind | undefined;
  if (kind) drawPieceIcon(canvas, kind);
}
showStart();
// The help screen greets the player on every visit.
toggleHelp();
refreshLevelOut();
hud.setStats(0, 1, 0);
refreshGauge();
const firstTheme = THEMES[0];
if (firstTheme) hud.setStageChip(firstTheme.icon + ' ' + firstTheme.name);
refreshPreviews();
applyEffects(loadEffectsEnabled(), true, false);
applyMusic(loadMusicEnabled(), false);
// three r183 deprecó `Clock`: `Timer` es la API moderna (en el core desde r179).
const timer = new THREE.Timer();
// Page Visibility API: evita deltas gigantes al volver de una pestaña oculta.
timer.connect(document);
let hudAcc = 0;
/* Encuadre del área de juego: solo se recalcula al cambiar de formato o modo. */
let frameKey = '';
let frame: Frame = { dist: 31.5, targetY: 0 };
function currentFrame(): Frame {
  const h = window.innerHeight;
  const compact = window.innerWidth <= 720 || h <= 480;
  const touch = input.getMode() === 'touch';
  // Bandas de UI (fracción del alto) que se solapan con la columna del tablero:
  // tira HUD arriba; en vertical táctil también los botones de abajo.
  const top = (compact ? 60 : 0) / h;
  const bottom = (touch && compact && camera.aspect < 1 ? 104 : 0) / h;
  const key = camera.aspect + ':' + top + ':' + bottom;
  if (key !== frameKey) {
    frameKey = key;
    frame = frameFor(camera.aspect, { top, bottom });
  }
  return frame;
}
function animate(): void {
  requestAnimationFrame(animate);
  timer.update();
  const rawDt = Math.min(timer.getDelta(), 0.1);
  // Pestaña oculta: no se simula ni se renderiza (algunos WebViews siguen llamando a rAF).
  if (document.hidden) return;
  const t = timer.getElapsed();
  input.update(rawDt);
  if (engine.phase === 'playing') {
    engine.update(rawDt);
    board.syncLocked(engine.grid);
    if (engine.active) {
      board.setActive(engine.active.kind, engine.activeCells());
      board.setGhost(engine.ghostCells());
    }
    // Único punto donde el juego alimenta la música: intensidad suavizada por frame.
    const sig: IntensitySignals = {
      stackHeight: (stackHeight(engine.grid) + 1) / VISIBLE_ROWS,
      level: (engine.level - 1) / (MAX_LEVEL - 1),
      levelProgress: engine.levelProgress().ratio,
      combo: Math.max(0, engine.combo)
    };
    music.setIntensity(intensity.update(rawDt, sig));
  }
  board.update(rawDt);
  stage.update(rawDt);
  flash.update(rawDt);
  const s = shake.update(rawDt);
  const swayX = Math.sin(t * 0.35) * 0.55;
  const swayY = Math.sin(t * 0.27) * 0.35;
  // Encuadre responsivo: el tablero completo (con marco) siempre centrado.
  // La deriva y el shake se aplican a la posición pero el eje apunta al centro
  // del tablero: solo se balancea la cámara, nunca se desplaza el tablero.
  const f = currentFrame();
  camera.position.set(swayX + s.x, f.targetY + 0.9 + swayY + s.y, f.dist);
  camera.lookAt(0, f.targetY + 0.3, 0);
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
