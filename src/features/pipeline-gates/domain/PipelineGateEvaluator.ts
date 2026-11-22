import type { FinancialParametersProps } from '../../../shared/domain/value-objects/FinancialParameters.ts';
import type { Lead } from '../../../shared/domain/value-objects/Lead.ts';
import type {
  PipelineBoard,
  PipelineStageId,
} from '../../../shared/domain/value-objects/PipelineStage.ts';
import {
  isClosureStage,
  normalizeStageId,
} from '../../../shared/domain/value-objects/PipelineStage.ts';
import type { DeterministicRule } from '../../governance/domain/DeterministicRule.ts';
import type { ConditionCheckRecord } from '../../governance/domain/EngineDecisionLog.ts';
import type { JustifiedExceptionRequest } from '../../governance/domain/JustifiedExceptionRequest.ts';
import { RuleConditionEvaluator } from '../../governance/domain/RuleConditionEvaluator.ts';
import type { TransitionCheckResult } from './TransitionCheckResult.ts';

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export interface GateEvaluationContext {
  lead: Lead;
  board: PipelineBoard;
  targetStageId: PipelineStageId;
  rules: readonly DeterministicRule[];
  financialParams: Readonly<FinancialParametersProps>;
  findApprovedException: (ruleCode: string) => JustifiedExceptionRequest | undefined;
}

/**
 * Servicio de Dominio del Sub-motor 1: Compuertas de Transición del Pipeline (`canTransitionStage`).
 *
 * En el pipeline estándar (`board-libranzas-principal`) valida en orden estricto:
 * 1. Excepción de cierre inmediato (`rechazado_perdido` / `cerrado_no_interesado`)
 * 2. `R-SEC-01` (progresión secuencial paso a paso)
 * 3. `R-TSK-MANDATORY` (sin tareas obligatorias abiertas)
 * 4. `R-LIB-001` (convenio activo y evidencia de primer contacto hacia `perfilamiento`)
 * 5. `R-LIB-002` / `R-LIB-002B` (capacidad Ley 1527 > $0 e ingreso >= 1 SMMLV configurable hacia `oferta_cierre`)
 * 6. `R-LIB-005` y `R-LIB-004` (financiera seleccionada y >= 2 documentos todos verificados hacia `en_estudio`)
 * 7. `R-LIB-005` (preaprobación confirmada hacia `aprobado_formalizacion`)
 * 8. `R-LIB-006` (documento pagaré/DECEVAL/libranza hacia `desembolsado`)
 * 9. Reglas dinámicas personalizadas activas desde el catálogo + excepciones aprobadas.
 *
 * En tableros personalizados (`isDefault === false`) valida únicamente `R-TSK-MANDATORY` y reglas dinámicas asociadas.
 */
export class PipelineGateEvaluator {
  private readonly conditionEvaluator = new RuleConditionEvaluator();

