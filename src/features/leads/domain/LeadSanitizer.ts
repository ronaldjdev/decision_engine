import type { FinancialParametersProps } from '../../../shared/domain/value-objects/FinancialParameters.ts';
import { Lead } from '../../../shared/domain/value-objects/Lead.ts';
import { LibranzaCapacity } from '../../../shared/domain/value-objects/LibranzaCapacity.ts';
import { normalizeStageId } from '../../../shared/domain/value-objects/PipelineStage.ts';

/**
 * Servicio de Dominio encargado de sanitizar los datos financieros y operativos de un Lead:
 * - Estima netIncome = round(monthlyIncome * sanitizerNetIncomeRatio) cuando falta.
 * - Calcula capacidad disponible Ley 1527 (50% inembargable - descuentos).
 * - Unifica el identificador de etapa hacia las 7 fases canónicas.
 * - Actualiza incomeDetails y capacityDetails con el SMMLV parametrizado.
 */
export class LeadSanitizer {
  public sanitize(lead: Lead, params: Readonly<FinancialParametersProps>): Lead {
    const clone = lead.clone();
    const p = clone.props;

    p.currentStageId = normalizeStageId(p.currentStageId);

    const netIncome =
      p.netIncome !== undefined && p.netIncome > 0
        ? Math.round(p.netIncome)
        : Math.round(p.monthlyIncome * params.sanitizerNetIncomeRatio);
    p.netIncome = netIncome;

    const capacity = LibranzaCapacity.calculate(
      netIncome,
      p.currentDiscounts,
      params.ley1527ProtectedRatio,
    );

    p.calculatedLibranzaCapacity = capacity.availableCapacity;
    p.capacityDetails = {
      availableCapacity: capacity.availableCapacity,
      maxInstallment: capacity.availableCapacity,
      isZeroOrNegative: capacity.isZeroOrNegative,
    };

    const minWageMultiple =
      params.smmlv > 0
        ? Number((p.monthlyIncome / params.smmlv).toFixed(2))
        : 0;

    p.incomeDetails = {
      baseIncome: p.incomeDetails?.baseIncome ?? p.monthlyIncome,
      additionalConcepts: p.incomeDetails?.additionalConcepts ?? 0,
      totalVerified: p.monthlyIncome,
      minWageMultiple,
    };

    p.qualificationData = {
      ...p.qualificationData,
      convenioActive: clone.hasActiveConvenio(),
      capacityApproved: capacity.availableCapacity > 0,
    };

    return clone;
  }
}
