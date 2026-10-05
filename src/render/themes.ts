/** Weather families the stage can run. Themes map 1:1 to one of these. */
export type WeatherKind = 'clear' | 'leaves' | 'rain' | 'storm' | 'snow' | 'stars' | 'aurora' | 'cosmos';

export interface StageTheme {
  name: string;
  icon: string;
  weather: WeatherKind;
  /** Sky gradient stops, top -> horizon. */
  sky: [number, number, number, number];
  fog: { color: number; near: number; far: number };
  /** Paper hill colors, far -> near. */
  hills: [number, number, number];
  sun: {
    visible: boolean;
    moon: boolean;
    color: number;
    rayColor: number;
    raysVisible: boolean;
    x: number;
    y: number;
    scale: number;
  };
  hemi: { sky: number; ground: number; intensity: number };
  dir: { color: number; intensity: number };
  ground: { color: number; gridOpacity: number };
  clouds: { color: number; speed: number; visible: boolean };
  /** Ambient confetti alpha multiplier (dark/stormy stages dim it). */
  confetti: number;
  /** Wind multiplier shared by clouds and weather fields. */
  wind: number;
}

/**
 * One theme every two levels (levels 1-2 -> Pradera, 3-4 -> Brisa, ...).
 * Everything is procedural: colors, lights and weather only.
 */
