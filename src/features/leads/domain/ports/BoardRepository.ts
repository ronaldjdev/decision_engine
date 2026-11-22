import type { PipelineBoard } from '../../../../shared/domain/value-objects/PipelineStage.ts';

export interface BoardRepository {
  findAll(): PipelineBoard[];
  findById(id: string): PipelineBoard | undefined;
  save(board: PipelineBoard): void;
}
