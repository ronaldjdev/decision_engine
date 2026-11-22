import type {
  MessageChannel,
  RailTier,
  TaskPriority,
} from '../../../shared/domain/value-objects/Lead.ts';
import type { InstallmentCalculationMode } from '../../../shared/domain/value-objects/FinancialParameters.ts';

export type QualificationVerdict =
  | 'APROBADO_PARA_RAIL'
  | 'CONDICIONAL_PLAN_B'
  | 'SIN_CONVENIO'
  | 'BLOQUEADO_LEY_1527';

export interface BulkQualificationResultItem {
  readonly leadId: string;
  readonly leadName: string;
  readonly calculatedCapacity: number;
  readonly estimatedInstallment: number;
  readonly installmentCalculationMode: InstallmentCalculationMode;
  readonly railTier: RailTier;
  readonly railScore: number;
  readonly qualificationVerdict: QualificationVerdict;
  readonly priority: TaskPriority;
  readonly nextBestAction: string;
  readonly cadenceChannel: MessageChannel;
  readonly cadenceStep: number;
  readonly nextRetrySchedule: string;
  readonly reasons: readonly string[];
}

export interface BulkQualificationBatch {
  readonly batchId: string;
  readonly executedAt: string;
  readonly totalLeadsEvaluated: number;
  readonly tierAPlusCount: number;
  readonly tierACount: number;
  readonly tierBCount: number;
  readonly tierConditionalCount: number;
  readonly declinedCount: number;
  readonly items: readonly BulkQualificationResultItem[];
}
