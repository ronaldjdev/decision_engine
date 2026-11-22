import type { JustifiedExceptionRequest } from '../domain/JustifiedExceptionRequest.ts';
import type { ExceptionRequestRepository } from '../domain/ports/ExceptionRequestRepository.ts';

export class InMemoryExceptionRequestRepository
  implements ExceptionRequestRepository
{
  private readonly store = new Map<string, JustifiedExceptionRequest>();

  public save(request: JustifiedExceptionRequest): void {
    this.store.set(request.props.id, request);
  }

  public findById(id: string): JustifiedExceptionRequest | undefined {
    return this.store.get(id);
  }

  public findAll(): JustifiedExceptionRequest[] {
    return Array.from(this.store.values());
  }

  public findApprovedForLeadAndRule(
    leadId: string,
    ruleCode: string,
  ): JustifiedExceptionRequest | undefined {
    for (const req of this.store.values()) {
      if (
        req.props.leadId === leadId &&
        req.props.ruleCode === ruleCode &&
        req.props.status === 'aprobada'
      ) {
        return req;
      }
    }
    return undefined;
  }
}
