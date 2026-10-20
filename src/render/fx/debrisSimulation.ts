import { DEBRIS_CONFIG } from './debrisConfig.js';
import type { DebrisPhysicsProfile } from './debrisConfig.js';
import type { FxRandom } from './fxRandom.js';

/** Punto de mundo desde el que nace un escombro. */
export interface DebrisOrigin {
  x: number;
  y: number;
  z: number;
  /** Color RGB empaquetado (0xRRGGBB). */
  color: number;
}

/** Modificadores opcionales para reutilizar el sistema (bombas, rayos, etc.). */
export interface DebrisSpawnOptions {
  /** Multiplica el impulso vertical y el avance hacia cámara. */
  impulse?: number;
  /** Multiplica la dispersión horizontal. */
  spread?: number;
  /** Escala visual del cubo (1 = tamaño configurado). */
  scale?: number;
}

/** Estado mutable de un cuerpo del pool. Nunca se asigna fuera de `spawn`. */
export interface DebrisBody {
  active: boolean;
  /** Orden de creación; sirve para reciclar siempre el más antiguo. */
  serial: number;
  age: number;
  fadeDelay: number;
  fadeDuration: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
  scale: number;
  alpha: number;
  color: number;
}

export interface DebrisSimulationOptions {
  capacity: number;
  profile: DebrisPhysicsProfile;
  random: FxRandom;
}

function emptyBody(): DebrisBody {
  return {
    active: false, serial: 0, age: 0, fadeDelay: 0, fadeDuration: 0,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0,
    scale: 1, alpha: 0, color: 0xffffff
  };
}

/**
 * Física cosmética de escombros: gravedad, rebote contra la plataforma, giro y
 * desvanecido. Es una simulación propia a propósito: no hay cuerpos que
 * colisionen entre sí, así que una librería de física solo añadiría peso.
 *
 * - Pool fijo con reciclaje FIFO: sin asignaciones en `spawn`/`update`.
 * - Paso fijo para que los rebotes no dependan del framerate.
 * - No conoce el tablero, el motor ni three.js: solo estado visual.
 */
export class DebrisSimulation {
  readonly bodies: DebrisBody[];
  private profile: DebrisPhysicsProfile;
  private readonly random: FxRandom;
  private active = 0;
  private next = 0;
  private serial = 0;
  private accumulator = 0;
  private evicted = 0;

  constructor(opts: DebrisSimulationOptions) {
    this.profile = opts.profile;
    this.random = opts.random;
    this.bodies = Array.from({ length: Math.max(1, opts.capacity) }, emptyBody);
  }

  get capacity(): number { return this.bodies.length; }
  get activeCount(): number { return this.active; }
  get evictedCount(): number { return this.evicted; }
  get currentProfile(): DebrisPhysicsProfile { return this.profile; }

  /** Cambia el preset de calidad y recorta los cuerpos que sobren. */
  setProfile(profile: DebrisPhysicsProfile): void {
    this.profile = profile;
    while (this.active > profile.maxActive) {
      const victim = this.oldestActiveIndex();
      if (victim < 0) break;
      this.deactivate(victim);
      this.evicted++;
    }
  }

  /**
   * Añade un cubo y devuelve su índice de instancia. Si el pool está lleno,
   * recicla el cuerpo activo más antiguo.
   */
  spawn(origin: DebrisOrigin, options: DebrisSpawnOptions = {}): number {
    const index = this.claimSlot();
    const body = this.bodies[index];
    if (!body) return -1;
    this.writeBody(body, origin, options);
    this.active++;
    return index;
  }

  update(dt: number): void {
    if (this.active === 0 || dt <= 0) return;
    this.accumulator += Math.min(dt, DEBRIS_CONFIG.maxFrameDelta);
    let steps = 0;
    while (this.accumulator >= DEBRIS_CONFIG.fixedStep && steps < DEBRIS_CONFIG.maxSubSteps) {
      this.step(DEBRIS_CONFIG.fixedStep);
      this.accumulator -= DEBRIS_CONFIG.fixedStep;
      steps++;
    }
    // Si el frame fue patológico, se descarta el resto en vez de acumular deuda.
    if (steps === DEBRIS_CONFIG.maxSubSteps) this.accumulator = 0;
  }

