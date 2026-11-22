import type { FinancialParametersProps } from '../../../shared/domain/value-objects/FinancialParameters.ts';
import type { Lead } from '../../../shared/domain/value-objects/Lead.ts';
import { calculateFrenchAmortizationInstallment } from '../../../shared/domain/value-objects/LibranzaCapacity.ts';
import type { DeterministicRule } from '../../governance/domain/DeterministicRule.ts';
import type { FinancialEntityPolicy } from './FinancialEntityPolicy.ts';
import type {
  EntityMatchStatus,
  FinancialEntityProbability,
} from './FinancialEntityProbability.ts';

function firstWordNormalized(value: string): string {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return cleaned.split(/\s+/)[0] ?? '';
}

/**
 * Servicio de Dominio del Sub-motor 2: Motor de Probabilidades Multientidad (`calculateFinancialEntityProbabilities`).
 *
 * Evalúa simultáneamente un `Lead` frente a las políticas de las 5 financieras aliadas
 * (*Valorenz, Capital, Bancoomeva, Coopcentral, Finandina*), aplicando:
 * - Probabilidad base `72%`, ajuste por convenio (primera palabra), edad (`R-LIB-003`),
 *   reportes en centrales (`R-LIB-008`) y capacidad Ley 1527.
 * - Normalización `[15%, 95%]`, clasificación de estado, cuota estimada por amortización francesa
 *   y resolución de entidad **Plan B** (`R-LIB-007`).
 */