  public evaluate(ctx: GateEvaluationContext): TransitionCheckResult {
    const normalizedTarget = normalizeStageId(ctx.targetStageId);
    const normalizedCurrent = normalizeStageId(ctx.lead.props.currentStageId);
    const checks: ConditionCheckRecord[] = [];

    const ruleMap = new Map<string, DeterministicRule>();
    for (const rule of ctx.rules) {
      ruleMap.set(rule.code, rule);
    }

    const isRuleActive = (code: string): boolean => {
      const rule = ruleMap.get(code);
      return rule ? rule.isActive : true;
    };

    // 1. Excepción de cierre (cerrado_no_interesado / rechazado_perdido)
    if (isClosureStage(normalizedTarget)) {
      checks.push({
        condition: 'Excepción de cierre de oportunidad',
        passed: true,
        actualValue: normalizedTarget,
      });
      return {
        allowed: true,
        reason: 'Cierre de oportunidad autorizado inmediatamente.',
        targetStageId: normalizedTarget,
        conditionsChecked: checks,
      };
    }

    const currentStage = ctx.board.stages.find((s) => s.id === normalizedCurrent);
    const targetStage = ctx.board.stages.find((s) => s.id === normalizedTarget);

    if (!targetStage) {
      return {
        allowed: false,
        reason: `La etapa destino '${normalizedTarget}' no existe en el tablero '${ctx.board.name}'.`,
        ruleId: 'R-BOARD-STAGE',
        ruleName: 'Validación de Etapa en Tablero',
        missingCondition: `Etapa válida dentro de ${ctx.board.id}`,
        targetStageId: normalizedTarget,
        conditionsChecked: checks,
      };
    }

    // 3 (shared across standard & custom): R-TSK-MANDATORY
    const checkMandatoryTasks = (): TransitionCheckResult | null => {
      const openMandatory = ctx.lead.openMandatoryTasks;
      const passed = openMandatory.length === 0;
      checks.push({
        condition: 'Sin tareas obligatorias pendientes, en progreso o vencidas',
        passed,
        actualValue: openMandatory.map((t) => `${t.id}:${t.status}`),
      });
      if (!passed) {
        const blocking = openMandatory[0];
        return {
          allowed: false,
          reason: `Existe una tarea obligatoria activa sin completar: "${blocking?.title ?? blocking?.id}".`,
          ruleId: 'R-TSK-MANDATORY',
          ruleName: 'Bloqueo por Tarea Obligatoria Pendiente',
          missingCondition: `Completar tarea obligatoria '${blocking?.title ?? blocking?.id}'`,
          targetStageId: normalizedTarget,
          conditionsChecked: checks,
        };
      }
      return null;
    };

    // B. Tableros Personalizados (isDefault === false): solo R-TSK-MANDATORY + reglas custom dirigidas
    if (!ctx.board.isDefault) {
      const taskFailure = checkMandatoryTasks();
      if (taskFailure) return taskFailure;

      const customResult = this.evaluateCustomRules(ctx, normalizedTarget, checks);
      if (customResult) return customResult;

      return {
        allowed: true,
        reason: `Transición autorizada en tablero personalizado '${ctx.board.name}' hacia '${targetStage.name}'.`,
        targetStageId: normalizedTarget,
        conditionsChecked: checks,
      };
    }

    // A. Pipeline Estándar de Libranzas (board-libranzas-principal)
    // 2. R-SEC-01: Secuencia estricta paso a paso
    if (currentStage) {
      const delta = targetStage.order - currentStage.order;
      const passed = delta <= 1;
      checks.push({
        condition: 'Progresión secuencial sin salto de etapas (R-SEC-01)',
        passed,
        actualValue: { currentOrder: currentStage.order, targetOrder: targetStage.order, delta },
      });
      if (!passed) {
        return {
          allowed: false,
          reason: `No se permite saltar etapas: de '${currentStage.name}' (orden ${currentStage.order}) a '${targetStage.name}' (orden ${targetStage.order}).`,
          ruleId: 'R-SEC-01',
          ruleName: 'Secuencia Estricta del Pipeline',
          missingCondition: 'Avanzar únicamente a la etapa inmediatamente siguiente',
          targetStageId: normalizedTarget,
          conditionsChecked: checks,
        };
      }
    }

    // 3. R-TSK-MANDATORY
    const taskFailure = checkMandatoryTasks();
    if (taskFailure) return taskFailure;

    // 4. R-LIB-001 (Convenio activo)
    const hasConvenio =
      ctx.lead.props.convenioCodigo !== 'SIN_CONVENIO' &&
      ctx.lead.props.convenioCodigo.trim().length > 0 &&
      ctx.lead.props.pagaduria.trim().length > 0;
    checks.push({
      condition: 'Convenio activo y pagaduría definida (R-LIB-001)',
      passed: hasConvenio,
      actualValue: {
        pagaduria: ctx.lead.props.pagaduria,
        convenioCodigo: ctx.lead.props.convenioCodigo,
      },
    });
    if (!hasConvenio) {
      return {
        allowed: false,
        reason: 'Bloqueo Ley 1527 (R-LIB-001): el prospecto no tiene convenio activo o pagaduría registrada.',
        ruleId: 'R-LIB-001',
        ruleName: 'Validación de Convenio Activo',
        missingCondition: 'Registrar pagaduría válida y código de convenio activo',
        targetStageId: normalizedTarget,
        conditionsChecked: checks,
      };
    }

    // 5. R-LIB-001 -> perfilamiento (evidencia de contacto)
    if (normalizedTarget === 'perfilamiento') {
      const hasContactMessage = ctx.lead.props.messages.some(
        (m) => m.channel === 'voip_call' || m.sender === 'lead',
      );
      const hasContactNote = ctx.lead.props.notesHistory.some((n) => {
        const text = stripAccents(n.content);
        return text.includes('contacto') || text.includes('interesad');
      });
      const passed = hasContactMessage || hasContactNote;
      checks.push({
        condition: 'Evidencia de primer contacto (llamada VoIP, mensaje del lead o nota de contacto/interés)',
        passed,
        actualValue: { hasContactMessage, hasContactNote },
      });
      if (!passed) {
        return {
          allowed: false,
          reason: 'Bloqueo R-LIB-001: se requiere evidencia de primer contacto antes de pasar a Perfilamiento.',
          ruleId: 'R-LIB-001',
          ruleName: 'Evidencia de Primer Contacto',
          missingCondition: 'Registrar llamada VoIP, mensaje del cliente o nota con "contacto"/"interesado"',
          targetStageId: normalizedTarget,
          conditionsChecked: checks,
        };
      }
    }

    // 6. R-LIB-002 / R-LIB-002B -> oferta_cierre (Ley 1527 y SMMLV configurable)
    if (normalizedTarget === 'oferta_cierre') {
      const capacityOk = ctx.lead.props.calculatedLibranzaCapacity > 0;
      const incomeOk = ctx.lead.props.monthlyIncome >= ctx.financialParams.smmlv;
      checks.push({
        condition: 'Capacidad disponible Ley 1527 > $0 (R-LIB-002)',
        passed: capacityOk,
        actualValue: ctx.lead.props.calculatedLibranzaCapacity,
      });
      checks.push({
        condition: `Ingreso mensual >= 1 SMMLV ($${ctx.financialParams.smmlv.toLocaleString('es-CO')}) (R-LIB-002B)`,
        passed: incomeOk,
        actualValue: ctx.lead.props.monthlyIncome,
      });
      if (!capacityOk) {
        return {
          allowed: false,
          reason: 'Bloqueo Ley 1527 (R-LIB-002): la capacidad disponible de libranza es $0 o negativa.',
          ruleId: 'R-LIB-002',
          ruleName: 'Protección 50% Inembargable Ley 1527',
          missingCondition: 'Capacidad disponible > $0 (o estructurar compra de cartera)',
          targetStageId: normalizedTarget,
          conditionsChecked: checks,
        };
      }
      if (!incomeOk) {
        return {
          allowed: false,
          reason: `Bloqueo R-LIB-002B: el ingreso mensual ($${ctx.lead.props.monthlyIncome.toLocaleString('es-CO')}) es inferior a 1 SMMLV ($${ctx.financialParams.smmlv.toLocaleString('es-CO')}).`,
          ruleId: 'R-LIB-002B',
          ruleName: 'Validación de Ingreso Mínimo Legal (1 SMMLV)',
          missingCondition: `Ingreso mensual >= $${ctx.financialParams.smmlv.toLocaleString('es-CO')} COP`,
          targetStageId: normalizedTarget,
          conditionsChecked: checks,
        };
      }
    }

    // 7. R-LIB-005 (R-LIB-FIN) & R-LIB-004 -> en_estudio
    if (normalizedTarget === 'en_estudio') {
      if (isRuleActive('R-LIB-005')) {
        const hasFinanciera =
          typeof ctx.lead.props.selectedFinanciera === 'string' &&
          ctx.lead.props.selectedFinanciera.trim().length > 0;
        const approvedException = !hasFinanciera
          ? ctx.findApprovedException('R-LIB-005')
          : undefined;
        checks.push({
          condition: 'Entidad financiera principal seleccionada (R-LIB-005 / R-LIB-FIN)',
          passed: hasFinanciera || Boolean(approvedException),
          actualValue: ctx.lead.props.selectedFinanciera ?? null,
        });
        if (!hasFinanciera && !approvedException) {
          return {
            allowed: false,
            reason: 'Bloqueo R-LIB-005 (R-LIB-FIN): debe seleccionarse una entidad financiera principal antes de radicar a estudio.',
            ruleId: 'R-LIB-005',
            ruleName: 'Selección Obligatoria de Entidad Financiera',
            missingCondition: 'Asignar lead.selectedFinanciera',
            targetStageId: normalizedTarget,
            conditionsChecked: checks,
          };
        }
      }

      const docs = ctx.lead.props.documents;
      const enoughDocs = docs.length >= 2;
      const allVerified = enoughDocs && docs.every((d) => d.status === 'verificado');
      checks.push({
        condition: 'Mínimo 2 documentos cargados y TODOS en estado verificado (R-LIB-004)',
        passed: allVerified,
        actualValue: docs.map((d) => `${d.name}:${d.status}`),
      });
      if (!allVerified) {
        const unverified = docs.filter((d) => d.status !== 'verificado').map((d) => d.name);
        return {
          allowed: false,
          reason: !enoughDocs
            ? `Bloqueo R-LIB-004: se requieren al menos 2 soportes verificados (actuales: ${docs.length}).`
            : `Bloqueo R-LIB-004: todos los documentos cargados deben estar verificados. Pendientes/rechazados: ${unverified.join(', ')}.`,
          ruleId: 'R-LIB-004',
          ruleName: 'Verificación Documental Completa',
          missingCondition: 'Cargar mínimo 2 documentos (cédula y colillas) y verificar el 100% de los soportes',
          targetStageId: normalizedTarget,
          conditionsChecked: checks,
        };
      }
    }

    // 8. Preaprobación -> aprobado_formalizacion
    if (normalizedTarget === 'aprobado_formalizacion') {
      const hasPreapproval = ctx.lead.props.qualificationData?.hasPreapproval === true;
      checks.push({
        condition: 'Preaprobación de entidad financiera confirmada (R-LIB-005)',
        passed: hasPreapproval,
        actualValue: hasPreapproval,
      });
      if (!hasPreapproval) {
        return {
          allowed: false,
          reason: 'Bloqueo R-LIB-005: el expediente no cuenta con preaprobación confirmada (hasPreapproval=true).',
          ruleId: 'R-LIB-005',
          ruleName: 'Preaprobación Obligatoria para Formalización',
          missingCondition: 'Confirmar qualificationData.hasPreapproval = true',
          targetStageId: normalizedTarget,
          conditionsChecked: checks,
        };
      }
    }

    // 9. R-LIB-006 -> desembolsado (Pagaré / DECEVAL / Libranza)
    if (normalizedTarget === 'desembolsado') {
      const matchingDoc = ctx.lead.props.documents.find((d) => {
        const normalizedName = stripAccents(d.name);
        return (
          normalizedName.includes('pagare') ||
          normalizedName.includes('deceval') ||
          normalizedName.includes('libranza')
        );
      });
      const passed = Boolean(matchingDoc);
      checks.push({
        condition: 'Documento legal de pagaré/DECEVAL/libranza cargado (R-LIB-006)',
        passed,
        actualValue: matchingDoc?.name ?? null,
      });
      if (!passed) {
        return {
          allowed: false,
          reason: 'Bloqueo Ley 1527 (R-LIB-006): falta documento de pagaré desmaterializado, DECEVAL o libranza para desembolso.',
          ruleId: 'R-LIB-006',
          ruleName: 'Pagaré DECEVAL y Formalización Legal',
          missingCondition: 'Adjuntar documento cuyo nombre incluya "pagaré", "deceval" o "libranza"',
          targetStageId: normalizedTarget,
          conditionsChecked: checks,
        };
      }
    }

    // 10. Reglas Dinámicas Personalizadas activas desde el catálogo (Mejora Sección 5.3 #2)
    const customFailure = this.evaluateCustomRules(ctx, normalizedTarget, checks);
    if (customFailure) {
      return customFailure;
    }

    return {
      allowed: true,
      reason: `Todas las compuertas aprobadas para avanzar a '${targetStage.name}'.`,
      targetStageId: normalizedTarget,
      conditionsChecked: checks,
    };
  }

