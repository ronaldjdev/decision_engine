import type { Clock } from '../../../shared/domain/Clock.ts';
import { NotFoundError } from '../../../shared/domain/DomainError.ts';
import type { IdGenerator } from '../../../shared/domain/IdGenerator.ts';
import type { FinancialParametersStore } from '../../../shared/domain/value-objects/FinancialParameters.ts';
import type {
  CommercialTask,
  LeadProps,
  OmnichannelMessage,
  Reminder,
} from '../../../shared/domain/value-objects/Lead.ts';
import { MultiEntityProbabilityService } from '../../entity-matching/domain/MultiEntityProbabilityService.ts';
import type { FinancialEntityPolicyRepository } from '../../entity-matching/domain/ports/FinancialEntityPolicyRepository.ts';
import type { EngineDecisionLog } from '../../governance/domain/EngineDecisionLog.ts';
import type { DecisionLogRepository } from '../../governance/domain/ports/DecisionLogRepository.ts';
import type { RuleRepository } from '../../governance/domain/ports/RuleRepository.ts';
import type { ActorContext } from '../../governance/domain/Role.ts';
import type { LeadRepository } from '../../leads/domain/ports/LeadRepository.ts';
import type { MoveLeadStageUseCase } from '../../pipeline-gates/application/MoveLeadStageUseCase.ts';
import type { ActionTagRepository } from '../domain/ports/ActionTagRepository.ts';
import type { LiveEventStore } from '../domain/ports/LiveEventStore.ts';
import type { NotificationGateway } from '../domain/ports/NotificationGateway.ts';

export interface TriggerActionTagInput {
  leadId: string;
  tag: string;
  scheduledTime?: string;
  newRequestedAmount?: number;
  rejectedEntity?: string;
}

export interface TriggerActionTagResult {
  readonly tag: string;
  readonly actionsExecuted: readonly string[];
  readonly lead: LeadProps;
  readonly createdTask?: CommercialTask;
  readonly createdReminder?: Reminder;
  readonly sentMessage?: OmnichannelMessage;
  readonly decisionLog?: EngineDecisionLog;
}

/**
 * Caso de Uso del Sub-motor 5: ejecuta automatizaciones por Etiquetas Operativas (`triggerActionTag`).
 *
 * Soporta las 6 etiquetas estándar (`#NO_CONTESTA`, `#ESTA_OCUPADO`, `#FALTAN_DOCUMENTOS`,
 * `#SOLICITA_MENOR_MONTO`, `#RECHAZADO_FINANCIERA` con activación automática de Plan B `R-MULTI-FIN-01`,
 * y `#CLIENTE_INTERESADO`) además de etiquetas personalizadas configuradas por `admin`.
 */
export class TriggerActionTagUseCase {
  private readonly leadRepository: LeadRepository;
  private readonly actionTagRepository: ActionTagRepository;
  private readonly policyRepository: FinancialEntityPolicyRepository;
  private readonly ruleRepository: RuleRepository;
  private readonly decisionLogRepository: DecisionLogRepository;
  private readonly notificationGateway: NotificationGateway;
  private readonly liveEventStore: LiveEventStore;
  private readonly moveLeadStage: MoveLeadStageUseCase;
  private readonly financialParamsStore: FinancialParametersStore;
  private readonly clock: Clock;
  private readonly idGenerator: IdGenerator;
  private readonly multiEntityService = new MultiEntityProbabilityService();

  constructor(deps: {
    leadRepository: LeadRepository;
    actionTagRepository: ActionTagRepository;
    policyRepository: FinancialEntityPolicyRepository;
    ruleRepository: RuleRepository;
    decisionLogRepository: DecisionLogRepository;
    notificationGateway: NotificationGateway;
    liveEventStore: LiveEventStore;
    moveLeadStage: MoveLeadStageUseCase;
    financialParamsStore: FinancialParametersStore;
    clock: Clock;
    idGenerator: IdGenerator;
  }) {
    this.leadRepository = deps.leadRepository;
    this.actionTagRepository = deps.actionTagRepository;
    this.policyRepository = deps.policyRepository;
    this.ruleRepository = deps.ruleRepository;
    this.decisionLogRepository = deps.decisionLogRepository;
    this.notificationGateway = deps.notificationGateway;
    this.liveEventStore = deps.liveEventStore;
    this.moveLeadStage = deps.moveLeadStage;
    this.financialParamsStore = deps.financialParamsStore;
    this.clock = deps.clock;
    this.idGenerator = deps.idGenerator;
  }

