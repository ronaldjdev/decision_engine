import type { Clock } from '../../../shared/domain/Clock.ts';
import { NotFoundError } from '../../../shared/domain/DomainError.ts';
import type { IdGenerator } from '../../../shared/domain/IdGenerator.ts';
import type {
  CommercialTask,
  LeadProps,
  Reminder,
} from '../../../shared/domain/value-objects/Lead.ts';
import type { EngineDecisionLog } from '../../governance/domain/EngineDecisionLog.ts';
import type { DecisionLogRepository } from '../../governance/domain/ports/DecisionLogRepository.ts';
import type { ActorContext } from '../../governance/domain/Role.ts';
import type { LeadRepository } from '../../leads/domain/ports/LeadRepository.ts';
import type { MoveLeadStageUseCase } from '../../pipeline-gates/application/MoveLeadStageUseCase.ts';
import type { TransitionCheckResult } from '../../pipeline-gates/domain/TransitionCheckResult.ts';
import type { TaskOutcome } from '../domain/TaskOutcomeRules.ts';
import { resolveNextBestActionForOutcome } from '../domain/TaskOutcomeRules.ts';

export interface CompleteTaskResult {
  readonly completedTask: CommercialTask;
  readonly generatedTask?: CommercialTask;
  readonly generatedReminder?: Reminder;
  readonly stageTransition?: {
    readonly attempted: boolean;
    readonly moved: boolean;
    readonly check: TransitionCheckResult;
  };
  readonly lead: LeadProps;
  readonly decisionLog: EngineDecisionLog;
}

/**
 * Caso de Uso del Sub-motor 4: completa una tarea comercial y calcula la Siguiente Mejor Acción (`completeTask`).
 *
 * Marca la tarea como completada, intenta avanzar el lead a la siguiente etapa unificada
 * (antes de crear la nueva tarea obligatoria para no auto-bloquearse con `R-TSK-MANDATORY`),
 * genera la siguiente tarea/recordatorio y deja traza en `EngineDecisionLog`.
 */
export class CompleteTaskUseCase {
  private readonly leadRepository: LeadRepository;
  private readonly moveLeadStage: MoveLeadStageUseCase;
  private readonly decisionLogRepository: DecisionLogRepository;
  private readonly clock: Clock;
  private readonly idGenerator: IdGenerator;

  constructor(deps: {
    leadRepository: LeadRepository;
    moveLeadStage: MoveLeadStageUseCase;
    decisionLogRepository: DecisionLogRepository;
    clock: Clock;
    idGenerator: IdGenerator;
  }) {
    this.leadRepository = deps.leadRepository;
    this.moveLeadStage = deps.moveLeadStage;
    this.decisionLogRepository = deps.decisionLogRepository;
    this.clock = deps.clock;
    this.idGenerator = deps.idGenerator;
  }

  public execute(
    actor: ActorContext,
    input: {
      leadId: string;
      taskId: string;
      outcome: TaskOutcome;
      notes?: string;
      agreedAppointmentIso?: string;
    },
  ): CompleteTaskResult {
    const lead = this.leadRepository.findById(input.leadId);
    if (!lead) {
      throw new NotFoundError('Lead', input.leadId);
    }

    const task = lead.props.tasks.find((t) => t.id === input.taskId);
    if (!task) {
      throw new NotFoundError('Tarea', input.taskId);
    }

    const nowIso = this.clock.nowIso();
    task.status = 'completada';
    task.completedAt = nowIso;
    task.outcome = input.outcome;

    if (lead.props.currentMandatoryTaskId === task.id) {
      lead.props.currentMandatoryTaskId = undefined;
    }

    if (input.outcome === 'contacto_exitoso_interesado') {
      lead.addNote(
        this.idGenerator.next('NOTE'),
        input.notes ?? 'Contacto exitoso: cliente interesado en crédito de libranza.',
        actor.name,
        nowIso,
      );
    } else if (input.notes) {
      lead.addNote(this.idGenerator.next('NOTE'), input.notes, actor.name, nowIso);
    }

    if (input.agreedAppointmentIso) {
      lead.props.contactPreferences = {
        preferredChannel:
          lead.props.contactPreferences?.preferredChannel ?? 'voip_call',
        ...lead.props.contactPreferences,
        agreedAppointment: input.agreedAppointmentIso,
      };
    }

    lead.props.processState.lastFollowUpAt = nowIso;
    this.leadRepository.save(lead);

    const plan = resolveNextBestActionForOutcome(input.outcome);

    // Intentar mover de etapa ANTES de crear la siguiente tarea obligatoria para no auto-bloquearse con R-TSK-MANDATORY
    let stageTransition: CompleteTaskResult['stageTransition'];
    if (plan.targetStageId && plan.targetStageId !== lead.props.currentStageId) {
      const moveResult = this.moveLeadStage.execute(actor, {
        leadId: lead.id,
        targetStageId: plan.targetStageId,
      });
      stageTransition = {
        attempted: true,
        moved: moveResult.moved,
        check: moveResult.check,
      };
    }

    // Recargar el lead actualizado después de la posible transición
    const refreshedLead = this.leadRepository.findById(lead.id)!;

    let generatedTask: CommercialTask | undefined;
    if (plan.nextTask) {
      generatedTask = {
        id: this.idGenerator.next('TSK'),
        leadId: refreshedLead.id,
        title: plan.nextTask.title,
        category: plan.nextTask.category,
        status: 'pendiente',
        mandatory: plan.nextTask.mandatory,
        priority: plan.nextTask.priority,
        dueAt: this.clock.addMinutesIso(plan.nextTask.slaMinutes),
        slaMinutes: plan.nextTask.slaMinutes,
        createdAt: nowIso,
        assignedAdvisor: refreshedLead.props.assignedAdvisor,
      };
      refreshedLead.addTask(generatedTask);
    }

    let generatedReminder: Reminder | undefined;
    if (plan.reminder) {
      generatedReminder = {
        id: this.idGenerator.next('REM'),
        leadId: refreshedLead.id,
        message: plan.reminder.message,
        scheduledFor:
          input.agreedAppointmentIso ??
          this.clock.addMinutesIso(plan.reminder.delayMinutes),
        priority: plan.reminder.priority,
        createdAt: nowIso,
        completed: false,
      };
      refreshedLead.addReminder(generatedReminder);
    }

    this.leadRepository.save(refreshedLead);

    const decisionLog: EngineDecisionLog = {
      id: this.idGenerator.next('LOG'),
      timestamp: nowIso,
      leadId: refreshedLead.id,
      leadName: refreshedLead.props.fullName,
      ruleId: 'R-NBA-COMPLETE-TASK',
      ruleName: 'Motor de Siguiente Mejor Acción',
      stageEvaluated: refreshedLead.props.currentStageId,
      conditionsChecked: [
        {
          condition: 'Resultado de tarea completada',
          passed: true,
          actualValue: input.outcome,
        },
        ...(stageTransition
          ? [
              {
                condition: `Transición automática a '${plan.targetStageId}'`,
                passed: stageTransition.moved,
                actualValue: stageTransition.check.reason,
              },
            ]
          : []),
      ],
      verdict: 'SIGUIENTE_ACCION_GENERADA',
      actionTaken: plan.actionSummary,
      advisorResponsible: actor.name,
    };
    this.decisionLogRepository.append(decisionLog);

    return {
      completedTask: { ...task },
      generatedTask,
      generatedReminder,
      stageTransition,
      lead: refreshedLead.toJSON(),
      decisionLog,
    };
  }
}
