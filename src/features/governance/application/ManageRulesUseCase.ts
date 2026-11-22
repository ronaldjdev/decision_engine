import { DomainError, NotFoundError } from '../../../shared/domain/DomainError.ts';
import type { DeterministicRuleProps } from '../domain/DeterministicRule.ts';
import { DeterministicRule } from '../domain/DeterministicRule.ts';
import type { RuleRepository } from '../domain/ports/RuleRepository.ts';
import type { ActorContext } from '../domain/Role.ts';
import { assertCanPerform } from '../domain/Role.ts';

/**
 * Caso de Uso de Gobernanza: administra el catálogo dinámico de reglas del motor (`R-LIB-001`..`R-LIB-008` y reglas custom).
 *
 * Aplica control de acceso RBAC:
 * - `advisor`: sin permisos de modificación.
 * - `supervisor`: puede activar/desactivar únicamente reglas `CONFIGURABLE_POLICY`.
 * - `admin`: creación, activación y eliminación de reglas (respetando inmutabilidad de restricciones duras legales).
 */
export class ManageRulesUseCase {
  private readonly ruleRepository: RuleRepository;

  constructor(ruleRepository: RuleRepository) {
    this.ruleRepository = ruleRepository;
  }

  public listRules(): DeterministicRule[] {
    return this.ruleRepository.findAll();
  }

  public createRule(
    actor: ActorContext,
    input: Omit<DeterministicRuleProps, 'isBuiltIn'>,
  ): DeterministicRule {
    assertCanPerform(actor, 'rule:create');
    if (this.ruleRepository.findByCode(input.code)) {
      throw new DomainError(
        'CONFLICT_ERROR',
        `Ya existe una regla registrada con el código '${input.code}'.`,
        { code: input.code },
      );
    }
    const rule = DeterministicRule.create({
      ...input,
      isBuiltIn: false,
    });
    this.ruleRepository.save(rule);
    return rule;
  }

  public toggleRule(
    actor: ActorContext,
    code: string,
    isActive: boolean,
  ): DeterministicRule {
    assertCanPerform(actor, 'rule:toggle_configurable');
    const existing = this.ruleRepository.findByCode(code);
    if (!existing) {
      throw new NotFoundError('Regla', code);
    }
    const updated = existing.setActive(isActive);
    this.ruleRepository.save(updated);
    return updated;
  }

  public deleteRule(actor: ActorContext, code: string): void {
    assertCanPerform(actor, 'rule:delete');
    const existing = this.ruleRepository.findByCode(code);
    if (!existing) {
      throw new NotFoundError('Regla', code);
    }
    if (existing.category === 'HARD_RESTRICTION' && existing.isBuiltIn) {
      throw new DomainError(
        'HARD_RESTRICTION_IMMUTABLE',
        `No es posible eliminar la restricción dura legal '${code}'.`,
        { code },
      );
    }
    this.ruleRepository.delete(code);
  }
}
