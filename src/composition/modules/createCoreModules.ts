import { ManageExceptionsUseCase } from '../../features/governance/application/ManageExceptionsUseCase.ts';
import { ManageRulesUseCase } from '../../features/governance/application/ManageRulesUseCase.ts';
import { QueryAuditLogsUseCase } from '../../features/governance/application/QueryAuditLogsUseCase.ts';
import { assertCanPerform } from '../../features/governance/domain/Role.ts';
import { LeadSanitizer } from '../../features/leads/domain/LeadSanitizer.ts';
import { Lead } from '../../shared/domain/value-objects/Lead.ts';
import type {
  ConfigModuleFacade,
  EngineRuntimeContext,
  GovernanceModule,
  LeadsModuleFacade,
} from '../types.ts';

/**
 * Ensambla la fachada del feature **Leads y Tableros**.
 * Garantiza que todo lead creado o actualizado pase por `LeadSanitizer` (cálculo Ley 1527 y normalización de etapa).
 */
export function createLeadsFacade(ctx: EngineRuntimeContext): LeadsModuleFacade {
  const sanitizer = new LeadSanitizer();

  return {
    list: () => ctx.repositories.leads.findAll().map((lead) => lead.toJSON()),
    getById: (id) => ctx.repositories.leads.findById(id)?.toJSON(),
    upsert: (input) => {
      const sanitized = sanitizer.sanitize(
        Lead.create({
          createdAt: ctx.clock.nowIso(),
          updatedAt: ctx.clock.nowIso(),
          ...input,
        }),
        ctx.financialParamsStore.get(),
      );
      ctx.repositories.leads.save(sanitized);
      return sanitized.toJSON();
    },
    createCustomBoard: (actor, board) => {
      assertCanPerform(actor, 'board:create');
      ctx.repositories.boards.save(board);
      return board;
    },
    listBoards: () => ctx.repositories.boards.findAll(),
  };
}

/**
 * Ensambla la fachada de **Configuración Financiera Parametrizable** (SMMLV, tasa E.A., modo de cuota).
 * Protege las actualizaciones mediante RBAC (`financial_params:update`, exclusivo de `admin`).
 */
export function createConfigFacade(
  ctx: EngineRuntimeContext,
): ConfigModuleFacade {
  return {
    getFinancialParameters: () => ctx.financialParamsStore.get(),
    updateFinancialParameters: (actor, patch) => {
      assertCanPerform(actor, 'financial_params:update');
      return ctx.financialParamsStore.update(patch);
    },
  };
}

/**
 * Ensambla el feature transversal de **Gobernanza**:
 * catálogo dinámico de reglas, excepciones justificadas y consulta de bitácora inmutable.
 */
export function createGovernanceModule(
  ctx: EngineRuntimeContext,
): GovernanceModule {
  return {
    rules: new ManageRulesUseCase(ctx.repositories.rules),
    exceptions: new ManageExceptionsUseCase({
      exceptionRepository: ctx.repositories.exceptions,
      ruleRepository: ctx.repositories.rules,
      decisionLogRepository: ctx.repositories.decisionLogs,
      clock: ctx.clock,
      idGenerator: ctx.idGenerator,
    }),
    auditLogs: new QueryAuditLogsUseCase(ctx.repositories.decisionLogs),
  };
}
