import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDecisionEngine,
  FixedClock,
  SequentialIdGenerator,
  type ActorContext,
} from '../src/index.ts';

const ADVISOR: ActorContext = { role: 'advisor', name: 'ana.asesora' };
const ADMIN: ActorContext = { role: 'admin', name: 'sofia.admin' };

describe('Sub-motor 4 y 5: Siguiente Mejor Acción, Priorización, Action Tags y Daemon', () => {
  it('completeTask avanza automáticamente a etapa unificada y genera siguiente tarea obligatoria', () => {
    const engine = createDecisionEngine({
      clock: new FixedClock('2026-11-22T10:00:00.000Z'),
      idGenerator: new SequentialIdGenerator(),
      seedSampleLeads: false,
    });

    engine.leads.upsert({
      id: 'L-NBA',
      fullName: 'Diana Torres',
      pagaduria: 'Colpensiones',
      convenioCodigo: 'CONV-COLP-001',
      monthlyIncome: 4_000_000,
      netIncome: 3_500_000,
      currentDiscounts: 200_000,
      currentStageId: 'lead_nuevo',
      tasks: [
        {
          id: 'TSK-INIT',
          leadId: 'L-NBA',
          title: 'Primer contacto VoIP',
          category: 'primer_contacto',
          status: 'pendiente',
          mandatory: true,
          priority: 'urgente',
          dueAt: '2026-11-22T10:15:00.000Z',
          slaMinutes: 15,
          createdAt: '2026-11-22T10:00:00.000Z',
        },
      ],
      currentMandatoryTaskId: 'TSK-INIT',
    });

    const result = engine.nextBestAction.completeTask.execute(ADVISOR, {
      leadId: 'L-NBA',
      taskId: 'TSK-INIT',
      outcome: 'contacto_exitoso_interesado',
    });

    assert.equal(result.completedTask.status, 'completada');
    assert.equal(result.stageTransition?.moved, true);
    assert.equal(result.lead.currentStageId, 'perfilamiento');
    assert.ok(result.generatedTask);
    assert.equal(result.generatedTask?.mandatory, true);
    assert.equal(result.lead.currentMandatoryTaskId, result.generatedTask?.id);
  });

  it('ordena la cola operativa según el ranking de compromiso y SLA (PriorityPolicyConfig)', () => {
    const clock = new FixedClock('2026-11-22T14:00:00.000Z');
    const engine = createDecisionEngine({ clock, seedSampleLeads: false });

    // Rank 5: Lead nuevo
    engine.leads.upsert({
      id: 'P-NEW',
      fullName: 'Lead Nuevo',
      currentStageId: 'lead_nuevo',
      createdAt: '2026-11-22T13:55:00.000Z',
    });
    // Rank 2: Chat urgente
    engine.leads.upsert({
      id: 'P-CHAT',
      fullName: 'Chat Urgente',
      currentStageId: 'perfilamiento',
      processState: {
        chat: { status: 'mensaje_recibido_urgente', lastUpdatedAt: '2026-11-22T13:58:00.000Z' },
        email: { status: 'idle' },
        call: { status: 'idle' },
      },
    });
    // Rank 1: Cita acordada ahora
    engine.leads.upsert({
      id: 'P-CITA',
      fullName: 'Cita Ahora',
      currentStageId: 'oferta_cierre',
      contactPreferences: {
        preferredChannel: 'voip_call',
        agreedAppointment: '2026-11-22T14:00:00.000Z',
      },
    });
    // Rank 3: Glosa / documento rechazado
    engine.leads.upsert({
      id: 'P-GLOSA',
      fullName: 'Glosa Pendiente',
      currentStageId: 'en_estudio',
      documents: [{ id: 'D1', name: 'Colilla.pdf', status: 'rechazado' }],
    });

    const queue = engine.nextBestAction.prioritizeQueue.execute();
    assert.deepEqual(
      queue.map((q) => q.leadId),
      ['P-CITA', 'P-CHAT', 'P-GLOSA', 'P-NEW'],
    );
  });

  it('ejecuta etiquetas operativas (#NO_CONTESTA, #SOLICITA_MENOR_MONTO, #RECHAZADO_FINANCIERA Plan B) y personalizadas', () => {
    const engine = createDecisionEngine({
      clock: new FixedClock('2026-11-22T10:00:00.000Z'),
      idGenerator: new SequentialIdGenerator(),
      seedSampleLeads: false,
    });

    engine.leads.upsert({
      id: 'L-TAG',
      fullName: 'Héctor Vargas',
      libranzaSegment: 'Pensionado',
      pagaduria: 'Colpensiones',
      convenioCodigo: 'CONV-COLP-001',
      monthlyIncome: 4_000_000,
      netIncome: 3_500_000,
      currentDiscounts: 300_000,
      requestedAmount: 40_000_000,
      selectedFinanciera: 'Valorenz',
      currentStageId: 'en_estudio',
      phone: '+573005556677',
    });

    // #NO_CONTESTA
    const noAnswer = engine.automation.triggerActionTag.execute(ADVISOR, {
      leadId: 'L-TAG',
      tag: '#NO_CONTESTA',
    });
    assert.equal(noAnswer.lead.cadenceState.retryCount, 1);
    assert.ok(noAnswer.sentMessage);
    assert.ok(noAnswer.createdReminder);

    // #SOLICITA_MENOR_MONTO (75% del monto y capacidad * 1.15)
    const lowerAmt = engine.automation.triggerActionTag.execute(ADVISOR, {
      leadId: 'L-TAG',
      tag: '#SOLICITA_MENOR_MONTO',
    });
    assert.equal(lowerAmt.lead.requestedAmount, 30_000_000);
    assert.equal(lowerAmt.lead.calculatedLibranzaCapacity, Math.round(1_450_000 * 1.15));

    // #RECHAZADO_FINANCIERA: Valorenz -> Capital (Plan B), NO mueve a rechazado, log R-MULTI-FIN-01
    const planB = engine.automation.triggerActionTag.execute(ADVISOR, {
      leadId: 'L-TAG',
      tag: '#RECHAZADO_FINANCIERA',
    });
    assert.equal(planB.lead.selectedFinanciera, 'Capital');
    assert.deepEqual(planB.lead.rejectedFinancieras, ['Valorenz']);
    assert.equal(planB.lead.currentStageId, 'en_estudio');
    assert.equal(planB.createdTask?.mandatory, true);
    assert.equal(planB.createdTask?.priority, 'urgente');
    assert.equal(planB.decisionLog?.ruleId, 'R-MULTI-FIN-01');

    // Etiqueta personalizada creada por Admin
    engine.automation.manageActionTags.createTag(ADMIN, {
      code: '#ENVIO_CERTIFICADO',
      label: 'Enviar recordatorio de certificado laboral',
      automationType: 'enviar_whatsapp_recordatorio',
      messageTemplate: 'Hola {{name}}, recuerda enviar tu certificado laboral.',
      priority: 'alta',
    });
    const customRes = engine.automation.triggerActionTag.execute(ADVISOR, {
      leadId: 'L-TAG',
      tag: '#ENVIO_CERTIFICADO',
    });
    assert.ok(customRes.sentMessage?.content.includes('Héctor Vargas'));
  });

  it('runRailsDaemonSweep detecta chat/call/email, excluye cerrados y evita duplicar tareas abiertas', () => {
    const engine = createDecisionEngine({
      clock: new FixedClock('2026-11-22T12:00:00.000Z'),
      idGenerator: new SequentialIdGenerator(),
      seedSampleLeads: false,
    });

    engine.leads.upsert({
      id: 'D-ACTIVE',
      fullName: 'Lead Activo Daemon',
      currentStageId: 'oferta_cierre',
      processState: {
        chat: { status: 'mensaje_recibido_urgente' },
        call: { status: 'no_contesta_reintento_requerido' },
        email: { status: 'click_simulacion' },
      },
    });

    engine.leads.upsert({
      id: 'D-CLOSED',
      fullName: 'Lead Desembolsado',
      currentStageId: 'desembolsado',
      processState: {
        chat: { status: 'mensaje_recibido_urgente' },
        call: { status: 'idle' },
        email: { status: 'idle' },
      },
    });

    const sweep1 = engine.automation.runDaemonSweep.execute();
    assert.equal(sweep1.leadsScanned, 1);
    assert.equal(sweep1.tasksCreated.length, 3);
    assert.equal(sweep1.eventsPublished.length, 3);

    // Segundo barrido inmediato NO debe duplicar tareas abiertas del mismo tipo
    const sweep2 = engine.automation.runDaemonSweep.execute();
    assert.equal(sweep2.leadsScanned, 1);
    assert.equal(sweep2.tasksCreated.length, 0);
  });
});
