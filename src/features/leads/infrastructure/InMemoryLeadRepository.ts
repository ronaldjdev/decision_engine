import type { Lead } from '../../../shared/domain/value-objects/Lead.ts';
import type { LeadRepository } from '../domain/ports/LeadRepository.ts';

export class InMemoryLeadRepository implements LeadRepository {
  private readonly leads = new Map<string, Lead>();

  constructor(initialLeads: readonly Lead[] = []) {
    for (const lead of initialLeads) {
      this.leads.set(lead.id, lead.clone());
    }
  }

  public findAll(): Lead[] {
    return Array.from(this.leads.values()).map((lead) => lead.clone());
  }

  public findById(id: string): Lead | undefined {
    const found = this.leads.get(id);
    return found ? found.clone() : undefined;
  }

  public save(lead: Lead): void {
    this.leads.set(lead.id, lead.clone());
  }

  public delete(id: string): boolean {
    return this.leads.delete(id);
  }
}
