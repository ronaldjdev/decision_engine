import type { MessageChannel } from '../../../../shared/domain/value-objects/Lead.ts';

export interface OutboundNotification {
  readonly id: string;
  readonly leadId: string;
  readonly channel: MessageChannel;
  readonly recipient: string;
  readonly body: string;
  readonly sentAt: string;
}

/**
 * Driven Port para integraciones externas de mensajería (WhatsApp, SMS, Email, VoIP).
 * En producción se implementa mediante adaptadores HTTP/Webhooks reales.
 */
export interface NotificationGateway {
  send(notification: OutboundNotification): void;
  getSentHistory(leadId?: string): OutboundNotification[];
}
