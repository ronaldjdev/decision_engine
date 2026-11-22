export type RailsEventSeverity = 'info' | 'warning' | 'urgent';

export interface RailsLiveEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly leadId: string;
  readonly leadName: string;
  readonly channel: 'chat' | 'call' | 'email' | 'action_tag' | 'daemon';
  readonly eventType: string;
  readonly message: string;
  readonly severity: RailsEventSeverity;
  readonly createdTaskId?: string;
}
