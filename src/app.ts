import './styles.css';
import * as THREE from 'three';
import { TetrisEngine } from './game/engine.js';
import { LINES_PER_LEVEL, MAX_LEVEL, PIECE_COLORS, SECONDS_PER_LEVEL, TOTAL_ROWS, VISIBLE_ROWS } from './game/types.js';
import type { GameEvent, GameMode, LevelProgress, PieceKind } from './game/types.js';
import type { IntensitySignals } from './audio/intensityTracker.js';
import { BoardRenderer } from './render/boardRenderer.js';
import { cellToWorld, MAX_FPS, pxPerCell } from './render/constants.js';
import { CameraShake, ClearFlash } from './render/effects.js';
import { debrisActive } from './render/fx/debrisMode.js';
import { DebrisSystem } from './render/fx/debrisSystem.js';
import { createFxRandom } from './render/fx/fxRandom.js';
import type { MutatorEvent, MutatorId } from './game/mutators/types.js';
import { isFxQuality } from './render/fx/fxQuality.js';
import type { FxQuality } from './render/fx/fxQuality.js';
import { frameFor } from './render/framing.js';
import type { Frame } from './render/framing.js';
import { refreshPointScales } from './render/particles.js';
import { createScene } from './render/scene.js';
import type { SceneOptions } from './render/scene.js';
import { createStage } from './render/stage.js';
import { THEMES, themeIndexForLevel } from './render/themes.js';
import { SoundFX } from './audio/sound.js';
import { IntensityTracker } from './audio/intensityTracker.js';
import { MusicDirector } from './audio/musicDirector.js';
import type { GenreId } from './audio/genreProfiles.js';
import { GENRE_META } from './audio/genreProfiles.js';
import { normalizeGenre } from './audio/genreRegistry.js';
import { detectDevice } from './platform/device.js';
import { FrameLimiter } from './platform/frameLimiter.js';
import { ViewportManager } from './platform/viewport.js';
import { InputManager } from './ui/inputManager.js';
import { ModeSelect } from './ui/modeSelect.js';
import { HUD } from './ui/hud.js';
import { drawHold, drawNext, drawPieceIcon } from './ui/preview.js';
import { loadEffectsEnabled, loadGameMode, loadMusicEnabled, loadMusicGenre, loadDebrisClassic, loadFxQuality, loadChaosLightning, loadChaosHail, prefersReducedMotion, saveEffectsEnabled, saveGameMode, saveMusicEnabled, saveMusicGenre, saveDebrisClassic, saveFxQuality, saveChaosLightning, saveChaosHail } from './ui/settings.js';
import { randomSeed } from './game/rng.js';
import { MusicMenu } from './ui/musicMenu.js';
import { initAnalytics } from './analytics.js';

const WIND_ARROW_MIN_SECONDS = 1;
const WIND_ARROW_EXTRA_SECONDS = 0.35;
const HUD_REFRESH_SECONDS = 0.08;
const MUSIC_INTENSITY_INTERVAL = 0.1;
const MAX_DELTA_SECONDS = 0.1;

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error('missing #' + id);
  return e as T;
}

const MUTATOR_LABEL: Record<MutatorId, string> = {
  wind: '🌬️ Viento', rain: '🌧️ Lluvia', lightning: '⚡ Relámpago', hail: '🌨️ Granizo', drill: '🔩 Taladro'
};