  clear(): void {
    for (const body of this.bodies) {
      body.active = false;
      body.alpha = 0;
    }
    this.active = 0;
    this.next = 0;
    this.accumulator = 0;
  }

  private claimSlot(): number {
    // Capacidad lógica de la calidad: primero se libera el más antiguo.
    if (this.active >= this.profile.maxActive) {
      const victim = this.oldestActiveIndex();
      if (victim >= 0) {
        this.deactivate(victim);
        this.evicted++;
      }
    }
    // Reutiliza el primer hueco libre en orden circular.
    for (let i = 0; i < this.bodies.length; i++) {
      const index = (this.next + i) % this.bodies.length;
      const body = this.bodies[index];
      if (body && !body.active) {
        this.next = (index + 1) % this.bodies.length;
        return index;
      }
    }
    // Sin huecos (capacidad < maxActive en una configuración extrema): recicla.
    const victim = this.oldestActiveIndex();
    if (victim >= 0) {
      this.deactivate(victim);
      this.evicted++;
      return victim;
    }
    return 0;
  }

  private oldestActiveIndex(): number {
    let best = -1;
    let bestSerial = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.bodies.length; i++) {
      const body = this.bodies[i];
      if (body && body.active && body.serial < bestSerial) {
        best = i;
        bestSerial = body.serial;
      }
    }
    return best;
  }

  private deactivate(index: number): void {
    const body = this.bodies[index];
    if (!body || !body.active) return;
    body.active = false;
    body.alpha = 0;
    if (this.active > 0) this.active--;
  }

  private writeBody(body: DebrisBody, origin: DebrisOrigin, options: DebrisSpawnOptions): void {
    const p = this.profile;
    const r = this.random;
    const spread = (options.spread ?? 1) * DEBRIS_CONFIG.spreadX;
    const impulse = options.impulse ?? 1;
    this.serial++;
    body.active = true;
    body.serial = this.serial;
    body.age = 0;
    body.fadeDelay = p.fadeDelay;
    body.fadeDuration = r.range(p.fadeDurationMin, p.fadeDurationMax);
    body.x = origin.x;
    body.y = origin.y;
    body.z = origin.z;
    body.vx = r.range(-spread, spread);
    body.vy = r.range(DEBRIS_CONFIG.impulseUpMin, DEBRIS_CONFIG.impulseUpMax) * impulse;
    body.vz = r.range(DEBRIS_CONFIG.driftZMin, DEBRIS_CONFIG.driftZMax) * impulse;
    body.rx = r.range(0, Math.PI * 2);
    body.ry = r.range(0, Math.PI * 2);
    body.rz = r.range(0, Math.PI * 2);
    body.sx = r.range(-p.spin, p.spin);
    body.sy = r.range(-p.spin, p.spin);
    body.sz = r.range(-p.spin, p.spin);
    body.scale = options.scale ?? 1;
    body.alpha = 1;
    body.color = origin.color;
  }

  private step(dt: number): void {
    const p = this.profile;
    for (const body of this.bodies) {
      if (!body.active) continue;
      body.age += dt;
      body.vy -= p.gravity * dt;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.z += body.vz * dt;
      body.rx += body.sx * dt;
      body.ry += body.sy * dt;
      body.rz += body.sz * dt;

      const half = (DEBRIS_CONFIG.size * body.scale) / 2;
      const restY = DEBRIS_CONFIG.floorY + half;
      if (body.y <= restY) {
        body.y = restY;
        if (body.vy < 0) {
          const bounce = -body.vy * p.restitution;
          body.vy = bounce >= DEBRIS_CONFIG.minBounceSpeed ? bounce : 0;
          body.vx *= p.friction;
          body.vz *= p.friction;
          body.sx *= DEBRIS_CONFIG.spinDamping;
          body.sy *= DEBRIS_CONFIG.spinDamping;
          body.sz *= DEBRIS_CONFIG.spinDamping;
        }
        if (Math.abs(body.vy) < DEBRIS_CONFIG.settleSpeed) {
          body.vy = 0;
          body.vx *= p.friction;
          body.vz *= p.friction;
        }
      }

      if (body.age >= body.fadeDelay) {
        body.alpha = 1 - (body.age - body.fadeDelay) / body.fadeDuration;
        if (body.alpha <= 0) {
          body.alpha = 0;
          body.active = false;
          if (this.active > 0) this.active--;
        }
      }
    }
  }
}

