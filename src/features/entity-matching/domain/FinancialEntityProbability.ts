export type EntityMatchStatus =
  | 'altamente_recomendada'
  | 'viable'
  | 'condicional'
  | 'no_aplica'
  | 'rechazada';

export interface FinancialEntityProbability {
  readonly entityName: string;
  readonly probability: number;
  readonly status: EntityMatchStatus;
  readonly reason: string;
  readonly maxApprovedAmount: number;
  readonly rateEA: number;
  readonly rateMV: number;
  readonly termMonths: number;
  readonly estimatedMonthlyInstallment: number;
  readonly isPlanBAlternative: boolean;
  readonly selected: boolean;
}
