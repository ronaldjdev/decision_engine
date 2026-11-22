import { ManageActionTagsUseCase } from '../../features/automation/application/ManageActionTagsUseCase.ts';
import { RunRailsDaemonSweepUseCase } from '../../features/automation/application/RunRailsDaemonSweepUseCase.ts';
import { TriggerActionTagUseCase } from '../../features/automation/application/TriggerActionTagUseCase.ts';
import { CompleteTaskUseCase } from '../../features/next-best-action/application/CompleteTaskUseCase.ts';
import { PrioritizeWorkQueueUseCase } from '../../features/next-best-action/application/PrioritizeWorkQueueUseCase.ts';
import { UpdatePriorityPolicyUseCase } from '../../features/next-best-action/application/UpdatePriorityPolicyUseCase.ts';
import type {
  AutomationModule,
  EngineRuntimeContext,
  NextBestActionModule,
  PipelineGatesModule,
} from '../types.ts';

/**
 * Ensambla el **Sub-motor 4 (Siguiente Mejor Acción y Política de Priorización)**.
 *
 * Depende de `pipelineGates.moveLeadStage` para validar compuertas antes de ejecutar
 * transiciones automáticas derivadas de completar tareas.
 */
export function createNextBestActionModule(
  ctx: EngineRuntimeContext,
  pipelineGates: PipelineGatesModule,
): NextBestActionModule {
  return {
    completeTask: new CompleteTaskUseCase({
      leadRepository: ctx.repositories.leads,
      moveLeadStage: pipelineGates.moveLeadStage,
      decisionLogRepository: ctx.repositories.decisionLogs,
      clock: ctx.clock,
      idGenerator: ctx.idGenerator,
    }),
    prioritizeQueue: new PrioritizeWorkQueueUseCase({
      leadRepository: ctx.repositories.leads,
      policyRepository: ctx.repositories.priorityPolicy,
      clock: ctx.clock,
    }),
    priorityPolicy: new UpdatePriorityPolicyUseCase({
      policyRepository: ctx.repositories.priorityPolicy,
      clock: ctx.clock,
    }),
  };
}

/**
 * Ensambla el **Sub-motor 5 (Automatización por Etiquetas Operativas y Demonio Continuo)**.
 *
 * Orquesta `triggerActionTag` (incluyendo activación de Plan B `R-MULTI-FIN-01`),
 * `runRailsDaemonSweep` y administración RBAC de etiquetas personalizadas.
 */
export function createAutomationModule(
  ctx: EngineRuntimeContext,
  pipelineGates: PipelineGatesModule,
): AutomationModule {
  return {
    triggerActionTag: new TriggerActionTagUseCase({
      leadRepository: ctx.repositories.leads,
      actionTagRepository: ctx.repositories.actionTags,
      policyRepository: ctx.repositories.financialEntities,
      ruleRepository: ctx.repositories.rules,
      decisionLogRepository: ctx.repositories.decisionLogs,
      notificationGateway: ctx.repositories.notifications,
      liveEventStore: ctx.repositories.liveEvents,
      moveLeadStage: pipelineGates.moveLeadStage,
      financialParamsStore: ctx.financialParamsStore,
      clock: ctx.clock,
      idGenerator: ctx.idGenerator,
    }),
    runDaemonSweep: new RunRailsDaemonSweepUseCase({
      leadRepository: ctx.repositories.leads,
      liveEventStore: ctx.repositories.liveEvents,
      decisionLogRepository: ctx.repositories.decisionLogs,
      clock: ctx.clock,
      idGenerator: ctx.idGenerator,
    }),
    manageActionTags: new ManageActionTagsUseCase(ctx.repositories.actionTags),
  };
}
