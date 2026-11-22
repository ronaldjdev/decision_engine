import type { CommercialActionTag } from '../ActionTag.ts';

export interface ActionTagRepository {
  findAll(): CommercialActionTag[];
  findByCode(code: string): CommercialActionTag | undefined;
  save(tag: CommercialActionTag): void;
  delete(code: string): boolean;
}
