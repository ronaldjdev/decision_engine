import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '../domain/IdGenerator.ts';

export class CryptoIdGenerator implements IdGenerator {
  public next(prefix?: string): string {
    const id = randomUUID().slice(0, 8);
    return prefix ? `${prefix}-${id}` : id;
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  public next(prefix?: string): string {
    this.counter += 1;
    const seq = String(this.counter).padStart(4, '0');
    return prefix ? `${prefix}-${seq}` : seq;
  }
}
