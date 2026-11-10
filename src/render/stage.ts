import * as THREE from 'three';
import { paintSky } from './scene.js';
import type { SceneParts } from './scene.js';
import { THEMES, themeIndexForLevel } from './themes.js';
import type { StageTheme } from './themes.js';
import { REFERENCE_LOOK, gradeSceneLighting, mixHex } from './sceneLighting.js';
import { WeatherSystem } from './weather.js';
import { Characters } from './characters.js';
import { WindSystem } from './fx/windSystem.js';
import type { ScenarioManager } from './scenarios/scenarioManager.js';

export interface StageOptions { onThunder?: () => void }

export interface Stage {
  /** Starts a smooth transition to the theme running at `level`. */
  setLevel(level: number, immediate?: boolean): void;
  /** Off = classic static background: no theme motion, weather or characters. */
  setEffectsEnabled(on: boolean, immediate?: boolean): void;
  effectsEnabled(): boolean;
  /** Lluvia de una tormenta del Caos: capa de lluvia y ambiente más oscuro. */
  setRain(on: boolean): void;
  /** Viento de una tormenta del Caos; `null` lo detiene. */
  setWind(dir: -1 | 1 | null): void;
  /** Ráfaga puntual de viento (acelera partículas un instante). */
  gust(dir: -1 | 1): void;
  /** Fogonazo de cielo puntual (relámpago del Caos, independiente del tema). */
  flashLightning(): void;
  /** Personajes del diorama (para adaptación al escenario). */
  characters(): Characters;
  /** Theme currently being displayed (target of the running transition). */
  theme(): StageTheme;
  update(dt: number): void;
  /** Inyecta el gestor de escenarios (opcional). */
  setScenarioManager(mgr: ScenarioManager | null): void;
  /** Devuelve el gestor de escenarios inyectado (o null). */
  scenarioManagerRef(): ScenarioManager | null;
}

const TRANSITION_SECONDS = 1.6;

