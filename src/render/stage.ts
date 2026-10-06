import * as THREE from 'three';
import { paintSky } from './scene.js';
import type { SceneParts } from './scene.js';
import { THEMES, themeIndexForLevel } from './themes.js';
import type { StageTheme } from './themes.js';
import { WeatherSystem } from './weather.js';
import { Characters } from './characters.js';

export interface StageOptions { onThunder?: () => void }

export interface Stage {
  /** Starts a smooth transition to the theme running at `level`. */
  setLevel(level: number, immediate?: boolean): void;
  /** Off = classic static background: no theme motion, weather or characters. */
  setEffectsEnabled(on: boolean, immediate?: boolean): void;
  effectsEnabled(): boolean;
  /** Theme currently being displayed (target of the running transition). */
  theme(): StageTheme;
  update(dt: number): void;
}

const TRANSITION_SECONDS = 1.6;
/** Gradación de luz global: menos ambiente y más luz clave => sombras más marcadas. */
const HEMI_GRADE = 0.62;
const KEY_GRADE = 1.28;

export function createStage(parts: SceneParts, opts: StageOptions = {}): Stage {
  const weather = new WeatherSystem(parts.scene);
  const characters = new Characters(parts.scene);

  // Additive sky flash used by storm lightning.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(240, 130), flashMat);
  flash.position.set(0, 10, -78);
  flash.visible = false;
  parts.scene.add(flash);

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

  const scratch = new THREE.Color();
  const tmpColor = new THREE.Color();
  const skyStops: [number, number, number, number] = [0, 0, 0, 0];

  function themeAt(i: number): StageTheme {
    return THEMES[i] ?? (THEMES[0] as StageTheme);
  }
  function mixHex(a: number, b: number, t: number, out: THREE.Color): number {
    out.setHex(a);
    tmpColor.setHex(b);
    out.lerp(tmpColor, t);
    return out.getHex();
  }
  /** Pushes the interpolated look between `fromIdx` and `toIdx` into the scene. */
  function apply(t: number): void {
    const a = themeAt(fromIdx);
    const b = themeAt(toIdx);
    skyStops[0] = mixHex(a.sky[0], b.sky[0], t, scratch);
    skyStops[1] = mixHex(a.sky[1], b.sky[1], t, scratch);
    skyStops[2] = mixHex(a.sky[2], b.sky[2], t, scratch);
    skyStops[3] = mixHex(a.sky[3], b.sky[3], t, scratch);
    paintSky(parts.sky, skyStops);
    mixHex(a.fog.color, b.fog.color, t, parts.fog.color);
    parts.fog.near = a.fog.near + (b.fog.near - a.fog.near) * t;
    parts.fog.far = a.fog.far + (b.fog.far - a.fog.far) * t;
    for (let i = 0; i < parts.hills.length; i++) {
      const mesh = parts.hills[i];
      if (!mesh) continue;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(mixHex(a.hills[i] ?? 0xffffff, b.hills[i] ?? 0xffffff, t, scratch));
    }
    parts.sunMat.color.setHex(mixHex(a.sun.color, b.sun.color, t, scratch));
    parts.rayMat.color.setHex(mixHex(a.sun.rayColor, b.sun.rayColor, t, scratch));
    parts.sunGroup.position.set(
      a.sun.x + (b.sun.x - a.sun.x) * t,
      a.sun.y + (b.sun.y - a.sun.y) * t,
      -52
    );
    parts.sunGroup.scale.setScalar(a.sun.scale + (b.sun.scale - a.sun.scale) * t);
    parts.hemi.color.setHex(mixHex(a.hemi.sky, b.hemi.sky, t, scratch));
    parts.hemi.groundColor.setHex(mixHex(a.hemi.ground, b.hemi.ground, t, scratch));
    baseHemi = (a.hemi.intensity + (b.hemi.intensity - a.hemi.intensity) * t) * HEMI_GRADE;
    parts.key.color.setHex(mixHex(a.dir.color, b.dir.color, t, scratch));
    baseKey = (a.dir.intensity + (b.dir.intensity - a.dir.intensity) * t) * KEY_GRADE;
    parts.groundMat.color.setHex(mixHex(a.ground.color, b.ground.color, t, scratch));
    parts.gridMat.opacity = a.ground.gridOpacity + (b.ground.gridOpacity - a.ground.gridOpacity) * t;
    parts.cloudMat.color.setHex(mixHex(a.clouds.color, b.clouds.color, t, scratch));
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
    const f = enabled ? flashK : 0;
    parts.key.intensity = baseKey * (1 + 1.8 * f);
    parts.hemi.intensity = baseHemi * (1 + 0.7 * f);
  }

  startTransition(themeIndexForLevel(level), true);

  return {
    setLevel(lv: number, immediate = false): void {
      level = lv;
      if (enabled) startTransition(themeIndexForLevel(lv), immediate);
    },
    setEffectsEnabled(on: boolean, immediate = false): void {
      if (enabled === on) return;
      enabled = on;
      if (!on) {
        // Classic frozen background: day palette, extras hidden and paused.
        startTransition(0, true);
        weather.setEnabled(false, true);
        characters.setEnabled(false);
        flashK = 0;
        flashMat.opacity = 0;
        flash.visible = false;
      } else {
        weather.setEnabled(true, true);
        characters.setEnabled(true);
        startTransition(themeIndexForLevel(level), immediate);
      }
      syncVisibility();
    },
    effectsEnabled(): boolean { return enabled; },
    theme(): StageTheme { return themeAt(toIdx); },
    update(dt: number): void {
      time += dt;
      if (enabled) {
        if (transitioning) {
          k = Math.min(1, k + dt / TRANSITION_SECONDS);
          if (k >= 1) transitioning = false;
          apply(k);
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
      updateLightFlash();
    }
  };
}
