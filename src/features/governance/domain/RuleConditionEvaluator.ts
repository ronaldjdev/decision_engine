import type { LeadDocument } from '../../../shared/domain/value-objects/Lead.ts';
import type { RuleCondition } from './DeterministicRule.ts';
import type { ConditionCheckRecord } from './EngineDecisionLog.ts';

function resolvePath(target: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = target;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current) && part === 'length') {
      current = current.length;
      continue;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Intérprete dinámico de condiciones de reglas (Mejora Sección 5.3 #2).
 *
 * Evalúa predicados declarativos (`RuleCondition[]`) sobre un contexto en tiempo de ejecución
 * soportando acceso a propiedades anidadas (`a.b.c`) y retornando trazas auditables
 * (`ConditionCheckRecord[]`) compatibles con `EngineDecisionLog`.
 */
export class RuleConditionEvaluator {
  public evaluateCondition(
    condition: RuleCondition,
    context: Record<string, unknown>,
  ): ConditionCheckRecord {
    const actualValue = resolvePath(context, condition.field);
    let passed = false;

    switch (condition.operator) {
      case 'eq':
        passed = actualValue === condition.value;
        break;
      case 'neq':
        passed = actualValue !== condition.value;
        break;
      case 'gt':
        passed = typeof actualValue === 'number' && typeof condition.value === 'number' && actualValue > condition.value;
        break;
      case 'gte':
        passed = typeof actualValue === 'number' && typeof condition.value === 'number' && actualValue >= condition.value;
        break;
      case 'lt':
        passed = typeof actualValue === 'number' && typeof condition.value === 'number' && actualValue < condition.value;
        break;
      case 'lte':
        passed = typeof actualValue === 'number' && typeof condition.value === 'number' && actualValue <= condition.value;
        break;
      case 'in':
        passed = Array.isArray(condition.value) && condition.value.includes(actualValue);
        break;
      case 'not_in':
        passed = Array.isArray(condition.value) && !condition.value.includes(actualValue);
        break;
      case 'contains':
        if (typeof actualValue === 'string' && typeof condition.value === 'string') {
          passed = actualValue.toLowerCase().includes(condition.value.toLowerCase());
        } else if (Array.isArray(actualValue)) {
          passed = actualValue.includes(condition.value);
        }
        break;
      case 'not_contains':
        if (typeof actualValue === 'string' && typeof condition.value === 'string') {
          passed = !actualValue.toLowerCase().includes(condition.value.toLowerCase());
        } else if (Array.isArray(actualValue)) {
          passed = !actualValue.includes(condition.value);
        } else {
          passed = true;
        }
        break;
      case 'exists':
        passed =
          actualValue !== undefined &&
          actualValue !== null &&
          (typeof actualValue !== 'string' || actualValue.trim().length > 0);
        break;
      case 'all_documents_verified':
        if (Array.isArray(actualValue)) {
          const docs = actualValue as LeadDocument[];
          const minCount = typeof condition.value === 'number' ? condition.value : 1;
          passed =
            docs.length >= minCount &&
            docs.every((doc) => doc.status === 'verificado');
        }
        break;
    }

    return {
      condition: condition.description,
      passed,
      actualValue,
    };
  }

  public evaluateAll(
    conditions: readonly RuleCondition[],
    context: Record<string, unknown>,
  ): { passed: boolean; checks: ConditionCheckRecord[]; firstFailed?: ConditionCheckRecord } {
    const checks = conditions.map((c) => this.evaluateCondition(c, context));
    const firstFailed = checks.find((c) => !c.passed);
    return {
      passed: !firstFailed,
      checks,
      firstFailed,
    };
  }
}
