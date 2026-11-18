import { describe, expect, it } from 'vitest';
import { bannerStageForLevel } from '../src/ui/levelBannerTheme.js';
import { scenarioMetaForLevel } from '../src/render/scenarios/scenarioCatalog.js';

function stage(level: number): string {
  return bannerStageForLevel(level).id;
}

describe('cartel de nivel por escenario', () => {
  it('los niveles 1-2 usan el tema clásico Pradera', () => {
    expect(bannerStageForLevel(1).id).toBe('pradera');
    expect(bannerStageForLevel(2).id).toBe('pradera');
    expect(bannerStageForLevel(2).icon).toBe('☀️');
  });

  it('sigue la misma rotación que los escenarios reales', () => {
    expect(stage(3)).toBe('forest');
    expect(stage(5)).toBe('forest');
    expect(stage(6)).toBe('cityNight');
    expect(stage(10)).toBe('cityNight');
    expect(stage(11)).toBe('space');
    expect(stage(15)).toBe('space');
    expect(stage(16)).toBe('deepSea');
    expect(stage(20)).toBe('deepSea');
  });

  it('ofrece icono y nombre legibles en cada tramo', () => {
    expect(bannerStageForLevel(3)).toMatchObject({ icon: '🌲', name: 'Bosque' });
    expect(bannerStageForLevel(6)).toMatchObject({ icon: '🌃', name: 'Ciudad nocturna' });
    expect(bannerStageForLevel(11)).toMatchObject({ icon: '🚀', name: 'Espacio' });
    expect(bannerStageForLevel(16)).toMatchObject({ icon: '🌊', name: 'Fondo del mar' });
  });

  it('el catálogo no inventa escenarios antes del nivel 3', () => {
    expect(scenarioMetaForLevel(1)).toBeNull();
    expect(scenarioMetaForLevel(2)).toBeNull();
    expect(scenarioMetaForLevel(3)?.id).toBe('forest');
  });
});
