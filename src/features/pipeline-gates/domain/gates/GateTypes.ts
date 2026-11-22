import type { FinancialParametersProps } from '../../../../shared/domain/value-objects/FinancialParameters.ts';
import type { Lead } from '../../../../shared/domain/value-objects/Lead.ts';
import type {
  PipelineBoard,
  PipelineStageDefinition,
  PipelineStageId,
} from '../../../../shared/domain/value-objects/PipelineStage.ts';
import type { DeterministicRule } from '../../../governance/domain/DeterministicRule.ts';
import type { ConditionCheckRecord } from '../../../governance/domain/EngineDecisionLog.ts';
import type { JustifiedExceptionRequest } from '../../../governance/domain/JustifiedExceptionRequest.ts';
import type { TransitionCheckResult } from '../TransitionCheckResult.ts';

/** Contexto público de entrada para evaluar las compuertas de transición. */
export interface GateEvaluationContext {
  lead: Lead;
  board: PipelineBoard;
  targetStageId: PipelineStageId;
  rules: readonly DeterministicRule[];
  financialParams: Readonly<FinancialParametersProps>;
  findApprovedException: (ruleCode: string) => JustifiedExceptionRequest | undefined;
}

/** Estado interno compartido entre las compuertas durante una evaluación. */
export interface GateEvaluationState {
  readonly ctx: GateEvaluationContext;
  readonly normalizedTarget: PipelineStageId;
  readonly currentStage?: PipelineStageDefinition;
  readonly targetStage: PipelineStageDefinition;
  readonly checks: ConditionCheckRecord[];
  readonly isRuleActive: (code: string) => boolean;
}

/** Contrato funcional de una compuerta individual: retorna bloqueo o `null` si pasa. */
export type PipelineGate = (state: GateEvaluationState) => TransitionCheckResult | null;

/** Normaliza texto eliminando diacríticos y convirtiendo a minúsculas. */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Construye una respuesta de bloqueo estandarizada con las trazas acumuladas. */
export function buildBlockResult(
  state: GateEvaluationState,
  info: {
    ruleId: string;
    ruleName: string;
    reason: string;
    missingCondition: string;
  },
): TransitionCheckResult {
  return {
    allowed: false,
    reason: info.reason,
    ruleId: info.ruleId,
    ruleName: info.ruleName,
    missingCondition: info.missingCondition,
    targetStageId: state.normalizedTarget,
    conditionsChecked: state.checks,
  };
}

/** Construye una respuesta de autorización con las trazas acumuladas. */
export function buildAllowResult(
  targetStageId: PipelineStageId,
  reason: string,
  conditionsChecked: readonly ConditionCheckRecord[],
): TransitionCheckResult {
  return { allowed: true, reason, targetStageId, conditionsChecked };
}
