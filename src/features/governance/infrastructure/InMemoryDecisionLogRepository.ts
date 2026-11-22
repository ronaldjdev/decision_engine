import type { EngineDecisionLog } from '../domain/EngineDecisionLog.ts';
import type {
  DecisionLogFilter,
  DecisionLogRepository,
} from '../domain/ports/DecisionLogRepository.ts';

export class InMemoryDecisionLogRepository implements DecisionLogRepository {
  private readonly logs: EngineDecisionLog[] = [];

  public append(log: EngineDecisionLog): void {
    this.logs.push(Object.freeze(structuredClone(log)));
  }

  public find(filter?: DecisionLogFilter): EngineDecisionLog[] {
    let result = [...this.logs];
    if (filter?.leadId) {
      result = result.filter((l) => l.leadId === filter.leadId);
    }
    if (filter?.ruleId) {
      result = result.filter((l) => l.ruleId === filter.ruleId);
    }
    if (filter?.verdict) {
      result = result.filter((l) => l.verdict === filter.verdict);
    }
    if (filter?.limit && filter.limit > 0) {
      result = result.slice(-filter.limit);
    }
    return result;
  }
}
