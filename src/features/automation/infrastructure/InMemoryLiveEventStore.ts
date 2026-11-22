import type { LiveEventStore } from '../domain/ports/LiveEventStore.ts';
import type { RailsLiveEvent } from '../domain/RailsLiveEvent.ts';

/**
 * Almacén de eventos en vivo con ventana deslizante de los últimos 50 eventos (Sección 4.5).
 */
export class InMemoryLiveEventStore implements LiveEventStore {
  private readonly maxEvents: number;
  private readonly events: RailsLiveEvent[] = [];

  constructor(maxEvents = 50) {
    this.maxEvents = maxEvents;
  }

  public publish(event: RailsLiveEvent): void {
    this.events.push(Object.freeze({ ...event }));
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
  }

  public listRecent(limit?: number): RailsLiveEvent[] {
    if (!limit || limit <= 0) return [...this.events];
    return this.events.slice(-limit);
  }
}
