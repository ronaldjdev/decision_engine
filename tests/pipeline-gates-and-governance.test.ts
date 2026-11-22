import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDecisionEngine,
  FixedClock,
  SequentialIdGenerator,
  type ActorContext,
} from '../src/index.ts';

const ADVISOR: ActorContext = { role: 'advisor', name: 'ana.asesora' };
const SUPERVISOR: ActorContext = { role: 'supervisor', name: 'carlos.supervisor' };
const ADMIN: ActorContext = { role: 'admin', name: 'sofia.admin' };

describe('Sub-motor 1: Compuertas de Transición y Gobernanza Dinámica', () => {
  it('bloquea saltos de etapa (R-SEC-01) y tareas obligatorias abiertas (R-TSK-MANDATORY)', () => {
    const engine = createDecisionEngine({
      clock: new FixedClock('2026-11-22T10:00:00.000Z'),
      idGenerator: new SequentialIdGenerator(),
      seedSampleLeads: false,
    });

    engine.leads.upsert({
      id: 'L-1',
      fullName: 'Pedro Pérez',
      pagaduria: 'Colpensiones',
      convenioCodigo: 'CONV-COLP-001',
      monthlyIncome: 3_000_000,
      netIncome: 2_600_000,
      currentDiscounts: 200_000,
      currentStageId: 'lead_nuevo',
      tasks: [
        {
          id: 'T-1',
          leadId: 'L-1',
          title: 'Primer contacto obligatorio',
          category: 'primer_contacto',
          status: 'pendiente',
          mandatory: true,
          priority: 'urgente',
          dueAt: '2026-11-22T10:15:00.000Z',
          slaMinutes: 15,
          createdAt: '2026-11-22T10:00:00.000Z',
        },
      ],
    });

    // Salto de etapa: lead_nuevo (1) -> oferta_cierre (3)
    const skipCheck = engine.pipelineGates.canTransitionStage.execute({
      leadId: 'L-1',
      targetStageId: 'oferta_cierre',
    });
    assert.equal(skipCheck.allowed, false);
    assert.equal(skipCheck.ruleId, 'R-SEC-01');

    // Intento de paso a perfilamiento bloqueado por tarea obligatoria
    const taskCheck = engine.pipelineGates.canTransitionStage.execute({
      leadId: 'L-1',
      targetStageId: 'perfilamiento',
    });
    assert.equal(taskCheck.allowed, false);
    assert.equal(taskCheck.ruleId, 'R-TSK-MANDATORY');

    // Excepción de cierre autorizada inmediatamente (incluso con alias heredado cerrado_no_interesado)
    const closureCheck = engine.pipelineGates.canTransitionStage.execute({
      leadId: 'L-1',
      targetStageId: 'cerrado_no_interesado',
    });
    assert.equal(closureCheck.allowed, true);
    assert.equal(closureCheck.targetStageId, 'rechazado_perdido');
  });

  it('recorre el pipeline completo validando R-LIB-001..R-LIB-006 y transforma en Cliente Activo', () => {
    const engine = createDecisionEngine({
      clock: new FixedClock('2026-11-22T10:00:00.000Z'),
      idGenerator: new SequentialIdGenerator(),
      seedSampleLeads: false,
    });

    // Crear lead en lead_nuevo sin contacto
    engine.leads.upsert({
      id: 'L-FULL',
      fullName: 'Lucía Gómez',
      pagaduria: 'Colpensiones',
      convenioCodigo: 'CONV-COLP-001',
      monthlyIncome: 4_000_000,
      netIncome: 3_500_000,
      currentDiscounts: 300_000,
      currentStageId: 'lead_nuevo',
    });

    // Sin evidencia de contacto -> bloqueado por R-LIB-001
    const blockContact = engine.pipelineGates.moveLeadStage.execute(ADVISOR, {
      leadId: 'L-FULL',
      targetStageId: 'perfilamiento',
    });
    assert.equal(blockContact.moved, false);
    assert.equal(blockContact.check.ruleId, 'R-LIB-001');
    assert.equal(blockContact.decisionLog.verdict, 'BLOQUEADO');

    // Agregar nota de contacto y avanzar a perfilamiento
    const lead = engine.repositories.leads.findById('L-FULL')!;
    lead.addNote('N-1', 'Contacto exitoso, cliente interesada', ADVISOR.name, engine.clock.nowIso());
    engine.repositories.leads.save(lead);

    const toPerf = engine.pipelineGates.moveLeadStage.execute(ADVISOR, {
      leadId: 'L-FULL',
      targetStageId: 'perfilamiento',
    });
    assert.equal(toPerf.moved, true);
    assert.equal(toPerf.lead.currentStageId, 'perfilamiento');

    // Avanzar a oferta_cierre (capacidad > 0 y monthlyIncome >= SMMLV)
    const toOferta = engine.pipelineGates.moveLeadStage.execute(ADVISOR, {
      leadId: 'L-FULL',
      targetStageId: 'oferta_cierre',
    });
    assert.equal(toOferta.moved, true);

    // Intentar pasar a en_estudio sin financiera -> bloqueado R-LIB-005
    const blockFin = engine.pipelineGates.moveLeadStage.execute(ADVISOR, {
      leadId: 'L-FULL',
      targetStageId: 'en_estudio',
    });
    assert.equal(blockFin.moved, false);
    assert.equal(blockFin.check.ruleId, 'R-LIB-005');

    // Asignar financiera + 3 documentos pero 1 pendiente -> bloqueado R-LIB-004 (Sección 5.2 #3)
    const l2 = engine.repositories.leads.findById('L-FULL')!;
    l2.props.selectedFinanciera = 'Valorenz';
    l2.props.documents = [
      { id: 'D1', name: 'Cedula.pdf', status: 'verificado' },
      { id: 'D2', name: 'Colilla1.pdf', status: 'verificado' },
      { id: 'D3', name: 'Colilla2.pdf', status: 'pendiente' },
    ];
    engine.repositories.leads.save(l2);

    const blockDoc = engine.pipelineGates.moveLeadStage.execute(ADVISOR, {
      leadId: 'L-FULL',
      targetStageId: 'en_estudio',
    });
    assert.equal(blockDoc.moved, false);
    assert.equal(blockDoc.check.ruleId, 'R-LIB-004');

    // Verificar 3er documento -> pasa a en_estudio
    l2.props.documents[2]!.status = 'verificado';
    engine.repositories.leads.save(l2);
    assert.equal(
      engine.pipelineGates.moveLeadStage.execute(ADVISOR, {
        leadId: 'L-FULL',
        targetStageId: 'en_estudio',
      }).moved,
      true,
    );

    // Pasar a aprobado_formalizacion requiere hasPreapproval === true
    assert.equal(
      engine.pipelineGates.canTransitionStage.execute({
        leadId: 'L-FULL',
        targetStageId: 'aprobado_formalizacion',
      }).allowed,
      false,
    );
    const l3 = engine.repositories.leads.findById('L-FULL')!;
    l3.props.qualificationData.hasPreapproval = true;
    engine.repositories.leads.save(l3);

    assert.equal(
      engine.pipelineGates.moveLeadStage.execute(ADVISOR, {
        leadId: 'L-FULL',
        targetStageId: 'aprobado_formalizacion',
      }).moved,
      true,
    );

    // Pasar a desembolsado requiere pagaré/deceval/libranza (R-LIB-006)
    assert.equal(
      engine.pipelineGates.canTransitionStage.execute({
        leadId: 'L-FULL',
        targetStageId: 'desembolsado',
      }).ruleId,
      'R-LIB-006',
    );
    const l4 = engine.repositories.leads.findById('L-FULL')!;
    l4.props.documents.push({
      id: 'D4',
      name: 'Pagaré DECEVAL firmado.pdf',
      status: 'verificado',
    });
    engine.repositories.leads.save(l4);

    const disbursed = engine.pipelineGates.moveLeadStage.execute(ADVISOR, {
      leadId: 'L-FULL',
      targetStageId: 'desembolsado',
    });
    assert.equal(disbursed.moved, true);
    assert.equal(disbursed.becameClient, true);
    assert.equal(disbursed.lead.isClient, true);
    assert.equal(disbursed.lead.clientSince, '2026-11-22T10:00:00.000Z');
  });

  it('evalúa reglas dinámicas creadas por admin, respeta RBAC y permite excepciones aprobadas', () => {
    const engine = createDecisionEngine({
      clock: new FixedClock('2026-11-22T10:00:00.000Z'),
      seedSampleLeads: false,
    });

    // Asesor NO puede crear ni desactivar reglas
    assert.throws(
      () => engine.governance.rules.toggleRule(ADVISOR, 'R-LIB-005', false),
      /no tiene permiso/,
    );

    // Supervisor NO puede desactivar restricción dura legal R-LIB-002
    assert.throws(
      () => engine.governance.rules.toggleRule(SUPERVISOR, 'R-LIB-002', false),
      /Restricción Dura/,
    );

    // Admin crea una regla dinámica configurable para oferta_cierre (score >= 650)
    engine.governance.rules.createRule(ADMIN, {
      code: 'R-CUSTOM-SCORE',
      name: 'Score Mínimo Campaña Especial',
      description: 'Exige score >= 650 para avanzar a oferta_cierre',
      category: 'CONFIGURABLE_POLICY',
      governanceOwner: 'COMITE_COMERCIAL',
      stage: 'oferta_cierre',
      isActive: true,
      conditions: [
        {
          field: 'creditScoreSimulated',
          operator: 'gte',
          value: 650,
          description: 'Score crediticio >= 650',
        },
      ],
    });

    engine.leads.upsert({
      id: 'L-DYN',
      fullName: 'Marcos Ruiz',
      pagaduria: 'Colpensiones',
      convenioCodigo: 'CONV-COLP-001',
      monthlyIncome: 3_000_000,
      netIncome: 2_640_000,
      currentDiscounts: 200_000,
      creditScoreSimulated: 610,
      currentStageId: 'perfilamiento',
    });

    // Bloqueado dinámicamente por R-CUSTOM-SCORE
    const blocked = engine.pipelineGates.canTransitionStage.execute({
      leadId: 'L-DYN',
      targetStageId: 'oferta_cierre',
    });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.ruleId, 'R-CUSTOM-SCORE');

    // Asesor radica Excepción Justificada y Supervisor la aprueba -> desbloquea transición!
    const exc = engine.governance.exceptions.submitException(ADVISOR, {
      leadId: 'L-DYN',
      ruleCode: 'R-CUSTOM-SCORE',
      justification: 'Cliente cuenta con paz y salvo verificado y codeudor pensionado.',
    });
    engine.governance.exceptions.reviewException(SUPERVISOR, {
      exceptionId: exc.props.id,
      decision: 'aprobada',
      comment: 'Aprobado por comité de riesgos.',
    });

    const allowedWithException = engine.pipelineGates.canTransitionStage.execute({
      leadId: 'L-DYN',
      targetStageId: 'oferta_cierre',
    });
    assert.equal(allowedWithException.allowed, true);
  });

  it('en tableros personalizados (isDefault=false) relaja compuertas fijas y valida solo R-TSK-MANDATORY', () => {
    const engine = createDecisionEngine({
      clock: new FixedClock('2026-11-22T10:00:00.000Z'),
      seedSampleLeads: false,
    });

    engine.leads.upsert({
      id: 'L-CUSTOM',
      fullName: 'Cliente VIP',
      pagaduria: '',
      convenioCodigo: 'SIN_CONVENIO',
      monthlyIncome: 500_000,
      boardId: 'board-compra-cartera-vip',
      currentStageId: 'recepcion_vip',
    });

    // Puede saltar directamente a la última etapa del tablero custom si no tiene tareas obligatorias
    const res = engine.pipelineGates.moveLeadStage.execute(ADVISOR, {
      leadId: 'L-CUSTOM',
      targetStageId: 'cierre_desembolso_vip',
    });
    assert.equal(res.moved, true);
    assert.equal(res.becameClient, true);
  });
});
