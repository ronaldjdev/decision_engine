import type { Clock } from '../../../shared/domain/Clock.ts';
import type { LeadRepository } from '../../leads/domain/ports/LeadRepository.ts';
import type { PrioritizedQueueEntry } from '../domain/PriorityPolicy.ts';
import { WorkQueuePrioritizer } from '../domain/PriorityPolicy.ts';
import type { PriorityPolicyRepository } from '../domain/ports/PriorityPolicyRepository.ts';

export class PrioritizeWorkQueueUseCase {
  private readonly leadRepository: LeadRepository;
  private readonly policyRepository: PriorityPolicyRepository;
  private readonly clock: Clock;
  private readonly prioritizer = new WorkQueuePrioritizer();

  constructor(deps: {
    leadRepository: LeadRepository;
    policyRepository: PriorityPolicyRepository;
    clock: Clock;
  }) {
    this.leadRepository = deps.leadRepository;
    this.policyRepository = deps.policyRepository;
    this.clock = deps.clock;
  }

  public execute(): PrioritizedQueueEntry[] {
    return this.prioritizer.prioritize(
      this.leadRepository.findAll(),
      this.policyRepository.get(),
      this.clock,
    );
  }
}
