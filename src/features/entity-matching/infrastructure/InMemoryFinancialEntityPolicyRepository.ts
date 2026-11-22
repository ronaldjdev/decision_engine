import type { FinancialEntityPolicy } from '../domain/FinancialEntityPolicy.ts';
import type { FinancialEntityPolicyRepository } from '../domain/ports/FinancialEntityPolicyRepository.ts';

export class InMemoryFinancialEntityPolicyRepository
  implements FinancialEntityPolicyRepository
{
  private readonly policies = new Map<string, FinancialEntityPolicy>();

  constructor(initialPolicies: readonly FinancialEntityPolicy[] = []) {
    for (const policy of initialPolicies) {
      this.policies.set(policy.entityName, structuredClone(policy));
    }
  }

  public findAll(): FinancialEntityPolicy[] {
    return Array.from(this.policies.values()).map((p) => structuredClone(p));
  }

  public findByName(entityName: string): FinancialEntityPolicy | undefined {
    const found = this.policies.get(entityName);
    return found ? structuredClone(found) : undefined;
  }

  public save(policy: FinancialEntityPolicy): void {
    this.policies.set(policy.entityName, structuredClone(policy));
  }
}