export function createStage(parts: SceneParts, opts: StageOptions = {}): Stage {
  const weather = new WeatherSystem(parts.scene);
  const characters = new Characters(parts.scene);
  const windFx = new WindSystem(parts.scene);

  // Additive sky flash used by storm lightning.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(240, 130), flashMat);
  flash.position.set(0, 10, -78);
  flash.visible = false;
  parts.scene.add(flash);

  // Fogonazo puntual para los relámpagos del Caos (independiente del tema):
  // el cielo responde siempre, aunque el escenario no sea tormentoso.
  const chaosFlashMat = new THREE.MeshBasicMaterial({
    color: 0xdff0ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  const chaosFlash = new THREE.Mesh(new THREE.PlaneGeometry(240, 130), chaosFlashMat);
  chaosFlash.position.set(0, 10, -77.8);
  chaosFlash.visible = false;
  parts.scene.add(chaosFlash);
  let chaosFlashK = 0;

  let level = 1;
  let enabled = true;
  let fromIdx = 0;
  let toIdx = 0;
  let k = 1; // transition progress 0..1
  let transitioning = false;
  let time = 0;
  let wind = THEMES[0]?.wind ?? 1;
  let baseKey = 1;
  let baseHemi = 1;
  let flashK = 0;
  let thunderIn = -1;
  let nextStrike = 5 + Math.random() * 6;
  let skyTick = false;
  /* Tormentas del Caos: intención (reglas) separada del fundido visual. */
  let rainWanted = false;
  let windWanted: -1 | 1 | null = null;
  let rainK = 0;
  const RAIN_FOG = new THREE.Color(0x46566a);
  const fogBase = new THREE.Color();

  const skyStops: [number, number, number, number] = [0, 0, 0, 0];

  /** Gestor de escenarios (opcional). Cuando está activo, se encarga de
   *  cielo, luces, niebla y suelo; el stage solo anima nubes, clima y personajes. */
  let scenarioManager: ScenarioManager | null = null;

  function themeAt(i: number): StageTheme {
    return THEMES[i] ?? (THEMES[0] as StageTheme);
  }
  /**
   * Pushes the interpolated look between `fromIdx` and `toIdx` into the scene.
   * Las luces, el suelo y la niebla pasan por `gradeSceneLighting`: el tema
   * cambia el ambiente, pero el diorama y las piezas conservan su lectura.
   */
  function apply(t: number, repaintSky = true): void {
    if (scenarioManager && scenarioManager.effectsEnabled()) return;
    const a = themeAt(fromIdx);
    const b = themeAt(toIdx);
    skyStops[0] = mixHex(a.sky[0], b.sky[0], t);
    skyStops[1] = mixHex(a.sky[1], b.sky[1], t);
    skyStops[2] = mixHex(a.sky[2], b.sky[2], t);
    skyStops[3] = mixHex(a.sky[3], b.sky[3], t);
    // La lenta gradación del cielo admite media tasa: el resto va a 60 fps.
    if (repaintSky) paintSky(parts.sky, skyStops);
    parts.fog.color.setHex(mixHex(a.fog.color, b.fog.color, t));
    // Guardamos la niebla del tema: la lluvia la oscurece encima sin pisarla.
    fogBase.copy(parts.fog.color);
    for (let i = 0; i < parts.hills.length; i++) {
      const mesh = parts.hills[i];
      if (!mesh) continue;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(mixHex(a.hills[i] ?? 0xffffff, b.hills[i] ?? 0xffffff, t));
    }
    parts.sunMat.color.setHex(mixHex(a.sun.color, b.sun.color, t));
    parts.rayMat.color.setHex(mixHex(a.sun.rayColor, b.sun.rayColor, t));
    parts.sunGroup.position.set(
      a.sun.x + (b.sun.x - a.sun.x) * t,
      a.sun.y + (b.sun.y - a.sun.y) * t,
      -52
    );
    parts.sunGroup.scale.setScalar(a.sun.scale + (b.sun.scale - a.sun.scale) * t);
    const light = gradeSceneLighting({
      hemi: {
        sky: mixHex(a.hemi.sky, b.hemi.sky, t),
        ground: mixHex(a.hemi.ground, b.hemi.ground, t),
        intensity: a.hemi.intensity + (b.hemi.intensity - a.hemi.intensity) * t
      },
      key: {
        color: mixHex(a.dir.color, b.dir.color, t),
        intensity: a.dir.intensity + (b.dir.intensity - a.dir.intensity) * t
      },
      // El tema clásico no define relleno: usa el de referencia (el del diorama).
      fill: REFERENCE_LOOK.fill,
      ground: mixHex(a.ground.color, b.ground.color, t),
      fog: {
        near: a.fog.near + (b.fog.near - a.fog.near) * t,
        far: a.fog.far + (b.fog.far - a.fog.far) * t
      }
    });
    parts.hemi.color.setHex(light.hemi.sky);
    parts.hemi.groundColor.setHex(light.hemi.ground);
    baseHemi = light.hemi.intensity;
    parts.key.color.setHex(light.key.color);
    baseKey = light.key.intensity;
    parts.fill.color.setHex(light.fill.color);
    parts.fill.intensity = light.fill.intensity;
    parts.groundMat.color.setHex(light.ground);
    parts.fog.near = light.fog.near;
    parts.fog.far = light.fog.far;
    parts.gridMat.opacity = a.ground.gridOpacity + (b.ground.gridOpacity - a.ground.gridOpacity) * t;
    parts.cloudMat.color.setHex(mixHex(a.clouds.color, b.clouds.color, t));
    parts.confetti.setAlpha(a.confetti + (b.confetti - a.confetti) * t);
    wind = a.wind + (b.wind - a.wind) * t;
  }
  /** Booleans (visibility toggles) follow the target theme and the effects flag. */
  function syncVisibility(): void {
    const t = themeAt(toIdx);
    parts.confetti.points.visible = enabled;
    for (const f of parts.floaters) f.group.visible = enabled;
    for (const c of parts.clouds) c.mesh.visible = enabled && t.clouds.visible;
    parts.sunGroup.visible = t.sun.visible;
    parts.rays.visible = t.sun.raysVisible;
  }
  function startTransition(idx: number, immediate: boolean): void {
    if (immediate || !enabled) {
      fromIdx = idx;
      toIdx = idx;
      k = 1;
      transitioning = false;
      apply(1);
      syncVisibility();
      weather.setWeather(themeAt(idx).weather, true);
      characters.setTheme(idx);
      return;
    }
    fromIdx = toIdx;
    toIdx = idx;
    k = 0;
    transitioning = true;
    syncVisibility();
    weather.setWeather(themeAt(idx).weather, false);
    characters.setTheme(idx);
  }
  /** Random lightning strikes while the target theme is stormy. */
  function lightning(dt: number): void {
    const stormy = themeAt(toIdx).weather === 'storm';
    if (!stormy) {
      flashK = 0;
      thunderIn = -1;
      nextStrike = 5 + Math.random() * 6;
      flash.visible = false;
      return;
    }
    if (thunderIn > 0) {
      thunderIn -= dt;
      if (thunderIn <= 0) { thunderIn = -1; opts.onThunder?.(); }
    }
    if (flashK > 0) {
      flashK = Math.max(0, flashK - dt / 0.38);
      flashMat.opacity = flashK * (0.45 + 0.25 * Math.sin(time * 42)) * 0.8;
      flash.visible = flashMat.opacity > 0.02;
    }
    nextStrike -= dt;
    if (nextStrike <= 0 && flashK === 0) {
      flashK = 1;
      flash.visible = true;
      nextStrike = 5 + Math.random() * 7;
      thunderIn = 0.35;
    }
  }
  /** Keeps light intensities in sync with the current base values and any flash. */
  function updateLightFlash(): void {
    const f = enabled ? Math.max(flashK, chaosFlashK) : 0;
    parts.key.intensity = baseKey * (1 + 1.8 * f) * (1 - 0.42 * rainK);
    parts.hemi.intensity = baseHemi * (1 + 0.7 * f) * (1 - 0.3 * rainK);
  }

  startTransition(themeIndexForLevel(level), true);

  return {
    setLevel(lv: number, immediate = false): void {
      level = lv;
      // El gestor de escenarios decide si se hace cargo del fondo; si no hay
      // escenario para este nivel, cae al tema clásico.
      if (scenarioManager && enabled && scenarioManager.setLevel(lv, immediate)) return;
      if (enabled) startTransition(themeIndexForLevel(lv), immediate);
    },
    setEffectsEnabled(on: boolean, immediate = false): void {
      if (enabled === on) return;
      enabled = on;
      if (!on) {
        // Classic frozen background: day palette, extras hidden and paused.
        if (scenarioManager) scenarioManager.setEffectsEnabled(false, immediate);
        startTransition(0, true);
        weather.setEnabled(false, true);
        weather.setOverlay(null, true);
        characters.setEnabled(false);
        characters.setGust(null);
        characters.setShelter(false);
        windFx.setEnabled(false);
        rainK = 0;
        flashK = 0;
        flashMat.opacity = 0;
        flash.visible = false;
        chaosFlashK = 0;
        chaosFlashMat.opacity = 0;
        chaosFlash.visible = false;
      } else {
        weather.setEnabled(true, true);
        weather.setOverlay(rainWanted ? 'storm' : null, true);
        characters.setEnabled(true);
        characters.setShelter(rainWanted);
        characters.setGust(windWanted);
        if (windWanted) windFx.setDirection(windWanted);
        else windFx.setEnabled(false);
        if (scenarioManager) {
          scenarioManager.setEffectsEnabled(true, immediate);
          // Si no hay escenario para el nivel actual, vuelve al tema clásico.
          if (!scenarioManager.effectsEnabled()) startTransition(themeIndexForLevel(level), immediate);
        } else {
          startTransition(themeIndexForLevel(level), immediate);
        }
      }
      syncVisibility();
    },
    effectsEnabled(): boolean { return enabled; },
    setRain(on: boolean): void {
      rainWanted = on;
      if (enabled) weather.setOverlay(on ? 'storm' : null);
    },
    setWind(dir: -1 | 1 | null): void {
      windWanted = dir;
      if (!enabled) return;
      if (dir === null) windFx.setEnabled(false);
      else windFx.setDirection(dir);
      characters.setGust(dir);
    },
    gust(dir: -1 | 1): void {
      if (enabled) windFx.gust(dir);
    },
    flashLightning(): void {
      if (!enabled) return;
      chaosFlashK = 1;
      chaosFlashMat.opacity = 0.85;
      chaosFlash.visible = true;
    },
    theme(): StageTheme { return themeAt(toIdx); },
    update(dt: number): void {
      time += dt;
      // La lluvia oscurece la niebla del tema con un fundido corto.
      const rainTarget = enabled && rainWanted ? 1 : 0;
      rainK += (rainTarget - rainK) * Math.min(1, dt * 2.6);
      if (Math.abs(rainK - rainTarget) < 0.002) rainK = rainTarget;
      if (enabled) {
        // Cuando hay escenario activo, él gestiona cielo/luces/niebla/suelo.
        // El stage sigue animando nubes, floaters, confeti, clima y personajes.
        if (scenarioManager && scenarioManager.effectsEnabled()) {
          scenarioManager.update(dt);
        } else if (transitioning) {
          k = Math.min(1, k + dt / TRANSITION_SECONDS);
          const done = k >= 1;
          if (done) transitioning = false;
          // Cielo a media tasa durante la transición; frame final siempre pintado.
          skyTick = !skyTick;
          apply(k, done || skyTick);
        }
        for (const c of parts.clouds) {
          if (!c.mesh.visible) continue;
          c.mesh.position.y = c.y + Math.sin(time * c.speed * wind + c.phase) * 0.45;
          c.mesh.position.x = c.x + Math.sin(time * 0.06 * wind + c.phase) * 1.6 * wind;
        }
        for (const f of parts.floaters) {
          if (!f.group.visible) continue;
          f.group.position.y = f.y + Math.sin(time * 0.9 + f.phase) * 0.5;
          f.group.rotation.y += dt * 0.35;
          f.group.rotation.x = Math.sin(time * 0.6 + f.phase) * 0.12;
        }
        parts.confetti.update(dt);
        weather.update(dt, wind);
        characters.update(dt);
        lightning(dt);
      }
      // Niebla base: la del escenario si controla el fondo; si no, la clásica.
      const scenarioOn = scenarioManager !== null && scenarioManager.effectsEnabled();
      const baseFog = scenarioOn && scenarioManager ? scenarioManager.currentFog() : fogBase;
      if (rainK > 0.001) parts.fog.color.copy(baseFog).lerp(RAIN_FOG, rainK * 0.55);
      else parts.fog.color.copy(baseFog);
      windFx.update(dt);
      // Fogonazo del Caos: decae siempre para no quedarse encendido en pausa/off.
      if (chaosFlashK > 0) {
        chaosFlashK = Math.max(0, chaosFlashK - dt / 0.32);
        chaosFlashMat.opacity = chaosFlashK * 0.85;
        chaosFlash.visible = chaosFlashK > 0.02;
      }
      // Con escenario activo sus luces ya están ajustadas: modulamos flash/lluvia
      // sólo en modo clásico para no pisar el look del escenario.
      if (!scenarioOn) updateLightFlash();
    },
    /** Inyecta el gestor de escenarios. Cuando está activo, este controla
     *  cielo, luces, niebla y suelo en lugar de los temas. */
    setScenarioManager(mgr: ScenarioManager | null): void { scenarioManager = mgr; },
    /** Devuelve el gestor de escenarios inyectado (o null). */
    scenarioManagerRef(): ScenarioManager | null { return scenarioManager; },
    /** Personajes del diorama. */
    characters(): Characters { return characters; },
  };
}
