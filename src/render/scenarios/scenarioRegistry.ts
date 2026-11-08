import type { Scenario } from './scenario.js';

/**
 * Registro único de escenarios. Cada módulo de escenario se registra aquí al
 * importarse. El gestor lee de este único lugar, por lo que añadir un nuevo
 * escenario solo requiere importar su módulo en el punto de entrada.
 */
export class ScenarioRegistry {
  private readonly scenarios = new Map<string, Scenario>();

  register(s: Scenario): void {
    if (this.scenarios.has(s.id)) {
      throw new Error(`Escenario duplicado: ${s.id}`);
    }
    this.scenarios.set(s.id, s);
  }

  get(id: string): Scenario | undefined {
    return this.scenarios.get(id);
  }

  all(): Scenario[] {
    return Array.from(this.scenarios.values());
  }

  has(id: string): boolean {
    return this.scenarios.has(id);
  }

  ids(): string[] {
    return Array.from(this.scenarios.keys());
  }
}

export const scenarioRegistry = new ScenarioRegistry();
