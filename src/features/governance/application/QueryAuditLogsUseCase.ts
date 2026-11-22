import type { EngineDecisionLog } from '../domain/EngineDecisionLog.ts';
import type {
  DecisionLogFilter,
  DecisionLogRepository,
} from '../domain/ports/DecisionLogRepository.ts';

export class QueryAuditLogsUseCase {
  private readonly decisionLogRepository: DecisionLogRepository;

  constructor(decisionLogRepository: DecisionLogRepository) {
    this.decisionLogRepository = decisionLogRepository;
  }

  public execute(filter?: DecisionLogFilter): EngineDecisionLog[] {
    return this.decisionLogRepository.find(filter);
  }
}
