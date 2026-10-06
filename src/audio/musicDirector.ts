/**
 * MusicDirector: única pieza que el juego conoce de la música. Expone el
 * ciclo de vida (start/stop/setIntensity), el toggle on/off (enable/disable/
 * toggle/isEnabled) y la coordinación con pausa y pestaña oculta. El motor de
 * audio se crea solo tras el primer gesto del usuario (política de autoplay).
 */
import { FADE_OUT_S } from './musicConstants.js';
import { clamp01 } from './musicPatterns.js';
import { MusicEngine } from './musicEngine.js';

export class MusicDirector {
  private engine: MusicEngine | null = null;
  private enabled = true;
  private unlocked = false;
  private playing = false;
  private paused = false;
  private hidden = false;
  private started = false;
  private intensity = 0;
  private seed = 1;
  private disableTimer = 0;

  /** Llamar desde un gesto de usuario (clic, tecla o toque). */
  unlock(): void {
    this.unlocked = true;
    this.playIfDesired();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Activa la música (no crea el AudioContext sin gesto previo). */
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    window.clearTimeout(this.disableTimer);
    this.playIfDesired();
  }

  /**
   * Desactiva la música: fade-out corto y, al terminar, se detiene el
   * scheduler y se suspende el AudioContext (cero CPU mientras está off).
   */
  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    window.clearTimeout(this.disableTimer);
    const eng = this.engine;
    if (!eng) return;
    eng.stop(FADE_OUT_S);
    this.disableTimer = window.setTimeout(() => {
      if (!this.enabled) this.engine?.setHidden(true);
    }, FADE_OUT_S * 1000 + 100);
  }

  toggle(): void {
    if (this.enabled) this.disable();
    else this.enable();
  }

  /** Comienza la canción de una partida: misma semilla ⇒ misma canción. */
  start(seed: number): void {
    this.seed = seed >>> 0;
    this.playing = true;
    this.paused = false;
    this.started = false;
    this.intensity = 0;
    this.playIfDesired();
  }

  /** Detiene la música (fade-out y scheduler parado). */
  stop(): void {
    this.playing = false;
    this.started = false;
    this.engine?.stop(FADE_OUT_S);
  }

  /** Cierre suave al terminar la partida (cadencia + fundido largo). */
  resolveEnding(): void {
    this.playing = false;
    this.started = false;
    this.engine?.resolveEnding();
  }

  /** El juego solo llama esto en cada frame; no conoce detalles del audio. */
  setIntensity(value: number): void {
    this.intensity = clamp01(value);
    this.engine?.setIntensity(this.intensity);
  }

  /** Pausa del juego o de la ayuda: silencio con fade y reanudación suave. */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) this.engine?.stop(FADE_OUT_S);
    else this.playIfDesired();
  }

  /** Pestaña oculta: además de silenciar, suspende el AudioContext. */
  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    if (hidden) {
      this.engine?.setHidden(true);
      return;
    }
    this.engine?.setHidden(false);
    this.playIfDesired();
  }

  dispose(): void {
    window.clearTimeout(this.disableTimer);
    this.engine?.dispose();
    this.engine = null;
    this.playing = false;
    this.started = false;
  }

  private playIfDesired(): void {
    if (!this.enabled || !this.unlocked || !this.playing || this.paused || this.hidden) return;
    const eng = this.ensureEngine();
    if (!eng) return;
    if (this.started) {
      if (!eng.running) eng.resumePlayback();
    } else {
      eng.start(this.seed, this.intensity);
      this.started = true;
    }
  }

  /** Crea el motor dentro de un gesto; devuelve null si el navegador lo bloquea. */
  private ensureEngine(): MusicEngine | null {
    try {
      if (!this.engine) {
        this.engine = new MusicEngine();
        this.engine.setIntensity(this.intensity);
      }
      return this.engine;
    } catch {
      return null;
    }
  }
}