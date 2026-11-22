import type { PipelineStageId } from '../../../shared/domain/value-objects/PipelineStage.ts';

export type DecisionVerdict =
  | 'AUTORIZADO'
  | 'BLOQUEADO'
  | 'SIGUIENTE_ACCION_GENERADA';

export interface ConditionCheckRecord {
  readonly condition: string;
  readonly passed: boolean;
  readonly actualValue: unknown;
}

export interface EngineDecisionLog {
  readonly id: string;
  readonly timestamp: string;
  readonly leadId: string;
  readonly leadName: string;
  readonly ruleId: string;
  readonly ruleName: string;
  readonly stageEvaluated: PipelineStageId;
  readonly conditionsChecked: readonly ConditionCheckRecord[];
  readonly verdict: DecisionVerdict;
  readonly actionTaken: string;
  readonly advisorResponsible: string;
}
