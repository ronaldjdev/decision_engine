import type { Clock } from '../../../shared/domain/Clock.ts';
import type { IdGenerator } from '../../../shared/domain/IdGenerator.ts';
import type { ActorContext } from '../../governance/domain/Role.ts';
import type { LeadRepository } from '../../leads/domain/ports/LeadRepository.ts';
import type {
  BulkQualificationBatch,
  BulkQualificationResultItem,
} from '../domain/QualificationModels.ts';
import type { QualifyIndividualLeadUseCase } from './QualifyIndividualLeadUseCase.ts';

/**
 * Caso de Uso del Sub-motor 3: ejecuta la calificación determinística en lote (`runBulkQualification`),
 * consolidando conteos por Tier (`TIER_A_PLUS` a `DECLINADO`) y detalle individual.
 */
export class RunBulkQualificationUseCase {
  private readonly leadRepository: LeadRepository;
  private readonly qualifyIndividual: QualifyIndividualLeadUseCase;
  private readonly clock: Clock;
  private readonly idGenerator: IdGenerator;

  constructor(deps: {
    leadRepository: LeadRepository;
    qualifyIndividual: QualifyIndividualLeadUseCase;
    clock: Clock;
    idGenerator: IdGenerator;
  }) {
    this.leadRepository = deps.leadRepository;
    this.qualifyIndividual = deps.qualifyIndividual;
    this.clock = deps.clock;
    this.idGenerator = deps.idGenerator;
  }

  public execute(
    actor: ActorContext,
    leadIds?: readonly string[],
  ): BulkQualificationBatch {
    const targetIds = leadIds
      ? [...leadIds]
      : this.leadRepository.findAll().map((l) => l.id);

    const items: BulkQualificationResultItem[] = targetIds.map((id) =>
      this.qualifyIndividual.execute(actor, id),
    );

    return {
      batchId: this.idGenerator.next('BATCH'),
      executedAt: this.clock.nowIso(),
      totalLeadsEvaluated: items.length,
      tierAPlusCount: items.filter((i) => i.railTier === 'TIER_A_PLUS').length,
      tierACount: items.filter((i) => i.railTier === 'TIER_A').length,
      tierBCount: items.filter((i) => i.railTier === 'TIER_B').length,
      tierConditionalCount: items.filter(
        (i) => i.railTier === 'TIER_C_CONDICIONAL',
      ).length,
      declinedCount: items.filter((i) => i.railTier === 'DECLINADO').length,
      items,
    };
  }
}
