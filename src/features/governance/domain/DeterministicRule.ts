import { DomainError } from '../../../shared/domain/DomainError.ts';
import type { PipelineStageId } from '../../../shared/domain/value-objects/PipelineStage.ts';

export type RuleCategory = 'HARD_RESTRICTION' | 'CONFIGURABLE_POLICY';

export type RuleGovernanceOwner =
  | 'LEY_1527_COMPLIANCE'
  | 'GERENCIA_RIESGOS'
  | 'COMITE_COMERCIAL'
  | 'ADMINISTRACION';

export type RuleConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'all_documents_verified';

export interface RuleCondition {
  readonly field: string;
  readonly operator: RuleConditionOperator;
  readonly value?: unknown;
  readonly description: string;
}

export interface DeterministicRuleProps {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly category: RuleCategory;
  readonly governanceOwner: RuleGovernanceOwner;
  readonly stage: PipelineStageId | 'ALL';
  readonly isActive: boolean;
  readonly isBuiltIn: boolean;
  readonly conditions: readonly RuleCondition[];
  readonly failureMessage?: string;
}

/**
 * Agregado de Regla Determinística del catálogo de gobernanza (`R-LIB-001`..`R-LIB-008` y reglas dinámicas).
 *
 * Invariante clave: las reglas con categoría `HARD_RESTRICTION` (cumplimiento Ley 1527)
 * son inmutables respecto a su activación y nunca pueden desactivarse.
 */
export class DeterministicRule {
  private props: DeterministicRuleProps;

  private constructor(props: DeterministicRuleProps) {
    this.props = {
      ...props,
      conditions: props.conditions.map((c) => ({ ...c })),
    };
  }

  public static create(props: DeterministicRuleProps): DeterministicRule {
    return new DeterministicRule(props);
  }

  public get code(): string {
    return this.props.code;
  }

  public get name(): string {
    return this.props.name;
  }

  public get description(): string {
    return this.props.description;
  }

  public get category(): RuleCategory {
    return this.props.category;
  }

  public get governanceOwner(): RuleGovernanceOwner {
    return this.props.governanceOwner;
  }

  public get stage(): PipelineStageId | 'ALL' {
    return this.props.stage;
  }

  public get isActive(): boolean {
    return this.props.isActive;
  }

  public get isBuiltIn(): boolean {
    return this.props.isBuiltIn;
  }

  public get conditions(): readonly RuleCondition[] {
    return this.props.conditions;
  }

  public get failureMessage(): string | undefined {
    return this.props.failureMessage;
  }

  public setActive(active: boolean): DeterministicRule {
    if (this.props.category === 'HARD_RESTRICTION' && !active) {
      throw new DomainError(
        'HARD_RESTRICTION_IMMUTABLE',
        `La regla '${this.props.code}' (${this.props.name}) es una Restricción Dura de cumplimiento legal y no puede ser desactivada.`,
        { ruleCode: this.props.code },
      );
    }
    return new DeterministicRule({
      ...this.props,
      isActive: active,
    });
  }

  public toJSON(): DeterministicRuleProps {
    return structuredClone(this.props);
  }
}
