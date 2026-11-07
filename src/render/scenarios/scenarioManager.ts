import * as THREE from 'three';
import { paintSky } from '../scene.js';
import type { SceneParts } from '../scene.js';
import type { Scenario, ScenarioLook } from './scenario.js';
import { scenarioRegistry } from './scenarioRegistry.js';
import { scenarioForLevel } from './levelMapping.js';

export interface ScenarioManagerOptions {
  parts: SceneParts;
  levelsPerScenario: number;
  transitionSeconds: number;
  onScenarioChange?: (id: string) => void;
}

export class ScenarioManager {
  private readonly parts: SceneParts;
  private readonly levelsPerScenario: number;
  private readonly transitionSeconds: number;
  private readonly onScenarioChange?: (id: string) => void;

  private active: Scenario | null = null;

  private fromLook: ScenarioLook | null = null;
  private toScenario: Scenario | null = null;
  private transitionK = 1;
  private transitioning = false;

  /** Niebla "limpia" del escenario actual (sin el oscurecido por lluvia).
   *  El stage la usa como base para la tormenta del Caos. */
  private readonly cleanFog = new THREE.Color();

  private level = 1;

  constructor(opts: ScenarioManagerOptions) {
    this.parts = opts.parts;
    this.levelsPerScenario = opts.levelsPerScenario;
    this.transitionSeconds = opts.transitionSeconds;
    this.onScenarioChange = opts.onScenarioChange;
  }

  activeScenario(): Scenario | null { return this.active; }

  /** Niebla limpia del escenario (sin oscurecido por lluvia). */
  currentFog(): THREE.Color { return this.cleanFog; }

  /**
   * Fija el nivel actual. Devuelve true si el gestor se hace cargo del fondo
   * (hay o habrá un escenario); false si el nivel aún no tiene escenario y el
   * stage debe usar el tema clásico.
   */
  setLevel(lv: number, immediate = false): boolean {
    this.level = lv;
    const target = this.scenarioForLevel(lv);
    if (!target) {
      // Sin escenario para este nivel: si había uno activo, se suelta.
      if (this.active) this.releaseActive();
      return false;
    }
    // Si ya estamos en ese escenario (o vamos hacia él) no reconstruimos.
    const current = this.toScenario?.id ?? this.active?.id ?? null;
    if (target === current) return true;
    this.startTransition(target, immediate);
    return true;
  }

  setScenario(id: string, immediate = false): void {
    const s = scenarioRegistry.get(id);
    if (!s) return;
    this.startTransition(s.id, immediate);
  }

  setEffectsEnabled(on: boolean, immediate = false): void {
    if (!on) {
      this.releaseActive();
      return;
    }
    if (this.active) {
      // Ya visible: basta con reaplicar el look (sin reconstruir geometría).
      this.applyLook(this.active.look);
      return;
    }
    const target = this.scenarioForLevel(this.level);
    if (target) this.startTransition(target, immediate);
  }

  /** true mientras un escenario controla el fondo (activo o en transición). */
  effectsEnabled(): boolean { return this.active !== null || this.transitioning; }

  /**
   * Devuelve el id del escenario que corresponde a un nivel (ver
   * `scenarioForLevel`), o null si todavía no hay ninguno disponible.
   */
  private scenarioForLevel(lv: number): string | null {
    return scenarioForLevel(scenarioRegistry.all(), lv, this.levelsPerScenario);
  }

  private startTransition(targetId: string, immediate: boolean): void {
    const target = scenarioRegistry.get(targetId);
    if (!target) return;

    const previous = this.active;
    const same = previous !== null && previous.id === targetId;

    // Primera activación (no hay escenario previo) o mismo objetivo: construir
    // de inmediato, sin fundido (no hay look de origen que interpolar).
    if (!previous || same) {
      this.releaseActive();
      target.build(this.parts);
      this.applyLook(target.look);
      this.active = target;
      this.transitionK = 1;
      this.transitioning = false;
      this.fromLook = null;
      this.toScenario = null;
      this.onScenarioChange?.(targetId);
      return;
    }

    // Cambio entre escenarios: fundido de ~transitionSeconds (cielo, luces,
    // niebla, suelo); la geometría nueva se construye al terminar el fundido.
    this.fromLook = previous.look;
    this.toScenario = target;
    this.transitionK = 0;
    this.transitioning = true;

    if (immediate) {
      this.transitionK = 1;
      this.transitioning = false;
      this.finishTransition();
    }
  }

  private finishTransition(): void {
    this.releaseActive();
    const target = this.toScenario;
    if (target) {
      target.build(this.parts);
      this.applyLook(target.look);
      this.active = target;
      this.onScenarioChange?.(target.id);
    }
    this.fromLook = null;
    this.toScenario = null;
  }

