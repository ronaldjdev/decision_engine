import type {
  NotificationGateway,
  OutboundNotification,
} from '../domain/ports/NotificationGateway.ts';

export class InMemoryNotificationGateway implements NotificationGateway {
  private readonly history: OutboundNotification[] = [];

  public send(notification: OutboundNotification): void {
    this.history.push(Object.freeze({ ...notification }));
  }

  public getSentHistory(leadId?: string): OutboundNotification[] {
    if (!leadId) return [...this.history];
    return this.history.filter((n) => n.leadId === leadId);
  }
}