  private evaluateCustomRules(
    ctx: GateEvaluationContext,
    normalizedTarget: PipelineStageId,
    checks: ConditionCheckRecord[],
  ): TransitionCheckResult | null {
    const dynamicRules = ctx.rules.filter(
      (rule) =>
        !rule.isBuiltIn &&
        rule.isActive &&
        rule.conditions.length > 0 &&
        (rule.stage === 'ALL' || normalizeStageId(rule.stage) === normalizedTarget),
    );

    if (dynamicRules.length === 0) {
      return null;
    }

    const evaluationContext: Record<string, unknown> = {
      ...ctx.lead.toJSON(),
      smmlv: ctx.financialParams.smmlv,
      targetStageId: normalizedTarget,
    };

    for (const rule of dynamicRules) {
      const result = this.conditionEvaluator.evaluateAll(
        rule.conditions,
        evaluationContext,
      );
      checks.push(...result.checks);

      if (!result.passed) {
        const approvedException =
          rule.category === 'CONFIGURABLE_POLICY'
            ? ctx.findApprovedException(rule.code)
            : undefined;
        if (approvedException) {
          checks.push({
            condition: `Excepción aprobada '${approvedException.props.id}' para regla ${rule.code}`,
            passed: true,
            actualValue: approvedException.props.reviewedBy,
          });
          continue;
        }
        return {
          allowed: false,
          reason:
            rule.failureMessage ??
            `Bloqueo por regla dinámica '${rule.code}' (${rule.name}): falló "${result.firstFailed?.condition}".`,
          ruleId: rule.code,
          ruleName: rule.name,
          missingCondition: result.firstFailed?.condition,
          targetStageId: normalizedTarget,
          conditionsChecked: checks,
        };
      }
    }

    return null;
  }
}
