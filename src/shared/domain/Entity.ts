/**
 * Evento de dominio inmutable emitido por un AggregateRoot cuando ocurre
 * un cambio relevante en el negocio.
 */
export interface DomainEvent {
  readonly eventName: string;
  readonly occurredAt: string;
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Clase base DDD para Entidades con identidad única persistente.
 */
export abstract class Entity<TId extends string = string> {
  public readonly id: TId;

  protected constructor(id: TId) {
    this.id = id;
  }

  /** Compara identidad de entidades por su identificador único. */
  public equals(other: Entity<TId> | null | undefined): boolean {
    if (!other) return false;
    return this.id === other.id;
  }
}

/**
 * Clase base DDD para Raíces de Agregado (Aggregate Roots).
 * Mantiene una cola interna de eventos de dominio pendientes de publicación.
 */
export abstract class AggregateRoot<TId extends string = string> extends Entity<TId> {
  private readonly domainEvents: DomainEvent[] = [];

  protected constructor(id: TId) {
    super(id);
  }

  /** Registra un nuevo evento de dominio generado por una transición de estado. */
  protected recordEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  /** Extrae y limpia los eventos acumulados en el agregado. */
  public pullDomainEvents(): DomainEvent[] {
    const events = [...this.domainEvents];
    this.domainEvents.length = 0;
    return events;
  }
}
