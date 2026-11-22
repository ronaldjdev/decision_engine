import type { FinancialEntityPolicy } from '../FinancialEntityPolicy.ts';

export interface FinancialEntityPolicyRepository {
  findAll(): FinancialEntityPolicy[];
  findByName(entityName: string): FinancialEntityPolicy | undefined;
  save(policy: FinancialEntityPolicy): void;
}
