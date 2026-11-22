import type { PipelineGate } from './GateTypes.ts';
import { buildBlockResult } from './GateTypes.ts';

/**
 * Compuerta `R-SEC-01`: exige progresión secuencial paso a paso (`targetOrder - currentOrder <= 1`).
 */
export const sequenceGate: PipelineGate = (state) => {
  const { currentStage, targetStage, checks } = state;
  if (!currentStage) return null;

  const delta = targetStage.order - currentStage.order;
  const passed = delta <= 1;
  checks.push({
    condition: 'Progresión secuencial sin salto de etapas (R-SEC-01)',
    passed,
    actualValue: { currentOrder: currentStage.order, targetOrder: targetStage.order, delta },
  });

  if (passed) return null;
  return buildBlockResult(state, {
    ruleId: 'R-SEC-01',
    ruleName: 'Secuencia Estricta del Pipeline',
    reason: `No se permite saltar etapas: de '${currentStage.name}' (orden ${currentStage.order}) a '${targetStage.name}' (orden ${targetStage.order}).`,
    missingCondition: 'Avanzar únicamente a la etapa inmediatamente siguiente',
  });
};

/**
 * Compuerta `R-TSK-MANDATORY`: bloquea avance si existen tareas obligatorias abiertas
 * (`pendiente`, `en_progreso` o `vencida`). Aplica tanto a tableros estándar como personalizados.
 */
export const mandatoryTasksGate: PipelineGate = (state) => {
  const openMandatory = state.ctx.lead.openMandatoryTasks;
  const passed = openMandatory.length === 0;
  state.checks.push({
    condition: 'Sin tareas obligatorias pendientes, en progreso o vencidas',
    passed,
    actualValue: openMandatory.map((t) => `${t.id}:${t.status}`),
  });

  if (passed) return null;
  const blocking = openMandatory[0];
  return buildBlockResult(state, {
    ruleId: 'R-TSK-MANDATORY',
    ruleName: 'Bloqueo por Tarea Obligatoria Pendiente',
    reason: `Existe una tarea obligatoria activa sin completar: "${blocking?.title ?? blocking?.id}".`,
    missingCondition: `Completar tarea obligatoria '${blocking?.title ?? blocking?.id}'`,
  });
};

/**
 * Compuerta `R-LIB-001` (base): exige pagaduría definida y código de convenio activo distinto de `SIN_CONVENIO`.
 */
export const convenioGate: PipelineGate = (state) => {
  const { convenioCodigo, pagaduria } = state.ctx.lead.props;
  const hasConvenio =
    convenioCodigo !== 'SIN_CONVENIO' &&
    convenioCodigo.trim().length > 0 &&
    pagaduria.trim().length > 0;

  state.checks.push({
    condition: 'Convenio activo y pagaduría definida (R-LIB-001)',
    passed: hasConvenio,
    actualValue: { pagaduria, convenioCodigo },
  });

  if (hasConvenio) return null;
  return buildBlockResult(state, {
    ruleId: 'R-LIB-001',
    ruleName: 'Validación de Convenio Activo',
    reason: 'Bloqueo Ley 1527 (R-LIB-001): el prospecto no tiene convenio activo o pagaduría registrada.',
    missingCondition: 'Registrar pagaduría válida y código de convenio activo',
  });
};
