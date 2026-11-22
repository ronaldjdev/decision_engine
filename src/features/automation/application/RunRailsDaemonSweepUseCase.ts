import type { Clock } from '../../../shared/domain/Clock.ts';
import type { IdGenerator } from '../../../shared/domain/IdGenerator.ts';
import type {
  CommercialTask,
  TaskCategory,
} from '../../../shared/domain/value-objects/Lead.ts';
import type { DecisionLogRepository } from '../../governance/domain/ports/DecisionLogRepository.ts';
import type { ActorContext } from '../../governance/domain/Role.ts';
import { SYSTEM_ACTOR } from '../../governance/domain/Role.ts';
import type { LeadRepository } from '../../leads/domain/ports/LeadRepository.ts';
import type { LiveEventStore } from '../domain/ports/LiveEventStore.ts';
import type { RailsLiveEvent } from '../domain/RailsLiveEvent.ts';

export interface DaemonSweepResult {
  readonly executedAt: string;
  readonly leadsScanned: number;
  readonly tasksCreated: readonly CommercialTask[];
  readonly eventsPublished: readonly RailsLiveEvent[];
}

/**
 * Caso de Uso del Sub-motor 5: Demonio Continuo Multicanal (`runRailsDaemonSweep`).
 *
 * Recorre leads activos (excluyendo `desembolsado` y `rechazado_perdido`), detecta señales
 * en vivo de WhatsApp urgente, reintentos VoIP y aperturas/clics de email, crea tareas
 * obligatorias sin duplicar tareas abiertas de la misma categoría y publica `RailsLiveEvent`.
 */
export class RunRailsDaemonSweepUseCase {
  private readonly leadRepository: LeadRepository;
  private readonly liveEventStore: LiveEventStore;
  private readonly decisionLogRepository: DecisionLogRepository;
  private readonly clock: Clock;
  private readonly idGenerator: IdGenerator;

  constructor(deps: {
    leadRepository: LeadRepository;
    liveEventStore: LiveEventStore;
    decisionLogRepository: DecisionLogRepository;
    clock: Clock;
    idGenerator: IdGenerator;
  }) {
    this.leadRepository = deps.leadRepository;
    this.liveEventStore = deps.liveEventStore;
    this.decisionLogRepository = deps.decisionLogRepository;
    this.clock = deps.clock;
    this.idGenerator = deps.idGenerator;
  }

  public execute(actor: ActorContext = SYSTEM_ACTOR): DaemonSweepResult {
    const nowIso = this.clock.nowIso();
    const leads = this.leadRepository.findAll();
    const tasksCreated: CommercialTask[] = [];
    const eventsPublished: RailsLiveEvent[] = [];
    let leadsScanned = 0;

    for (const lead of leads) {
      const stage = lead.props.currentStageId;
      if (stage === 'desembolsado' || stage === 'rechazado_perdido') {
        continue;
      }
      leadsScanned += 1;

      const hasOpenTaskOfCategory = (category: TaskCategory): boolean =>
        lead.props.tasks.some(
          (t) =>
            t.category === category &&
            (t.status === 'pendiente' ||
              t.status === 'en_progreso' ||
              t.status === 'vencida'),
        );

      const maybeCreateTask = (spec: {
        category: TaskCategory;
        title: string;
        priority: CommercialTask['priority'];
        slaMinutes: number;
        channel: RailsLiveEvent['channel'];
        eventType: string;
        severity: RailsLiveEvent['severity'];
      }): void => {
        if (hasOpenTaskOfCategory(spec.category)) return;

        const task: CommercialTask = {
          id: this.idGenerator.next('TSK'),
          leadId: lead.id,
          title: spec.title,
          category: spec.category,
          status: 'pendiente',
          mandatory: true,
          priority: spec.priority,
          dueAt: this.clock.addMinutesIso(spec.slaMinutes),
          slaMinutes: spec.slaMinutes,
          createdAt: nowIso,
          assignedAdvisor: lead.props.assignedAdvisor,
        };
        lead.addTask(task);
        tasksCreated.push(task);

        const event: RailsLiveEvent = {
          id: this.idGenerator.next('EVT'),
          timestamp: nowIso,
          leadId: lead.id,
          leadName: lead.props.fullName,
          channel: spec.channel,
          eventType: spec.eventType,
          message: `Daemon creó tarea obligatoria: ${spec.title}`,
          severity: spec.severity,
          createdTaskId: task.id,
        };
        this.liveEventStore.publish(event);
        eventsPublished.push(event);

        this.decisionLogRepository.append({
          id: this.idGenerator.next('LOG'),
          timestamp: nowIso,
          leadId: lead.id,
          leadName: lead.props.fullName,
          ruleId: 'R-DAEMON-SWEEP',
          ruleName: 'Demonio Continuo Multicanal (Rails Daemon)',
          stageEvaluated: lead.props.currentStageId,
          conditionsChecked: [
            {
              condition: `Detección de señal en canal '${spec.channel}'`,
              passed: true,
              actualValue: spec.eventType,
            },
          ],
          verdict: 'SIGUIENTE_ACCION_GENERADA',
          actionTaken: `Tarea obligatoria '${task.id}' generada (${spec.title}).`,
          advisorResponsible: actor.name,
        });
      };

      // 1. chat.status === 'mensaje_recibido_urgente' -> WhatsApp SLA 15 min
      if (lead.props.processState.chat.status === 'mensaje_recibido_urgente') {
        maybeCreateTask({
          category: 'whatsapp_urgente',
          title: 'Responder WhatsApp urgente del cliente (SLA 15 min)',
          priority: 'urgente',
          slaMinutes: 15,
          channel: 'chat',
          eventType: 'mensaje_recibido_urgente',
          severity: 'urgent',
        });
      }

      // 2. call.status === 'no_contesta_reintento_requerido' -> Reintento VoIP (+2h)
      if (
        lead.props.processState.call.status === 'no_contesta_reintento_requerido'
      ) {
        maybeCreateTask({
          category: 'reintento_voip',
          title: 'Reintento VoIP requerido (+2h)',
          priority: 'alta',
          slaMinutes: 120,
          channel: 'call',
          eventType: 'no_contesta_reintento_requerido',
          severity: 'warning',
        });
      }

      // 3. email.status === 'propuesta_abierta' | 'click_simulacion' -> Cierre de Oferta (+30 min)
      if (
        lead.props.processState.email.status === 'propuesta_abierta' ||
        lead.props.processState.email.status === 'click_simulacion'
      ) {
        maybeCreateTask({
          category: 'cierre_oferta',
          title: 'Cierre de oferta: cliente interactuó con propuesta/simulación (+30 min)',
          priority: 'alta',
          slaMinutes: 30,
          channel: 'email',
          eventType: lead.props.processState.email.status,
          severity: 'urgent',
        });
      }

      this.leadRepository.save(lead);
    }

    return {
      executedAt: nowIso,
      leadsScanned,
      tasksCreated,
      eventsPublished,
    };
  }
}
