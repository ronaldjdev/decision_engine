/**
 * Códigos canónicos de error del dominio para mapear fallos de negocio
 * de forma desacoplada de la capa de transporte (HTTP, CLI, etc.).
 */
export type DomainErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'AUTHORIZATION_ERROR'
  | 'INVARIANT_VIOLATION'
  | 'CONFLICT_ERROR'
  | 'HARD_RESTRICTION_IMMUTABLE';

/**
 * Error base del dominio en el Shared Kernel.
 * Todas las violaciones de reglas de negocio, invariantes o permisos heredan de esta clase.
 */
export class DomainError extends Error {
  public readonly code: DomainErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: DomainErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

/** Error lanzado cuando una entrada incumple validaciones de formato o rango. */
export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

/** Error lanzado cuando una entidad o agregado solicitado no existe en su repositorio. */
export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} con identificador '${id}' no encontrado.`, {
      entity,
      id,
    });
    this.name = 'NotFoundError';
  }
}

/** Error lanzado cuando el rol del actor (RBAC) carece de permisos para la operación. */
export class AuthorizationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('AUTHORIZATION_ERROR', message, details);
    this.name = 'AuthorizationError';
  }
}

/** Error lanzado cuando se intenta violar un invariante de estado de un agregado. */
export class InvariantViolationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('INVARIANT_VIOLATION', message, details);
    this.name = 'InvariantViolationError';
  }
}
