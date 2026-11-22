import { AuthorizationError } from '../../../shared/domain/DomainError.ts';

/** Roles soportados por el modelo de gobernanza RBAC (Sección 5.1). */
export type UserRole = 'advisor' | 'supervisor' | 'admin';

/** Contexto del usuario o servicio que invoca un caso de uso para RBAC y auditoría. */
export interface ActorContext {
  readonly role: UserRole;
  readonly name: string;
}

/** Actor interno usado por automatizaciones de sistema como el demonio continuo. */
export const SYSTEM_ACTOR: Readonly<ActorContext> = Object.freeze({
  role: 'admin',
  name: 'system.decision-engine',
});

export type GovernanceAction =
  | 'rule:create'
  | 'rule:delete'
  | 'rule:toggle_configurable'
  | 'rule:toggle_hard'
  | 'priority_policy:update'
  | 'exception:request'
  | 'exception:review'
  | 'action_tag:manage'
  | 'board:create'
  | 'financial_params:update'
  | 'stage:force_override';

const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly GovernanceAction[]>> =
  Object.freeze({
    advisor: ['exception:request'],
    supervisor: [
      'rule:toggle_configurable',
      'priority_policy:update',
      'exception:request',
      'exception:review',
      'stage:force_override',
    ],
    admin: [
      'rule:create',
      'rule:delete',
      'rule:toggle_configurable',
      'priority_policy:update',
      'exception:request',
      'exception:review',
      'action_tag:manage',
      'board:create',
      'financial_params:update',
      'stage:force_override',
    ],
  });

export function canPerform(role: UserRole, action: GovernanceAction): boolean {
  return ROLE_PERMISSIONS[role].includes(action);
}

export function assertCanPerform(actor: ActorContext, action: GovernanceAction): void {
  if (!canPerform(actor.role, action)) {
    throw new AuthorizationError(
      `El rol '${actor.role}' (${actor.name}) no tiene permiso para ejecutar '${action}'.`,
      { role: actor.role, actor: actor.name, action },
    );
  }
}
