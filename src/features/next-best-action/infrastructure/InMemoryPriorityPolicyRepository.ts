import type { PriorityPolicyConfig } from '../domain/PriorityPolicy.ts';
import type { PriorityPolicyRepository } from '../domain/ports/PriorityPolicyRepository.ts';

export class InMemoryPriorityPolicyRepository
  implements PriorityPolicyRepository
{
  private config: PriorityPolicyConfig;

  constructor(initialConfig: PriorityPolicyConfig) {
    this.config = structuredClone(initialConfig);
  }

  public get(): PriorityPolicyConfig {
    return structuredClone(this.config);
  }

  public save(config: PriorityPolicyConfig): void {
    this.config = structuredClone(config);
  }
}
