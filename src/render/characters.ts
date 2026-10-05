import * as THREE from 'three';
import { INK, outlineMaterial, toonGradient } from './materials.js';

function toonMat(color: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient });
}

/** Cut-out paper part: toon mesh + inverted-hull ink outline. */
function cut(geo: THREE.BufferGeometry, color: number, hull = 1.07): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, toonMat(color)));
  if (hull > 0) {
    const h = new THREE.Mesh(geo, outlineMaterial());
    h.scale.setScalar(hull);
    g.add(h);
  }
  return g;
}

/** Hot-air paper balloon: envelope + basket + ropes + pennant cap. */
function buildBalloon(): THREE.Group {
  const g = new THREE.Group();
  const envelope = cut(new THREE.SphereGeometry(1.6, 20, 14), 0xe4573f);
  envelope.scale.set(1, 1.15, 1);
  envelope.position.y = 2.1;
  const cap = cut(new THREE.SphereGeometry(0.3, 12, 8), 0xfff3d6);
  cap.position.y = 4.05;
  const basket = cut(new THREE.BoxGeometry(0.95, 0.7, 0.95), 0xb9814e);
  basket.position.y = -0.35;
  const ropePts: THREE.Vector3[] = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as Array<[number, number]>) {
    ropePts.push(new THREE.Vector3(sx * 0.34, 0.02, sz * 0.34));
    ropePts.push(new THREE.Vector3(sx * 1.0, 0.85, sz * 1.0));
  }
  const ropes = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(ropePts),
    new THREE.LineBasicMaterial({ color: INK })
  );
  g.add(envelope, cap, basket, ropes);
  return g;
}

/** Flapping paper bird (two wings + body). */
function buildBird(): { group: THREE.Group; wings: THREE.Mesh[] } {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x54443a, side: THREE.DoubleSide });
  const wingGeo = new THREE.PlaneGeometry(0.9, 0.3);
  const left = new THREE.Mesh(wingGeo, mat);
  const right = new THREE.Mesh(wingGeo, mat);
  left.position.x = -0.45;
  right.position.x = 0.45;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat);
  group.add(left, right, body);
  return { group, wings: [left, right] };
}

/** Hopping paper bunny (faces +x). */
function buildBunny(): THREE.Group {
  const g = new THREE.Group();
  const body = cut(new THREE.SphereGeometry(0.5, 16, 12), 0xfdf8ee);
  body.scale.set(1, 0.88, 0.9);
  body.position.y = 0.55;
  const head = cut(new THREE.SphereGeometry(0.34, 16, 12), 0xfdf8ee);
  head.position.set(0.42, 1.02, 0);
  const earGeo = new THREE.CapsuleGeometry(0.08, 0.34, 4, 8);
  const earA = cut(earGeo, 0xfdf8ee);
  earA.position.set(0.3, 1.52, 0.1);
  earA.rotation.z = 0.28;
  const earB = cut(earGeo, 0xfdf8ee);
  earB.position.set(0.54, 1.5, 0.1);
  earB.rotation.z = -0.12;
  const tail = cut(new THREE.SphereGeometry(0.15, 10, 8), 0xffffff);
  tail.position.set(-0.46, 0.62, 0);
  const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: INK });
  const eyeA = new THREE.Mesh(eyeGeo, eyeMat);
  eyeA.position.set(0.68, 1.1, 0.14);
  const eyeB = new THREE.Mesh(eyeGeo, eyeMat);
  eyeB.position.set(0.68, 1.1, -0.14);
  g.add(body, head, earA, earB, tail, eyeA, eyeB);
  return g;
}

/** Sliding paper penguin (faces +x). */
function buildPenguin(): THREE.Group {
  const g = new THREE.Group();
  const body = cut(new THREE.SphereGeometry(0.5, 16, 12), 0x2f3542);
  body.scale.set(1, 1.2, 0.85);
  body.position.y = 0.62;
  const belly = cut(new THREE.SphereGeometry(0.34, 14, 10), 0xfdf8ee);
  belly.scale.set(0.85, 1.1, 0.55);
  belly.position.set(0.08, 0.58, 0);
  const beak = cut(new THREE.ConeGeometry(0.09, 0.24, 10), 0xf2953a, 0);
  beak.position.set(0.5, 1.0, 0);
  beak.rotation.z = -Math.PI / 2;
  const eyeGeo = new THREE.SphereGeometry(0.045, 8, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: INK });
  const eyeA = new THREE.Mesh(eyeGeo, eyeMat);
  eyeA.position.set(0.42, 1.1, 0.13);
  const eyeB = new THREE.Mesh(eyeGeo, eyeMat);
  eyeB.position.set(0.42, 1.1, -0.13);
  const footGeo = new THREE.BoxGeometry(0.24, 0.07, 0.3);
  const footA = cut(footGeo, 0xf2953a, 0);
  footA.position.set(0.05, 0.04, 0.14);
  const footB = cut(footGeo, 0xf2953a, 0);
  footB.position.set(0.05, 0.04, -0.14);
  g.add(body, belly, beak, eyeA, eyeB, footA, footB);
  return g;
}

