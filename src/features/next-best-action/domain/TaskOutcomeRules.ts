import type {
  TaskCategory,
  TaskPriority,
} from '../../../shared/domain/value-objects/Lead.ts';
import type { StandardPipelineStageId } from '../../../shared/domain/value-objects/PipelineStage.ts';

export type TaskOutcome =
  | 'contacto_exitoso_interesado'
  | 'no_contesta'
  | 'cita_agendada'
  | 'perfilamiento_completo'
  | 'oferta_aceptada'
  | 'documentos_verificados'
  | 'preaprobado'
  | 'formalizado_desembolso'
  | 'rechazado_financiera'
  | 'no_interesado';

export interface NextBestActionPlan {
  readonly targetStageId?: StandardPipelineStageId;
  readonly nextTask?: {
    readonly title: string;
    readonly category: TaskCategory;
    readonly mandatory: boolean;
    readonly priority: TaskPriority;
    readonly slaMinutes: number;
  };
  readonly reminder?: {
    readonly message: string;
    readonly delayMinutes: number;
    readonly priority: TaskPriority;
  };
  readonly actionSummary: string;
}

/**
 * Reglas determinísticas de Siguiente Mejor Acción con etapas unificadas (7 fases canónicas - Sección 5.3 #3).
 */
export function resolveNextBestActionForOutcome(
  outcome: TaskOutcome,
): NextBestActionPlan {
  switch (outcome) {
    case 'contacto_exitoso_interesado':
      return {
        targetStageId: 'perfilamiento',
        nextTask: {
          title: 'Completar perfilamiento financiero y validar Ley 1527',
          category: 'validacion_documentos',
          mandatory: true,
          priority: 'alta',
          slaMinutes: 30,
        },
        actionSummary: 'Contacto exitoso: avanza a perfilamiento y genera tarea obligatoria de validación Ley 1527.',
      };

    case 'no_contesta':
      return {
        nextTask: {
          title: 'Reintento de llamada VoIP (+2h)',
          category: 'reintento_voip',
          mandatory: true,
          priority: 'media',
          slaMinutes: 120,
        },
        reminder: {
          message: 'Reintentar contacto telefónico con prospecto (no contestó).',
          delayMinutes: 120,
          priority: 'media',
        },
        actionSummary: 'No contesta: programa reintento obligatorio VoIP en +2h y recordatorio.',
      };

    case 'cita_agendada':
      return {
        nextTask: {
          title: 'Atender cita acordada con el cliente',
          category: 'cita_acordada',
          mandatory: true,
          priority: 'urgente',
          slaMinutes: 5,
        },
        reminder: {
          message: 'Cita comercial acordada con prospecto.',
          delayMinutes: 60,
          priority: 'urgente',
        },
        actionSummary: 'Cita agendada: crea tarea obligatoria de cita acordada (Rank #1 SLA 5 min).',
      };

    case 'perfilamiento_completo':
      return {
        targetStageId: 'oferta_cierre',
        nextTask: {
          title: 'Presentar oferta de libranza y seleccionar entidad financiera',
          category: 'cierre_oferta',
          mandatory: true,
          priority: 'alta',
          slaMinutes: 30,
        },
        actionSummary: 'Perfilamiento completo: avanza a oferta_cierre y genera tarea de cierre.',
      };

    case 'oferta_aceptada':
      return {
        nextTask: {
          title: 'Recopilar y verificar mínimo 2 soportes (cédula y colillas)',
          category: 'validacion_documentos',
          mandatory: true,
          priority: 'alta',
          slaMinutes: 60,
        },
        actionSummary: 'Oferta aceptada: exige verificación documental (R-LIB-004) antes de radicar a en_estudio.',
      };

    case 'documentos_verificados':
      return {
        targetStageId: 'en_estudio',
        nextTask: {
          title: 'Hacer seguimiento de radicación y preaprobación en financiera',
          category: 'seguimiento_estudio',
          mandatory: true,
          priority: 'alta',
          slaMinutes: 120,
        },
        actionSummary: 'Documentos verificados: avanza a en_estudio y genera tarea de seguimiento.',
      };

    case 'preaprobado':
      return {
        targetStageId: 'aprobado_formalizacion',
        nextTask: {
          title: 'Gestionar firma de pagaré DECEVAL y confirmar visado de pagaduría',
          category: 'formalizacion_pagare',
          mandatory: true,
          priority: 'urgente',
          slaMinutes: 60,
        },
        actionSummary: 'Preaprobado: avanza a aprobado_formalizacion y genera tarea obligatoria de formalización DECEVAL.',
      };

    case 'formalizado_desembolso':
      return {
        targetStageId: 'desembolsado',
        actionSummary: 'Formalización y pagaré completos: avanza a desembolsado y transforma en Cliente Activo.',
      };

    case 'rechazado_financiera':
      return {
        nextTask: {
          title: 'Activar Plan B en financiera alternativa (R-LIB-007)',
          category: 'plan_b_reactivacion',
          mandatory: true,
          priority: 'urgente',
          slaMinutes: 30,
        },
        actionSummary: 'Rechazo de financiera: NO cierra el lead; activa tarea urgente de Plan B.',
      };

    case 'no_interesado':
      return {
        targetStageId: 'rechazado_perdido',
        actionSummary: 'Cliente no interesado: cierra oportunidad en rechazado_perdido.',
      };
  }
}
