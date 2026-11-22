import type { LibranzaSegment } from '../../../shared/domain/value-objects/Lead.ts';
import type { StandardPipelineStageId } from '../../../shared/domain/value-objects/PipelineStage.ts';
import type { FinancialEntityProbability } from '../../entity-matching/domain/FinancialEntityProbability.ts';

export type SimCallOutcome =
  | 'contacto_exitoso_interesado'
  | 'no_contesta'
  | 'buzon_voz'
  | 'no_interesado'
  | 'cita_agendada';

export interface SandboxSimulationInput {
  readonly simSegment: LibranzaSegment;
  readonly simPagaduria: string;
  readonly simConvenioActivo: boolean;
  readonly simNetIncome: number;
  readonly simExistingDiscounts: number;
  readonly simRequestedInstallment: number;
  readonly simApplicantAge: number;
  readonly simLoanTermYears: number;
  readonly simCallOutcome: SimCallOutcome;
  readonly simColillasVerified: boolean;
  readonly simVisadoApproved: boolean;
  readonly simPromissorySigned: boolean;
  readonly simCreditScore?: number;
  readonly simIsReported?: boolean;
  readonly simSelectedFinanciera?: string;
}

export type SimulationStepStatus = 'APROBADO' | 'BLOQUEADO' | 'PENDIENTE' | 'OMITIDO';

export interface SimulationStep {
  readonly ruleCode: string;
  readonly ruleName: string;
  readonly category: 'HARD_RESTRICTION' | 'CONFIGURABLE_POLICY';
  readonly status: SimulationStepStatus;
  readonly detail: string;
  readonly actualValue: unknown;
}

export interface SimulationVerdict {
  readonly status: 'APROBADO_DESEMBOLSO' | 'EN_PROGRESO' | 'BLOQUEADO' | 'DECLINADO';
  readonly title: string;
  readonly description: string;
  readonly nextAction: string;
  readonly nextStage: StandardPipelineStageId;
}

export interface SandboxSimulationResult {
  readonly executedAt: string;
  readonly isolated: true;
  readonly ley1527Breakdown: {
    readonly netIncome: number;
    readonly unseizableRemainder: number;
    readonly existingDiscounts: number;
    readonly availableCapacity: number;
    readonly requestedInstallment: number;
    readonly installmentCovered: boolean;
  };
  readonly evaluationSteps: readonly SimulationStep[];
  readonly finalVerdict: SimulationVerdict;
  readonly entityProbabilitiesPreview: readonly FinancialEntityProbability[];
}