  public execute(
    actor: ActorContext,
    input: TriggerActionTagInput,
  ): TriggerActionTagResult {
    const lead = this.leadRepository.findById(input.leadId);
    if (!lead) {
      throw new NotFoundError('Lead', input.leadId);
    }

    const normalizedTag = input.tag.startsWith('#')
      ? input.tag.toUpperCase()
      : `#${input.tag.toUpperCase()}`;

    const nowIso = this.clock.nowIso();
    const actionsExecuted: string[] = [];
    let createdTask: CommercialTask | undefined;
    let createdReminder: Reminder | undefined;
    let sentMessage: OmnichannelMessage | undefined;
    let decisionLog: EngineDecisionLog | undefined;

    const sendWhatsApp = (body: string): OmnichannelMessage => {
      const msg: OmnichannelMessage = {
        id: this.idGenerator.next('MSG'),
        leadId: lead.id,
        channel: 'whatsapp',
        sender: 'system',
        content: body,
        sentAt: nowIso,
      };
      lead.addMessage(msg);
      this.notificationGateway.send({
        id: msg.id,
        leadId: lead.id,
        channel: 'whatsapp',
        recipient: lead.props.phone,
        body,
        sentAt: nowIso,
      });
      return msg;
    };

    switch (normalizedTag) {
      case '#NO_CONTESTA': {
        sentMessage = sendWhatsApp(
          `Hola ${lead.props.fullName}, intentamos comunicarnos contigo sobre tu solicitud de libranza. ¿A qué hora te queda mejor que te llamemos?`,
        );
        createdReminder = {
          id: this.idGenerator.next('REM'),
          leadId: lead.id,
          message: `Reintentar llamada con ${lead.props.fullName} (#NO_CONTESTA)`,
          scheduledFor: this.clock.addMinutesIso(120),
          priority: 'media',
          createdAt: nowIso,
          completed: false,
        };
        lead.addReminder(createdReminder);
        lead.props.cadenceState.retryCount += 1;
        lead.props.cadenceState.nextRetrySchedule = createdReminder.scheduledFor;
        actionsExecuted.push(
          'WhatsApp automático enviado',
          'Recordatorio de llamada agendado en +2h',
          `cadenceState.retryCount incrementado a ${lead.props.cadenceState.retryCount}`,
        );
        break;
      }

      case '#ESTA_OCUPADO': {
        const agreedTime = input.scheduledTime ?? '16:00';
        const scheduledIso = agreedTime.includes('T')
          ? agreedTime
          : `${nowIso.slice(0, 10)}T${agreedTime}:00.000Z`;
        createdReminder = {
          id: this.idGenerator.next('REM'),
          leadId: lead.id,
          message: `Llamada urgente reprogramada con ${lead.props.fullName} a las ${agreedTime}`,
          scheduledFor: scheduledIso,
          priority: 'urgente',
          createdAt: nowIso,
          completed: false,
        };
        lead.addReminder(createdReminder);
        lead.props.contactPreferences = {
          preferredChannel: lead.props.contactPreferences?.preferredChannel ?? 'whatsapp',
          ...lead.props.contactPreferences,
          agreedAppointment: scheduledIso,
        };
        sentMessage = sendWhatsApp(
          `Perfecto ${lead.props.fullName}, confirmamos tu llamada para las ${agreedTime}. ¡Hablamos pronto!`,
        );
        actionsExecuted.push(
          `Recordatorio urgente agendado para ${agreedTime}`,
          'Confirmación enviada por WhatsApp',
        );
        break;
      }

      case '#FALTAN_DOCUMENTOS': {
        sentMessage = sendWhatsApp(
          `Hola ${lead.props.fullName}, para avanzar con tu libranza necesitamos los 2 últimos desprendibles de pago/pensión y tu cédula ampliada al 150%.`,
        );
        actionsExecuted.push(
          'WhatsApp solicitando 2 últimos desprendibles y cédula al 150%',
        );
        break;
      }

      case '#SOLICITA_MENOR_MONTO': {
        const previousAmount = lead.props.requestedAmount;
        const adjustedAmount =
          input.newRequestedAmount && input.newRequestedAmount > 0
            ? Math.round(input.newRequestedAmount)
            : Math.round(previousAmount * 0.75);
        lead.props.requestedAmount = adjustedAmount;
        lead.props.calculatedLibranzaCapacity = Math.round(
          lead.props.calculatedLibranzaCapacity * 1.15,
        );
        if (lead.props.capacityDetails) {
          lead.props.capacityDetails.availableCapacity =
            lead.props.calculatedLibranzaCapacity;
          lead.props.capacityDetails.maxInstallment =
            lead.props.calculatedLibranzaCapacity;
        }
        actionsExecuted.push(
          `Monto solicitado ajustado de $${previousAmount.toLocaleString('es-CO')} a $${adjustedAmount.toLocaleString('es-CO')}`,
          `Capacidad recalibrada (+15%) a $${lead.props.calculatedLibranzaCapacity.toLocaleString('es-CO')}`,
        );
        break;
      }

      case '#RECHAZADO_FINANCIERA': {
        const rejected = input.rejectedEntity ?? lead.props.selectedFinanciera;
        if (rejected && !lead.props.rejectedFinancieras.includes(rejected)) {
          lead.props.rejectedFinancieras.push(rejected);
        }

        const probabilities = this.multiEntityService.evaluate({
          lead,
          policies: this.policyRepository.findAll(),
          rules: this.ruleRepository.findAll(),
          financialParams: this.financialParamsStore.get(),
        });

        const planBEntity = this.multiEntityService.resolvePlanBEntity(
          rejected,
          probabilities,
        );
        lead.props.selectedFinanciera = planBEntity;

        createdTask = {
          id: this.idGenerator.next('TSK'),
          leadId: lead.id,
          title: `Activar Plan B en ${planBEntity} tras rechazo de ${rejected ?? 'entidad anterior'}`,
          category: 'plan_b_reactivacion',
          status: 'pendiente',
          mandatory: true,
          priority: 'urgente',
          dueAt: this.clock.addMinutesIso(30),
          slaMinutes: 30,
          createdAt: nowIso,
          assignedAdvisor: lead.props.assignedAdvisor,
        };
        lead.addTask(createdTask);

        decisionLog = {
          id: this.idGenerator.next('LOG'),
          timestamp: nowIso,
          leadId: lead.id,
          leadName: lead.props.fullName,
          ruleId: 'R-MULTI-FIN-01',
          ruleName: 'Activación Automática de Plan B Multientidad (R-LIB-007)',
          stageEvaluated: lead.props.currentStageId,
          conditionsChecked: [
            {
              condition: 'Entidad rechazada registrada en rejectedFinancieras',
              passed: true,
              actualValue: rejected ?? 'N/A',
            },
            {
              condition: 'Entidad Plan B seleccionada sin cerrar al lead',
              passed: true,
              actualValue: planBEntity,
            },
          ],
          verdict: 'SIGUIENTE_ACCION_GENERADA',
          actionTaken: `Plan B activado: ${rejected ?? 'Anterior'} -> ${planBEntity}. Tarea obligatoria urgente '${createdTask.id}' creada. Lead permanece activo en '${lead.props.currentStageId}'.`,
          advisorResponsible: actor.name,
        };
        this.decisionLogRepository.append(decisionLog);

        actionsExecuted.push(
          `Rechazo registrado para ${rejected ?? 'financiera previa'}`,
          `selectedFinanciera reasignada a Plan B: ${planBEntity}`,
          'Tarea obligatoria urgente de Plan B creada',
          'Lead NO movido a rechazado (R-LIB-007 / R-MULTI-FIN-01)',
        );
        break;
      }

      case '#CLIENTE_INTERESADO': {
        lead.addNote(
          this.idGenerator.next('NOTE'),
          'Etiqueta #CLIENTE_INTERESADO: cliente confirma interés en avanzar.',
          actor.name,
          nowIso,
        );
        this.leadRepository.save(lead);
        if (lead.props.currentStageId === 'lead_nuevo') {
          const moveRes = this.moveLeadStage.execute(actor, {
            leadId: lead.id,
            targetStageId: 'perfilamiento',
          });
          decisionLog = moveRes.decisionLog;
          actionsExecuted.push(
            moveRes.moved
              ? 'Avance automático a etapa perfilamiento autorizado'
              : `No se pudo avanzar automáticamente: ${moveRes.check.reason}`,
          );
          return {
            tag: normalizedTag,
            actionsExecuted,
            lead: moveRes.lead,
            decisionLog,
          };
        }
        actionsExecuted.push('Interés registrado en notas (etapa actual no es lead_nuevo)');
        break;
      }

      default: {
        const customTag = this.actionTagRepository.findByCode(normalizedTag);
        if (!customTag) {
          throw new NotFoundError('Etiqueta Operativa', normalizedTag);
        }

        switch (customTag.automationType) {
          case 'enviar_whatsapp_recordatorio':
            sentMessage = sendWhatsApp(
              (customTag.messageTemplate ?? `Recordatorio para {{name}}`).replace(
                '{{name}}',
                lead.props.fullName,
              ),
            );
            actionsExecuted.push(`WhatsApp personalizado enviado (${customTag.code})`);
            break;

          case 'crear_tarea_obligatoria':
            createdTask = {
              id: this.idGenerator.next('TSK'),
              leadId: lead.id,
              title: customTag.label,
              category: 'personalizada',
              status: 'pendiente',
              mandatory: true,
              priority: customTag.priority,
              dueAt: this.clock.addMinutesIso(customTag.slaMinutes ?? 30),
              slaMinutes: customTag.slaMinutes ?? 30,
              createdAt: nowIso,
              assignedAdvisor: lead.props.assignedAdvisor,
            };
            lead.addTask(createdTask);
            actionsExecuted.push(`Tarea obligatoria creada (${customTag.label})`);
            break;

          case 'reprogramar_llamada':
            createdReminder = {
              id: this.idGenerator.next('REM'),
              leadId: lead.id,
              message: `Llamada reprogramada (${customTag.label})`,
              scheduledFor: this.clock.addMinutesIso(customTag.slaMinutes ?? 120),
              priority: customTag.priority,
              createdAt: nowIso,
              completed: false,
            };
            lead.addReminder(createdReminder);
            actionsExecuted.push('Llamada reprogramada mediante recordatorio');
            break;

          case 'cambiar_etapa_pipeline':
            if (customTag.targetStageId) {
              this.leadRepository.save(lead);
              const moveRes = this.moveLeadStage.execute(actor, {
                leadId: lead.id,
                targetStageId: customTag.targetStageId,
              });
              decisionLog = moveRes.decisionLog;
              actionsExecuted.push(
                moveRes.moved
                  ? `Etapa cambiada a '${customTag.targetStageId}'`
                  : `Bloqueo al cambiar etapa: ${moveRes.check.reason}`,
              );
              return {
                tag: normalizedTag,
                actionsExecuted,
                lead: moveRes.lead,
                decisionLog,
              };
            }
            break;

          case 'bloquear_avance':
            createdTask = {
              id: this.idGenerator.next('TSK'),
              leadId: lead.id,
              title: `Bloqueo operativo: ${customTag.label}`,
              category: 'personalizada',
              status: 'pendiente',
              mandatory: true,
              priority: 'urgente',
              dueAt: this.clock.addMinutesIso(customTag.slaMinutes ?? 60),
              slaMinutes: customTag.slaMinutes ?? 60,
              createdAt: nowIso,
              assignedAdvisor: lead.props.assignedAdvisor,
            };
            lead.addTask(createdTask);
            actionsExecuted.push('Avance bloqueado mediante tarea obligatoria de control');
            break;

          case 'activar_plan_b': {
            this.leadRepository.save(lead);
            return this.execute(actor, {
              ...input,
              tag: '#RECHAZADO_FINANCIERA',
            });
          }
        }
      }
    }

    this.leadRepository.save(lead);

    this.liveEventStore.publish({
      id: this.idGenerator.next('EVT'),
      timestamp: nowIso,
      leadId: lead.id,
      leadName: lead.props.fullName,
      channel: 'action_tag',
      eventType: normalizedTag,
      message: actionsExecuted.join(' | '),
      severity: normalizedTag === '#RECHAZADO_FINANCIERA' ? 'urgent' : 'info',
      createdTaskId: createdTask?.id,
    });

    if (!decisionLog) {
      decisionLog = {
        id: this.idGenerator.next('LOG'),
        timestamp: nowIso,
        leadId: lead.id,
        leadName: lead.props.fullName,
        ruleId: `TAG:${normalizedTag}`,
        ruleName: `Automatización Etiqueta ${normalizedTag}`,
        stageEvaluated: lead.props.currentStageId,
        conditionsChecked: [
          {
            condition: 'Etiqueta operativa ejecutada',
            passed: true,
            actualValue: normalizedTag,
          },
        ],
        verdict: 'SIGUIENTE_ACCION_GENERADA',
        actionTaken: actionsExecuted.join('; '),
        advisorResponsible: actor.name,
      };
      this.decisionLogRepository.append(decisionLog);
    }

    return {
      tag: normalizedTag,
      actionsExecuted,
      lead: lead.toJSON(),
      createdTask,
      createdReminder,
      sentMessage,
      decisionLog,
    };
  }
}
