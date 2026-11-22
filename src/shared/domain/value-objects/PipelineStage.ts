/**
 * Las 7 etapas canónicas del pipeline moderno de libranzas (Sección 5.3 #3).
 */
export const STANDARD_PIPELINE_STAGES = [
  'lead_nuevo',
  'perfilamiento',
  'oferta_cierre',
  'en_estudio',
  'aprobado_formalizacion',
  'desembolsado',
  'rechazado_perdido',
] as const;

export type StandardPipelineStageId = (typeof STANDARD_PIPELINE_STAGES)[number];

/** Identificador de etapa: puede ser una etapa estándar o una etapa de tablero personalizado. */
export type PipelineStageId = StandardPipelineStageId | (string & {});

/**
 * Mapa de compatibilidad para unificar identificadores heredados (Sección 5.3 #3)
 * hacia las 7 etapas canónicas del pipeline moderno.
 */
export const LEGACY_STAGE_ALIAS_MAP: Readonly<Record<string, StandardPipelineStageId>> =
  Object.freeze({
    primer_contacto: 'perfilamiento',
    documentacion_pendiente: 'oferta_cierre',
    solicitud_evaluacion: 'en_estudio',
    credito_aprobado: 'aprobado_formalizacion',
    credito_desembolsado: 'desembolsado',
    cerrado_no_interesado: 'rechazado_perdido',
  });

/**
 * Normaliza un identificador de etapa heredado hacia su etapa canónica moderna.
 * Si no es un alias heredado, retorna el identificador sin cambios.
 */
export function normalizeStageId(stageId: string): PipelineStageId {
  const alias = LEGACY_STAGE_ALIAS_MAP[stageId];
  return alias ?? stageId;
}

/** Indica si la etapa corresponde a un cierre/descarte inmediato de oportunidad. */
export function isClosureStage(stageId: string): boolean {
  const normalized = normalizeStageId(stageId);
  return normalized === 'rechazado_perdido';
}

/** Definición estructural de una columna/etapa dentro de un tablero Kanban. */
export interface PipelineStageDefinition {
  readonly id: PipelineStageId;
  readonly name: string;
  readonly order: number;
  readonly isTerminal?: boolean;
}

/** Definición de un tablero de proceso (estándar o personalizado). */
export interface PipelineBoard {
  readonly id: string;
  readonly name: string;
  /** `true` para el pipeline estándar con compuertas R-LIB-001..006; `false` para tableros personalizados. */
  readonly isDefault: boolean;
  readonly stages: readonly PipelineStageDefinition[];
}

/** Identificador del tablero principal estándar de libranzas. */
export const DEFAULT_BOARD_ID = 'board-libranzas-principal';
