import type { Clock } from '../../../shared/domain/Clock.ts';
import { ValidationError } from '../../../shared/domain/DomainError.ts';
import type { ActorContext } from '../../governance/domain/Role.ts';
import { assertCanPerform } from '../../governance/domain/Role.ts';
import type {
  PriorityPolicyConfig,
  PriorityPolicyItem,
} from '../domain/PriorityPolicy.ts';
import type { PriorityPolicyRepository } from '../domain/ports/PriorityPolicyRepository.ts';

export class UpdatePriorityPolicyUseCase {
  private readonly policyRepository: PriorityPolicyRepository;
  private readonly clock: Clock;

  constructor(deps: {
    policyRepository: PriorityPolicyRepository;
    clock: Clock;
  }) {
    this.policyRepository = deps.policyRepository;
    this.clock = deps.clock;
  }

  public getCurrent(): PriorityPolicyConfig {
    return this.policyRepository.get();
  }

  public execute(
    actor: ActorContext,
    items: readonly PriorityPolicyItem[],
  ): PriorityPolicyConfig {
    assertCanPerform(actor, 'priority_policy:update');
    if (items.length === 0) {
      throw new ValidationError('La política de priorización debe contener al menos un tipo de caso.');
    }
    const config: PriorityPolicyConfig = {
      updatedAt: this.clock.nowIso(),
      updatedBy: actor.name,
      items: [...items].sort((a, b) => a.rank - b.rank),
    };
    this.policyRepository.save(config);
    return config;
  }
}
