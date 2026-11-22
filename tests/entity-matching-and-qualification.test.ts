import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateClassicApproximationInstallment,
  calculateFrenchAmortizationInstallment,
  createDecisionEngine,
  FixedClock,
  type ActorContext,
} from '../src/index.ts';

const ADVISOR: ActorContext = { role: 'advisor', name: 'ana.asesora' };
const ADMIN: ActorContext = { role: 'admin', name: 'sofia.admin' };

describe('Sub-motor 2 y 3: Probabilidades Multientidad, Calificación y Tiers', () => {
  it('prioriza entidades tolerantes (Valorenz/Capital) para clientes reportados y penaliza tradicionales', () => {
    const engine = createDecisionEngine({
      clock: new FixedClock('2026-11-22T10:00:00.000Z'),
      seedSampleLeads: true,
    });

    // LEAD-002 es Empleado Público FOMAG, reportado en centrales (score 575)
    const probs = engine.entityMatching.evaluateProbabilities.execute('LEAD-002');
    assert.equal(probs.length, 5);

    const topTwo = probs.slice(0, 2).map((p) => p.entityName);
    assert.deepEqual(topTwo.sort(), ['Capital', 'Valorenz']);

    const valorenz = probs.find((p) => p.entityName === 'Valorenz')!;
    const bancoomeva = probs.find((p) => p.entityName === 'Bancoomeva')!;
    assert.ok(valorenz.probability >= 80);
    assert.equal(valorenz.status, 'altamente_recomendada');
    assert.ok(bancoomeva.probability < 55);
  });

  it('marca entidades rechazadas en 0% (rechazada) y trunca probabilidad a 15% cuando capacidad <= 0', () => {
    const engine = createDecisionEngine({
      clock: new FixedClock('2026-11-22T10:00:00.000Z'),
      seedSampleLeads: false,
    });

    engine.leads.upsert({
      id: 'L-ZERO',
      fullName: 'Sin Cupo',
      libranzaSegment: 'Pensionado',
      pagaduria: 'Colpensiones',
      convenioCodigo: 'CONV-COLP-001',
      age: 62,
      monthlyIncome: 2_000_000,
      netIncome: 1_800_000,
      currentDiscounts: 1_000_000, // 50% = 900k -> capacidad = 0
      creditScoreSimulated: 780,
      rejectedFinancieras: ['Valorenz'],
    });

    const probs = engine.entityMatching.evaluateProbabilities.execute('L-ZERO');
    const valorenz = probs.find((p) => p.entityName === 'Valorenz')!;
    assert.equal(valorenz.probability, 0);
    assert.equal(valorenz.status, 'rechazada');

    for (const p of probs.filter((e) => e.entityName !== 'Valorenz')) {
      assert.ok(p.probability <= 15);
    }
  });

  it('clasifica correctamente TIER_A_PLUS, TIER_C_CONDICIONAL y DECLINADO en calificación en lote', () => {
    const engine = createDecisionEngine({
      clock: new FixedClock('2026-11-22T10:00:00.000Z'),
      seedSampleLeads: false,
    });

    // TIER_A_PLUS: Pensionado Colpensiones, score 780, alta capacidad
    engine.leads.upsert({
      id: 'Q-APLUS',
      fullName: 'Lead Estrella',
      libranzaSegment: 'Pensionado',
      pagaduria: 'Colpensiones',
      convenioCodigo: 'CONV-COLP-001',
      monthlyIncome: 6_000_000,
      netIncome: 5_200_000,
      currentDiscounts: 200_000,
      creditScoreSimulated: 780,
      requestedAmount: 25_000_000,
    });

    // TIER_C_CONDICIONAL: capacidad >= 100k pero menor a cuota estimada
    engine.leads.upsert({
      id: 'Q-COND',
      fullName: 'Lead Condicional',
      libranzaSegment: 'Empleado Público',
      pagaduria: 'FOMAG',
      convenioCodigo: 'CONV-FOMAG-001',
      monthlyIncome: 2_000_000,
      netIncome: 1_800_000,
      currentDiscounts: 600_000, // capacidad = 300k
      creditScoreSimulated: 660,
      requestedAmount: 45_000_000, // cuota estimada > 1M
    });

    // DECLINADO SIN_CONVENIO
    engine.leads.upsert({
      id: 'Q-NOCONV',
      fullName: 'Sin Convenio',
      libranzaSegment: 'Empleado Privado',
      pagaduria: 'Independiente',
      convenioCodigo: 'SIN_CONVENIO',
      monthlyIncome: 5_000_000,
      netIncome: 4_400_000,
      currentDiscounts: 0,
      creditScoreSimulated: 800,
    });

    // DECLINADO BLOQUEADO_LEY_1527 (< $100.000)
    engine.leads.upsert({
      id: 'Q-LEY1527',
      fullName: 'Bloqueado Ley 1527',
      libranzaSegment: 'Pensionado',
      pagaduria: 'Colpensiones',
      convenioCodigo: 'CONV-COLP-001',
      monthlyIncome: 2_000_000,
      netIncome: 1_800_000,
      currentDiscounts: 850_000, // capacidad = 50k < 100k
      creditScoreSimulated: 750,
    });

    const batch = engine.qualification.runBulkQualification.execute(ADVISOR);
    assert.equal(batch.totalLeadsEvaluated, 4);
    assert.equal(batch.tierAPlusCount, 1);
    assert.equal(batch.tierConditionalCount, 1);
    assert.equal(batch.declinedCount, 2);

    const aPlus = batch.items.find((i) => i.leadId === 'Q-APLUS')!;
    assert.equal(aPlus.railTier, 'TIER_A_PLUS');
    assert.equal(aPlus.railScore, 100);
    assert.equal(aPlus.priority, 'urgente');
    assert.equal(aPlus.cadenceChannel, 'voip_call');

    const cond = batch.items.find((i) => i.leadId === 'Q-COND')!;
    assert.equal(cond.railTier, 'TIER_C_CONDICIONAL');
    assert.equal(cond.qualificationVerdict, 'CONDICIONAL_PLAN_B');
    assert.equal(cond.cadenceChannel, 'whatsapp');

    const noConv = batch.items.find((i) => i.leadId === 'Q-NOCONV')!;
    assert.equal(noConv.qualificationVerdict, 'SIN_CONVENIO');
    assert.equal(noConv.cadenceChannel, 'sms');

    const ley = batch.items.find((i) => i.leadId === 'Q-LEY1527')!;
    assert.equal(ley.qualificationVerdict, 'BLOQUEADO_LEY_1527');
    assert.equal(ley.cadenceChannel, 'email');
  });

  it('soporta SMMLV parametrizable y cambio entre amortización francesa y aproximación clásica (Sección 5.3 #4)', () => {
    const french = calculateFrenchAmortizationInstallment(20_000_000, 0.189, 60);
    const classic = calculateClassicApproximationInstallment(20_000_000);
    assert.equal(classic, 450_000);
    assert.ok(french > 490_000 && french < 520_000);

    const engine = createDecisionEngine({
      clock: new FixedClock('2026-11-22T10:00:00.000Z'),
      seedSampleLeads: false,
    });

    engine.config.updateFinancialParameters(ADMIN, {
      smmlv: 1_500_000,
      installmentCalculationMode: 'classic_approximation',
    });

    engine.leads.upsert({
      id: 'L-SMMLV',
      fullName: 'Ingreso Frontera',
      pagaduria: 'Colpensiones',
      convenioCodigo: 'CONV-COLP-001',
      monthlyIncome: 1_450_000, // Debajo del nuevo SMMLV configurable $1.5M
      netIncome: 1_300_000,
      currentDiscounts: 0,
      currentStageId: 'perfilamiento',
      requestedAmount: 20_000_000,
    });

    const check = engine.pipelineGates.canTransitionStage.execute({
      leadId: 'L-SMMLV',
      targetStageId: 'oferta_cierre',
    });
    assert.equal(check.allowed, false);
    assert.equal(check.ruleId, 'R-LIB-002B');

    const qual = engine.qualification.qualifyIndividual.execute(ADVISOR, 'L-SMMLV');
    assert.equal(qual.installmentCalculationMode, 'classic_approximation');
    assert.equal(qual.estimatedInstallment, 450_000);
  });
});
