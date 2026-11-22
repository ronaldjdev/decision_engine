import type { Clock } from '../../../shared/domain/Clock.ts';
import type { FinancialParametersProps } from '../../../shared/domain/value-objects/FinancialParameters.ts';
import type {
  Lead,
  MessageChannel,
  RailTier,
  TaskPriority,
} from '../../../shared/domain/value-objects/Lead.ts';
import {
  LibranzaCapacity,
  estimateInstallment,
} from '../../../shared/domain/value-objects/LibranzaCapacity.ts';
import type {
  BulkQualificationResultItem,
  QualificationVerdict,
} from './QualificationModels.ts';

/**
 * Servicio de Dominio del Sub-motor 3: Evaluador Determinístico de Calificación y Tiers (`qualifyLeadDeterministic`).
 *
 * Puntúa prospectos de `0` a `100` (base `50`) evaluando convenio activo (`+20`), segmento (`+15/+5`),
 * cobertura de capacidad Ley 1527 frente a cuota estimada (`+20`) y score crediticio (`+25/+15/+5/+0`),
 * asignando `RailTier`, veredicto, canal inicial, prioridad y siguiente mejor acción.
 */
export class DeterministicQualifierService {
  public evaluate(input: {
    lead: Lead;
    financialParams: Readonly<FinancialParametersProps>;
    clock: Clock;
    entityRateOverride?: { rateEA: number; termMonths: number };
  }): BulkQualificationResultItem {
    const { lead, financialParams, clock, entityRateOverride } = input;
    const p = lead.props;
    const reasons: string[] = [];

    const effectiveNetIncome =
      p.netIncome !== undefined && p.netIncome > 0
        ? p.netIncome
        : Math.round(p.monthlyIncome * financialParams.qualifierNetIncomeRatio);

    const capacity = LibranzaCapacity.calculate(
      effectiveNetIncome,
      p.currentDiscounts,
      financialParams.ley1527ProtectedRatio,
    );
    const calculatedCapacity = capacity.availableCapacity;

    const estimatedInstallment = estimateInstallment(
      p.requestedAmount,
      financialParams,
      entityRateOverride,
    );
    const capacityPassed = calculatedCapacity >= estimatedInstallment;

    // Puntaje base: 50 puntos (tope máximo 100)
    let score = 50;
    reasons.push('Puntaje base inicial: 50 pts');

    const convenioActive = lead.hasActiveConvenio();
    if (convenioActive) {
      score += 20;
      reasons.push(`Convenio activo (${p.pagaduria} / ${p.convenioCodigo}): +20 pts`);
    } else {
      reasons.push('Sin convenio activo con pagaduría: +0 pts');
    }

    if (
      p.libranzaSegment === 'Pensionado' ||
      p.libranzaSegment === 'Empleado Público'
    ) {
      score += 15;
      reasons.push(`Segmento estable (${p.libranzaSegment}): +15 pts`);
    } else {
      score += 5;
      reasons.push(`Segmento ${p.libranzaSegment}: +5 pts`);
    }

    if (capacityPassed) {
      score += 20;
      reasons.push(
        `Capacidad Ley 1527 ($${calculatedCapacity.toLocaleString('es-CO')}) >= cuota estimada ($${estimatedInstallment.toLocaleString('es-CO')}): +20 pts`,
      );
    } else {
      reasons.push(
        `Capacidad ($${calculatedCapacity.toLocaleString('es-CO')}) inferior a cuota estimada ($${estimatedInstallment.toLocaleString('es-CO')}): +0 pts`,
      );
    }

    const creditScore = p.creditBureauDetails?.score ?? p.creditScoreSimulated;
    if (creditScore >= 750) {
      score += 25;
      reasons.push(`Score crediticio excelente (${creditScore} >= 750): +25 pts`);
    } else if (creditScore >= 650) {
      score += 15;
      reasons.push(`Score crediticio bueno (${creditScore} >= 650): +15 pts`);
    } else if (creditScore >= 550) {
      score += 5;
      reasons.push(`Score crediticio moderado (${creditScore} >= 550): +5 pts`);
    } else {
      reasons.push(`Score crediticio bajo (${creditScore} < 550): +0 pts`);
    }

    const railScore = Math.min(100, score);

    // Asignación en orden estricto (Sección 3.5)
    let railTier: RailTier;
    let qualificationVerdict: QualificationVerdict;
    let cadenceChannel: MessageChannel;
    let priority: TaskPriority;
    let nextBestAction: string;
    let retryDelayMinutes: number;

    if (!convenioActive) {
      railTier = 'DECLINADO';
      qualificationVerdict = 'SIN_CONVENIO';
      cadenceChannel = 'sms';
      priority = 'baja';
      nextBestAction = 'Enviar SMS informativo: pagaduría sin convenio vigente.';
      retryDelayMinutes = 1440;
    } else if (calculatedCapacity < financialParams.minQualifyingCapacity) {
      railTier = 'DECLINADO';
      qualificationVerdict = 'BLOQUEADO_LEY_1527';
      cadenceChannel = 'email';
      priority = 'baja';
      nextBestAction =
        'Enviar correo con opciones de saneamiento o compra de cartera (Ley 1527 < $100.000).';
      retryDelayMinutes = 1440;
    } else if (railScore >= 90 && capacityPassed && creditScore >= 720) {
      railTier = 'TIER_A_PLUS';
      qualificationVerdict = 'APROBADO_PARA_RAIL';
      cadenceChannel = 'voip_call';
      priority = 'urgente';
      nextBestAction = 'Llamada VoIP inmediata (SLA < 15 min) con oferta preaprobada preferencial.';
      retryDelayMinutes = 15;
    } else if (railScore >= 70 && capacityPassed) {
      railTier = 'TIER_A';
      qualificationVerdict = 'APROBADO_PARA_RAIL';
      cadenceChannel = 'voip_call';
      priority = 'alta';
      nextBestAction = 'Llamada VoIP prioritaria para perfilamiento y recolección de desprendibles.';
      retryDelayMinutes = 30;
    } else if (!capacityPassed) {
      railTier = 'TIER_C_CONDICIONAL';
      qualificationVerdict = 'CONDICIONAL_PLAN_B';
      cadenceChannel = 'whatsapp';
      priority = 'baja';
      nextBestAction =
        'Enviar WhatsApp ofreciendo ajuste de monto o ampliación de plazo / Plan B.';
      retryDelayMinutes = 120;
    } else {
      railTier = 'TIER_B';
      qualificationVerdict = 'APROBADO_PARA_RAIL';
      cadenceChannel = 'voip_call';
      priority = 'media';
      nextBestAction = 'Contactar por VoIP en cola estándar para validar condiciones de libranza.';
      retryDelayMinutes = 60;
    }

    return {
      leadId: lead.id,
      leadName: p.fullName,
      calculatedCapacity,
      estimatedInstallment,
      installmentCalculationMode: financialParams.installmentCalculationMode,
      railTier,
      railScore,
      qualificationVerdict,
      priority,
      nextBestAction,
      cadenceChannel,
      cadenceStep: 1,
      nextRetrySchedule: clock.addMinutesIso(retryDelayMinutes),
      reasons,
    };
  }
}
