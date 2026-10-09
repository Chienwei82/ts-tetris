import type { ChaosModule } from './types.js';

const modules = new Map<string, ChaosModule>();

export function registerChaosModule(module: ChaosModule): void {
  if (modules.has(module.id)) throw new Error('chaos module already registered: ' + module.id);
  modules.set(module.id, module);
}

export function getChaosModule(id: string): ChaosModule | undefined {
  return modules.get(id);
}

export function listChaosModules(): ChaosModule[] {
  return [...modules.values()];
}

export function clearChaosRegistry(): void {
  modules.clear();
}