export const THEMES: StageTheme[] = [
  {
    name: 'Pradera', icon: '☀️', weather: 'clear',
    sky: [0x6fb7e8, 0xa9d9f2, 0xdceef7, 0xf7ecd4],
    fog: { color: 0xd5ebf5, near: 34, far: 95 },
    hills: [0xa9cfe0, 0x8ecb8b, 0x5fae62],
    sun: { visible: true, moon: false, color: 0xffd34e, rayColor: 0xffe08a, raysVisible: true, x: 15, y: 15, scale: 1 },
    hemi: { sky: 0xfff4dd, ground: 0xd8c9a8, intensity: 0.95 },
    dir: { color: 0xfff1d6, intensity: 1.5 },
    ground: { color: 0xf2e6cc, gridOpacity: 0.35 },
    clouds: { color: 0xfffdf4, speed: 1, visible: true },
    confetti: 1, wind: 1
  },
  {
    name: 'Brisa', icon: '🍃', weather: 'leaves',
    sky: [0x63b6e8, 0xa5e0ea, 0xe6f6ef, 0xfbf0d2],
    fog: { color: 0xd8ecf0, near: 34, far: 95 },
    hills: [0xa4c8dd, 0x92cf8d, 0x64b366],
    sun: { visible: true, moon: false, color: 0xffda5e, rayColor: 0xffe69a, raysVisible: true, x: 14, y: 15.5, scale: 1 },
    hemi: { sky: 0xfff8e6, ground: 0xd6cba8, intensity: 1 },
    dir: { color: 0xfff4dc, intensity: 1.5 },
    ground: { color: 0xf2e8d0, gridOpacity: 0.35 },
    clouds: { color: 0xfffdf4, speed: 1.7, visible: true },
    confetti: 0.95, wind: 1.9
  },
  {
    name: 'Atardecer', icon: '🌇', weather: 'clear',
    sky: [0x5e6fc4, 0xa76fb0, 0xf08a6a, 0xffd9a0],
    fog: { color: 0xf0c9a8, near: 30, far: 90 },
    hills: [0x9a86c9, 0xc27a9c, 0x8a5f8f],
    sun: { visible: true, moon: false, color: 0xffb03a, rayColor: 0xffc96b, raysVisible: true, x: 15, y: 11, scale: 1.35 },
    hemi: { sky: 0xffd9b0, ground: 0x7a5c6e, intensity: 0.85 },
    dir: { color: 0xffc89a, intensity: 1.05 },
    ground: { color: 0xf0d9b4, gridOpacity: 0.3 },
    clouds: { color: 0xffe6d2, speed: 0.8, visible: true },
    confetti: 1, wind: 0.8
  },
  {
    name: 'Lluvia', icon: '🌧️', weather: 'rain',
    sky: [0x5d7f9c, 0x86a5bd, 0xbfd4e2, 0xe3ebee],
    fog: { color: 0xb9cdd8, near: 26, far: 80 },
    hills: [0x7d9cb0, 0x6f9c86, 0x5b8a6e],
    sun: { visible: false, moon: false, color: 0xd8dde0, rayColor: 0xd8dde0, raysVisible: false, x: 15, y: 15, scale: 1 },
    hemi: { sky: 0xdfe9f0, ground: 0x8a9aa0, intensity: 0.7 },
    dir: { color: 0xd8e6f0, intensity: 0.55 },
    ground: { color: 0xdcd6c6, gridOpacity: 0.25 },
    clouds: { color: 0xd8dee4, speed: 1.3, visible: true },
    confetti: 0.5, wind: 1.3
  },
  {
    name: 'Tormenta', icon: '⛈️', weather: 'storm',
    sky: [0x2f3d52, 0x4a5a72, 0x6e7f95, 0x94a2b2],
    fog: { color: 0x6f7f92, near: 22, far: 70 },
    hills: [0x4c5c6e, 0x415c52, 0x374d44],
    sun: { visible: false, moon: false, color: 0x9aa6b4, rayColor: 0x9aa6b4, raysVisible: false, x: 15, y: 15, scale: 1 },
    hemi: { sky: 0x9fb0c4, ground: 0x3c444e, intensity: 0.55 },
    dir: { color: 0xaebfd2, intensity: 0.5 },
    ground: { color: 0xbfb6a4, gridOpacity: 0.2 },
    clouds: { color: 0x9aa6b4, speed: 2.4, visible: true },
    confetti: 0.15, wind: 2.6
  },
  {
    name: 'Noche', icon: '🌙', weather: 'stars',
    sky: [0x0f1d3d, 0x1d3157, 0x33507c, 0x5b7ba6],
    fog: { color: 0x2a3d5e, near: 24, far: 78 },
    hills: [0x27405f, 0x1f4a52, 0x1b3d46],
    sun: { visible: true, moon: true, color: 0xf2edd8, rayColor: 0x8fa4c8, raysVisible: false, x: 15, y: 16, scale: 0.75 },
    hemi: { sky: 0x6d84b8, ground: 0x1c2a3e, intensity: 0.55 },
    dir: { color: 0x9fb3e0, intensity: 0.45 },
    ground: { color: 0x9a927f, gridOpacity: 0.2 },
    clouds: { color: 0x8c9cb8, speed: 0.5, visible: true },
    confetti: 0.35, wind: 0.6
  },
  {
    name: 'Nieve', icon: '❄️', weather: 'snow',
    sky: [0x8fa9c9, 0xbdd3e8, 0xe6f0f8, 0xf7f9fb],
    fog: { color: 0xe4eefa, near: 30, far: 88 },
    hills: [0xc9d9ea, 0xbcd6c9, 0xa9c8b9],
    sun: { visible: true, moon: false, color: 0xfff0c0, rayColor: 0xfff6d8, raysVisible: true, x: 15, y: 16, scale: 0.85 },
    hemi: { sky: 0xf2f7ff, ground: 0xd8e2ea, intensity: 0.95 },
    dir: { color: 0xf4f8ff, intensity: 0.75 },
    ground: { color: 0xf7f1e4, gridOpacity: 0.3 },
    clouds: { color: 0xffffff, speed: 0.6, visible: true },
    confetti: 0.4, wind: 0.8
  },
  {
    name: 'Aurora', icon: '🌌', weather: 'aurora',
    sky: [0x0b1430, 0x14264a, 0x1f3a63, 0x35588a],
    fog: { color: 0x1c2f4e, near: 26, far: 84 },
    hills: [0x1f3553, 0x1c4248, 0x173741],
    sun: { visible: true, moon: true, color: 0xf2edd8, rayColor: 0x8fa4c8, raysVisible: false, x: 15, y: 16, scale: 0.6 },
    hemi: { sky: 0x5f7fb0, ground: 0x172436, intensity: 0.5 },
    dir: { color: 0x8fa8d8, intensity: 0.4 },
    ground: { color: 0x8f8878, gridOpacity: 0.18 },
    clouds: { color: 0x7d90b0, speed: 0.4, visible: true },
    confetti: 0.3, wind: 0.5
  },
  {
    name: 'Amanecer', icon: '🌄', weather: 'clear',
    sky: [0x6f7fc0, 0xa98fc0, 0xf2a98c, 0xffe3b8],
    fog: { color: 0xf0d8c0, near: 28, far: 86 },
    hills: [0xb59cc4, 0xa8c0a0, 0x7fa878],
    sun: { visible: true, moon: false, color: 0xffcf6b, rayColor: 0xffe3a0, raysVisible: true, x: 13, y: 12.5, scale: 1.2 },
    hemi: { sky: 0xffe6c8, ground: 0x7d7a68, intensity: 0.9 },
    dir: { color: 0xffd9a8, intensity: 1 },
    ground: { color: 0xf2e2c4, gridOpacity: 0.3 },
    clouds: { color: 0xffe9d8, speed: 0.7, visible: true },
    confetti: 1, wind: 0.7
  },
  {
    name: 'Cosmos', icon: '🚀', weather: 'cosmos',
    sky: [0x0a0a1e, 0x181440, 0x2b1f5e, 0x453a80],
    fog: { color: 0x1c1840, near: 26, far: 88 },
    hills: [0x191836, 0x171430, 0x131026],
    sun: { visible: true, moon: true, color: 0xc9b8ff, rayColor: 0xc9b8ff, raysVisible: false, x: -15, y: 16, scale: 0.9 },
    hemi: { sky: 0x5a4fa0, ground: 0x12101f, intensity: 0.5 },
    dir: { color: 0x8f7fd8, intensity: 0.45 },
    ground: { color: 0x2a2438, gridOpacity: 0.15 },
    clouds: { color: 0x5a54a0, speed: 0.3, visible: false },
    confetti: 0.2, wind: 0.3
  }
];

/** Theme running at a given level (1-based, clamped to the list). */
export function themeIndexForLevel(level: number): number {
  const idx = Math.floor((Math.max(1, level) - 1) / 2);
  return Math.min(THEMES.length - 1, Math.max(0, idx));
}
