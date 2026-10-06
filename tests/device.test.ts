import { describe, expect, it } from 'vitest';
import { classifyDevice } from '../src/platform/device.js';
import type { DeviceSignals } from '../src/platform/device.js';

function signals(partial: Partial<DeviceSignals> = {}): DeviceSignals {
  return {
    coarsePointer: false,
    finePointer: true,
    hoverNone: false,
    maxTouchPoints: 0,
    uaMobile: undefined,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    minScreenSide: 900,
    ...partial
  };
}

describe('classifyDevice', () => {
  it('detecta escritorio sin toque con confianza alta', () => {
    const p = classifyDevice(signals());
    expect(p).toEqual({ kind: 'desktop', confidence: 'high' });
  });

  it('detecta un iPhone como móvil con confianza alta (sin userAgentData)', () => {
    const p = classifyDevice(signals({
      coarsePointer: true, finePointer: false, hoverNone: true, maxTouchPoints: 5,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
      minScreenSide: 390
    }));
    expect(p).toEqual({ kind: 'mobile', confidence: 'high' });
  });

  it('usa userAgentData.mobile cuando está disponible', () => {
    const p = classifyDevice(signals({
      coarsePointer: true, finePointer: false, hoverNone: true, maxTouchPoints: 5,
      uaMobile: true, minScreenSide: 412
    }));
    expect(p).toEqual({ kind: 'mobile', confidence: 'high' });
  });

  it('desenmascara iPadOS (se anuncia como Macintosh)', () => {
    const p = classifyDevice(signals({
      coarsePointer: false, finePointer: true, hoverNone: false, maxTouchPoints: 5,
      uaMobile: false,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      minScreenSide: 820
    }));
    expect(p).toEqual({ kind: 'tablet', confidence: 'high' });
  });

  it('detecta una tableta Android por pantalla grande', () => {
    const p = classifyDevice(signals({
      coarsePointer: true, finePointer: false, hoverNone: true, maxTouchPoints: 10,
      uaMobile: false,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36',
      minScreenSide: 800
    }));
    expect(p).toEqual({ kind: 'tablet', confidence: 'high' });
  });

  it('un móvil grande se clasifica como tableta', () => {
    const p = classifyDevice(signals({
      coarsePointer: true, finePointer: false, hoverNone: true, maxTouchPoints: 5,
      uaMobile: true, minScreenSide: 673
    }));
    expect(p).toEqual({ kind: 'tablet', confidence: 'high' });
  });

  it('un portátil táctil es escritorio con confianza baja (ambiguo)', () => {
    const p = classifyDevice(signals({
      coarsePointer: false, finePointer: true, hoverNone: false, maxTouchPoints: 10,
      uaMobile: false,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      minScreenSide: 900
    }));
    expect(p).toEqual({ kind: 'desktop', confidence: 'low' });
  });

  it('una tableta con teclado/trackpad da confianza baja', () => {
    const p = classifyDevice(signals({
      coarsePointer: true, finePointer: true, hoverNone: true, maxTouchPoints: 10,
      uaMobile: undefined,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      minScreenSide: 1280
    }));
    expect(p.kind).toBe('tablet');
    expect(p.confidence).toBe('low');
  });

  it('sin señales claras cae en escritorio con confianza baja', () => {
    const p = classifyDevice(signals({ finePointer: false, coarsePointer: false }));
    expect(p).toEqual({ kind: 'desktop', confidence: 'low' });
  });
});