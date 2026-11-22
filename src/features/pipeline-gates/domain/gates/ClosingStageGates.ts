import type { PipelineGate } from './GateTypes.ts';
import { buildBlockResult, stripAccents } from './GateTypes.ts';

/**
 * Compuerta `R-LIB-005` (`R-LIB-FIN`) y `R-LIB-004` hacia `en_estudio`:
 * exige entidad financiera principal (si `R-LIB-005` está activa y sin excepción aprobada)
 * y al menos 2 documentos cargados con el 100% en estado `'verificado'`.
 */
export const studyFilingGate: PipelineGate = (state) => {
  if (state.normalizedTarget !== 'en_estudio') return null;

  const { selectedFinanciera, documents } = state.ctx.lead.props;

  if (state.isRuleActive('R-LIB-005')) {
    const hasFinanciera =
      typeof selectedFinanciera === 'string' && selectedFinanciera.trim().length > 0;
    const approvedException = !hasFinanciera
      ? state.ctx.findApprovedException('R-LIB-005')
      : undefined;

    state.checks.push({
      condition: 'Entidad financiera principal seleccionada (R-LIB-005 / R-LIB-FIN)',
      passed: hasFinanciera || Boolean(approvedException),
      actualValue: selectedFinanciera ?? null,
    });

    if (!hasFinanciera && !approvedException) {
      return buildBlockResult(state, {
        ruleId: 'R-LIB-005',
        ruleName: 'Selección Obligatoria de Entidad Financiera',
        reason: 'Bloqueo R-LIB-005 (R-LIB-FIN): debe seleccionarse una entidad financiera principal antes de radicar a estudio.',
        missingCondition: 'Asignar lead.selectedFinanciera',
      });
    }
  }

  const enoughDocs = documents.length >= 2;
  const allVerified = enoughDocs && documents.every((d) => d.status === 'verificado');
  state.checks.push({
    condition: 'Mínimo 2 documentos cargados y TODOS en estado verificado (R-LIB-004)',
    passed: allVerified,
    actualValue: documents.map((d) => `${d.name}:${d.status}`),
  });

  if (allVerified) return null;
  const unverified = documents.filter((d) => d.status !== 'verificado').map((d) => d.name);
  return buildBlockResult(state, {
    ruleId: 'R-LIB-004',
    ruleName: 'Verificación Documental Completa',
    reason: !enoughDocs
      ? `Bloqueo R-LIB-004: se requieren al menos 2 soportes verificados (actuales: ${documents.length}).`
      : `Bloqueo R-LIB-004: todos los documentos cargados deben estar verificados. Pendientes/rechazados: ${unverified.join(', ')}.`,
    missingCondition: 'Cargar mínimo 2 documentos (cédula y colillas) y verificar el 100% de los soportes',
  });
};

/**
 * Compuerta `R-LIB-005` hacia `aprobado_formalizacion`:
 * exige preaprobación confirmada (`qualificationData.hasPreapproval === true`).
 */
export const preapprovalGate: PipelineGate = (state) => {
  if (state.normalizedTarget !== 'aprobado_formalizacion') return null;

  const hasPreapproval = state.ctx.lead.props.qualificationData?.hasPreapproval === true;
  state.checks.push({
    condition: 'Preaprobación de entidad financiera confirmada (R-LIB-005)',
    passed: hasPreapproval,
    actualValue: hasPreapproval,
  });

  if (hasPreapproval) return null;
  return buildBlockResult(state, {
    ruleId: 'R-LIB-005',
    ruleName: 'Preaprobación Obligatoria para Formalización',
    reason: 'Bloqueo R-LIB-005: el expediente no cuenta con preaprobación confirmada (hasPreapproval=true).',
    missingCondition: 'Confirmar qualificationData.hasPreapproval = true',
  });
};

/**
 * Compuerta `R-LIB-006` hacia `desembolsado`:
 * exige documento legal cuyo nombre incluya `"pagaré"`, `"deceval"` o `"libranza"`.
 */
export const disbursementGate: PipelineGate = (state) => {
  if (state.normalizedTarget !== 'desembolsado') return null;

  const matchingDoc = state.ctx.lead.props.documents.find((d) => {
    const name = stripAccents(d.name);
    return name.includes('pagare') || name.includes('deceval') || name.includes('libranza');
  });

  state.checks.push({
    condition: 'Documento legal de pagaré/DECEVAL/libranza cargado (R-LIB-006)',
    passed: Boolean(matchingDoc),
    actualValue: matchingDoc?.name ?? null,
  });

  if (matchingDoc) return null;
  return buildBlockResult(state, {
    ruleId: 'R-LIB-006',
    ruleName: 'Pagaré DECEVAL y Formalización Legal',
    reason: 'Bloqueo Ley 1527 (R-LIB-006): falta documento de pagaré desmaterializado, DECEVAL o libranza para desembolso.',
    missingCondition: 'Adjuntar documento cuyo nombre incluya "pagaré", "deceval" o "libranza"',
  });
};
