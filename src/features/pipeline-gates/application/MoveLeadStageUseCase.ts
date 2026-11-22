import type { Clock } from '../../../shared/domain/Clock.ts';
import { NotFoundError } from '../../../shared/domain/DomainError.ts';
import type { IdGenerator } from '../../../shared/domain/IdGenerator.ts';
import type { FinancialParametersStore } from '../../../shared/domain/value-objects/FinancialParameters.ts';
import type { LeadProps } from '../../../shared/domain/value-objects/Lead.ts';
import type {
  PipelineBoard,
  PipelineStageId,
} from '../../../shared/domain/value-objects/PipelineStage.ts';
import { normalizeStageId } from '../../../shared/domain/value-objects/PipelineStage.ts';
import type { EngineDecisionLog } from '../../governance/domain/EngineDecisionLog.ts';
import type { DecisionLogRepository } from '../../governance/domain/ports/DecisionLogRepository.ts';
import type { ExceptionRequestRepository } from '../../governance/domain/ports/ExceptionRequestRepository.ts';
import type { RuleRepository } from '../../governance/domain/ports/RuleRepository.ts';
import type { ActorContext } from '../../governance/domain/Role.ts';
import { assertCanPerform } from '../../governance/domain/Role.ts';
import type { BoardRepository } from '../../leads/domain/ports/BoardRepository.ts';
import type { LeadRepository } from '../../leads/domain/ports/LeadRepository.ts';
import { PipelineGateEvaluator } from '../domain/PipelineGateEvaluator.ts';
import type { TransitionCheckResult } from '../domain/TransitionCheckResult.ts';

export interface MoveLeadStageResult {
  readonly moved: boolean;
  readonly check: TransitionCheckResult;
  readonly lead: LeadProps;
  readonly decisionLog: EngineDecisionLog;
  readonly becameClient: boolean;
}

/**
 * Caso de Uso del Sub-motor 1: ejecuta la transición de etapa de un `Lead` (`moveLeadStage`).
 *
 * Evalúa compuertas mediante `PipelineGateEvaluator`, valida permiso `stage:force_override`
 * si se solicita omisión manual, transforma automáticamente en Cliente Activo al llegar a
 * desembolso/etapa final y persiste una entrada inmutable en `EngineDecisionLog`.
 */
export class MoveLeadStageUseCase {
  private readonly leadRepository: LeadRepository;
  private readonly boardRepository: BoardRepository;
  private readonly ruleRepository: RuleRepository;
  private readonly exceptionRepository: ExceptionRequestRepository;
  private readonly decisionLogRepository: DecisionLogRepository;
  private readonly financialParamsStore: FinancialParametersStore;
  private readonly clock: Clock;
  private readonly idGenerator: IdGenerator;
  private readonly evaluator = new PipelineGateEvaluator();

  constructor(deps: {
    leadRepository: LeadRepository;
    boardRepository: BoardRepository;
    ruleRepository: RuleRepository;
    exceptionRepository: ExceptionRequestRepository;
    decisionLogRepository: DecisionLogRepository;
    financialParamsStore: FinancialParametersStore;
    clock: Clock;
    idGenerator: IdGenerator;
  }) {
    this.leadRepository = deps.leadRepository;
    this.boardRepository = deps.boardRepository;
    this.ruleRepository = deps.ruleRepository;
    this.exceptionRepository = deps.exceptionRepository;
    this.decisionLogRepository = deps.decisionLogRepository;
    this.financialParamsStore = deps.financialParamsStore;
    this.clock = deps.clock;
    this.idGenerator = deps.idGenerator;
  }

