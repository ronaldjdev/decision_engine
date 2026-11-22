import {
  isClosureStage,
  normalizeStageId,
} from '../../../shared/domain/value-objects/PipelineStage.ts';
import type { ConditionCheckRecord } from '../../governance/domain/EngineDecisionLog.ts';
import {
  disbursementGate,
  preapprovalGate,
  studyFilingGate,
} from './gates/ClosingStageGates.ts';
import { dynamicRulesGate } from './gates/DynamicRulesGate.ts';
import {
  capacityAndSmmlvGate,
  firstContactGate,
} from './gates/EarlyStageGates.ts';
import type {
  GateEvaluationContext,
  GateEvaluationState,
  PipelineGate,
} from './gates/GateTypes.ts';
import { buildAllowResult } from './gates/GateTypes.ts';
import {
  convenioGate,
  mandatoryTasksGate,
  sequenceGate,
} from './gates/StructuralGates.ts';
import type { TransitionCheckResult } from './TransitionCheckResult.ts';

export type { GateEvaluationContext } from './gates/GateTypes.ts';

/** Cadena ordenada de compuertas para el pipeline estándar (`board-libranzas-principal`). */
const STANDARD_BOARD_GATES: readonly PipelineGate[] = [
  sequenceGate,
  mandatoryTasksGate,
  convenioGate,
  firstContactGate,
  capacityAndSmmlvGate,
  studyFilingGate,
  preapprovalGate,
  disbursementGate,
  dynamicRulesGate,
];

/** Cadena simplificada de compuertas para tableros personalizados (`isDefault === false`). */
const CUSTOM_BOARD_GATES: readonly PipelineGate[] = [
  mandatoryTasksGate,
  dynamicRulesGate,
];

/**
 * Servicio de Dominio del Sub-motor 1: Compuertas de Transición del Pipeline (`canTransitionStage`).
 *
 * Orquesta en orden estricto la cadena de compuertas correspondiente al tipo de tablero
 * (estándar vs. personalizado), delegando cada regla a módulos independientes en `./gates/`.
 */
export class PipelineGateEvaluator {
  public evaluate(ctx: GateEvaluationContext): TransitionCheckResult {
    const normalizedTarget = normalizeStageId(ctx.targetStageId);
    const normalizedCurrent = normalizeStageId(ctx.lead.props.currentStageId);
    const checks: ConditionCheckRecord[] = [];

    // 1. Excepción de cierre inmediato (rechazado_perdido / cerrado_no_interesado)
    if (isClosureStage(normalizedTarget)) {
      checks.push({
        condition: 'Excepción de cierre de oportunidad',
        passed: true,
        actualValue: normalizedTarget,
      });
      return buildAllowResult(
        normalizedTarget,
        'Cierre de oportunidad autorizado inmediatamente.',
        checks,
      );
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

    const ruleMap = new Map(ctx.rules.map((rule) => [rule.code, rule]));
    const state: GateEvaluationState = {
      ctx,
      normalizedTarget,
      currentStage,
      targetStage,
      checks,
      isRuleActive: (code) => ruleMap.get(code)?.isActive ?? true,
    };

    const gateChain = ctx.board.isDefault ? STANDARD_BOARD_GATES : CUSTOM_BOARD_GATES;
    for (const gate of gateChain) {
      const blocked = gate(state);
      if (blocked) return blocked;
    }

    const reason = ctx.board.isDefault
      ? `Todas las compuertas aprobadas para avanzar a '${targetStage.name}'.`
      : `Transición autorizada en tablero personalizado '${ctx.board.name}' hacia '${targetStage.name}'.`;

    return buildAllowResult(normalizedTarget, reason, checks);
  }
}
