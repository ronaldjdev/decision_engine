/**
 * Driven Port de reloj del sistema.
 * Permite inyectar un reloj determinístico (`FixedClock`) en pruebas y auditoría.
 */
export interface Clock {
  /** Retorna la fecha/hora actual como instancia `Date`. */
  now(): Date;
  /** Retorna la fecha/hora actual en formato ISO-8601. */
  nowIso(): string;
  /** Retorna la fecha/hora actual desplazada en `minutes` minutos en formato ISO-8601. */
  addMinutesIso(minutes: number): string;
}