  public execute(
    actor: ActorContext,
    input: {
      leadId: string;
      targetStageId: PipelineStageId;
      forceOverride?: boolean;
    },
  ): MoveLeadStageResult {
    const lead = this.leadRepository.findById(input.leadId);
    if (!lead) {
      throw new NotFoundError('Lead', input.leadId);
    }

    const board = this.boardRepository.findById(lead.props.boardId);
    if (!board) {
      throw new NotFoundError('Tablero', lead.props.boardId);
    }

    if (input.forceOverride) {
      assertCanPerform(actor, 'stage:force_override');
    }

    const check = this.evaluator.evaluate({
      lead,
      board,
      targetStageId: input.targetStageId,
      rules: this.ruleRepository.findAll(),
      financialParams: this.financialParamsStore.get(),
      findApprovedException: (ruleCode) =>
        this.exceptionRepository.findApprovedForLeadAndRule(lead.id, ruleCode),
    });

    const normalizedTarget = normalizeStageId(input.targetStageId);
    const nowIso = this.clock.nowIso();

    if (!check.allowed && !input.forceOverride) {
      const log: EngineDecisionLog = {
        id: this.idGenerator.next('LOG'),
        timestamp: nowIso,
        leadId: lead.id,
        leadName: lead.props.fullName,
        ruleId: check.ruleId ?? 'R-GATE-BLOCK',
        ruleName: check.ruleName ?? 'Compuerta de Transición',
        stageEvaluated: normalizedTarget,
        conditionsChecked: check.conditionsChecked,
        verdict: 'BLOQUEADO',
        actionTaken: `Transición a '${normalizedTarget}' bloqueada: ${check.reason}`,
        advisorResponsible: actor.name,
      };
      this.decisionLogRepository.append(log);

      return {
        moved: false,
        check,
        lead: lead.toJSON(),
        decisionLog: log,
        becameClient: false,
      };
    }

    const shouldBecomeClient = this.shouldMarkAsClient(board, normalizedTarget);
    const wasAlreadyClient = lead.props.isClient;
    const fromStage = lead.props.currentStageId;

    lead.moveToStage(normalizedTarget, nowIso, shouldBecomeClient);
    lead.addNote(
      this.idGenerator.next('NOTE'),
      input.forceOverride && !check.allowed
        ? `Etapa movida por override (${actor.role}:${actor.name}) de '${fromStage}' a '${normalizedTarget}'.`
        : `Etapa actualizada de '${fromStage}' a '${normalizedTarget}'.${shouldBecomeClient && !wasAlreadyClient ? ' Lead transformado automáticamente a Cliente Activo.' : ''}`,
      actor.name,
      nowIso,
    );

    this.leadRepository.save(lead);

    const log: EngineDecisionLog = {
      id: this.idGenerator.next('LOG'),
      timestamp: nowIso,
      leadId: lead.id,
      leadName: lead.props.fullName,
      ruleId:
        input.forceOverride && !check.allowed
          ? 'R-OVERRIDE-AUTH'
          : (check.ruleId ?? 'R-STAGE-TRANSITION'),
      ruleName:
        input.forceOverride && !check.allowed
          ? 'Override Autorizado de Compuerta'
          : 'Compuerta de Transición del Pipeline',
      stageEvaluated: normalizedTarget,
      conditionsChecked: check.conditionsChecked,
      verdict: 'AUTORIZADO',
      actionTaken: `Lead movido de '${fromStage}' a '${normalizedTarget}'${shouldBecomeClient && !wasAlreadyClient ? ' (Cliente Activo activado)' : ''}.`,
      advisorResponsible: actor.name,
    };
    this.decisionLogRepository.append(log);

    return {
      moved: true,
      check: input.forceOverride && !check.allowed
        ? {
            ...check,
            allowed: true,
            reason: `Autorizado mediante forceOverride por ${actor.role} (${actor.name}).`,
          }
        : check,
      lead: lead.toJSON(),
      decisionLog: log,
      becameClient: shouldBecomeClient && !wasAlreadyClient,
    };
  }

  private shouldMarkAsClient(
    board: PipelineBoard,
    targetStageId: PipelineStageId,
  ): boolean {
    if (
      targetStageId === 'desembolsado' ||
      targetStageId.toLowerCase().includes('desembolso')
    ) {
      return true;
    }
    const nonClosureStages = board.stages.filter((s) => !s.isTerminal);
    if (nonClosureStages.length > 2) {
      const sorted = [...nonClosureStages].sort((a, b) => a.order - b.order);
      const last = sorted[sorted.length - 1];
      if (last && last.id === targetStageId) {
        return true;
      }
    }
    return false;
  }
}
