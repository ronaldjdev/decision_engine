import type { DeterministicRule } from '../domain/DeterministicRule.ts';
import type { RuleRepository } from '../domain/ports/RuleRepository.ts';

export class InMemoryRuleRepository implements RuleRepository {
  private readonly rules = new Map<string, DeterministicRule>();

  constructor(initialRules: readonly DeterministicRule[] = []) {
    for (const rule of initialRules) {
      this.rules.set(rule.code, rule);
    }
  }

  public findAll(): DeterministicRule[] {
    return Array.from(this.rules.values());
  }

  public findByCode(code: string): DeterministicRule | undefined {
    return this.rules.get(code);
  }

  public save(rule: DeterministicRule): void {
    this.rules.set(rule.code, rule);
  }

  public delete(code: string): boolean {
    return this.rules.delete(code);
  }
}
