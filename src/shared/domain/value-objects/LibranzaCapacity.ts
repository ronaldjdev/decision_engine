import { ValueObject } from '../ValueObject.ts';
import type { FinancialParametersProps } from './FinancialParameters.ts';
import { DEFAULT_FINANCIAL_PARAMETERS } from './FinancialParameters.ts';

interface LibranzaCapacityProps extends Record<string, unknown> {
  netIncome: number;
  existingDiscounts: number;
  unseizableRemainder: number;
  availableCapacity: number;
  isZeroOrNegative: boolean;
}

/**
 * Value Object que implementa la fórmula legal de **Ley 1527 de 2012**:
 * - `Remanente Inembargable (50%) = Ingreso Neto * 0.50`
 * - `Capacidad Disponible = max(0, (Ingreso Neto * 0.50) - Descuentos Previos)`
 */
export class LibranzaCapacity extends ValueObject<LibranzaCapacityProps> {
  public readonly netIncome: number;
  public readonly existingDiscounts: number;
  public readonly unseizableRemainder: number;
  public readonly availableCapacity: number;
  public readonly isZeroOrNegative: boolean;

  private constructor(props: LibranzaCapacityProps) {
    super(props);
    this.netIncome = props.netIncome;
    this.existingDiscounts = props.existingDiscounts;
    this.unseizableRemainder = props.unseizableRemainder;
    this.availableCapacity = props.availableCapacity;
    this.isZeroOrNegative = props.isZeroOrNegative;
  }

  /**
   * Calcula la capacidad disponible de libranza a partir del ingreso neto y descuentos vigentes.
   * @param netIncome Ingreso neto mensual en COP.
   * @param existingDiscounts Sumatoria de descuentos previos de nómina/pensión en COP.
   * @param protectedRatio Porcentaje máximo embargable (por defecto `0.50`).
   */
  public static calculate(
    netIncome: number,
    existingDiscounts: number,
    protectedRatio: number = DEFAULT_FINANCIAL_PARAMETERS.ley1527ProtectedRatio,
  ): LibranzaCapacity {
    const safeNet = Math.max(0, Math.round(netIncome));
    const safeDiscounts = Math.max(0, Math.round(existingDiscounts));
    const unseizableRemainder = Math.round(safeNet * protectedRatio);
    const rawAvailable = unseizableRemainder - safeDiscounts;
    const availableCapacity = Math.max(0, rawAvailable);

    return new LibranzaCapacity({
      netIncome: safeNet,
      existingDiscounts: safeDiscounts,
      unseizableRemainder,
      availableCapacity,
      isZeroOrNegative: rawAvailable <= 0,
    });
  }

  /** Verifica si el cupo libre cubre completamente la cuota solicitada. */
  public canCoverInstallment(installment: number): boolean {
    return this.availableCapacity >= installment;
  }
}

/**
 * Convierte tasa Efectiva Anual (E.A.) a tasa Mensual Vencida (M.V.):
 * `i_m = (1 + EA)^(1/12) - 1`.
 */
export function effectiveAnnualToMonthlyRate(rateEA: number): number {
  return Math.pow(1 + rateEA, 1 / 12) - 1;
}

/**
 * Calcula cuota mensual mediante sistema de amortización francesa:
 * `C = P * [i_m * (1 + i_m)^n] / [(1 + i_m)^n - 1]`.
 */
export function calculateFrenchAmortizationInstallment(
  principal: number,
  rateEA: number,
  termMonths: number,
): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const monthlyRate = effectiveAnnualToMonthlyRate(rateEA);
  if (monthlyRate <= 0) {
    return Math.round(principal / termMonths);
  }
  const factor = Math.pow(1 + monthlyRate, termMonths);
  const installment = (principal * (monthlyRate * factor)) / (factor - 1);
  return Math.round(installment);
}

/**
 * Aproximación clásica heredada del prototipo:
 * `Cuota = round((monto / 60) * 1.35)`.
 */
export function calculateClassicApproximationInstallment(principal: number): number {
  if (principal <= 0) return 0;
  return Math.round((principal / 60) * 1.35);
}

/**
 * Selector unificado de cuota estimada según la estrategia configurada en `FinancialParametersProps`.
 */
export function estimateInstallment(
  principal: number,
  params: Readonly<FinancialParametersProps>,
  overrides?: { rateEA?: number; termMonths?: number },
): number {
  if (params.installmentCalculationMode === 'classic_approximation') {
    return calculateClassicApproximationInstallment(principal);
  }
  const rateEA = overrides?.rateEA ?? params.defaultAnnualRateEA;
  const termMonths = overrides?.termMonths ?? params.defaultTermMonths;
  return calculateFrenchAmortizationInstallment(principal, rateEA, termMonths);
}