  private releaseActive(): void {
    if (this.active) {
      this.active.release();
      this.active = null;
    }
    // Restaura la escenografía clásica (colinas + sol) que los escenarios ocultan.
    for (const h of this.parts.hills) h.visible = true;
    this.parts.sunGroup.visible = true;
  }

  private applyLook(look: ScenarioLook): void {
    const p = this.parts;
    paintSky(p.sky, look.sky);
    // Oculta la escenografía clásica mientras un escenario está activo.
    for (const h of p.hills) h.visible = false;
    p.sunGroup.visible = false;
    p.fog.color.setHex(look.fog.color);
    p.fog.near = look.fog.near;
    p.fog.far = look.fog.far;
    this.cleanFog.copy(p.fog.color);
    p.hemi.color.setHex(look.hemi.sky);
    p.hemi.groundColor.setHex(look.hemi.ground);
    p.hemi.intensity = look.hemi.intensity;
    p.key.color.setHex(look.key.color);
    p.key.intensity = look.key.intensity;
    p.fill.color.setHex(look.fill.color);
    p.fill.intensity = look.fill.intensity;
    p.groundMat.color.setHex(look.ground.color);
    const gm = p.gridMat as THREE.Material;
    gm.transparent = true;
    gm.opacity = look.ground.gridOpacity;
    p.cloudMat.color.setHex(look.clouds.color);
    for (const c of p.clouds) c.mesh.visible = look.clouds.visible;
    p.confetti.setAlpha(look.confetti);
  }

  private applyBlend(t: number): void {
    const a = this.fromLook;
    const b = this.toScenario ? this.toScenario.look : this.active!.look;
    if (!a || !b) { if (b) this.applyLook(b); return; }

    const p = this.parts;
    const scratch = new THREE.Color();
    const skyStops: [number, number, number, number] = [
      lerpHex(a.sky[0], b.sky[0], t, scratch),
      lerpHex(a.sky[1], b.sky[1], t, scratch),
      lerpHex(a.sky[2], b.sky[2], t, scratch),
      lerpHex(a.sky[3], b.sky[3], t, scratch),
    ];
    paintSky(p.sky, skyStops);

    p.fog.color.copy(
      new THREE.Color().setHex(a.fog.color).lerp(new THREE.Color().setHex(b.fog.color), t)
    );
    p.fog.near = a.fog.near + (b.fog.near - a.fog.near) * t;
    p.fog.far = a.fog.far + (b.fog.far - a.fog.far) * t;
    this.cleanFog.copy(p.fog.color);

    p.hemi.color.setHex(lerpHex(a.hemi.sky, b.hemi.sky, t, scratch));
    p.hemi.groundColor.setHex(lerpHex(a.hemi.ground, b.hemi.ground, t, scratch));
    p.hemi.intensity = a.hemi.intensity + (b.hemi.intensity - a.hemi.intensity) * t;

    p.key.color.setHex(lerpHex(a.key.color, b.key.color, t, scratch));
    p.key.intensity = a.key.intensity + (b.key.intensity - a.key.intensity) * t;

    p.fill.color.setHex(lerpHex(a.fill.color, b.fill.color, t, scratch));
    p.fill.intensity = a.fill.intensity + (b.fill.intensity - a.fill.intensity) * t;

    p.groundMat.color.setHex(lerpHex(a.ground.color, b.ground.color, t, scratch));
    const gm = p.gridMat as THREE.Material;
    gm.transparent = true;
    gm.opacity = a.ground.gridOpacity + (b.ground.gridOpacity - a.ground.gridOpacity) * t;

    p.cloudMat.color.setHex(lerpHex(a.clouds.color, b.clouds.color, t, scratch));
    for (const c of p.clouds) c.mesh.visible = b.clouds.visible;

    p.confetti.setAlpha(a.confetti + (b.confetti - a.confetti) * t);
  }

  update(dt: number): void {
    if (this.transitioning) {
      // Fundido de ~transitionSeconds: cielo, luces, niebla y suelo pasan del
      // look anterior al nuevo; la geometría nueva se construye al terminar.
      this.transitionK = Math.min(1, this.transitionK + dt / this.transitionSeconds);
      if (this.transitionK >= 1) {
        this.transitioning = false;
        this.finishTransition();
      } else {
        this.applyBlend(this.transitionK);
      }
    }
    // Animación propia del escenario (parpadeos, deriva, etc.).
    if (this.active) this.active.update(dt);
  }
}

function lerpHex(a: number, b: number, t: number, out: THREE.Color): number {
  out.setHex(a);
  const c2 = new THREE.Color().setHex(b);
  out.lerp(c2, t);
  return out.getHex();
}
