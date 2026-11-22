import type { Clock } from '../../../shared/domain/Clock.ts';
import { DomainError, NotFoundError } from '../../../shared/domain/DomainError.ts';
import type { IdGenerator } from '../../../shared/domain/IdGenerator.ts';
import { JustifiedExceptionRequest } from '../domain/JustifiedExceptionRequest.ts';
import type { DecisionLogRepository } from '../domain/ports/DecisionLogRepository.ts';
import type { ExceptionRequestRepository } from '../domain/ports/ExceptionRequestRepository.ts';
import type { RuleRepository } from '../domain/ports/RuleRepository.ts';
import type { ActorContext } from '../domain/Role.ts';
import { assertCanPerform } from '../domain/Role.ts';

/**
 * Caso de Uso de Gobernanza: flujo de Excepciones Justificadas (`JustifiedExceptionRequest`).
 *
 * Permite a asesores radicar excepciones sobre políticas configurables (nunca sobre
 * restricciones duras de Ley 1527) y a supervisores/administradores aprobarlas o rechazarlas
 * con trazabilidad completa en `EngineDecisionLog`.
 */
export class ManageExceptionsUseCase {
  private readonly exceptionRepository: ExceptionRequestRepository;
  private readonly ruleRepository: RuleRepository;
  private readonly decisionLogRepository: DecisionLogRepository;
  private readonly clock: Clock;
  private readonly idGenerator: IdGenerator;

  constructor(deps: {
    exceptionRepository: ExceptionRequestRepository;
    ruleRepository: RuleRepository;
    decisionLogRepository: DecisionLogRepository;
    clock: Clock;
    idGenerator: IdGenerator;
  }) {
    this.exceptionRepository = deps.exceptionRepository;
    this.ruleRepository = deps.ruleRepository;
    this.decisionLogRepository = deps.decisionLogRepository;
    this.clock = deps.clock;
    this.idGenerator = deps.idGenerator;
  }

  public listAll(): JustifiedExceptionRequest[] {
    return this.exceptionRepository.findAll();
  }

  public submitException(
    actor: ActorContext,
    input: { leadId: string; leadName?: string; ruleCode: string; justification: string },
  ): JustifiedExceptionRequest {
    assertCanPerform(actor, 'exception:request');
    const rule = this.ruleRepository.findByCode(input.ruleCode);
    if (!rule) {
      throw new NotFoundError('Regla', input.ruleCode);
    }
    if (rule.category === 'HARD_RESTRICTION') {
      throw new DomainError(
        'HARD_RESTRICTION_IMMUTABLE',
        `No se permiten excepciones sobre la restricción dura legal '${rule.code}' (${rule.name}).`,
        { ruleCode: rule.code },
      );
    }

    const request = JustifiedExceptionRequest.submit({
      id: this.idGenerator.next('EXC'),
      leadId: input.leadId,
      ruleCode: input.ruleCode,
      justification: input.justification,
      requestedBy: actor.name,
      requestedAt: this.clock.nowIso(),
    });
    this.exceptionRepository.save(request);

    this.decisionLogRepository.append({
      id: this.idGenerator.next('LOG'),
      timestamp: this.clock.nowIso(),
      leadId: input.leadId,
      leadName: input.leadName ?? input.leadId,
      ruleId: rule.code,
      ruleName: rule.name,
      stageEvaluated: rule.stage === 'ALL' ? 'lead_nuevo' : rule.stage,
      conditionsChecked: [
        {
          condition: 'Solicitud de excepción justificada radicada',
          passed: true,
          actualValue: input.justification,
        },
      ],
      verdict: 'SIGUIENTE_ACCION_GENERADA',
      actionTaken: `Excepción '${request.props.id}' radicada para revisión de supervisor.`,
      advisorResponsible: actor.name,
    });

    return request;
  }

  public reviewException(
    actor: ActorContext,
    input: {
      exceptionId: string;
      decision: 'aprobada' | 'rechazada';
      comment?: string;
    },
  ): JustifiedExceptionRequest {
    assertCanPerform(actor, 'exception:review');
    const existing = this.exceptionRepository.findById(input.exceptionId);
    if (!existing) {
      throw new NotFoundError('Excepción Justificada', input.exceptionId);
    }

    const reviewed = existing.review({
      decision: input.decision,
      reviewedBy: actor.name,
      reviewedAt: this.clock.nowIso(),
      comment: input.comment,
    });
    this.exceptionRepository.save(reviewed);

    this.decisionLogRepository.append({
      id: this.idGenerator.next('LOG'),
      timestamp: this.clock.nowIso(),
      leadId: reviewed.props.leadId,
      leadName: reviewed.props.leadId,
      ruleId: reviewed.props.ruleCode,
      ruleName: `Revisión de Excepción ${reviewed.props.id}`,
      stageEvaluated: 'lead_nuevo',
      conditionsChecked: [
        {
          condition: `Decisión de ${actor.role} sobre excepción`,
          passed: input.decision === 'aprobada',
          actualValue: input.decision,
        },
      ],
      verdict: input.decision === 'aprobada' ? 'AUTORIZADO' : 'BLOQUEADO',
      actionTaken: `Excepción '${reviewed.props.id}' ${input.decision} por ${actor.name}.`,
      advisorResponsible: actor.name,
    });

    return reviewed;
  }
}