function fmtClock(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

function stageLabelFor(lv: number): string {
  const t = THEMES[themeIndexForLevel(lv)];
  return t ? t.icon + ' ' + t.name : '';
}

export class GameApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly nextCanvas: HTMLCanvasElement;
  private readonly holdCanvas: HTMLCanvasElement;
  private readonly hud: HUD;
  private readonly sound: SoundFX;
  private readonly music: MusicDirector;
  private readonly intensity: IntensityTracker;
  private readonly device: ReturnType<typeof detectDevice>;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly board: BoardRenderer;
  private readonly flash: ClearFlash;
  private readonly shake: CameraShake;
  private readonly debris: DebrisSystem;
  private readonly stage: ReturnType<typeof createStage>;
  private readonly stormShade: HTMLElement;
  private readonly windArrow: HTMLElement;
  private readonly windGlyph: HTMLElement;
  private readonly stormFxRandom: ReturnType<typeof createFxRandom>;

  private gameMode: GameMode;
  private chaosSeed: number;
  private fxQuality: FxQuality;
  private debrisInClassic: boolean;
  private chaosLightningOn: boolean;
  private chaosHailOn: boolean;
  private debrisOn = false;
  private effectsOn = true;
  private musicOn = true;
  private musicGenre: GenreId;
  private helpOpen = false;
  private helpAutoPaused = false;

  private engine: TetrisEngine;
  private activeMutator: MutatorId | null = null;
  private windArrowLeft = 0;
  private lastThemeIdx = 0;
  private lastGridV = -1;
  private lastPieceV = -1;
  private lastSpecialV = -1;
  private hudAcc = 0;
  private musicAcc = 0;
  private needsRender = true;

  private readonly timer: THREE.Timer;
  private readonly frameLimiter: FrameLimiter;
  private readonly musicSig: IntensitySignals;
  private frameKey = '';
  private frame: Frame = { dist: 31.5, targetY: 0 };

  private readonly input: InputManager;
  private readonly musicMenu: MusicMenu;
  private readonly modeSelect: ModeSelect;

  private lastNextKey = '';
  private lastHoldKey = '';

  constructor() {
    initAnalytics();

    this.canvas = el<HTMLCanvasElement>('scene');
    this.nextCanvas = el<HTMLCanvasElement>('next');
    this.holdCanvas = el<HTMLCanvasElement>('hold');

    this.hud = new HUD();
    this.gameMode = loadGameMode();
    this.chaosSeed = randomSeed();
    this.sound = new SoundFX();

    const initialGenre = normalizeGenre(loadMusicGenre());
    this.musicGenre = initialGenre;
    this.music = new MusicDirector({ initialGenre });
    this.intensity = new IntensityTracker();

    this.device = detectDevice();
    const quality: SceneOptions = this.device.kind === 'desktop' ? {} : { antialias: false, shadowMapSize: 1024 };
    const { renderer, scene, camera, parts } = createScene(this.canvas, quality);
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    new ViewportManager(renderer, camera, this.canvas, { onChange: refreshPointScales });

    this.board = new BoardRenderer(scene);
    this.flash = new ClearFlash(scene, 10);
    this.shake = new CameraShake();

    const fallbackQuality: FxQuality = this.device.kind === 'desktop' ? 'high' : this.device.kind === 'tablet' ? 'medium' : 'low';
    this.fxQuality = loadFxQuality(fallbackQuality);
    this.debris = new DebrisSystem(scene, { quality: this.fxQuality });

    this.debrisInClassic = loadDebrisClassic();
    this.chaosLightningOn = loadChaosLightning();
    this.chaosHailOn = loadChaosHail();

    this.stage = createStage(parts, { onThunder: () => this.sound.play('thunder') });

    this.stormShade = el<HTMLDivElement>('storm-shade');
    this.windArrow = el<HTMLDivElement>('wind-arrow');
    this.windGlyph = el<HTMLSpanElement>('wind-arrow-glyph');
    this.stormFxRandom = createFxRandom();

    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.frameLimiter = new FrameLimiter(MAX_FPS);
    this.musicSig = { stackHeight: 0, level: 0, levelProgress: 0, combo: 0 };

    this.engine = new TetrisEngine({
      mode: this.gameMode,
      mutatorConfig: { pool: this.mutatorPool() },
      seed: this.chaosSeed,
      onEvent: (e) => this.handleEvent(e),
      onMutatorEvent: (e) => this.handleMutatorEvent(e),
    });

    this.input = new InputManager({
      onLeft: () => { this.engine.move(-1); },
      onRight: () => { this.engine.move(1); },
      onDown: () => { this.engine.moveDown(); },
      onRotateCW: () => { this.engine.rotate(1); },
      onRotateCCW: () => { this.engine.rotate(-1); },
      onHardDrop: () => { this.engine.hardDrop(); },
      onHold: () => { this.engine.hold(); this.refreshPreviews(); },
      onPause: () => { if (this.helpOpen) this.toggleHelp(); else this.togglePause(); },
      onRestart: () => { if (!this.helpOpen) this.startGame(); },
      onToggleEffects: () => { this.applyEffects(!this.effectsOn); },
      onToggleMusic: () => { this.applyMusic(!this.musicOn); },
      onConfirm: () => {
        if (this.helpOpen) { this.toggleHelp(); return; }
        if (this.engine.phase === 'ready' || this.engine.phase === 'gameover') this.startGame();
        else if (this.engine.phase === 'paused') this.togglePause();
      },
      onHelp: () => this.toggleHelp(),
      setSoftDrop: (v) => { this.engine.softDrop = v; }
    }, el<HTMLDivElement>('touch-controls'), this.canvas, () => pxPerCell(this.camera, this.canvas));

    this.musicMenu = new MusicMenu({
      button: el<HTMLButtonElement>('btn-music'),
      enabled: this.musicOn,
      genre: this.musicGenre,
      onToggle: (on) => { this.sound.unlock(); this.music.unlock(); this.applyMusic(on); },
      onGenre: (genre) => { this.sound.unlock(); this.music.unlock(); this.applyGenre(genre); },
    });

    this.modeSelect = new ModeSelect({
      root: el<HTMLDivElement>('mode-overlay'),
      profile: this.device,
      onChoose: (mode) => {
        this.input.setMode(mode);
        document.body.classList.toggle('touch', mode === 'touch');
      },
      onOpenChange: (open) => { this.input.setEnabled(!open); }
    });
    this.modeSelect.resolve();

    this.setupDOMListeners();
    this.setupAudioUnlock();
    this.setupVisibilityChange();

    this.applyEffects(loadEffectsEnabled(), true, false);
    this.applyMusic(loadMusicEnabled(), false);
    this.applyGenre(this.musicGenre, false);

    this.showStart();
    this.toggleHelp();
    this.refreshLevelOut();
    this.hud.setStats(0, 1, 0);
    this.refreshGauge();
    const firstTheme = THEMES[0];
    if (firstTheme) this.hud.setStageChip(firstTheme.icon + ' ' + firstTheme.name);
    this.refreshPreviews();

    const debrisClassicCheck = el<HTMLInputElement>('debris-classic');
    const chaosLightningCheck = el<HTMLInputElement>('chaos-lightning');
    const chaosHailCheck = el<HTMLInputElement>('chaos-hail');
    const fxQualitySelect = el<HTMLSelectElement>('fx-quality');

    debrisClassicCheck.checked = this.debrisInClassic;
    chaosLightningCheck.checked = this.chaosLightningOn;
    chaosHailCheck.checked = this.chaosHailOn;
    fxQualitySelect.value = this.fxQuality;

    debrisClassicCheck.addEventListener('change', () => {
      this.debrisInClassic = debrisClassicCheck.checked;
      saveDebrisClassic(this.debrisInClassic);
      this.applyDebrisSettings();
    });
    chaosLightningCheck.addEventListener('change', () => {
      this.chaosLightningOn = chaosLightningCheck.checked;
      saveChaosLightning(this.chaosLightningOn);
    });
    chaosHailCheck.addEventListener('change', () => {
      this.chaosHailOn = chaosHailCheck.checked;
      saveChaosHail(this.chaosHailOn);
    });
    fxQualitySelect.addEventListener('change', () => {
      const value = fxQualitySelect.value;
      if (!isFxQuality(value)) return;
      this.fxQuality = value;
      saveFxQuality(value);
      this.debris.setQuality(value);
    });
    for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="game-mode"]')) {
      radio.addEventListener('change', () => { if (this.engine.phase === 'ready') this.applyDebrisSettings(); });
    }

    for (const canvas of document.querySelectorAll<HTMLCanvasElement>('.piece-icon')) {
      const kind = canvas.dataset.piece as PieceKind | undefined;
      if (kind) drawPieceIcon(canvas, kind);
    }

    requestAnimationFrame(this.animate);
  }

  private setupDOMListeners(): void {
    const levelRange = el<HTMLInputElement>('level-range');
    levelRange.max = String(MAX_LEVEL);
    levelRange.addEventListener('input', () => this.refreshLevelOut());

    const btnEffects = el<HTMLButtonElement>('btn-effects');
    btnEffects.addEventListener('click', () => { btnEffects.blur(); this.sound.unlock(); this.applyEffects(!this.effectsOn); });

    const btnStart = el<HTMLButtonElement>('btn-start');
    const btnRestart = el<HTMLButtonElement>('btn-restart');
    const btnPause = el<HTMLButtonElement>('btn-pause');
    const btnHelp = el<HTMLButtonElement>('btn-help');
    const btnHelpClose = el<HTMLButtonElement>('btn-help-close');
    const btnMode = el<HTMLButtonElement>('btn-mode');

    btnStart.addEventListener('click', () => {
      btnStart.blur();
      this.sound.unlock();
      if (this.engine.phase === 'paused') this.togglePause();
      else this.startGame();
    });
    btnRestart.addEventListener('click', () => { btnRestart.blur(); this.sound.unlock(); this.startGame(); });
    btnPause.addEventListener('click', () => { btnPause.blur(); this.togglePause(); });
    btnHelp.addEventListener('click', () => { btnHelp.blur(); this.sound.unlock(); this.toggleHelp(); });
    btnHelpClose.addEventListener('click', () => { btnHelpClose.blur(); this.sound.unlock(); this.toggleHelp(); });
    btnMode.addEventListener('click', () => {
      btnMode.blur();
      this.sound.unlock();
      if (this.engine.phase === 'playing') {
        this.engine.pause();
        this.input.releaseAll();
        this.hud.showOverlay('PAUSA', 'Pulsa <span class="key">P</span> o <span class="key">Enter</span> para continuar', '');
        this.syncMusicPause();
      }
      this.modeSelect.show();
    });
  }

  private setupAudioUnlock(): void {
    const unlockAudio = (): void => { this.sound.unlock(); this.music.unlock(); };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    window.addEventListener('touchend', unlockAudio, { once: true });
  }

  private setupVisibilityChange(): void {
    document.addEventListener('visibilitychange', () => { this.music.setHidden(document.hidden); });
  }

  private showWindArrow(dir: -1 | 1, seconds: number): void {
    this.windGlyph.textContent = dir < 0 ? '←' : '→';
    this.windArrow.classList.toggle('left', dir < 0);
    this.windArrow.classList.toggle('right', dir > 0);
    this.windArrow.classList.add('on');
    this.windArrow.setAttribute('aria-label', dir < 0 ? 'Viento hacia la izquierda' : 'Viento hacia la derecha');
    this.windArrowLeft = Math.max(WIND_ARROW_MIN_SECONDS, seconds) + WIND_ARROW_EXTRA_SECONDS;
  }

  private hideWindArrow(): void {
    this.windArrowLeft = 0;
    this.windArrow.classList.remove('on');
  }

  private clearStormVisuals(): void {
    this.activeMutator = null;
    this.hud.setMutatorChip('');
    this.hideWindArrow();
    this.stage.setRain(false);
    this.stage.setWind(null);
    this.stormShade.classList.remove('on');
  }

  private setRainStorm(on: boolean): void {
    this.stage.setRain(on);
    this.stage.setWind(null);
    this.hideWindArrow();
    if (this.effectsOn) this.stormShade.classList.toggle('on', on);
  }

  private setLightningStorm(on: boolean): void {
    this.stage.setRain(false);
    this.stage.setWind(null);
    this.hideWindArrow();
    if (this.effectsOn) this.stormShade.classList.toggle('on', on);
  }

  private setWindStorm(dir: -1 | 1 | null): void {
    this.stage.setRain(false);
    this.stormShade.classList.remove('on');
    if (dir === null) {
      this.stage.setWind(null);
      this.hideWindArrow();
    } else {
      this.stage.setWind(dir);
    }
  }

  private handleMutatorEvent(e: MutatorEvent): void {
    switch (e.kind) {
      case 'warn':
        this.hud.setMutatorChip('⏳ ' + MUTATOR_LABEL[e.mutator] + '…');
        this.hud.toast('⛈️ ' + MUTATOR_LABEL[e.mutator] + ' en ' + Math.max(1, Math.ceil(e.seconds)) + ' s', 1600);
        break;
      case 'start':
        this.activeMutator = e.mutator;
        this.hud.setMutatorChip(MUTATOR_LABEL[e.mutator]);
        if (e.mutator === 'rain') {
          this.setRainStorm(true);
          this.hud.toast('🌧️ Lluvia — el suelo resbala', 2200);
        } else if (e.mutator === 'lightning') {
          this.setLightningStorm(true);
          this.hud.toast('⚡ Relámpago — rompe bloques', 2200);
        } else if (e.mutator === 'hail') {
          this.setRainStorm(true);
          this.hud.toast('🌨️ Granizo — bloquea columnas', 2200);
        } else {
          this.setWindStorm(null);
          this.hud.toast('🌬️ Viento — empuja la pieza', 2000);
        }
        break;
      case 'drill-warn': {
        this.hud.setMutatorChip('⏳ ' + MUTATOR_LABEL.drill + '…');
        this.hud.toast('🔩 Taladro en columna ' + (e.column + 1) + ' — se avecina', 1600);
        break;
      }
      case 'drill': {
        this.sound.play('drill');
        this.shake.add(0.5);
        this.hud.toast('🔩 Taladro — columna ' + (e.column + 1) + ' perforada hasta el fondo', 2000);
        break;
      }
      case 'wind-warn':
        this.setWindStorm(e.dir);
        this.showWindArrow(e.dir, e.seconds);
        break;
      case 'wind-gust': {
        this.stage.gust(e.dir);
        this.sound.play('wind');
        this.shake.add(0.16);
        const cells = this.engine.activeCells();
        const base = cells[Math.floor(this.stormFxRandom.range(0, cells.length))];
        if (base) {
          const p = cellToWorld(base.x, base.y);
          const count = 3 + Math.floor(this.stormFxRandom.range(0, 4));
          this.board.particles.burst(new THREE.Vector3(p.x - e.dir * 1.2, p.y + 0.4, 0.6), 0xf4f7fb, count, 2.4, 1.4);
        }
        break;
      }
      case 'lightning': {
        this.sound.play('lock');
        this.shake.add(0.3);
        if (this.effectsOn) {
          for (const cell of e.cells) {
            const p = cellToWorld(cell.x, cell.y);
            this.board.particles.burst(new THREE.Vector3(p.x, p.y, 0.4), 0xfff2a6, 6, 2.8, 1.6);
          }
        }
        this.hud.toast('⚡ ¡Rayo!', 900);
        break;
      }
      case 'hail': {
        this.sound.play('lock');
        if (this.effectsOn) {
          for (const col of e.columns) {
            const p = cellToWorld(col, TOTAL_ROWS - 1);
            this.board.particles.burst(new THREE.Vector3(p.x, p.y + 2, 0.4), 0xcfe6ff, 4, 2.2, 1.4);
          }
        }
        break;
      }
      case 'end':
        this.clearStormVisuals();
        if (e.mutator === 'rain' || e.mutator === 'hail') {
          this.hud.toast('⛅ ' + (e.mutator === 'hail' ? 'El granizo se derrite' : 'La lluvia amaina'), 1500);
        } else if (e.mutator === 'lightning') {
          this.hud.toast('⛅ El relámpago cesa', 1500);
        } else {
          this.hud.toast('⛅ El viento calma', 1500);
        }
        break;
    }
  }

  private refreshMusicButton(): void {
    const meta = GENRE_META[this.musicGenre];
    const btnMusic = el<HTMLButtonElement>('btn-music');
    const labelEl = btnMusic.querySelector('.bb-label');
    const label = ' ' + meta.label + ': ' + (this.musicOn ? 'ON' : 'OFF');
    if (labelEl) labelEl.textContent = label;
    else btnMusic.textContent = (this.musicOn ? '🎵' : '🔇') + label;
    btnMusic.setAttribute('aria-pressed', String(this.musicOn));
    btnMusic.setAttribute('aria-label', 'Musica procedural: ' + meta.label + ', ' + (this.musicOn ? 'activada' : 'desactivada') + '. Abrir menu');
    btnMusic.classList.toggle('off', !this.musicOn);
  }

  private applyMusic(on: boolean, persist = true): void {
    this.musicOn = on;
    if (on) this.music.enable(); else this.music.disable();
    this.refreshMusicButton();
    this.musicMenu.setEnabled(on);
    if (persist) saveMusicEnabled(on);
  }

  private applyGenre(genre: GenreId, persist = true): void {
    this.musicGenre = genre;
    this.music.setGenre(genre);
    this.refreshMusicButton();
    this.musicMenu.setGenre(genre);
    if (persist) saveMusicGenre(genre);
  }

  private applyEffects(on: boolean, immediate = false, persist = true): void {
    this.effectsOn = on;
    this.stage.setEffectsEnabled(on, immediate);
    if (!on) this.stormShade.classList.remove('on');
    else if (this.activeMutator === 'rain') this.stormShade.classList.add('on');
    const btnEffects = el<HTMLButtonElement>('btn-effects');
    const label = on ? 'EFECTOS ON' : 'EFECTOS OFF';
    btnEffects.textContent = label;
    btnEffects.setAttribute('aria-pressed', String(on));
    btnEffects.classList.toggle('off', !on);
    if (persist) saveEffectsEnabled(on);
  }

  private applyDebrisSettings(): void {
    const inRun = this.engine.phase === 'playing' || this.engine.phase === 'paused' || this.engine.phase === 'gameover';
    const active = debrisActive({
      mode: inRun ? this.gameMode : this.currentMode(),
      classicOptIn: this.debrisInClassic,
      effectsOn: this.effectsOn,
      reducedMotion: prefersReducedMotion()
    });
    this.debrisOn = active;
    this.debris.setEnabled(active);
    this.hud.setDebrisChip(active);
  }

  private gaugeCaption(p: LevelProgress): string {
    if (p.atMax) return 'Nivel máximo alcanzado';
    const into = Math.max(0, Math.min(LINES_PER_LEVEL, this.engine.lines - (this.engine.level - 1) * LINES_PER_LEVEL));
    return into + '/' + LINES_PER_LEVEL + ' líneas · ' + fmtClock(this.engine.levelTime) + '/' + fmtClock(SECONDS_PER_LEVEL);
  }

  private refreshGauge(): void {
    const p = this.engine.levelProgress();
    this.hud.setLevelGauge(p.ratio, this.gaugeCaption(p), p.atMax ? 'max' : p.source);
  }

  private currentMode(): GameMode {
    const sel = document.querySelector<HTMLInputElement>('input[name="game-mode"]:checked');
    return sel && sel.value === 'chaos' ? 'chaos' : 'classic';
  }

  private syncModePicker(): void {
    const radios = document.querySelectorAll<HTMLInputElement>('input[name="game-mode"]');
    radios.forEach((r) => { r.checked = (r.value === this.gameMode); });
  }

  private mutatorPool(): MutatorId[] {
    const pool: MutatorId[] = ['wind', 'rain'];
    if (this.chaosLightningOn) pool.push('lightning');
    if (this.chaosHailOn) pool.push('hail');
    return pool;
  }

  private refreshLevelOut(): void {
    const lv = this.startLevel();
    const levelRangeOut = el<HTMLOutputElement>('level-range-out');
    levelRangeOut.textContent = lv + ' · ' + stageLabelFor(lv);
  }

  private startLevel(): number {
    const levelRange = el<HTMLInputElement>('level-range');
    const v = Number.parseInt(levelRange.value, 10);
    return Number.isFinite(v) ? Math.min(MAX_LEVEL, Math.max(1, v)) : 1;
  }

  private showStart(): void {
    this.syncModePicker();
    this.hud.setModeChip(this.gameMode === 'chaos' ? 'Caos' : 'Tradicional');
    this.hud.setChaosStatus('');
    this.hud.setMutatorChip('');
    this.hud.showOverlay('TETRIS 3D', 'Pulsa <span class="key">Enter</span> o haz clic en Jugar', '', true);
  }

  private showGameOver(): void {
    this.clearStormVisuals();
    const theme = this.stage.theme();
    this.gameMode = this.engine.mode;
    this.syncModePicker();
    this.hud.showOverlay(
      'FIN DEL JUEGO',
      'Pulsa <span class="key">Enter</span> o <span class="key">R</span> para reintentar',
      '<strong>' + this.engine.score.toLocaleString('es') + '</strong> pts · Nivel ' + this.engine.level + ' · Modo ' + (this.engine.mode === 'chaos' ? 'Caos' : 'Tradicional') +
        ' (' + theme.icon + ' ' + theme.name + ') · ' + this.engine.lines + ' líneas'
    );
  }

  private startGame(): void {
    this.gameMode = this.currentMode();
    saveGameMode(this.gameMode);
    this.chaosSeed = randomSeed();
    this.lastSpecialV = -1;
    this.hud.setModeChip(this.gameMode === 'chaos' ? 'Caos' : 'Tradicional');
    this.hud.setChaosStatus('');
    const lv = this.startLevel();
    this.engine = new TetrisEngine({
      mode: this.gameMode,
      mutatorConfig: { pool: this.mutatorPool() },
      seed: this.chaosSeed,
      onEvent: (e) => this.handleEvent(e),
      onMutatorEvent: (e) => this.handleMutatorEvent(e),
    });
    this.engine.start(lv);
    this.board.reset();
    this.debris.clear();
    this.clearStormVisuals();
    this.applyDebrisSettings();
    this.board.setActive(this.engine.active?.kind ?? 'T', this.engine.activeCells(), true, this.engine.special);
    this.stage.setLevel(lv, true);
    this.intensity.reset();
    this.music.startWithGenreSeed();
    console.info('[música] género:', this.music.getGenre(), '· semilla:', this.music.getSeed());
    this.lastThemeIdx = themeIndexForLevel(lv);
    this.hud.setStageChip(stageLabelFor(lv));
    this.hud.hideOverlay();
    this.hud.setStats(0, lv, 0);
    this.refreshGauge();
    this.refreshPreviews();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  private syncMusicPause(): void {
    this.music.setPaused(this.engine.phase === 'paused' || this.helpOpen);
  }

  private togglePause(): void {
    if (this.helpOpen) return;
    if (this.engine.phase === 'playing') {
      this.engine.pause(); this.sound.play('pause'); this.input.releaseAll();
      this.hud.showOverlay('PAUSA', 'Pulsa <span class="key">P</span> o <span class="key">Enter</span> para continuar', '');
    } else if (this.engine.phase === 'paused') {
      this.engine.resume(); this.hud.hideOverlay();
    }
    this.syncMusicPause();
  }

  private toggleHelp(): void {
    if (!this.helpOpen) {
      this.helpOpen = true;
      this.helpAutoPaused = this.engine.phase === 'playing';
      if (this.helpAutoPaused) this.engine.pause();
      this.input.releaseAll();
      el<HTMLDivElement>('help-overlay').classList.remove('hidden-overlay');
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    } else {
      this.helpOpen = false;
      el<HTMLDivElement>('help-overlay').classList.add('hidden-overlay');
      if (this.helpAutoPaused && this.engine.phase === 'paused') this.engine.resume();
      this.helpAutoPaused = false;
    }
    this.syncMusicPause();
  }

  private refreshPreviews(): void {
    const next = this.engine.peekNext(3);
    const upcoming = this.engine.peekSpecial();
    const nk = 'N:' + next.join('') + ':' + String(upcoming);
    if (nk !== this.lastNextKey) {
      this.lastNextKey = nk;
      drawNext(this.nextCanvas, next, upcoming);
    }
    const hk = String(this.engine.holdKind) + ':' + this.engine.canHold + ':' + String(this.engine.holdSpecial);
    if (hk !== this.lastHoldKey) {
      this.lastHoldKey = hk;
      drawHold(this.holdCanvas, this.engine.holdKind, this.engine.canHold, this.engine.holdSpecial);
    }
  }

  private handleEvent(e: GameEvent): void {
    const kind = this.engine.active?.kind ?? 'T';
    const hex = PIECE_COLORS[kind];
    switch (e.type) {
      case 'move': this.sound.play('move'); break;
      case 'rotate': this.sound.play('rotate'); break;
      case 'hold': this.sound.play('hold'); break;
      case 'bomb': {
        this.sound.play('explosion');
        this.shake.add(0.9);
        this.intensity.event('harddrop');
        const cells = e.cells ?? [];
        if (cells.length > 0) {
          const lo = Math.min(...cells.map((c) => c.y));
          const hi = Math.max(...cells.map((c) => c.y));
          this.flash.flash(lo, hi - lo + 1);
        }
        for (const c of cells) {
          const q = cellToWorld(c.x, c.y);
          this.board.particles.burst(new THREE.Vector3(q.x, q.y, 0.7), 0xffb03a, 9, 3.6, 3.8);
          this.board.particles.burst(new THREE.Vector3(q.x, q.y, 0.7), 0xe04e39, 5, 2.8, 3.0);
        }
        this.hud.toast('💣 BOOM — 2 filas reventadas', 1700);
        break;
      }
      case 'bolt': {
        this.sound.play('thunder');
        this.shake.add(0.6);
        const cells = e.cells ?? [];
        if (cells.length > 0) {
          const ys = cells.map((c) => c.y);
          this.flash.flash(Math.min(...ys), Math.max(...ys) - Math.min(...ys) + 1);
          for (const c of cells) {
            const q = cellToWorld(c.x, c.y);
            this.board.particles.burst(new THREE.Vector3(q.x, q.y, 0.7), 0xffd23f, 8, 3.0, 3.2);
          }
        }
        this.hud.toast('⚡ Rayo — ' + cells.length + ' bloques rotos', 1700);
        break;
      }
      case 'drill': {
        this.sound.play('lock');
        this.shake.add(0.35);
        for (const c of e.cells ?? []) {
          const q = cellToWorld(c.x, c.y);
          this.board.particles.burst(new THREE.Vector3(q.x, q.y, 0.7), 0x9aa7ff, 10, 3.2, 3.2);
        }
        this.hud.toast('🔩 Taladro — se hunde 2 filas', 1500);
        break;
      }
      case 'drill-strike': {
        this.sound.play('drill');
        this.shake.add(0.7);
        const column = e.column ?? 0;
        const cells = e.cells ?? [];
        if (cells.length > 0) {
          const ys = cells.map((c) => c.y);
          this.flash.flash(Math.min(...ys), Math.max(...ys) - Math.min(...ys) + 1);
        }
        for (const c of cells) {
          const q = cellToWorld(c.x, c.y);
          this.board.particles.burst(new THREE.Vector3(q.x, q.y, 0.7), 0xe4573f, 10, 3.4, 3.6);
        }
        this.hud.toast('🔥 Roca roja — columna ' + (column + 1) + ' en desventaja', 1800);
        break;
      }
      case 'harddrop':
        this.sound.play('harddrop');
        this.intensity.event('harddrop');
        this.shake.add(0.35);
        if (e.cells) for (const c of e.cells.slice(0, 4)) {
          const p = cellToWorld(c.x, c.y);
          this.board.particles.burst(new THREE.Vector3(p.x, p.y, 0.5), hex, 4, 1.4, 1.0);
        }
        break;
      case 'lock':
        this.sound.play('lock');
        this.shake.add(0.08);
        this.board.playLock(e.cells ?? [], kind);
        break;
      case 'clear': {
        const n = e.lines ?? 0;
        this.intensity.event(n >= 4 ? 'tetris' : 'clear');
        if (n >= 4) { this.sound.play('tetris'); this.hud.toast('¡TETRIS! +' + (e.scoreGained ?? 0)); }
        else { this.sound.play('clear', n); if (n > 1) this.hud.toast(n + ' líneas +' + (e.scoreGained ?? 0)); }
        this.shake.add(0.12 + n * 0.09);
        const rows = e.rows ?? [];
        if (rows.length > 0) {
          const lo = Math.min(...rows); const hi = Math.max(...rows);
          this.flash.flash(lo, hi - lo + 1);
          const cleared = this.board.playClear(rows, { launch: !this.debrisOn, particles: !this.debrisOn });
          if (this.debrisOn) this.debris.spawnCells(cleared);
        }
        break;
      }
      case 'combo':
        this.intensity.event('combo');
        if ((e.scoreGained ?? 0) > 1) this.hud.toast('Combo x' + e.scoreGained);
        break;
      case 'levelup': {
        const lv = e.level ?? this.engine.level;
        this.sound.play('levelup');
        this.intensity.event('levelup');
        this.shake.add(0.4);
        this.stage.setLevel(lv);
        const idx = themeIndexForLevel(lv);
        const label = stageLabelFor(lv);
        if (idx !== this.lastThemeIdx) {
          this.lastThemeIdx = idx;
          this.hud.toast('Nivel ' + lv + ' — ' + label, 2400);
          this.hud.levelBanner('NIVEL ' + lv, label);
        } else {
          this.hud.toast('Nivel ' + lv + ' — ¡más velocidad!', 2200);
          this.hud.levelBanner('NIVEL ' + lv, '¡más rápido!');
        }
        this.hud.setStageChip(label);
        break;
      }
      case 'gameover':
        this.sound.play('gameover');
        this.music.resolveEnding();
        this.shake.add(0.6);
        this.showGameOver();
        break;
    }
  }

  private animate = (now: number): void => {
    requestAnimationFrame(this.animate);
    if (!this.frameLimiter.shouldProcess(now)) return;
    this.timer.update(now);
    const rawDt = Math.min(this.timer.getDelta(), MAX_DELTA_SECONDS);
    if (document.hidden) return;
    const t = this.timer.getElapsed();
    this.input.update(rawDt);

    if (this.windArrowLeft > 0 && this.engine.phase === 'playing' && !this.helpOpen) {
      this.windArrowLeft = Math.max(0, this.windArrowLeft - rawDt);
      if (this.windArrowLeft === 0) this.hideWindArrow();
    }

    let frameDirty = false;
    if (this.engine.phase === 'playing') {
      this.engine.update(rawDt);
      frameDirty = true;

      if (this.engine.gridVersion !== this.lastGridV || this.board.busyClearing) {
        this.board.syncLocked(this.engine.grid);
        if (!this.board.busyClearing) this.lastGridV = this.engine.gridVersion;
      }
      if (this.engine.pieceVersion !== this.lastPieceV) {
        this.lastPieceV = this.engine.pieceVersion;
        if (this.engine.active) {
          const sp = this.engine.special;
          this.board.setActive(this.engine.active.kind, this.engine.activeCells(), false, sp);
          const label = sp === 'bomb' ? '💣 Bomba · revienta 2 filas'
            : sp === 'bolt' ? '⚡ Rayo · rompe 4 bloques'
            : sp === 'drill' ? '🔩 Taladro · se hunde 2 filas' : '';
          if (sp && this.engine.pieceVersion !== this.lastSpecialV) {
            this.lastSpecialV = this.engine.pieceVersion;
            this.hud.toast('Pieza especial: ' + label, 1600);
          }
          this.hud.setChaosStatus(label);
          this.board.setGhost(this.engine.ghostCells(), sp);
        }
      }

      this.musicSig.stackHeight = (this.engine.stackHeight + 1) / VISIBLE_ROWS;
      this.musicSig.level = (this.engine.level - 1) / (MAX_LEVEL - 1);
      this.musicSig.levelProgress = this.engine.levelProgress().ratio;
      this.musicSig.combo = Math.max(0, this.engine.combo);
      const v = this.intensity.update(rawDt, this.musicSig);
      this.musicAcc += rawDt;
      if (this.musicAcc >= MUSIC_INTENSITY_INTERVAL) { this.musicAcc = 0; this.music.setIntensity(v); }
    }

    if (this.board.update(rawDt)) {
      this.renderer.shadowMap.needsUpdate = true;
      frameDirty = true;
    }

    this.debris.setPaused(this.engine.phase === 'paused' || this.helpOpen);
    this.debris.update(rawDt);
    this.stage.update(rawDt);
    this.flash.update(rawDt);
    const s = this.shake.update(rawDt);
    if (s.x !== 0 || s.y !== 0) frameDirty = true;

    if (frameDirty || this.needsRender) {
      const swayX = Math.sin(t * 0.35) * 0.55;
      const swayY = Math.sin(t * 0.27) * 0.35;
      const f = this.currentFrame();
      this.camera.position.set(swayX + s.x, f.targetY + 0.9 + swayY + s.y, f.dist);
      this.camera.lookAt(0, f.targetY + 0.3, 0);
    }

    this.hudAcc += rawDt;
    if (this.hudAcc > HUD_REFRESH_SECONDS) {
      this.hudAcc = 0;
      this.hud.setStats(this.engine.score, this.engine.level, this.engine.lines);
      this.refreshGauge();
      this.refreshPreviews();
      frameDirty = true;
    }

    if (frameDirty || this.needsRender) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
    }
    this.needsRender = this.needsRender || frameDirty;
  };

  private currentFrame(): Frame {
    const h = window.innerHeight;
    const compact = window.innerWidth <= 720 || h <= 480;
    const touch = this.input.getMode() === 'touch';
    const top = (compact ? 60 : 0) / h;
    const bottom = (touch && compact && this.camera.aspect < 1 ? 200 : 0) / h;
    const key = this.camera.aspect + ':' + top + ':' + bottom;
    if (key !== this.frameKey) {
      this.frameKey = key;
      this.frame = frameFor(this.camera.aspect, { top, bottom });
    }
    return this.frame;
  }
}

/* Punto de entrada: solo crea la app y la deja arrancar. */
new GameApp();