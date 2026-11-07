/** Barrel de escenarios. Importar este módulo registra todos los escenarios
 *  en el ScenarioRegistry (el único lugar donde se declaran). */
import './cityNight.js';
import './forest.js';
import './space.js';
import './deepSea.js';

export type { Scenario, ScenarioResources } from './scenario.js';
export { scenarioRegistry, ScenarioRegistry } from './scenarioRegistry.js';
export { scenarioForLevel } from './levelMapping.js';
export type { ScenarioLevelInfo } from './levelMapping.js';
export type { ScenarioManagerOptions } from './scenarioManager.js';
export { ScenarioManager } from './scenarioManager.js';
