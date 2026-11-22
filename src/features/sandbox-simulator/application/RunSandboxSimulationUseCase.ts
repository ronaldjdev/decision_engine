import type { Clock } from '../../../shared/domain/Clock.ts';
import type { FinancialParametersStore } from '../../../shared/domain/value-objects/FinancialParameters.ts';
import type { FinancialEntityPolicyRepository } from '../../entity-matching/domain/ports/FinancialEntityPolicyRepository.ts';
import type { RuleRepository } from '../../governance/domain/ports/RuleRepository.ts';
import { SandboxSimulatorService } from '../domain/SandboxSimulatorService.ts';
import type {
  SandboxSimulationInput,
  SandboxSimulationResult,
} from '../domain/SimulationModels.ts';

export class RunSandboxSimulationUseCase {
  private readonly policyRepository: FinancialEntityPolicyRepository;
  private readonly ruleRepository: RuleRepository;
  private readonly financialParamsStore: FinancialParametersStore;
  private readonly clock: Clock;
  private readonly simulator = new SandboxSimulatorService();

  constructor(deps: {
    policyRepository: FinancialEntityPolicyRepository;
    ruleRepository: RuleRepository;
    financialParamsStore: FinancialParametersStore;
    clock: Clock;
  }) {
    this.policyRepository = deps.policyRepository;
    this.ruleRepository = deps.ruleRepository;
    this.financialParamsStore = deps.financialParamsStore;
    this.clock = deps.clock;
  }

  public execute(sim: SandboxSimulationInput): SandboxSimulationResult {
    return this.simulator.simulate({
      sim,
      policies: this.policyRepository.findAll(),
      rules: this.ruleRepository.findAll(),
      financialParams: this.financialParamsStore.get(),
      clock: this.clock,
    });
  }
}
