import type { Clock } from '../../../shared/domain/Clock.ts';
import type { Lead } from '../../../shared/domain/value-objects/Lead.ts';

export type PriorityCaseType =
  | 'cita_acordada'
  | 'chat_reciente'
  | 'devolucion_glosa'
  | 'llamada_solicitada'
  | 'lead_nuevo'
  | 'credito_sin_seguimiento_12h';

export interface PriorityPolicyItem {
  readonly rank: number;
  readonly caseType: PriorityCaseType;
  readonly label: string;
  readonly slaMinutes: number;
  readonly scoreBase: number;
}

export interface PriorityPolicyConfig {
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly items: readonly PriorityPolicyItem[];
}

export interface PrioritizedQueueEntry {
  readonly leadId: string;
  readonly leadName: string;
  readonly caseType: PriorityCaseType;
  readonly label: string;
  readonly rank: number;
  readonly slaMinutes: number;
  readonly effectiveScore: number;
  readonly slaBreached: boolean;
  readonly currentStageId: string;
  readonly reason: string;
}

/**
 * Servicio de Dominio del Sub-motor 4: Priorización de Cola Operativa (`PriorityPolicyConfig`).
 *
 * Ordena los prospectos activos del asesor según ranking de compromiso horario y SLA
 * (`cita_acordada` -> `chat_reciente` -> `devolucion_glosa` -> `llamada_solicitada`
 * -> `lead_nuevo` -> `credito_sin_seguimiento_12h`), aplicando impulso por vencimiento de SLA.
 */
export class WorkQueuePrioritizer {
  public prioritize(
    leads: readonly Lead[],
    policy: PriorityPolicyConfig,
    clock: Clock,
  ): PrioritizedQueueEntry[] {
    const nowMs = clock.now().getTime();
    const policyMap = new Map<PriorityCaseType, PriorityPolicyItem>();
    for (const item of policy.items) {
      policyMap.set(item.caseType, item);
    }

    const entries: PrioritizedQueueEntry[] = [];

    for (const lead of leads) {
      const p = lead.props;
      if (
        p.currentStageId === 'desembolsado' ||
        p.currentStageId === 'rechazado_perdido'
      ) {
        continue;
      }

      const detected = this.detectCaseType(lead, nowMs);
      if (!detected) continue;

      const policyItem = policyMap.get(detected.caseType);
      if (!policyItem) continue;

      const slaBreached = detected.elapsedMinutes > policyItem.slaMinutes;
      const urgencyBoost = slaBreached ? 15 : 0;
      const rankBonus = Math.max(0, 7 - policyItem.rank);

      entries.push({
        leadId: lead.id,
        leadName: p.fullName,
        caseType: detected.caseType,
        label: policyItem.label,
        rank: policyItem.rank,
        slaMinutes: policyItem.slaMinutes,
        effectiveScore: policyItem.scoreBase + urgencyBoost + rankBonus,
        slaBreached,
        currentStageId: p.currentStageId,
        reason: detected.reason,
      });
    }

    return entries.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return b.effectiveScore - a.effectiveScore;
    });
  }

  private detectCaseType(
    lead: Lead,
    nowMs: number,
  ): { caseType: PriorityCaseType; elapsedMinutes: number; reason: string } | null {
    const p = lead.props;

    // 1. Cita acordada para ahora (ventana +/- 15 min)
    if (p.contactPreferences?.agreedAppointment) {
      const apptMs = Date.parse(p.contactPreferences.agreedAppointment);
      if (!Number.isNaN(apptMs)) {
        const diffMinutes = (nowMs - apptMs) / 60_000;
        if (diffMinutes >= -15 && diffMinutes <= 60) {
          return {
            caseType: 'cita_acordada',
            elapsedMinutes: Math.max(0, diffMinutes),
            reason: `Cita acordada para ${p.contactPreferences.agreedAppointment}`,
          };
        }
      }
    }

    // 2. Chat reciente en vivo
    if (p.processState.chat.status === 'mensaje_recibido_urgente') {
      const updatedMs = p.processState.chat.lastUpdatedAt
        ? Date.parse(p.processState.chat.lastUpdatedAt)
        : nowMs;
      return {
        caseType: 'chat_reciente',
        elapsedMinutes: Math.max(0, (nowMs - updatedMs) / 60_000),
        reason: 'Mensaje reciente recibido por chat en vivo.',
      };
    }

    // 3. Devolución / glosa pendiente
    const hasRejectedDoc = p.documents.some((d) => d.status === 'rechazado');
    if (p.processState.hasPendingGlosa || hasRejectedDoc) {
      return {
        caseType: 'devolucion_glosa',
        elapsedMinutes: 10,
        reason: hasRejectedDoc
          ? 'Documento rechazado pendiente de subsanar.'
          : 'Glosa operativa pendiente de subsanar.',
      };
    }

    // 4. Llamada solicitada expresamente
    if (p.processState.call.status === 'solicitada_por_cliente') {
      const updatedMs = p.processState.call.lastUpdatedAt
        ? Date.parse(p.processState.call.lastUpdatedAt)
        : nowMs;
      return {
        caseType: 'llamada_solicitada',
        elapsedMinutes: Math.max(0, (nowMs - updatedMs) / 60_000),
        reason: 'Llamada solicitada expresamente por el cliente.',
      };
    }

    // 5. Lead nuevo recién captado
    if (p.currentStageId === 'lead_nuevo') {
      const createdMs = Date.parse(p.createdAt);
      return {
        caseType: 'lead_nuevo',
        elapsedMinutes: Number.isNaN(createdMs)
          ? 0
          : Math.max(0, (nowMs - createdMs) / 60_000),
        reason: 'Lead nuevo pendiente de primer contacto (SLA < 15 min).',
      };
    }

    // 6. Crédito en proceso sin seguimiento > 12h
    const lastRef = p.processState.lastFollowUpAt ?? p.updatedAt;
    const lastMs = Date.parse(lastRef);
    const hoursWithoutFollowUp = Number.isNaN(lastMs)
      ? 0
      : (nowMs - lastMs) / 3_600_000;
    if (hoursWithoutFollowUp >= 12) {
      return {
        caseType: 'credito_sin_seguimiento_12h',
        elapsedMinutes: Math.round((hoursWithoutFollowUp - 12) * 60),
        reason: `Sin seguimiento desde hace ${Math.floor(hoursWithoutFollowUp)} horas.`,
      };
    }

    return null;
  }
}
