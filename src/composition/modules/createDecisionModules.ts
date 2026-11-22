import { EvaluateEntityProbabilitiesUseCase } from '../../features/entity-matching/application/EvaluateEntityProbabilitiesUseCase.ts';
import { CheckStageTransitionUseCase } from '../../features/pipeline-gates/application/CheckStageTransitionUseCase.ts';
import { MoveLeadStageUseCase } from '../../features/pipeline-gates/application/MoveLeadStageUseCase.ts';
import { QualifyIndividualLeadUseCase } from '../../features/qualification/application/QualifyIndividualLeadUseCase.ts';
import { RunBulkQualificationUseCase } from '../../features/qualification/application/RunBulkQualificationUseCase.ts';
import { RunSandboxSimulationUseCase } from '../../features/sandbox-simulator/application/RunSandboxSimulationUseCase.ts';
import type {
  EngineRuntimeContext,
  EntityMatchingModule,
  PipelineGatesModule,
  QualificationModule,
  SandboxModule,
} from '../types.ts';

/**
 * Ensambla el **Sub-motor 1 (Compuertas de Transición del Pipeline)**:
 * validación de compuertas (`canTransitionStage`) y ejecución auditada (`moveLeadStage`).
 */
export function createPipelineGatesModule(
  ctx: EngineRuntimeContext,
): PipelineGatesModule {
  const canTransitionStage = new CheckStageTransitionUseCase({
    leadRepository: ctx.repositories.leads,
    boardRepository: ctx.repositories.boards,
    ruleRepository: ctx.repositories.rules,
    exceptionRepository: ctx.repositories.exceptions,
    financialParamsStore: ctx.financialParamsStore,
  });

  const moveLeadStage = new MoveLeadStageUseCase({
    leadRepository: ctx.repositories.leads,
    boardRepository: ctx.repositories.boards,
    ruleRepository: ctx.repositories.rules,
    exceptionRepository: ctx.repositories.exceptions,
    decisionLogRepository: ctx.repositories.decisionLogs,
    financialParamsStore: ctx.financialParamsStore,
    clock: ctx.clock,
    idGenerator: ctx.idGenerator,
  });

  return { canTransitionStage, moveLeadStage };
}

/**
 * Ensambla el **Sub-motor 2 (Probabilidades Multientidad)** para las 5 financieras aliadas y Plan B.
 */
export function createEntityMatchingModule(
  ctx: EngineRuntimeContext,
): EntityMatchingModule {
  return {
    evaluateProbabilities: new EvaluateEntityProbabilitiesUseCase({
      leadRepository: ctx.repositories.leads,
      policyRepository: ctx.repositories.financialEntities,
      ruleRepository: ctx.repositories.rules,
      financialParamsStore: ctx.financialParamsStore,
    }),
  };
}

/**
 * Ensambla el **Sub-motor 3 (Calificación Determinística y Tiers)** en modo individual y por lotes.
 */
export function createQualificationModule(
  ctx: EngineRuntimeContext,
): QualificationModule {
  const qualifyIndividual = new QualifyIndividualLeadUseCase({
    leadRepository: ctx.repositories.leads,
    policyRepository: ctx.repositories.financialEntities,
    decisionLogRepository: ctx.repositories.decisionLogs,
    financialParamsStore: ctx.financialParamsStore,
    clock: ctx.clock,
    idGenerator: ctx.idGenerator,
  });

  const runBulkQualification = new RunBulkQualificationUseCase({
    leadRepository: ctx.repositories.leads,
    qualifyIndividual,
    clock: ctx.clock,
    idGenerator: ctx.idGenerator,
  });

  return { qualifyIndividual, runBulkQualification };
}

/**
 * Ensambla el **Sub-motor 6 (Simulador Sandbox Aislado)** sin mutación sobre leads productivos.
 */
export function createSandboxModule(ctx: EngineRuntimeContext): SandboxModule {
  return {
    simulate: new RunSandboxSimulationUseCase({
      policyRepository: ctx.repositories.financialEntities,
      ruleRepository: ctx.repositories.rules,
      financialParamsStore: ctx.financialParamsStore,
      clock: ctx.clock,
    }),
  };
}