export class MultiEntityProbabilityService {
  public evaluate(input: {
    lead: Lead;
    policies: readonly FinancialEntityPolicy[];
    rules: readonly DeterministicRule[];
    financialParams: Readonly<FinancialParametersProps>;
  }): FinancialEntityProbability[] {
    const { lead, policies, rules, financialParams } = input;
    const p = lead.props;

    const ruleActive = (code: string): boolean => {
      const found = rules.find((r) => r.code === code);
      return found ? found.isActive : true;
    };

    const ageRuleActive = ruleActive('R-LIB-003');
    const planBRuleActive = ruleActive('R-LIB-007');
    const bureauToleranceRuleActive = ruleActive('R-LIB-008');

    const pagaduriaWord = firstWordNormalized(p.pagaduria);
    const isReported = lead.isReportedInBureau();
    const score = p.creditBureauDetails?.score ?? p.creditScoreSimulated;
    const capacity = p.calculatedLibranzaCapacity;
    const hasRejections = p.rejectedFinancieras.length > 0;

    const results: FinancialEntityProbability[] = policies.map((policy) => {
      const termMonths = policy.maxTermMonths;
      const estimatedMonthlyInstallment = calculateFrenchAmortizationInstallment(
        p.requestedAmount,
        policy.rateEA,
        Math.min(termMonths, financialParams.defaultTermMonths),
      );

      // 1. Si ya fue rechazada
      if (p.rejectedFinancieras.includes(policy.entityName)) {
        return {
          entityName: policy.entityName,
          probability: 0,
          status: 'rechazada',
          reason: 'Entidad registrada previamente en rejectedFinancieras.',
          maxApprovedAmount: 0,
          rateEA: policy.rateEA,
          rateMV: policy.rateMV,
          termMonths,
          estimatedMonthlyInstallment,
          isPlanBAlternative: false,
          selected: p.selectedFinanciera === policy.entityName,
        };
      }

      // 2. Si el segmento no es aceptado
      if (!policy.acceptedSegments.includes(p.libranzaSegment)) {
        return {
          entityName: policy.entityName,
          probability: 10,
          status: 'no_aplica',
          reason: `Segmento '${p.libranzaSegment}' no atendido por ${policy.entityName}.`,
          maxApprovedAmount: 0,
          rateEA: policy.rateEA,
          rateMV: policy.rateMV,
          termMonths,
          estimatedMonthlyInstallment,
          isPlanBAlternative: false,
          selected: p.selectedFinanciera === policy.entityName,
        };
      }

      // 3. Cálculo base 72%
      let prob = 72;
      const reasons: string[] = [];

      // Convenio por primera palabra entre pagaduría y keyAgreements
      const hasKeyAgreement =
        pagaduriaWord.length > 0 &&
        policy.keyAgreements.some(
          (agr) => firstWordNormalized(agr) === pagaduriaWord,
        );
      if (hasKeyAgreement) {
        prob += 14;
        reasons.push(`Convenio clave con ${p.pagaduria} (+14%)`);
      } else {
        prob -= 15;
        reasons.push(`Sin convenio directo prioritario con '${p.pagaduria || 'N/A'}' (-15%)`);
      }

      // Edad vs policy.maxAge (R-LIB-003)
      if (ageRuleActive) {
        if (p.age > policy.maxAge) {
          prob -= 40;
          reasons.push(`Edad (${p.age}) supera máximo de póliza (${policy.maxAge}) (-40%)`);
        } else if (p.age <= policy.maxAge - 8) {
          prob += 6;
          reasons.push(`Edad holgada respecto a póliza (${p.age} <= ${policy.maxAge - 8}) (+6%)`);
        }
      }

      // Centrales de riesgo (R-LIB-008)
      if (isReported) {
        if (policy.toleratesCreditBureauReport && bureauToleranceRuleActive) {
          prob += 10;
          reasons.push('Entidad tolerante a reportes en centrales (+10%)');
        } else {
          prob -= 45;
          reasons.push('Restringida por reporte negativo en centrales (-45%)');
        }
      } else {
        if (score >= policy.minScore) {
          prob += 8;
          reasons.push(`Score (${score}) >= mínimo (${policy.minScore}) (+8%)`);
        } else {
          prob -= 18;
          reasons.push(`Score (${score}) inferior al mínimo (${policy.minScore}) (-18%)`);
        }
      }

      // Ingreso mínimo en SMMLV parametrizado
      const minRequiredIncome = Math.round(policy.minSmmlv * financialParams.smmlv);
      if (p.monthlyIncome < minRequiredIncome) {
        reasons.push(
          `Ingreso ($${p.monthlyIncome.toLocaleString('es-CO')}) debajo de ${policy.minSmmlv} SMMLV`,
        );
      }

      // Capacidad Ley 1527
      if (capacity <= 0) {
        prob = Math.min(prob, 15);
        reasons.push('Capacidad Ley 1527 en $0 (truncado a 15%)');
      } else if (capacity > 1_200_000) {
        prob += 6;
        reasons.push('Capacidad holgada > $1.2M (+6%)');
      }

      // 4. Normalización [15%, 95%]
      const normalizedProb = Math.max(15, Math.min(95, Math.round(prob)));

      // 5. Clasificación de estado
      const status = this.classifyStatus(normalizedProb);

      // 6. Monto máximo estimado
      const multiplier = normalizedProb > 70 ? 1.2 : 0.9;
      const maxApprovedAmount = Math.min(
        policy.maxAmount,
        Math.max(10_000_000, Math.round(p.requestedAmount * multiplier)),
      );

      return {
        entityName: policy.entityName,
        probability: normalizedProb,
        status,
        reason: reasons.join('; '),
        maxApprovedAmount,
        rateEA: policy.rateEA,
        rateMV: policy.rateMV,
        termMonths,
        estimatedMonthlyInstallment,
        isPlanBAlternative:
          planBRuleActive &&
          (Boolean(policy.isDefaultPlanB) ||
            (hasRejections &&
              normalizedProb >= 55 &&
              p.selectedFinanciera !== policy.entityName)),
        selected: p.selectedFinanciera === policy.entityName,
      };
    });

    // 7. Ordenamiento descendente por probabilidad
    return results.sort((a, b) => b.probability - a.probability);
  }

  public resolvePlanBEntity(
    rejectedEntity: string | undefined,
    probabilities: readonly FinancialEntityProbability[],
  ): string {
    // Regla explícita Sección 3.7: Valorenz -> Capital, Bancoomeva -> Valorenz, otros -> Capital
    const preferredFallback =
      rejectedEntity === 'Valorenz'
        ? 'Capital'
        : rejectedEntity === 'Bancoomeva'
          ? 'Valorenz'
          : 'Capital';

    const preferredCandidate = probabilities.find(
      (p) => p.entityName === preferredFallback && p.status !== 'rechazada',
    );
    if (preferredCandidate) {
      return preferredCandidate.entityName;
    }

    const bestAvailable = probabilities.find(
      (p) => p.status !== 'rechazada' && p.entityName !== rejectedEntity,
    );
    return bestAvailable?.entityName ?? 'Capital';
  }

  private classifyStatus(prob: number): EntityMatchStatus {
    if (prob >= 80) return 'altamente_recomendada';
    if (prob >= 55) return 'viable';
    if (prob >= 35) return 'condicional';
    return 'no_aplica';
  }
}
