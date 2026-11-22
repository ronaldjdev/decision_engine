import { NotFoundError } from '../../../shared/domain/DomainError.ts';
import type { FinancialParametersStore } from '../../../shared/domain/value-objects/FinancialParameters.ts';
import type { PipelineStageId } from '../../../shared/domain/value-objects/PipelineStage.ts';
import type { ExceptionRequestRepository } from '../../governance/domain/ports/ExceptionRequestRepository.ts';
import type { RuleRepository } from '../../governance/domain/ports/RuleRepository.ts';
import type { BoardRepository } from '../../leads/domain/ports/BoardRepository.ts';
import type { LeadRepository } from '../../leads/domain/ports/LeadRepository.ts';
import { PipelineGateEvaluator } from '../domain/PipelineGateEvaluator.ts';
import type { TransitionCheckResult } from '../domain/TransitionCheckResult.ts';

export class CheckStageTransitionUseCase {
  private readonly leadRepository: LeadRepository;
  private readonly boardRepository: BoardRepository;
  private readonly ruleRepository: RuleRepository;
  private readonly exceptionRepository: ExceptionRequestRepository;
  private readonly financialParamsStore: FinancialParametersStore;
  private readonly evaluator = new PipelineGateEvaluator();

  constructor(deps: {
    leadRepository: LeadRepository;
    boardRepository: BoardRepository;
    ruleRepository: RuleRepository;
    exceptionRepository: ExceptionRequestRepository;
    financialParamsStore: FinancialParametersStore;
  }) {
    this.leadRepository = deps.leadRepository;
    this.boardRepository = deps.boardRepository;
    this.ruleRepository = deps.ruleRepository;
    this.exceptionRepository = deps.exceptionRepository;
    this.financialParamsStore = deps.financialParamsStore;
  }

  public execute(input: {
    leadId: string;
    targetStageId: PipelineStageId;
  }): TransitionCheckResult {
    const lead = this.leadRepository.findById(input.leadId);
    if (!lead) {
      throw new NotFoundError('Lead', input.leadId);
    }

    const board = this.boardRepository.findById(lead.props.boardId);
    if (!board) {
      throw new NotFoundError('Tablero', lead.props.boardId);
    }

    return this.evaluator.evaluate({
      lead,
      board,
      targetStageId: input.targetStageId,
      rules: this.ruleRepository.findAll(),
      financialParams: this.financialParamsStore.get(),
      findApprovedException: (ruleCode) =>
        this.exceptionRepository.findApprovedForLeadAndRule(lead.id, ruleCode),
    });
  }
}
