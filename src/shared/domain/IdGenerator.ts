/**
 * Driven Port para generación de identificadores únicos de entidades, tareas y logs.
 */
export interface IdGenerator {
  /** Genera un identificador único, opcionalmente precedido por un prefijo (ej. `LOG`, `TSK`). */
  next(prefix?: string): string;
}
