import * as THREE from 'three';
interface P { pos: THREE.Vector3; vel: THREE.Vector3; life: number; maxLife: number; color: THREE.Color; phase: number; }

/** White paper-scrap sprite tinted per-vertex. */
let confettiTex: THREE.CanvasTexture | null = null;
function confettiTexture(): THREE.CanvasTexture {
  if (confettiTex) return confettiTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(10, 12, 44, 40, 9);
    ctx.fill();
    // slight fold highlight so scraps read as paper, not dots
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(14, 16, 36, 6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  confettiTex = tex;
  return tex;
}

/** gl_PointSize = worldSize * framebufferHeight / (2 tan(fov/2)) / depth. */
function pointScale(worldSize: number): number {
  const h = window.innerHeight * Math.min(window.devicePixelRatio || 1, 2);
  return (worldSize * h) / (2 * Math.tan((40 * Math.PI) / 360));
}

/**
 * Point-sprite material shared by confetti and weather fields.
 * `uGlobal` fades a whole field in/out (weather transitions, theme attenuation).
 */
export function spriteMaterial(tex: THREE.CanvasTexture, worldSize: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: tex },
      uScale: { value: pointScale(worldSize) },
      uGlobal: { value: 1 }
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aAlpha;
      uniform float uScale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uScale / max(0.5, -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uGlobal;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        float a = tex.a * vAlpha * uGlobal;
        if (a < 0.03) discard;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    transparent: true,
    depthWrite: false
  });
}

export function updatePointScale(mat: THREE.ShaderMaterial, worldSize: number): void {
  const u = mat.uniforms['uScale'];
  if (u) u.value = pointScale(worldSize);
}

/** Sets the whole-field alpha multiplier (0 hides a field without touching its vertices). */
export function setSpriteAlpha(mat: THREE.ShaderMaterial, alpha: number): void {
  const u = mat.uniforms['uGlobal'];
  if (u) u.value = alpha;
}

export class ParticleSystem {
  readonly points: THREE.Points;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private parts: P[] = [];
  private max = 900;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;
  constructor() {
    const pos = new Float32Array(this.max * 3);
    const col = new Float32Array(this.max * 3);
    const alp = new Float32Array(this.max);
    this.posAttr = new THREE.BufferAttribute(pos, 3);
    this.colAttr = new THREE.BufferAttribute(col, 3);
    this.alphaAttr = new THREE.BufferAttribute(alp, 1);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aColor', this.colAttr);
    this.geo.setAttribute('aAlpha', this.alphaAttr);
    this.mat = spriteMaterial(confettiTexture(), 0.24);
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.geo.setDrawRange(0, 0);
  }
  burst(origin: THREE.Vector3, colorHex: number, count: number, speed: number, up = 2): void {
    const color = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= this.max) this.parts.shift();
      const a = Math.random() * Math.PI * 2;
      const r = (0.3 + Math.random() * 0.7) * speed;
      this.parts.push({
        pos: new THREE.Vector3(origin.x + (Math.random() - 0.5) * 0.6, origin.y + (Math.random() - 0.5) * 0.6, origin.z + (Math.random() - 0.5) * 0.6),
        vel: new THREE.Vector3(Math.cos(a) * r, Math.random() * up + 1, Math.sin(a) * r * 0.5 + 0.8),
        life: 0, maxLife: 0.7 + Math.random() * 0.7,
        color: color.clone().offsetHSL((Math.random() - 0.5) * 0.05, 0.02, Math.random() * 0.18),
        phase: Math.random() * Math.PI * 2
      });
    }
  }
  update(dt: number): void {
    const pos = this.posAttr.array as Float32Array;
    const col = this.colAttr.array as Float32Array;
    const alp = this.alphaAttr.array as Float32Array;
    let w = 0;
    for (const p of this.parts) {
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      // paper scraps flutter down slowly instead of ballistic neon sparks
      p.vel.y -= 3.4 * dt;
      p.vel.multiplyScalar(1 - 1.1 * dt);
      p.pos.addScaledVector(p.vel, dt);
      p.pos.x += Math.sin(p.life * 6 + p.phase) * dt * 1.2;
      p.pos.z += Math.cos(p.life * 5 + p.phase) * dt * 0.5;
      const k = 1 - p.life / p.maxLife;
      pos[w * 3] = p.pos.x; pos[w * 3 + 1] = p.pos.y; pos[w * 3 + 2] = p.pos.z;
      col[w * 3] = p.color.r; col[w * 3 + 1] = p.color.g; col[w * 3 + 2] = p.color.b;
      alp[w] = k * k;
      w++;
    }
    this.parts = this.parts.filter((p) => p.life < p.maxLife);
    this.geo.setDrawRange(0, w);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    updatePointScale(this.mat, 0.24);
  }
}

const AMBIENT_COLORS = [0xe04e39, 0xffc93c, 0x4d9de0, 0x58b368, 0xb477e6, 0xffffff, 0x46c6d4];

/** Slowly falling paper confetti used as scene dressing. */
export class AmbientConfetti {
  readonly points: THREE.Points;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private posAttr: THREE.BufferAttribute;
  private n: number;
  private speed: Float32Array;
  private phase: Float32Array;
  private x0: number;
  private x1: number;
  private y0: number;
  private y1: number;
  private t = 0;
  constructor(count: number, box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }) {
    this.n = count;
    this.x0 = box.x0; this.x1 = box.x1;
    this.y0 = box.y0; this.y1 = box.y1;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const alp = new Float32Array(count);
    this.speed = new Float32Array(count);
    this.phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = box.x0 + Math.random() * (box.x1 - box.x0);
      pos[i * 3 + 1] = box.y0 + Math.random() * (box.y1 - box.y0);
      pos[i * 3 + 2] = box.z0 + Math.random() * (box.z1 - box.z0);
      const c = new THREE.Color(AMBIENT_COLORS[i % AMBIENT_COLORS.length] ?? 0xffffff);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      alp[i] = 0.9;
      this.speed[i] = 0.5 + Math.random() * 1.1;
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    this.posAttr = new THREE.BufferAttribute(pos, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
    this.mat = spriteMaterial(confettiTexture(), 0.3);
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }
  /** Theme-driven attenuation (dark/stormy stages dim the ambient confetti). */
  setAlpha(a: number): void { setSpriteAlpha(this.mat, a); }
  update(dt: number): void {
    this.t += dt;
    const a = this.posAttr.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const ix = i * 3;
      const x = a[ix] ?? 0;
      const y = a[ix + 1] ?? 0;
      let ny = y - (this.speed[i] ?? 0.8) * dt;
      let nx = x + Math.sin(this.t * 1.3 + (this.phase[i] ?? 0)) * dt * 0.7;
      if (ny < this.y0) {
        ny = this.y1;
        nx = this.x0 + Math.random() * (this.x1 - this.x0);
      }
      a[ix] = nx;
      a[ix + 1] = ny;
    }
    this.posAttr.needsUpdate = true;
    updatePointScale(this.mat, 0.3);
  }
}

