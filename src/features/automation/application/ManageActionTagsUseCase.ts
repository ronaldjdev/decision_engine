import { DomainError, NotFoundError } from '../../../shared/domain/DomainError.ts';
import type { ActorContext } from '../../governance/domain/Role.ts';
import { assertCanPerform } from '../../governance/domain/Role.ts';
import type { CommercialActionTag } from '../domain/ActionTag.ts';
import type { ActionTagRepository } from '../domain/ports/ActionTagRepository.ts';

export class ManageActionTagsUseCase {
  private readonly actionTagRepository: ActionTagRepository;

  constructor(actionTagRepository: ActionTagRepository) {
    this.actionTagRepository = actionTagRepository;
  }

  public listAll(): CommercialActionTag[] {
    return this.actionTagRepository.findAll();
  }

  public createTag(
    actor: ActorContext,
    input: Omit<CommercialActionTag, 'isStandard'>,
  ): CommercialActionTag {
    assertCanPerform(actor, 'action_tag:manage');
    const code = input.code.startsWith('#')
      ? input.code.toUpperCase()
      : `#${input.code.toUpperCase()}`;
    if (this.actionTagRepository.findByCode(code)) {
      throw new DomainError(
        'CONFLICT_ERROR',
        `La etiqueta operativa '${code}' ya existe.`,
        { code },
      );
    }
    const tag: CommercialActionTag = {
      ...input,
      code,
      isStandard: false,
    };
    this.actionTagRepository.save(tag);
    return tag;
  }

  public deleteTag(actor: ActorContext, code: string): void {
    assertCanPerform(actor, 'action_tag:manage');
    const normalized = code.startsWith('#') ? code.toUpperCase() : `#${code.toUpperCase()}`;
    const existing = this.actionTagRepository.findByCode(normalized);
    if (!existing) {
      throw new NotFoundError('Etiqueta Operativa', normalized);
    }
    if (existing.isStandard) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `La etiqueta estándar '${normalized}' no puede eliminarse.`,
      );
    }
    this.actionTagRepository.delete(normalized);
  }
}
