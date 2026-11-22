import { normalizeStageId } from '../../../../shared/domain/value-objects/PipelineStage.ts';
import { RuleConditionEvaluator } from '../../../governance/domain/RuleConditionEvaluator.ts';
import type { PipelineGate } from './GateTypes.ts';
import { buildBlockResult } from './GateTypes.ts';

const conditionEvaluator = new RuleConditionEvaluator();

/**
 * Compuerta de Reglas Dinámicas Personalizadas (Mejora Sección 5.3 #2):
 * evalúa en tiempo de ejecución las reglas creadas por `admin` activas para la etapa destino
 * y respeta excepciones justificadas aprobadas para reglas `CONFIGURABLE_POLICY`.
 */
export const dynamicRulesGate: PipelineGate = (state) => {
  const { ctx, normalizedTarget, checks } = state;

  const dynamicRules = ctx.rules.filter(
    (rule) =>
      !rule.isBuiltIn &&
      rule.isActive &&
      rule.conditions.length > 0 &&
      (rule.stage === 'ALL' || normalizeStageId(rule.stage) === normalizedTarget),
  );

  if (dynamicRules.length === 0) return null;

  const evaluationContext: Record<string, unknown> = {
    ...ctx.lead.toJSON(),
    smmlv: ctx.financialParams.smmlv,
    targetStageId: normalizedTarget,
  };

  for (const rule of dynamicRules) {
    const result = conditionEvaluator.evaluateAll(rule.conditions, evaluationContext);
    checks.push(...result.checks);
    if (result.passed) continue;

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

    return buildBlockResult(state, {
      ruleId: rule.code,
      ruleName: rule.name,
      reason:
        rule.failureMessage ??
        `Bloqueo por regla dinámica '${rule.code}' (${rule.name}): falló "${result.firstFailed?.condition}".`,
      missingCondition: result.firstFailed?.condition ?? rule.description,
    });
  }

  return null;
};
