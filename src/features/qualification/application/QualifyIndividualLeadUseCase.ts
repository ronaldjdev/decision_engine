import type { Clock } from '../../../shared/domain/Clock.ts';
import { NotFoundError } from '../../../shared/domain/DomainError.ts';
import type { IdGenerator } from '../../../shared/domain/IdGenerator.ts';
import type { FinancialParametersStore } from '../../../shared/domain/value-objects/FinancialParameters.ts';
import type { FinancialEntityPolicyRepository } from '../../entity-matching/domain/ports/FinancialEntityPolicyRepository.ts';
import type { DecisionLogRepository } from '../../governance/domain/ports/DecisionLogRepository.ts';
import type { ActorContext } from '../../governance/domain/Role.ts';
import type { LeadRepository } from '../../leads/domain/ports/LeadRepository.ts';
import { DeterministicQualifierService } from '../domain/DeterministicQualifierService.ts';
import type { BulkQualificationResultItem } from '../domain/QualificationModels.ts';

/**
 * Caso de Uso del Sub-motor 3: califica individualmente un `Lead`, actualiza su `railTier`,
 * `railScore`, `priority` y `cadenceState`, y registra el dictamen en `EngineDecisionLog`.
 */
export class QualifyIndividualLeadUseCase {
  private readonly leadRepository: LeadRepository;
  private readonly policyRepository: FinancialEntityPolicyRepository;
  private readonly decisionLogRepository: DecisionLogRepository;
  private readonly financialParamsStore: FinancialParametersStore;
  private readonly clock: Clock;
  private readonly idGenerator: IdGenerator;
  private readonly qualifier = new DeterministicQualifierService();

  constructor(deps: {
    leadRepository: LeadRepository;
    policyRepository: FinancialEntityPolicyRepository;
    decisionLogRepository: DecisionLogRepository;
    financialParamsStore: FinancialParametersStore;
    clock: Clock;
    idGenerator: IdGenerator;
  }) {
    this.leadRepository = deps.leadRepository;
    this.policyRepository = deps.policyRepository;
    this.decisionLogRepository = deps.decisionLogRepository;
    this.financialParamsStore = deps.financialParamsStore;
    this.clock = deps.clock;
    this.idGenerator = deps.idGenerator;
  }

  public execute(
    actor: ActorContext,
    leadId: string,
  ): BulkQualificationResultItem {
    const lead = this.leadRepository.findById(leadId);
    if (!lead) {
      throw new NotFoundError('Lead', leadId);
    }

    const selectedPolicy = lead.props.selectedFinanciera
      ? this.policyRepository.findByName(lead.props.selectedFinanciera)
      : undefined;

    const result = this.qualifier.evaluate({
      lead,
      financialParams: this.financialParamsStore.get(),
      clock: this.clock,
      entityRateOverride: selectedPolicy
        ? {
            rateEA: selectedPolicy.rateEA,
            termMonths: Math.min(
              selectedPolicy.maxTermMonths,
              this.financialParamsStore.get().defaultTermMonths,
            ),
          }
        : undefined,
    });

    lead.props.calculatedLibranzaCapacity = result.calculatedCapacity;
    lead.props.railTier = result.railTier;
    lead.props.railScore = result.railScore;
    lead.props.priority = result.priority;
    lead.props.cadenceState = {
      channel: result.cadenceChannel,
      step: result.cadenceStep,
      retryCount: lead.props.cadenceState.retryCount,
      nextRetrySchedule: result.nextRetrySchedule,
    };
    lead.props.updatedAt = this.clock.nowIso();
    this.leadRepository.save(lead);

    this.decisionLogRepository.append({
      id: this.idGenerator.next('LOG'),
      timestamp: this.clock.nowIso(),
      leadId: lead.id,
      leadName: lead.props.fullName,
      ruleId: 'R-QUAL-DETERMINISTIC',
      ruleName: 'Calificación Determinística y Clasificación por Tier',
      stageEvaluated: lead.props.currentStageId,
      conditionsChecked: [
        {
          condition: 'Score determinístico calculado',
          passed: result.railTier !== 'DECLINADO',
          actualValue: result.railScore,
        },
        {
          condition: 'Capacidad Ley 1527 vs Cuota Estimada',
          passed: result.calculatedCapacity >= result.estimatedInstallment,
          actualValue: {
            capacity: result.calculatedCapacity,
            estimatedInstallment: result.estimatedInstallment,
          },
        },
      ],
      verdict:
        result.railTier === 'DECLINADO'
          ? 'BLOQUEADO'
          : 'SIGUIENTE_ACCION_GENERADA',
      actionTaken: `Clasificado como ${result.railTier} (${result.qualificationVerdict}, ${result.railScore} pts). ${result.nextBestAction}`,
      advisorResponsible: actor.name,
    });

    return result;
  }
}
