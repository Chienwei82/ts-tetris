import * as THREE from 'three';
import { setSpriteAlpha, spriteMaterial } from './particles.js';
import type { WeatherKind } from './themes.js';

interface Box { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }

const FADE_SECONDS = 1.6;

function makeTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cssRgb(hex: number): string {
  return 'rgb(' + ((hex >> 16) & 255) + ',' + ((hex >> 8) & 255) + ',' + (hex & 255) + ')';
}

/* Thin vertical streak: a raindrop. */
function rainTexture(): THREE.CanvasTexture {
  return makeTex(16, 64, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(6, 0, 4, 64);
  });
}

/* Soft dot: a snowflake. */
function snowTexture(): THREE.CanvasTexture {
  return makeTex(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 26);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
  });
}


/* Paper scrap with a fold: a leaf / petal. */
function leafTexture(): THREE.CanvasTexture {
  return makeTex(64, 64, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(32, 32, 20, 30, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(26, 12, 5, 34);
  });
}

/* 4-point sparkle: stars. */
function starTexture(): THREE.CanvasTexture {
  return makeTex(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 14);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(32, 4); ctx.lineTo(32, 60);
    ctx.moveTo(4, 32); ctx.lineTo(60, 32);
    ctx.stroke();
  });
}

/* Warm glow: fireflies. */
function glowTexture(): THREE.CanvasTexture {
  return makeTex(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,200,0.7)');
    g.addColorStop(1, 'rgba(255,255,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* Horizontal streak with fading tail: a shooting star. */
function streakTexture(): THREE.CanvasTexture {
  return makeTex(128, 16, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 6, 128, 4);
  });
}

/* Soft-edged aurora curtain in a single hue. */
function auroraTexture(color: number): THREE.CanvasTexture {
  return makeTex(128, 64, (ctx) => {
    const g = ctx.createLinearGradient(0, 6, 0, 58);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, cssRgb(color));
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 64);
    ctx.globalCompositeOperation = 'destination-out';
    const gl = ctx.createLinearGradient(0, 0, 42, 0);
    gl.addColorStop(0, 'rgba(0,0,0,1)');
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, 42, 64);
    const gr = ctx.createLinearGradient(128, 0, 86, 0);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(86, 0, 42, 64);
    ctx.globalCompositeOperation = 'source-over';
  });
}

interface FallOpts {
  count: number;
  tex: THREE.CanvasTexture;
  size: number;
  palette: number[];
  /** Fall speed range (world units/second); ignored when `fall` is false. */
  speed: [number, number];
  /** Lateral sway amplitude multiplied by the stage wind. */
  swayAmp: number;
  swayFreq: number;
  fall: boolean;
  /** Twinkle angular speed for alpha pulsing (0 = steady alpha). */
  twinkle: number;
  /** Slow wandering drift for floating fields (fireflies). */
  wander: number;
  box: Box;
  alpha: number;
}

/** Point field that falls with the wind, or twinkles in place (stars/fireflies). */
class FallField {
  readonly points: THREE.Points;
  private opts: FallOpts;
  private mat: THREE.ShaderMaterial;
  private attr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;
  private speed: Float32Array;
  private phase: Float32Array;
  private fade = 0;
  private target = 0;
  private time = 0;
  constructor(opts: FallOpts) {
    this.opts = opts;
    const n = opts.count;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const alp = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.phase = new Float32Array(n);
    const b = opts.box;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = b.x0 + Math.random() * (b.x1 - b.x0);
      pos[i * 3 + 1] = b.y0 + Math.random() * (b.y1 - b.y0);
      pos[i * 3 + 2] = b.z0 + Math.random() * (b.z1 - b.z0);
      const c = new THREE.Color(opts.palette[i % opts.palette.length] ?? 0xffffff);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      alp[i] = 1;
      this.speed[i] = opts.speed[0] + Math.random() * (opts.speed[1] - opts.speed[0]);
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(alp, 1);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aAlpha', this.alphaAttr);
    this.mat = spriteMaterial(opts.tex, opts.size);
    setSpriteAlpha(this.mat, 0);
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }
  setTarget(on: boolean, immediate: boolean): void {
    this.target = on ? 1 : 0;
    if (immediate) {
      this.fade = this.target;
      setSpriteAlpha(this.mat, this.opts.alpha * this.fade);
      this.points.visible = this.fade > 0.01;
    }
  }
  update(dt: number, wind: number): void {
    if (this.fade !== this.target) {
      const step = dt / FADE_SECONDS;
      this.fade = this.target > this.fade ? Math.min(this.target, this.fade + step) : Math.max(this.target, this.fade - step);
      setSpriteAlpha(this.mat, this.opts.alpha * this.fade);
      this.points.visible = this.fade > 0.01;
    }
    if (!this.points.visible) return;
    this.time += dt;
    const a = this.attr.array as Float32Array;
    const n = this.opts.count;
    const b = this.opts.box;
    const speed = this.speed;
    const phase = this.phase;
    const t = this.time;
    if (this.opts.fall) {
      const sway = dt * this.opts.swayAmp * (0.4 + wind * 0.6);
      const freq = this.opts.swayFreq;
      for (let i = 0; i < n; i++) {
        const ix = i * 3;
        let y = (a[ix + 1] ?? 0) - (speed[i] ?? 1) * dt;
        let x = (a[ix] ?? 0) + Math.sin(t * freq + (phase[i] ?? 0)) * sway;
        if (y < b.y0) {
          y = b.y1;
          x = b.x0 + Math.random() * (b.x1 - b.x0);
        }
        a[ix] = x;
        a[ix + 1] = y;
      }
      this.attr.needsUpdate = true;
    } else if (this.opts.wander > 0) {
      const wander = this.opts.wander;
      for (let i = 0; i < n; i++) {
        const ix = i * 3;
        let x = (a[ix] ?? 0) + Math.sin(t * 0.6 + (phase[i] ?? 0)) * dt * wander;
        let y = (a[ix + 1] ?? 0) + Math.cos(t * 0.45 + (phase[i] ?? 0) * 1.7) * dt * wander * 0.6;
        if (x < b.x0) x = b.x1;
        if (x > b.x1) x = b.x0;
        if (y < b.y0) y = b.y1;
        if (y > b.y1) y = b.y0;
        a[ix] = x;
        a[ix + 1] = y;
      }
      this.attr.needsUpdate = true;
    }
    if (this.opts.twinkle > 0) {
      const alp = this.alphaAttr.array as Float32Array;
      const tw = this.opts.twinkle;
      for (let i = 0; i < n; i++) {
        alp[i] = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * tw + (phase[i] ?? 0) * 3));
      }
      this.alphaAttr.needsUpdate = true;
    }
  }
}

