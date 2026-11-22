import { ValidationError } from '../DomainError.ts';

/**
 * Estrategia de cálculo de cuota mensual estimada (Sección 5.3 #4):
 * - `french_amortization`: Amortización francesa con tasa E.A. convertida a M.V. y plazo.
 * - `classic_approximation`: Fórmula heredada `round((monto / 60) * 1.35)`.
 */
export type InstallmentCalculationMode =
  | 'french_amortization'
  | 'classic_approximation';

/**
 * Parámetros financieros y regulatorios centralizados del motor.
 * Elimina constantes rígidas (como SMMLV fijo) para permitir actualización anual en producción.
 */
export interface FinancialParametersProps {
  /** Salario Mínimo Mensual Legal Vigente (COP). Parametrizable anualmente. */
  smmlv: number;
  /** Porcentaje legal Ley 1527 inembargable (por defecto 0.50 = 50%). */
  ley1527ProtectedRatio: number;
  /** Capacidad mínima para no ser declinado en calificación masiva (COP). */
  minQualifyingCapacity: number;
  /** Factor de estimación de ingreso neto en sanitización si falta netIncome (0.88). */
  sanitizerNetIncomeRatio: number;
  /** Factor de estimación de ingreso neto en calificación si falta netIncome (0.85). */
  qualifierNetIncomeRatio: number;
  /** Modo de cálculo de cuota estimada: amortización francesa o aproximación clásica. */
  installmentCalculationMode: InstallmentCalculationMode;
  /** Tasa Efectiva Anual (E.A.) de referencia para amortización francesa (ej. 0.189 = 18.9% E.A.). */
  defaultAnnualRateEA: number;
  /** Plazo de referencia en meses para amortización francesa (ej. 60 meses). */
  defaultTermMonths: number;
  /** Edad máxima asegurabilidad + plazo para pensionados (84 años). */
  pensionadoMaxAgePlusTerm: number;
}

/** Valores financieros predeterminados del motor CrediFlow. */
export const DEFAULT_FINANCIAL_PARAMETERS: Readonly<FinancialParametersProps> =
  Object.freeze({
    smmlv: 1_400_000,
    ley1527ProtectedRatio: 0.5,
    minQualifyingCapacity: 100_000,
    sanitizerNetIncomeRatio: 0.88,
    qualifierNetIncomeRatio: 0.85,
    installmentCalculationMode: 'french_amortization',
    defaultAnnualRateEA: 0.189,
    defaultTermMonths: 60,
    pensionadoMaxAgePlusTerm: 84,
  });

/**
 * Almacén de parámetros financieros con validación de invariantes en cada actualización.
 */
export class FinancialParametersStore {
  private current: FinancialParametersProps;

  constructor(initial?: Partial<FinancialParametersProps>) {
    this.current = {
      ...DEFAULT_FINANCIAL_PARAMETERS,
      ...initial,
    };
    this.validate(this.current);
  }

  /** Retorna una copia inmutable de la configuración financiera vigente. */
  public get(): Readonly<FinancialParametersProps> {
    return Object.freeze({ ...this.current });
  }

  /**
   * Aplica una actualización parcial validada sobre los parámetros financieros.
   * @throws ValidationError Si algún parámetro sale de los rangos permitidos.
   */
  public update(patch: Partial<FinancialParametersProps>): Readonly<FinancialParametersProps> {
    const next: FinancialParametersProps = {
      ...this.current,
      ...patch,
    };
    this.validate(next);
    this.current = next;
    return this.get();
  }

  private validate(params: FinancialParametersProps): void {
    if (params.smmlv <= 0) {
      throw new ValidationError('El SMMLV debe ser mayor a 0.');
    }
    if (params.ley1527ProtectedRatio <= 0 || params.ley1527ProtectedRatio > 1) {
      throw new ValidationError('El porcentaje Ley 1527 debe estar entre 0 y 1.');
    }
    if (params.defaultAnnualRateEA <= 0 || params.defaultAnnualRateEA > 1) {
      throw new ValidationError('La tasa E.A. de referencia debe estar entre 0 y 1.');
    }
    if (params.defaultTermMonths < 1 || params.defaultTermMonths > 240) {
      throw new ValidationError('El plazo de referencia debe estar entre 1 y 240 meses.');
    }
  }
}
