import type { Clock } from '../../../shared/domain/Clock.ts';
import type { FinancialParametersProps } from '../../../shared/domain/value-objects/FinancialParameters.ts';
import { Lead } from '../../../shared/domain/value-objects/Lead.ts';
import {
  LibranzaCapacity,
  effectiveAnnualToMonthlyRate,
} from '../../../shared/domain/value-objects/LibranzaCapacity.ts';
import type { FinancialEntityPolicy } from '../../entity-matching/domain/FinancialEntityPolicy.ts';
import { MultiEntityProbabilityService } from '../../entity-matching/domain/MultiEntityProbabilityService.ts';
import type { DeterministicRule } from '../../governance/domain/DeterministicRule.ts';
import type {
  SandboxSimulationInput,
  SandboxSimulationResult,
  SimulationStep,
  SimulationVerdict,
} from './SimulationModels.ts';

/**
 * Servicio puro de dominio para el Simulador Sandbox (Sub-motor 6).
 * Evalúa R-LIB-001 a R-LIB-006 de forma aislada sin mutar leads productivos.
 */
export class SandboxSimulatorService {
  private readonly multiEntityService = new MultiEntityProbabilityService();

  public simulate(input: {
    sim: SandboxSimulationInput;
    policies: readonly FinancialEntityPolicy[];
    rules: readonly DeterministicRule[];
    financialParams: Readonly<FinancialParametersProps>;
    clock: Clock;
  }): SandboxSimulationResult {
    const { sim, policies, rules, financialParams, clock } = input;
    const isRuleActive = (code: string): boolean => {
      const found = rules.find((r) => r.code === code);
      return found ? found.isActive : true;
    };

    const capacity = LibranzaCapacity.calculate(
      sim.simNetIncome,
      sim.simExistingDiscounts,
      financialParams.ley1527ProtectedRatio,
    );
    const installmentCovered = capacity.canCoverInstallment(
      sim.simRequestedInstallment,
    );

    const steps: SimulationStep[] = [];

    // R-LIB-001: Convenio activo y primer contacto
    const hasConvenio = sim.simConvenioActivo && sim.simPagaduria.trim().length > 0;
    const contactValid =
      sim.simCallOutcome === 'contacto_exitoso_interesado' ||
      sim.simCallOutcome === 'cita_agendada';
    steps.push({
      ruleCode: 'R-LIB-001',
      ruleName: 'Validación de Convenio Activo y Primer Contacto',
      category: 'HARD_RESTRICTION',
      status: !hasConvenio
        ? 'BLOQUEADO'
        : sim.simCallOutcome === 'no_interesado'
          ? 'BLOQUEADO'
          : contactValid
            ? 'APROBADO'
            : 'PENDIENTE',
      detail: !hasConvenio
        ? `Sin convenio activo con pagaduría '${sim.simPagaduria || 'N/A'}'.`
        : sim.simCallOutcome === 'no_interesado'
          ? 'Cliente manifiesta no estar interesado.'
          : contactValid
            ? `Convenio activo con ${sim.simPagaduria} y contacto efectivo (${sim.simCallOutcome}).`
            : `Convenio activo, pero primer contacto pendiente (${sim.simCallOutcome}).`,
      actualValue: {
        pagaduria: sim.simPagaduria,
        convenioActivo: sim.simConvenioActivo,
        callOutcome: sim.simCallOutcome,
      },
    });

    // R-LIB-002: Capacidad Ley 1527 (50% inembargable) y SMMLV
    const incomeMeetsSmmlv = sim.simNetIncome >= financialParams.smmlv;
    const capacityPositive = capacity.availableCapacity > 0;
    const rLib002Pass = incomeMeetsSmmlv && capacityPositive && installmentCovered;
    steps.push({
      ruleCode: 'R-LIB-002',
      ruleName: 'Protección Ley 1527 (50% Inembargable) y Cupo de Cuota',
      category: 'HARD_RESTRICTION',
      status: rLib002Pass ? 'APROBADO' : 'BLOQUEADO',
      detail: !incomeMeetsSmmlv
        ? `Ingreso neto ($${sim.simNetIncome.toLocaleString('es-CO')}) menor a 1 SMMLV ($${financialParams.smmlv.toLocaleString('es-CO')}).`
        : !capacityPositive
          ? 'Capacidad disponible Ley 1527 es $0 (requiere compra de cartera).'
          : !installmentCovered
            ? `Cuota solicitada ($${sim.simRequestedInstallment.toLocaleString('es-CO')}) excede capacidad disponible ($${capacity.availableCapacity.toLocaleString('es-CO')}).`
            : `Capacidad disponible ($${capacity.availableCapacity.toLocaleString('es-CO')}) cubre la cuota ($${sim.simRequestedInstallment.toLocaleString('es-CO')}).`,
      actualValue: {
        availableCapacity: capacity.availableCapacity,
        requestedInstallment: sim.simRequestedInstallment,
        smmlv: financialParams.smmlv,
      },
    });

    // R-LIB-003: Edad máxima al vencimiento (edad + plazo <= 84 para Pensionados)
    const rLib003Active = isRuleActive('R-LIB-003');
    const ageAtMaturity = sim.simApplicantAge + sim.simLoanTermYears;
    const maxMaturityLimit = financialParams.pensionadoMaxAgePlusTerm;
    const ageCheckApplies = sim.simSegment === 'Pensionado';
    const rLib003Pass =
      !rLib003Active ||
      (ageCheckApplies ? ageAtMaturity <= maxMaturityLimit : sim.simApplicantAge <= 75);
    steps.push({
      ruleCode: 'R-LIB-003',
      ruleName: 'Edad Máxima y Asegurabilidad al Vencimiento',
      category: 'CONFIGURABLE_POLICY',
      status: !rLib003Active
        ? 'OMITIDO'
        : rLib003Pass
          ? 'APROBADO'
          : 'BLOQUEADO',
      detail: !rLib003Active
        ? 'Regla configurable R-LIB-003 desactivada en el catálogo actual.'
        : ageCheckApplies
          ? rLib003Pass
            ? `Pensionado: edad (${sim.simApplicantAge}) + plazo (${sim.simLoanTermYears} años) = ${ageAtMaturity} <= ${maxMaturityLimit}.`
            : `Sobreedad pensionado: ${sim.simApplicantAge} + ${sim.simLoanTermYears} = ${ageAtMaturity} supera límite de ${maxMaturityLimit} años.`
          : rLib003Pass
            ? `Edad (${sim.simApplicantAge} años) dentro de política de asegurabilidad.`
            : `Edad (${sim.simApplicantAge} años) supera tope estándar de 75 años para ${sim.simSegment}.`,
      actualValue: {
        applicantAge: sim.simApplicantAge,
        loanTermYears: sim.simLoanTermYears,
        ageAtMaturity,
        maxMaturityLimit,
      },
    });

    // R-LIB-004: Verificación documental (colillas y cédula)
    steps.push({
      ruleCode: 'R-LIB-004',
      ruleName: 'Verificación de Soportes Documentales (Colillas y Cédula)',
      category: 'HARD_RESTRICTION',
      status: sim.simColillasVerified ? 'APROBADO' : 'PENDIENTE',
      detail: sim.simColillasVerified
        ? 'Colillas de pago y cédula verificadas correctamente.'
        : 'Falta verificación documental de colillas/cédula para radicar a estudio.',
      actualValue: { colillasVerified: sim.simColillasVerified },
    });

    // R-LIB-005: Entidad financiera principal y preaprobación / visado
    const termMonths = Math.max(12, sim.simLoanTermYears * 12);
    const monthlyRefRate = effectiveAnnualToMonthlyRate(
      financialParams.defaultAnnualRateEA,
    );
    const impliedPrincipal = Math.round(
      sim.simRequestedInstallment *
        ((1 - Math.pow(1 + monthlyRefRate, -termMonths)) / monthlyRefRate),
    );

    const virtualLead = Lead.create({
      id: 'SANDBOX-VIRTUAL-LEAD',
      fullName: 'Prospecto Simulado (Sandbox)',
      libranzaSegment: sim.simSegment,
      employmentType: sim.simSegment,
      pagaduria: sim.simPagaduria,
      convenioCodigo: sim.simConvenioActivo ? 'CONV-SANDBOX-001' : 'SIN_CONVENIO',
      age: sim.simApplicantAge,
      monthlyIncome: Math.round(sim.simNetIncome / financialParams.sanitizerNetIncomeRatio),
      netIncome: sim.simNetIncome,
      currentDiscounts: sim.simExistingDiscounts,
      calculatedLibranzaCapacity: capacity.availableCapacity,
      creditScoreSimulated: sim.simCreditScore ?? 680,
      creditBureauDetails:
        sim.simIsReported !== undefined
          ? {
              score: sim.simCreditScore ?? (sim.simIsReported ? 540 : 710),
              isReported: sim.simIsReported,
            }
          : undefined,
      requestedAmount: impliedPrincipal,
      selectedFinanciera: sim.simSelectedFinanciera,
    });

    const entityProbabilitiesPreview = this.multiEntityService.evaluate({
      lead: virtualLead,
      policies,
      rules,
      financialParams,
    });
    const bestEntity = entityProbabilitiesPreview[0];
    const rLib005Active = isRuleActive('R-LIB-005');
    const hasViableEntity = Boolean(
      bestEntity && bestEntity.probability >= 55,
    );

    steps.push({
      ruleCode: 'R-LIB-005',
      ruleName: 'Selección de Entidad Financiera y Visado de Pagaduría',
      category: 'CONFIGURABLE_POLICY',
      status: !rLib005Active
        ? 'OMITIDO'
        : !hasViableEntity
          ? 'BLOQUEADO'
          : sim.simVisadoApproved
            ? 'APROBADO'
            : 'PENDIENTE',
      detail: !rLib005Active
        ? 'Regla configurable R-LIB-005 desactivada en el catálogo.'
        : !hasViableEntity
          ? 'Ninguna financiera aliada alcanza viabilidad >= 55% con los parámetros actuales.'
          : sim.simVisadoApproved
            ? `Entidad sugerida: ${sim.simSelectedFinanciera ?? bestEntity?.entityName} (${bestEntity?.probability}%) con visado aprobado.`
            : `Entidad sugerida: ${sim.simSelectedFinanciera ?? bestEntity?.entityName} (${bestEntity?.probability}%). Falta confirmación de visado.`,
      actualValue: {
        recommendedEntity: bestEntity?.entityName ?? null,
        probability: bestEntity?.probability ?? 0,
        visadoApproved: sim.simVisadoApproved,
      },
    });

    // R-LIB-006: Pagaré DECEVAL y visado confirmado antes de desembolso
    const rLib006Pass = sim.simVisadoApproved && sim.simPromissorySigned;
    steps.push({
      ruleCode: 'R-LIB-006',
      ruleName: 'Pagaré Desmaterializado DECEVAL y Visado para Desembolso',
      category: 'HARD_RESTRICTION',
      status: rLib006Pass ? 'APROBADO' : 'PENDIENTE',
      detail: rLib006Pass
        ? 'Pagaré DECEVAL firmado y visado confirmado: listo para desembolso.'
        : !sim.simVisadoApproved && !sim.simPromissorySigned
          ? 'Faltan visado de pagaduría y firma de pagaré DECEVAL.'
          : !sim.simVisadoApproved
            ? 'Falta confirmación de visado de pagaduría.'
            : 'Falta firma de pagaré desmaterializado DECEVAL.',
      actualValue: {
        visadoApproved: sim.simVisadoApproved,
        promissorySigned: sim.simPromissorySigned,
      },
    });

    const finalVerdict = this.computeFinalVerdict(steps, bestEntity?.entityName);

    return {
      executedAt: clock.nowIso(),
      isolated: true,
      ley1527Breakdown: {
        netIncome: capacity.netIncome,
        unseizableRemainder: capacity.unseizableRemainder,
        existingDiscounts: capacity.existingDiscounts,
        availableCapacity: capacity.availableCapacity,
        requestedInstallment: sim.simRequestedInstallment,
        installmentCovered,
      },
      evaluationSteps: steps,
      finalVerdict,
      entityProbabilitiesPreview,
    };
  }

