import type { RailsLiveEvent } from '../RailsLiveEvent.ts';

export interface LiveEventStore {
  publish(event: RailsLiveEvent): void;
  listRecent(limit?: number): RailsLiveEvent[];
}
