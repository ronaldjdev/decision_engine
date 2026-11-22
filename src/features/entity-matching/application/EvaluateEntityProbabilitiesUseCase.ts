import { NotFoundError } from '../../../shared/domain/DomainError.ts';
import type { FinancialParametersStore } from '../../../shared/domain/value-objects/FinancialParameters.ts';
import type { RuleRepository } from '../../governance/domain/ports/RuleRepository.ts';
import type { LeadRepository } from '../../leads/domain/ports/LeadRepository.ts';
import type { FinancialEntityProbability } from '../domain/FinancialEntityProbability.ts';
import { MultiEntityProbabilityService } from '../domain/MultiEntityProbabilityService.ts';
import type { FinancialEntityPolicyRepository } from '../domain/ports/FinancialEntityPolicyRepository.ts';

export class EvaluateEntityProbabilitiesUseCase {
  private readonly leadRepository: LeadRepository;
  private readonly policyRepository: FinancialEntityPolicyRepository;
  private readonly ruleRepository: RuleRepository;
  private readonly financialParamsStore: FinancialParametersStore;
  private readonly service = new MultiEntityProbabilityService();

  constructor(deps: {
    leadRepository: LeadRepository;
    policyRepository: FinancialEntityPolicyRepository;
    ruleRepository: RuleRepository;
    financialParamsStore: FinancialParametersStore;
  }) {
    this.leadRepository = deps.leadRepository;
    this.policyRepository = deps.policyRepository;
    this.ruleRepository = deps.ruleRepository;
    this.financialParamsStore = deps.financialParamsStore;
  }

  public execute(leadId: string): FinancialEntityProbability[] {
    const lead = this.leadRepository.findById(leadId);
    if (!lead) {
      throw new NotFoundError('Lead', leadId);
    }

    return this.service.evaluate({
      lead,
      policies: this.policyRepository.findAll(),
      rules: this.ruleRepository.findAll(),
      financialParams: this.financialParamsStore.get(),
    });
  }
}
