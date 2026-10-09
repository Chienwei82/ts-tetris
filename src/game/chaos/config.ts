/** Toda la configuracion tunable del modo caos vive aqui. */
export interface ChaosConfig {
  linesPerMutator: number;
  mutatorWarnSec: number;
  mutatorMinSec: number;
  mutatorMaxSec: number;
  ghostDelaySec: number;
  specialProbability: number;
  garbageIntervalSec: number;
  garbageWarnSec: number;
  tremorIntervalSec: number;
  tremorWarnSec: number;
}

export const DEFAULT_CHAOS_CONFIG: ChaosConfig = {
  linesPerMutator: 6,
  mutatorWarnSec: 1,
  mutatorMinSec: 15,
  mutatorMaxSec: 20,
  ghostDelaySec: 0.5,
  specialProbability: 0.07,
  garbageIntervalSec: 25,
  garbageWarnSec: 2,
  tremorIntervalSec: 30,
  tremorWarnSec: 1,
};