/** Occasional diagonal meteors for the Cosmos theme. */
class ShootingStars {
  readonly object = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private mats: THREE.MeshBasicMaterial[] = [];
  private remaining: number[] = [];
  private vel: THREE.Vector2[] = [];
  private total = 1.3;
  private timer = 3;
  private on = false;
  constructor() {
    const geo = new THREE.PlaneGeometry(5, 0.3);
    const tex = streakTexture();
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.meshes.push(mesh);
      this.mats.push(mat);
      this.remaining.push(0);
      this.vel.push(new THREE.Vector2(1, 0));
      this.object.add(mesh);
    }
  }
  setActive(on: boolean): void {
    this.on = on;
    if (!on) {
      for (let i = 0; i < this.meshes.length; i++) {
        this.remaining[i] = 0;
        const m = this.meshes[i];
        if (m) m.visible = false;
      }
    }
  }
  update(dt: number): void {
    if (!this.on) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      const slot = this.remaining.findIndex((r) => r <= 0);
      const mesh = slot >= 0 ? this.meshes[slot] : undefined;
      const mat = slot >= 0 ? this.mats[slot] : undefined;
      const v = this.vel[slot];
      if (mesh && mat && v) {
        mesh.position.set(-34 + Math.random() * 34, 16 + Math.random() * 10, -50);
        v.set(20 + Math.random() * 10, -(8 + Math.random() * 6));
        mesh.rotation.z = Math.atan2(v.y, v.x);
        this.remaining[slot] = this.total;
        mesh.visible = true;
      }
      this.timer = 3 + Math.random() * 5;
    }
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      const mat = this.mats[i];
      const v = this.vel[i];
      const r = this.remaining[i] ?? 0;
      if (!mesh || !mat || !v || r <= 0) continue;
      this.remaining[i] = r - dt;
      mesh.position.x += v.x * dt;
      mesh.position.y += v.y * dt;
      const k = Math.max(0, this.remaining[i] ?? 0) / this.total;
      mat.opacity = Math.sin(Math.PI * Math.min(1, 1 - k)) * 0.9;
      if ((this.remaining[i] ?? 0) <= 0) mesh.visible = false;
    }
  }
}