/** Toy saucer with a blinking light. */
function buildUfo(): { group: THREE.Group; light: THREE.Mesh } {
  const g = new THREE.Group();
  const disc = cut(new THREE.CylinderGeometry(1.2, 0.55, 0.34, 20), 0x9aa2b8);
  const dome = cut(new THREE.SphereGeometry(0.62, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xbfeaff);
  dome.position.y = 0.16;
  const ring = cut(new THREE.TorusGeometry(1.24, 0.08, 8, 26), 0xbfc6d8, 0);
  ring.rotation.x = Math.PI / 2;
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), lightMat);
  light.position.y = -0.3;
  g.add(disc, dome, ring, light);
  return { group: g, light };
}

/** Theme indices where each character shows up (see THEMES order). */
const BALLOON_THEMES = [0, 1, 2, 5, 8];
const BIRD_THEMES = [0, 1, 8];
const BUNNY_THEMES = [0, 6, 8];
const PENGUIN_THEMES = [6, 7];
const UFO_THEMES = [5, 9];

/** Background cast: balloon, bird flock, bunny, penguin and a tourist saucer. */
export class Characters {
  private readonly root = new THREE.Group();
  private readonly balloon: THREE.Group;
  private readonly birds: { group: THREE.Group; wings: THREE.Mesh[]; offset: number; baseY: number; speed: number }[] = [];
  private readonly bunny: THREE.Group;
  private readonly penguin: THREE.Group;
  private readonly ufo: THREE.Group;
  private readonly ufoLight: THREE.Mesh;
  private enabled = true;
  private themeIdx = 0;
  private time = 0;
  private readonly balloonPhase = Math.random() * 12;
  constructor(scene: THREE.Scene) {
    this.balloon = buildBalloon();
    this.balloon.position.set(0, 8, -30);
    this.root.add(this.balloon);
    for (let i = 0; i < 3; i++) {
      const b = buildBird();
      b.group.position.set(0, 11 + i * 2.2, -40 - i);
      this.root.add(b.group);
      this.birds.push({ group: b.group, wings: b.wings, offset: i * 29 + Math.random() * 12, baseY: 11 + i * 2.2, speed: 4.5 + Math.random() * 1.5 });
    }
    this.bunny = buildBunny();
    this.bunny.position.set(-6, -10.55, -18);
    this.penguin = buildPenguin();
    this.penguin.position.set(6, -10.55, -18);
    const ufo = buildUfo();
    this.ufo = ufo.group;
    this.ufoLight = ufo.light;
    this.ufo.position.set(0, 14, -36);
    this.root.add(this.bunny, this.penguin, this.ufo);
    scene.add(this.root);
    this.applyTheme();
  }
  setEnabled(on: boolean): void { this.enabled = on; this.root.visible = on; }
  setTheme(idx: number): void {
    if (this.themeIdx === idx) return;
    this.themeIdx = idx;
    this.applyTheme();
  }
  private applyTheme(): void {
    const i = this.themeIdx;
    this.balloon.visible = BALLOON_THEMES.includes(i);
    for (const b of this.birds) b.group.visible = BIRD_THEMES.includes(i);
    this.bunny.visible = BUNNY_THEMES.includes(i);
    this.penguin.visible = PENGUIN_THEMES.includes(i);
    this.ufo.visible = UFO_THEMES.includes(i);
  }
  update(dt: number): void {
    if (!this.enabled) return;
    this.time += dt;
    const t = this.time;
    if (this.balloon.visible) {
      const span = 76;
      this.balloon.position.x = ((t * 1.1 + this.balloonPhase) % span) - span / 2;
      this.balloon.position.y = 8 + Math.sin(t * 0.5) * 0.6;
      this.balloon.rotation.z = Math.sin(t * 0.3) * 0.05;
    }
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      if (!b || !b.group.visible) continue;
      const span = 92;
      b.group.position.x = ((t * b.speed + b.offset) % span) - span / 2;
      b.group.position.y = b.baseY + Math.sin(t * 0.7 + i * 2.1) * 0.8;
      const flap = 0.35 + Math.sin(t * 9 + i * 1.7) * 0.5;
      const l = b.wings[0];
      const r = b.wings[1];
      if (l) l.rotation.z = flap;
      if (r) r.rotation.z = -flap;
    }
    if (this.bunny.visible) {
      const walk = t * 0.35;
      this.bunny.position.x = -6 + Math.sin(walk) * 5;
      const hop = Math.abs(Math.sin(t * 2.4));
      this.bunny.position.y = -10.55 + hop * 0.55;
      this.bunny.scale.y = 0.92 + 0.08 * hop;
      this.bunny.rotation.y = Math.cos(walk) >= 0 ? 0 : Math.PI;
    }
    if (this.penguin.visible) {
      this.penguin.position.x = 6 + Math.sin(t * 0.8) * 3.2;
      this.penguin.position.y = -10.55 + Math.abs(Math.sin(t * 3.2)) * 0.12;
      this.penguin.rotation.z = -Math.cos(t * 0.8) * 0.16;
      this.penguin.rotation.y = Math.cos(t * 0.8) >= 0 ? 0 : Math.PI;
    }
    if (this.ufo.visible) {
      this.ufo.position.x = Math.sin(t * 0.35) * 6;
      this.ufo.position.y = 14 + Math.sin(t * 1.4) * 0.5;
      this.ufo.rotation.y += dt * 0.6;
      this.ufoLight.scale.setScalar(Math.max(0.3, 0.7 + 0.5 * Math.sin(t * 6)));
    }
  }
}
