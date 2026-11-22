import type { PriorityPolicyConfig } from '../PriorityPolicy.ts';

export interface PriorityPolicyRepository {
  get(): PriorityPolicyConfig;
  save(config: PriorityPolicyConfig): void;
}
