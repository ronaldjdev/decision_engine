import { FinancialParametersStore } from '../shared/domain/value-objects/FinancialParameters.ts';
import { CryptoIdGenerator } from '../shared/infrastructure/CryptoIdGenerator.ts';
import { SystemClock } from '../shared/infrastructure/SystemClock.ts';
import { createRepositories } from './createRepositories.ts';
import {
  createConfigFacade,
  createGovernanceModule,
  createLeadsFacade,
} from './modules/createCoreModules.ts';
import {
  createEntityMatchingModule,
  createPipelineGatesModule,
  createQualificationModule,
  createSandboxModule,
} from './modules/createDecisionModules.ts';
import {
  createAutomationModule,
  createNextBestActionModule,
} from './modules/createOperationsModules.ts';
import type {
  DecisionEngine,
  DecisionEngineAdapters,
  EngineRuntimeContext,
} from './types.ts';

export type {
  AutomationModule,
  ConfigModuleFacade,
  DecisionEngine,
  DecisionEngineAdapters,
  DecisionEngineRepositories,
  EntityMatchingModule,
  GovernanceModule,
  LeadsModuleFacade,
  NextBestActionModule,
  PipelineGatesModule,
  QualificationModule,
  SandboxModule,
} from './types.ts';

/**
 * **Composition Root** de la arquitectura hexagonal del Motor de Decisiones CrediFlow.
 *
 * Ensambla de forma desacoplada:
 * 1. Infraestructura base (`Clock`, `IdGenerator`, `FinancialParametersStore`).
 * 2. Driven Adapters vía {@link createRepositories} (`InMemory` con seed data o personalizados).
 * 3. Módulos de aplicación por feature (Core, Decisión y Operaciones).
 *
 * @param adapters Adaptadores secundarios u opciones de configuración opcionales.
 * @returns Instancia lista para usar de {@link DecisionEngine} (librería, REST API o CLI).
 */
export function createDecisionEngine(
  adapters: DecisionEngineAdapters = {},
): DecisionEngine {
  const clock = adapters.clock ?? new SystemClock();
  const idGenerator = adapters.idGenerator ?? new CryptoIdGenerator();
  const financialParamsStore = new FinancialParametersStore(
    adapters.financialParameters,
  );
  const repositories = createRepositories(adapters, clock, financialParamsStore);

  const runtimeContext: EngineRuntimeContext = {
    clock,
    idGenerator,
    financialParamsStore,
    repositories,
  };

  const pipelineGates = createPipelineGatesModule(runtimeContext);

  return {
    clock,
    repositories,
    leads: createLeadsFacade(runtimeContext),
    config: createConfigFacade(runtimeContext),
    pipelineGates,
    entityMatching: createEntityMatchingModule(runtimeContext),
    qualification: createQualificationModule(runtimeContext),
    nextBestAction: createNextBestActionModule(runtimeContext, pipelineGates),
    automation: createAutomationModule(runtimeContext, pipelineGates),
    sandbox: createSandboxModule(runtimeContext),
    governance: createGovernanceModule(runtimeContext),
  };
}
