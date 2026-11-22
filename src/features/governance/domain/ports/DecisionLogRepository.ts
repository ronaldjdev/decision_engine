import type { EngineDecisionLog } from '../EngineDecisionLog.ts';

export interface DecisionLogFilter {
  leadId?: string;
  ruleId?: string;
  verdict?: EngineDecisionLog['verdict'];
  limit?: number;
}

export interface DecisionLogRepository {
  append(log: EngineDecisionLog): void;
  find(filter?: DecisionLogFilter): EngineDecisionLog[];
}
