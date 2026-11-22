import type { Clock } from '../domain/Clock.ts';

export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }

  public nowIso(): string {
    return this.now().toISOString();
  }

  public addMinutesIso(minutes: number): string {
    return new Date(this.now().getTime() + minutes * 60_000).toISOString();
  }
}

export class FixedClock implements Clock {
  private current: Date;

  constructor(isoDate: string) {
    this.current = new Date(isoDate);
  }

  public advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }

  public now(): Date {
    return new Date(this.current.getTime());
  }

  public nowIso(): string {
    return this.current.toISOString();
  }

  public addMinutesIso(minutes: number): string {
    return new Date(this.current.getTime() + minutes * 60_000).toISOString();
  }
}
