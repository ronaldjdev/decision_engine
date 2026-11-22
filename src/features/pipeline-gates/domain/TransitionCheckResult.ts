import type { ConditionCheckRecord } from '../../governance/domain/EngineDecisionLog.ts';
import type { PipelineStageId } from '../../../shared/domain/value-objects/PipelineStage.ts';

export interface TransitionCheckResult {
  readonly allowed: boolean;
  readonly reason: string;
  readonly ruleId?: string;
  readonly ruleName?: string;
  readonly missingCondition?: string;
  readonly targetStageId: PipelineStageId;
  readonly conditionsChecked: readonly ConditionCheckRecord[];
  readonly bypassedByExceptionId?: string;
}
