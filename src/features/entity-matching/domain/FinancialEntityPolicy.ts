import type { LibranzaSegment } from '../../../shared/domain/value-objects/Lead.ts';

export interface FinancialEntityPolicy {
  readonly entityName: string;
  readonly acceptedSegments: readonly LibranzaSegment[];
  readonly toleratesCreditBureauReport: boolean;
  readonly maxAge: number;
  readonly minSmmlv: number;
  readonly maxDti: number;
  readonly minScore: number;
  readonly keyAgreements: readonly string[];
  readonly rateMV: number;
  readonly rateEA: number;
  readonly maxTermMonths: number;
  readonly maxAmount: number;
  readonly isDefaultPlanB?: boolean;
}
