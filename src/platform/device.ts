/**
 * Detección de dispositivo (escritorio / móvil / tableta) combinando varias
 * señales del navegador, con un nivel de confianza sobre el resultado.
 */

/** Señales crudas de las que depende la detección (separadas para poder inyectarlas en tests). */
export interface DeviceSignals {
  /** `matchMedia('(pointer: coarse)')`: el puntero principal es un dedo. */
  coarsePointer: boolean;
  /** `matchMedia('(pointer: fine)')`: hay puntero fino (ratón, trackpad, lápiz). */
  finePointer: boolean;
  /** `matchMedia('(hover: none)')`: el puntero principal no puede hacer hover. */
  hoverNone: boolean;
  /** `navigator.maxTouchPoints`. */
  maxTouchPoints: number;
  /** `navigator.userAgentData?.mobile`; `undefined` si la API no existe. */
  uaMobile: boolean | undefined;
  /** `navigator.userAgent` clásico (fallback). */
  userAgent: string;
  /** Menor lado de `screen` en px. */
  minScreenSide: number;
}

export type DeviceKind = 'desktop' | 'mobile' | 'tablet';

/** 'high': las señales concuerdan. 'low': señales contradictorias (híbridos). */
export type DetectionConfidence = 'high' | 'low';

export interface DeviceProfile {
  kind: DeviceKind;
  confidence: DetectionConfidence;
}

/** Por debajo de este lado menor (px) un dispositivo táctil se considera móvil. */
const TABLET_MIN_SIDE = 600;

/** Vista mínima de `navigator.userAgentData` (aún no está en lib.dom). */
interface UserAgentDataLike {
  readonly mobile: boolean;
}

function userAgentData(nav: Navigator): UserAgentDataLike | null {
  const raw: unknown = (nav as Navigator & { userAgentData?: unknown }).userAgentData;
  if (typeof raw !== 'object' || raw === null) return null;
  const mobile = (raw as { mobile?: unknown }).mobile;
  if (typeof mobile !== 'boolean') return null;
  return { mobile };
}

/** Clasificación pura a partir de señales ya recogidas (testeable sin DOM). */
export function classifyDevice(s: DeviceSignals): DeviceProfile {
  const uaMobile = s.uaMobile ?? /Android|iPhone|iPod|Windows Phone|Mobile/i.test(s.userAgent);
  const uaTablet = /iPad|Tablet/i.test(s.userAgent) ||
    (/Android/i.test(s.userAgent) && !/Mobile/i.test(s.userAgent));

  // iPadOS 13+ se anuncia como Macintosh: el toque multitáctil lo delata.
  if (/Macintosh/.test(s.userAgent) && s.maxTouchPoints > 1) {
    return { kind: 'tablet', confidence: 'high' };
  }

  const hasTouch = s.maxTouchPoints > 0 || s.coarsePointer;

  // Ratón/teclado sin toque: escritorio inequívoco.
  if (!hasTouch && s.finePointer && !uaMobile) {
    return { kind: 'desktop', confidence: 'high' };
  }

  if (uaTablet) return { kind: 'tablet', confidence: 'high' };

  if (uaMobile) {
    return { kind: s.minScreenSide >= TABLET_MIN_SIDE ? 'tablet' : 'mobile', confidence: 'high' };
  }

  // Táctil puro (dedo como puntero principal, sin hover ni puntero fino):
  // móvil o tableta por tamaño de pantalla.
  if (s.coarsePointer && s.hoverNone && !s.finePointer) {
    return { kind: s.minScreenSide >= TABLET_MIN_SIDE ? 'tablet' : 'mobile', confidence: 'high' };
  }

  // Híbridos ambiguos (portátil táctil, tableta con teclado/trackpad): confianza baja.
  if (hasTouch && s.finePointer) {
    const kind: DeviceKind = !s.hoverNone
      ? 'desktop'
      : s.minScreenSide >= TABLET_MIN_SIDE ? 'tablet' : 'mobile';
    return { kind, confidence: 'low' };
  }

  return { kind: 'desktop', confidence: 'low' };
}

/** Recoge las señales del entorno actual (DOM). */
export function collectSignals(nav: Navigator, win: Window): DeviceSignals {
  const data = userAgentData(nav);
  return {
    coarsePointer: win.matchMedia('(pointer: coarse)').matches,
    finePointer: win.matchMedia('(pointer: fine)').matches,
    hoverNone: win.matchMedia('(hover: none)').matches,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    uaMobile: data?.mobile,
    userAgent: nav.userAgent,
    minScreenSide: Math.min(win.screen.width, win.screen.height)
  };
}

/** Atajo: detección sobre el entorno real. */
export function detectDevice(): DeviceProfile {
  return classifyDevice(collectSignals(window.navigator, window));
}