/** Layered additive curtains seen in the Aurora theme. */
class AuroraBands {
  readonly object = new THREE.Group();
  private bands: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; baseX: number; baseY: number; phase: number }[] = [];
  private fade = 0;
  private target = 0;
  private time = 0;
  constructor() {
    const specs: Array<[number, number, number, number, number, number]> = [
      [0x3ef0a8, 52, 13, -24, 12, -60],
      [0x2ad4ff, 64, 10, 2, 16, -64],
      [0x7a5cff, 46, 15, 26, 13.5, -62],
      [0x53e0b0, 58, 11, -8, 9, -58]
    ];
    for (const [color, w, h, x, y, z] of specs) {
      const mat = new THREE.MeshBasicMaterial({
        map: auroraTexture(color), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(x, y, z);
      this.object.add(mesh);
      this.bands.push({ mesh, mat, baseX: x, baseY: y, phase: Math.random() * Math.PI * 2 });
    }
    this.object.visible = false;
  }
  setTarget(on: boolean, immediate: boolean): void {
    this.target = on ? 1 : 0;
    if (immediate) {
      this.fade = this.target;
      this.object.visible = this.fade > 0.01;
      if (!on) for (const b of this.bands) b.mat.opacity = 0;
    }
  }
  update(dt: number): void {
    if (this.fade !== this.target) {
      const step = dt / FADE_SECONDS;
      this.fade = this.target > this.fade ? Math.min(this.target, this.fade + step) : Math.max(this.target, this.fade - step);
      this.object.visible = this.fade > 0.01;
    }
    if (!this.object.visible) return;
    this.time += dt;
    for (const b of this.bands) {
      b.mat.opacity = this.fade * (0.16 + 0.1 * Math.sin(this.time * 0.4 + b.phase));
      b.mesh.position.x = b.baseX + Math.sin(this.time * 0.1 + b.phase) * 4;
      b.mesh.position.y = b.baseY + Math.sin(this.time * 0.23 + b.phase) * 0.6;
      b.mesh.rotation.z = Math.sin(this.time * 0.07 + b.phase) * 0.05;
    }
  }
}

/** Weather particle fields for every theme, with fade-in/out transitions. */
export class WeatherSystem {
  private readonly allFields: FallField[];
  private readonly byKind: Record<WeatherKind, FallField[]>;
  private readonly aurora = new AuroraBands();
  private readonly shooting = new ShootingStars();
  private kind: WeatherKind = 'clear';
  private enabled = true;
  constructor(scene: THREE.Scene) {
    const rainTex = rainTexture();
    const rain = new FallField({
      count: 650, tex: rainTex, size: 0.55, palette: [0xbfe0f5, 0xd8ecff],
      speed: [24, 32], swayAmp: 1.2, swayFreq: 2, fall: true, twinkle: 0, wander: 0,
      box: { x0: -38, x1: 38, y0: -14, y1: 26, z0: -24, z1: -4 }, alpha: 0.55
    });
    const storm = new FallField({
      count: 900, tex: rainTex, size: 0.65, palette: [0xa8c4dd, 0xbfd6ea],
      speed: [30, 40], swayAmp: 2.6, swayFreq: 2.6, fall: true, twinkle: 0, wander: 0,
      box: { x0: -38, x1: 38, y0: -14, y1: 28, z0: -26, z1: -2 }, alpha: 0.5
    });
    const snow = new FallField({
      count: 360, tex: snowTexture(), size: 0.26, palette: [0xffffff, 0xf0f8ff],
      speed: [1.1, 2.3], swayAmp: 1.1, swayFreq: 1.4, fall: true, twinkle: 0, wander: 0,
      box: { x0: -38, x1: 38, y0: -13, y1: 28, z0: -28, z1: -3 }, alpha: 0.95
    });
    const leaves = new FallField({
      count: 120, tex: leafTexture(), size: 0.36, palette: [0xe09a3a, 0xd97b3a, 0xc9a53a, 0xb86a35],
      speed: [2.2, 4.6], swayAmp: 2.6, swayFreq: 1.1, fall: true, twinkle: 0, wander: 0,
      box: { x0: -38, x1: 38, y0: -13, y1: 26, z0: -30, z1: -4 }, alpha: 0.95
    });
    const stars = new FallField({
      count: 150, tex: starTexture(), size: 0.34, palette: [0xffffff, 0xfff6d0, 0xd0e6ff],
      speed: [0, 0], swayAmp: 0, swayFreq: 0, fall: false, twinkle: 1.6, wander: 0,
      box: { x0: -44, x1: 44, y0: 2, y1: 30, z0: -72, z1: -48 }, alpha: 0.9
    });
    const fireflies = new FallField({
      count: 60, tex: glowTexture(), size: 0.22, palette: [0xffe066, 0xffd54a],
      speed: [0, 0], swayAmp: 0, swayFreq: 0, fall: false, twinkle: 2.2, wander: 0.5,
      box: { x0: -26, x1: 26, y0: -10, y1: -1, z0: -26, z1: -8 }, alpha: 0.9
    });
    this.allFields = [rain, storm, snow, leaves, stars, fireflies];
    this.byKind = {
      clear: [], leaves: [leaves], rain: [rain], storm: [storm],
      snow: [snow], stars: [stars, fireflies], aurora: [stars, snow], cosmos: [stars]
    };
    for (const f of this.allFields) scene.add(f.points);
    scene.add(this.aurora.object, this.shooting.object);
  }
  get weather(): WeatherKind { return this.kind; }
  setWeather(kind: WeatherKind, immediate = false): void {
    this.kind = kind;
    const active = new Set(this.byKind[kind]);
    for (const f of this.allFields) f.setTarget(active.has(f), immediate);
    this.aurora.setTarget(kind === 'aurora', immediate);
    this.shooting.setActive(kind === 'cosmos' && this.enabled);
  }
  setEnabled(on: boolean, immediate = false): void {
    this.enabled = on;
    if (!on) {
      for (const f of this.allFields) f.setTarget(false, true);
      this.aurora.setTarget(false, true);
      this.shooting.setActive(false);
    } else {
      this.setWeather(this.kind, immediate);
    }
  }
  update(dt: number, wind: number): void {
    if (!this.enabled) return;
    for (const f of this.allFields) f.update(dt, wind);
    this.aurora.update(dt);
    this.shooting.update(dt);
  }
}
