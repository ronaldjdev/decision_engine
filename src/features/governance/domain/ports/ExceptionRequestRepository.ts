import type { JustifiedExceptionRequest } from '../JustifiedExceptionRequest.ts';

export interface ExceptionRequestRepository {
  save(request: JustifiedExceptionRequest): void;
  findById(id: string): JustifiedExceptionRequest | undefined;
  findAll(): JustifiedExceptionRequest[];
  findApprovedForLeadAndRule(
    leadId: string,
    ruleCode: string,
  ): JustifiedExceptionRequest | undefined;
}
