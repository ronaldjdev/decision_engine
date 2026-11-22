import type { PipelineBoard } from '../../../shared/domain/value-objects/PipelineStage.ts';
import type { BoardRepository } from '../domain/ports/BoardRepository.ts';

export class InMemoryBoardRepository implements BoardRepository {
  private readonly boards = new Map<string, PipelineBoard>();

  constructor(initialBoards: readonly PipelineBoard[] = []) {
    for (const board of initialBoards) {
      this.boards.set(board.id, structuredClone(board));
    }
  }

  public findAll(): PipelineBoard[] {
    return Array.from(this.boards.values()).map((b) => structuredClone(b));
  }

  public findById(id: string): PipelineBoard | undefined {
    const board = this.boards.get(id);
    return board ? structuredClone(board) : undefined;
  }

  public save(board: PipelineBoard): void {
    this.boards.set(board.id, structuredClone(board));
  }
}
