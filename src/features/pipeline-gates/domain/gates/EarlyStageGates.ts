import type { PipelineGate } from './GateTypes.ts';
import { buildBlockResult, stripAccents } from './GateTypes.ts';

/**
 * Compuerta `R-LIB-001` hacia `perfilamiento`:
 * exige evidencia de primer contacto (llamada VoIP, mensaje del lead o nota con "contacto"/"interesad").
 */
export const firstContactGate: PipelineGate = (state) => {
  if (state.normalizedTarget !== 'perfilamiento') return null;

  const { messages, notesHistory } = state.ctx.lead.props;
  const hasContactMessage = messages.some(
    (m) => m.channel === 'voip_call' || m.sender === 'lead',
  );
  const hasContactNote = notesHistory.some((n) => {
    const text = stripAccents(n.content);
    return text.includes('contacto') || text.includes('interesad');
  });

  const passed = hasContactMessage || hasContactNote;
  state.checks.push({
    condition: 'Evidencia de primer contacto (llamada VoIP, mensaje del lead o nota de contacto/interés)',
    passed,
    actualValue: { hasContactMessage, hasContactNote },
  });

  if (passed) return null;
  return buildBlockResult(state, {
    ruleId: 'R-LIB-001',
    ruleName: 'Evidencia de Primer Contacto',
    reason: 'Bloqueo R-LIB-001: se requiere evidencia de primer contacto antes de pasar a Perfilamiento.',
    missingCondition: 'Registrar llamada VoIP, mensaje del cliente o nota con "contacto"/"interesado"',
  });
};

/**
 * Compuerta `R-LIB-002` y `R-LIB-002B` hacia `oferta_cierre`:
 * valida capacidad disponible Ley 1527 > `$0` e ingreso mensual >= 1 SMMLV parametrizado.
 */
export const capacityAndSmmlvGate: PipelineGate = (state) => {
  if (state.normalizedTarget !== 'oferta_cierre') return null;

  const { calculatedLibranzaCapacity, monthlyIncome } = state.ctx.lead.props;
  const { smmlv } = state.ctx.financialParams;
  const capacityOk = calculatedLibranzaCapacity > 0;
  const incomeOk = monthlyIncome >= smmlv;

  state.checks.push({
    condition: 'Capacidad disponible Ley 1527 > $0 (R-LIB-002)',
    passed: capacityOk,
    actualValue: calculatedLibranzaCapacity,
  });
  state.checks.push({
    condition: `Ingreso mensual >= 1 SMMLV ($${smmlv.toLocaleString('es-CO')}) (R-LIB-002B)`,
    passed: incomeOk,
    actualValue: monthlyIncome,
  });

  if (!capacityOk) {
    return buildBlockResult(state, {
      ruleId: 'R-LIB-002',
      ruleName: 'Protección 50% Inembargable Ley 1527',
      reason: 'Bloqueo Ley 1527 (R-LIB-002): la capacidad disponible de libranza es $0 o negativa.',
      missingCondition: 'Capacidad disponible > $0 (o estructurar compra de cartera)',
    });
  }

  if (!incomeOk) {
    return buildBlockResult(state, {
      ruleId: 'R-LIB-002B',
      ruleName: 'Validación de Ingreso Mínimo Legal (1 SMMLV)',
      reason: `Bloqueo R-LIB-002B: el ingreso mensual ($${monthlyIncome.toLocaleString('es-CO')}) es inferior a 1 SMMLV ($${smmlv.toLocaleString('es-CO')}).`,
      missingCondition: `Ingreso mensual >= $${smmlv.toLocaleString('es-CO')} COP`,
    });
  }

  return null;
};