  private computeFinalVerdict(
    steps: readonly SimulationStep[],
    recommendedEntity?: string,
  ): SimulationVerdict {
    const stepByCode = new Map(steps.map((s) => [s.ruleCode, s]));
    const r1 = stepByCode.get('R-LIB-001')!;
    const r2 = stepByCode.get('R-LIB-002')!;
    const r3 = stepByCode.get('R-LIB-003')!;
    const r4 = stepByCode.get('R-LIB-004')!;
    const r5 = stepByCode.get('R-LIB-005')!;
    const r6 = stepByCode.get('R-LIB-006')!;

    if (r1.status === 'BLOQUEADO') {
      return {
        status: 'DECLINADO',
        title: 'Declinado por Compuerta R-LIB-001',
        description: r1.detail,
        nextAction: 'Cerrar oportunidad o verificar convenio alternativo.',
        nextStage: 'rechazado_perdido',
      };
    }

    if (r2.status === 'BLOQUEADO') {
      return {
        status: 'BLOQUEADO',
        title: 'Bloqueado por Ley 1527 (R-LIB-002)',
        description: r2.detail,
        nextAction: 'Reducir monto/cuota solicitada o estructurar compra de cartera.',
        nextStage: 'perfilamiento',
      };
    }

    if (r3.status === 'BLOQUEADO') {
      return {
        status: 'BLOQUEADO',
        title: 'Bloqueado por Política de Edad (R-LIB-003)',
        description: r3.detail,
        nextAction: 'Reducir plazo del crédito o radicar Excepción Justificada al supervisor.',
        nextStage: 'oferta_cierre',
      };
    }

    if (r1.status === 'PENDIENTE') {
      return {
        status: 'EN_PROGRESO',
        title: 'Pendiente Primer Contacto Efectivo',
        description: r1.detail,
        nextAction: 'Ejecutar reintento VoIP y enviar recordatorio por WhatsApp.',
        nextStage: 'lead_nuevo',
      };
    }

    if (r4.status !== 'APROBADO') {
      return {
        status: 'EN_PROGRESO',
        title: 'Viable – Pendiente Verificación Documental (R-LIB-004)',
        description: r4.detail,
        nextAction: `Solicitar 2 últimos desprendibles y cédula al 150% para radicar en ${recommendedEntity ?? 'financiera aliada'}.`,
        nextStage: 'oferta_cierre',
      };
    }

    if (r5.status === 'BLOQUEADO') {
      return {
        status: 'BLOQUEADO',
        title: 'Sin Financiera Viable (R-LIB-005)',
        description: r5.detail,
        nextAction: 'Evaluar Plan B (Capital / Valorenz) o ajustar monto solicitado.',
        nextStage: 'oferta_cierre',
      };
    }

    if (r5.status === 'PENDIENTE') {
      return {
        status: 'EN_PROGRESO',
        title: 'Radicado en Estudio – Esperando Visado',
        description: r5.detail,
        nextAction: 'Hacer seguimiento al visado ante pagaduría y preaprobación.',
        nextStage: 'en_estudio',
      };
    }

    if (r6.status !== 'APROBADO') {
      return {
        status: 'EN_PROGRESO',
        title: 'Aprobado – Pendiente Firma Pagaré DECEVAL (R-LIB-006)',
        description: r6.detail,
        nextAction: 'Gestionar firma electrónica del pagaré desmaterializado DECEVAL.',
        nextStage: 'aprobado_formalizacion',
      };
    }

    return {
      status: 'APROBADO_DESEMBOLSO',
      title: 'Aprobado para Desembolso (Todas las Compuertas Cumplidas)',
      description: `Expediente cumple R-LIB-001 a R-LIB-006. Financiera principal sugerida: ${recommendedEntity ?? 'Valorenz'}.`,
      nextAction: 'Ejecutar desembolso y transformar prospecto en Cliente Activo.',
      nextStage: 'desembolsado',
    };
  }
}
