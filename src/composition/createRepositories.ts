import { InMemoryActionTagRepository } from '../features/automation/infrastructure/InMemoryActionTagRepository.ts';
import { InMemoryLiveEventStore } from '../features/automation/infrastructure/InMemoryLiveEventStore.ts';
import { InMemoryNotificationGateway } from '../features/automation/infrastructure/InMemoryNotificationGateway.ts';
import { InMemoryFinancialEntityPolicyRepository } from '../features/entity-matching/infrastructure/InMemoryFinancialEntityPolicyRepository.ts';
import { InMemoryDecisionLogRepository } from '../features/governance/infrastructure/InMemoryDecisionLogRepository.ts';
import { InMemoryExceptionRequestRepository } from '../features/governance/infrastructure/InMemoryExceptionRequestRepository.ts';
import { InMemoryRuleRepository } from '../features/governance/infrastructure/InMemoryRuleRepository.ts';
import { LeadSanitizer } from '../features/leads/domain/LeadSanitizer.ts';
import { InMemoryBoardRepository } from '../features/leads/infrastructure/InMemoryBoardRepository.ts';
import { InMemoryLeadRepository } from '../features/leads/infrastructure/InMemoryLeadRepository.ts';
import { InMemoryPriorityPolicyRepository } from '../features/next-best-action/infrastructure/InMemoryPriorityPolicyRepository.ts';
import type { Clock } from '../shared/domain/Clock.ts';
import type { FinancialParametersStore } from '../shared/domain/value-objects/FinancialParameters.ts';
import {
  createSeedActionTags,
  createSeedBoards,
  createSeedFinancialEntityPolicies,
  createSeedLeads,
  createSeedPriorityPolicy,
  createSeedRules,
} from '../shared/infrastructure/seed/SeedData.ts';
import type {
  DecisionEngineAdapters,
  DecisionEngineRepositories,
} from './types.ts';

/**
 * Resuelve e inicializa todos los Driven Adapters (repositorios, gateways y almacenes de eventos).
 *
 * Para cada puerto no proporcionado explícitamente en `adapters`, instancia el adaptador
 * `InMemory` correspondiente precargado con los datos semilla del dominio (5 financieras,
 * catálogo `R-LIB-001`..`R-LIB-008`, `PriorityPolicyConfig`, etiquetas estándar y tableros).
 *
 * @param adapters Adaptadores personalizados u opciones de inicialización.
 * @param clock Reloj activo para sellar marcas de tiempo iniciales.
 * @param financialParamsStore Parámetros financieros usados al sanitizar leads semilla.
 */
export function createRepositories(
  adapters: DecisionEngineAdapters,
  clock: Clock,
  financialParamsStore: FinancialParametersStore,
): DecisionEngineRepositories {
  const sanitizer = new LeadSanitizer();
  const nowIso = clock.nowIso();

  const initialLeads =
    adapters.seedSampleLeads === false
      ? []
      : createSeedLeads(nowIso).map((lead) =>
          sanitizer.sanitize(lead, financialParamsStore.get()),
        );

  return {
    leads: adapters.leadRepository ?? new InMemoryLeadRepository(initialLeads),
    boards: adapters.boardRepository ?? new InMemoryBoardRepository(createSeedBoards()),
    rules: adapters.ruleRepository ?? new InMemoryRuleRepository(createSeedRules()),
    decisionLogs:
      adapters.decisionLogRepository ?? new InMemoryDecisionLogRepository(),
    exceptions:
      adapters.exceptionRepository ?? new InMemoryExceptionRequestRepository(),
    financialEntities:
      adapters.policyRepository ??
      new InMemoryFinancialEntityPolicyRepository(
        createSeedFinancialEntityPolicies(),
      ),
    priorityPolicy:
      adapters.priorityPolicyRepository ??
      new InMemoryPriorityPolicyRepository(createSeedPriorityPolicy(nowIso)),
    actionTags:
      adapters.actionTagRepository ??
      new InMemoryActionTagRepository(createSeedActionTags()),
    notifications:
      adapters.notificationGateway ?? new InMemoryNotificationGateway(),
    liveEvents: adapters.liveEventStore ?? new InMemoryLiveEventStore(50),
  };
}
