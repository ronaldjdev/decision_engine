import type { TaskPriority } from '../../../shared/domain/value-objects/Lead.ts';
import type { PipelineStageId } from '../../../shared/domain/value-objects/PipelineStage.ts';

export type ActionTagAutomationType =
  | 'enviar_whatsapp_recordatorio'
  | 'crear_tarea_obligatoria'
  | 'reprogramar_llamada'
  | 'cambiar_etapa_pipeline'
  | 'bloquear_avance'
  | 'activar_plan_b';

export interface CommercialActionTag {
  readonly code: string;
  readonly label: string;
  readonly isStandard: boolean;
  readonly automationType: ActionTagAutomationType;
  readonly messageTemplate?: string;
  readonly targetStageId?: PipelineStageId;
  readonly priority: TaskPriority;
  readonly slaMinutes?: number;
}
