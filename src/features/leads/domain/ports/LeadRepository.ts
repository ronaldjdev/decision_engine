import type { Lead } from '../../../../shared/domain/value-objects/Lead.ts';

export interface LeadRepository {
  findAll(): Lead[];
  findById(id: string): Lead | undefined;
  save(lead: Lead): void;
  delete(id: string): boolean;
}
