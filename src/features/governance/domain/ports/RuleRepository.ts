import type { DeterministicRule } from '../DeterministicRule.ts';

export interface RuleRepository {
  findAll(): DeterministicRule[];
  findByCode(code: string): DeterministicRule | undefined;
  save(rule: DeterministicRule): void;
  delete(code: string): boolean;
}
