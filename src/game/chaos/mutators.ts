import { getChaosModule, registerChaosModule } from './registry.js';
import type { ChaosContext, ChaosModule } from './types.js';

function base(id: string, name: string, apply: (ctx: ChaosContext) => void, cleanup: (ctx: ChaosContext) => void): ChaosModule {
  return {
    id, name, durationSec: 18,
    onStart: (ctx) => apply(ctx),
    onTick: () => undefined,
    onEnd: (ctx) => cleanup(ctx),
  };
}

export const gravityDoubleModule: ChaosModule = base(
  'mut-gravity', 'Gravedad doble',
  (ctx) => { ctx.flags.gravityMultiplier = 2; if (ctx.engine.chaos) ctx.engine.chaos.gravityMultiplier = 2; },
  (ctx) => { ctx.flags.gravityMultiplier = 1; if (ctx.engine.chaos) ctx.engine.chaos.gravityMultiplier = 1; },
);

export const invertedControlsModule: ChaosModule = base(
  'mut-inverted', 'Controles invertidos',
  (ctx) => { ctx.flags.invertedControls = true; },
  (ctx) => { ctx.flags.invertedControls = false; },
);

export const hiddenNextModule: ChaosModule = base(
  'mut-hidden-next', 'Siguiente oculto',
  (ctx) => { ctx.flags.hiddenNext = true; },
  (ctx) => { ctx.flags.hiddenNext = false; },
);

export const fogModule: ChaosModule = base(
  'mut-fog', 'Niebla superior',
  (ctx) => { ctx.flags.fogTopHalf = true; },
  (ctx) => { ctx.flags.fogTopHalf = false; },
);

/** Piezas invisibles: `main.ts` oculta la pieza activa tras `ghostDelaySec`. */
export const ghostPiecesModule: ChaosModule = base(
  'mut-ghost', 'Piezas invisibles',
  (ctx) => { ctx.flags.ghostActive = true; },
  (ctx) => { ctx.flags.ghostActive = false; },
);

/** Unico lugar donde se registran todos los modulos caos. */
export function registerAllChaosModules(): void {
  if (getChaosModule('mut-gravity')) return;
  registerChaosModule(gravityDoubleModule);
  registerChaosModule(invertedControlsModule);
  registerChaosModule(hiddenNextModule);
  registerChaosModule(fogModule);
  registerChaosModule(ghostPiecesModule);
}
