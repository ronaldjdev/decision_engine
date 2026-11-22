import type { CommercialActionTag } from '../domain/ActionTag.ts';
import type { ActionTagRepository } from '../domain/ports/ActionTagRepository.ts';

export class InMemoryActionTagRepository implements ActionTagRepository {
  private readonly tags = new Map<string, CommercialActionTag>();

  constructor(initialTags: readonly CommercialActionTag[] = []) {
    for (const tag of initialTags) {
      this.tags.set(tag.code.toUpperCase(), structuredClone(tag));
    }
  }

  public findAll(): CommercialActionTag[] {
    return Array.from(this.tags.values()).map((t) => structuredClone(t));
  }

  public findByCode(code: string): CommercialActionTag | undefined {
    const found = this.tags.get(code.toUpperCase());
    return found ? structuredClone(found) : undefined;
  }

  public save(tag: CommercialActionTag): void {
    this.tags.set(tag.code.toUpperCase(), structuredClone(tag));
  }

  public delete(code: string): boolean {
    return this.tags.delete(code.toUpperCase());
  }
}
