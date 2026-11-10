import * as THREE from 'three';
import { paintSky } from '../scene.js';
import type { SceneParts } from '../scene.js';
import { gradeSceneLighting, lightingOf, mixHex } from '../sceneLighting.js';
import type { SceneLighting } from '../sceneLighting.js';
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
  /** Luces ya graduadas de los extremos del fundido (ver `sceneLighting`). */
  private fromGraded: SceneLighting | null = null;
  private toGraded: SceneLighting | null = null;
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
      this.fromGraded = null;
      this.toGraded = null;
      this.onScenarioChange?.(targetId);
      return;
    }

    // Cambio entre escenarios: fundido de ~transitionSeconds (cielo, luces,
    // niebla, suelo); la geometría nueva se construye al terminar el fundido.
    this.fromLook = previous.look;
    this.toScenario = target;
    this.fromGraded = gradeSceneLighting(lightingOf(previous.look));
    this.toGraded = gradeSceneLighting(lightingOf(target.look));
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
    this.fromGraded = null;
    this.toGraded = null;
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

  /**
   * Aplica el look de un escenario. La iluminación se gradúa (`sceneLighting`)
   * para que el fondo cambie de ambiente sin oscurecer el diorama ni las piezas:
   * el cielo, las nubes y el confeti sí son los del escenario.
   */
  private applyLook(look: ScenarioLook): void {
    const p = this.parts;
    const light = gradeSceneLighting(lightingOf(look));
    paintSky(p.sky, look.sky);
    // Oculta la escenografía clásica mientras un escenario está activo.
    for (const h of p.hills) h.visible = false;
    p.sunGroup.visible = false;
    p.fog.color.setHex(look.fog.color);
    p.fog.near = light.fog.near;
    p.fog.far = light.fog.far;
    this.cleanFog.copy(p.fog.color);
    p.hemi.color.setHex(light.hemi.sky);
    p.hemi.groundColor.setHex(light.hemi.ground);
    p.hemi.intensity = light.hemi.intensity;
    p.key.color.setHex(light.key.color);
    p.key.intensity = light.key.intensity;
    p.fill.color.setHex(light.fill.color);
    p.fill.intensity = light.fill.intensity;
    p.groundMat.color.setHex(light.ground);
    const gm = p.gridMat as THREE.Material;
    gm.transparent = true;
    gm.opacity = look.ground.gridOpacity;
    p.cloudMat.color.setHex(look.clouds.color);
    for (const c of p.clouds) c.mesh.visible = look.clouds.visible;
    p.confetti.setAlpha(look.confetti);
  }

  private applyBlend(t: number): void {
    const a = this.fromLook;
    const b = this.toScenario ? this.toScenario.look : this.active?.look ?? null;
    const ga = this.fromGraded;
    const gb = this.toGraded;
    if (!a || !b) { if (b) this.applyLook(b); return; }
    if (!ga || !gb) { this.applyLook(b); return; }

    const p = this.parts;
    paintSky(p.sky, [
      mixHex(a.sky[0], b.sky[0], t),
      mixHex(a.sky[1], b.sky[1], t),
      mixHex(a.sky[2], b.sky[2], t),
      mixHex(a.sky[3], b.sky[3], t),
    ]);

    // La niebla (color) es ambiente; sus distancias se interpolan ya graduadas
    // para que nunca llegue a empezar delante del plano del tablero.
    p.fog.color.setHex(mixHex(a.fog.color, b.fog.color, t));
    p.fog.near = ga.fog.near + (gb.fog.near - ga.fog.near) * t;
    p.fog.far = ga.fog.far + (gb.fog.far - ga.fog.far) * t;
    this.cleanFog.copy(p.fog.color);

    // Luces graduadas: el fundido de ambiente no apaga el diorama.
    p.hemi.color.setHex(mixHex(ga.hemi.sky, gb.hemi.sky, t));
    p.hemi.groundColor.setHex(mixHex(ga.hemi.ground, gb.hemi.ground, t));
    p.hemi.intensity = ga.hemi.intensity + (gb.hemi.intensity - ga.hemi.intensity) * t;

    p.key.color.setHex(mixHex(ga.key.color, gb.key.color, t));
    p.key.intensity = ga.key.intensity + (gb.key.intensity - ga.key.intensity) * t;

    p.fill.color.setHex(mixHex(ga.fill.color, gb.fill.color, t));
    p.fill.intensity = ga.fill.intensity + (gb.fill.intensity - ga.fill.intensity) * t;

    p.groundMat.color.setHex(mixHex(ga.ground, gb.ground, t));
    const gm = p.gridMat as THREE.Material;
    gm.transparent = true;
    gm.opacity = a.ground.gridOpacity + (b.ground.gridOpacity - a.ground.gridOpacity) * t;

    p.cloudMat.color.setHex(mixHex(a.clouds.color, b.clouds.color, t));
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
