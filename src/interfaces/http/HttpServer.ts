import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type { DecisionEngine } from '../../composition/DecisionEngineContainer.ts';
import { createDecisionEngine } from '../../composition/DecisionEngineContainer.ts';
import type { CommercialActionTag } from '../../features/automation/domain/ActionTag.ts';
import type { TriggerActionTagInput } from '../../features/automation/application/TriggerActionTagUseCase.ts';
import type { DeterministicRuleProps } from '../../features/governance/domain/DeterministicRule.ts';
import type { ActorContext, UserRole } from '../../features/governance/domain/Role.ts';
import type { PriorityPolicyItem } from '../../features/next-best-action/domain/PriorityPolicy.ts';
import type { TaskOutcome } from '../../features/next-best-action/domain/TaskOutcomeRules.ts';
import type { SandboxSimulationInput } from '../../features/sandbox-simulator/domain/SimulationModels.ts';
import { DomainError, ValidationError } from '../../shared/domain/DomainError.ts';
import type { FinancialParametersProps } from '../../shared/domain/value-objects/FinancialParameters.ts';
import type { LeadProps } from '../../shared/domain/value-objects/Lead.ts';
import type { PipelineStageId } from '../../shared/domain/value-objects/PipelineStage.ts';

function parseActor(req: IncomingMessage): ActorContext {
  const roleHeader = String(req.headers['x-actor-role'] ?? 'advisor').toLowerCase();
  const validRoles: readonly UserRole[] = ['advisor', 'supervisor', 'admin'];
  const role: UserRole = validRoles.includes(roleHeader as UserRole)
    ? (roleHeader as UserRole)
    : 'advisor';
  const name = String(req.headers['x-actor-name'] ?? `${role}.api`);
  return { role, name };
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {} as T;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ValidationError('El cuerpo de la petición no es un JSON válido.');
  }
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,x-actor-role,x-actor-name',
  });
  res.end(body);
}

function mapDomainErrorStatus(error: DomainError): number {
  switch (error.code) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'AUTHORIZATION_ERROR':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT_ERROR':
      return 409;
    case 'INVARIANT_VIOLATION':
    case 'HARD_RESTRICTION_IMMUTABLE':
      return 422;
  }
}

/**
 * Crea el Driving Adapter HTTP REST API para el Motor de Decisiones CrediFlow.
 *
 * - Sin dependencias externas (basado en `node:http`).
 * - Extrae el actor RBAC desde los headers `x-actor-role` (`advisor | supervisor | admin`) y `x-actor-name`.
 * - Traduce errores tipados `DomainError` a códigos HTTP estándar (`400`, `403`, `404`, `409`, `422`).
 */
export function createDecisionEngineHttpServer(
  engine: DecisionEngine = createDecisionEngine(),
): Server {
  return createServer(async (req, res) => {
    try {
      const method = req.method ?? 'GET';
      if (method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers': 'content-type,x-actor-role,x-actor-name',
        });
        res.end();
        return;
      }

      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname.replace(/\/+$/, '') || '/';
      const actor = parseActor(req);

      // Index / Health
      if (method === 'GET' && path === '/health') {
        sendJson(res, 200, {
          status: 'ok',
          service: '@crediflow/decision-engine',
          timestamp: engine.clock.nowIso(),
        });
        return;
      }

      if (method === 'GET' && path === '/') {
        sendJson(res, 200, {
          service: 'CrediFlow CRM – Motor de Decisiones Determinístico (Credit Libranzas)',
          architecture: 'Feature-Based Hexagonal Architecture + DDD',
          headers: {
            'x-actor-role': 'advisor | supervisor | admin (default: advisor)',
            'x-actor-name': 'Nombre del actor responsable para auditoría',
          },
          endpoints: [
            'GET  /health',
            'GET  /api/leads',
            'GET  /api/leads/:id',
            'POST /api/leads',
            'GET  /api/boards',
            'POST /api/pipeline/check-transition',
            'POST /api/pipeline/move-stage',
            'GET  /api/leads/:id/entity-probabilities',
            'POST /api/qualification/lead/:id',
            'POST /api/qualification/bulk',
            'POST /api/tasks/complete',
            'GET  /api/priority/queue',
            'GET  /api/priority/policy',
            'PUT  /api/priority/policy',
            'POST /api/automation/action-tags/trigger',
            'GET  /api/automation/action-tags',
            'POST /api/automation/action-tags',
            'POST /api/automation/daemon/sweep',
            'GET  /api/automation/events',
            'POST /api/sandbox/simulate',
            'GET  /api/governance/rules',
            'POST /api/governance/rules',
            'PATCH /api/governance/rules/:code/toggle',
            'DELETE /api/governance/rules/:code',
            'GET  /api/governance/exceptions',
            'POST /api/governance/exceptions',
            'POST /api/governance/exceptions/:id/review',
            'GET  /api/governance/audit-logs',
            'GET  /api/config/financial-parameters',
            'PUT  /api/config/financial-parameters',
          ],
        });
        return;
      }

      // Leads & Boards
      if (method === 'GET' && path === '/api/leads') {
        sendJson(res, 200, { leads: engine.leads.list() });
        return;
      }

      if (method === 'POST' && path === '/api/leads') {
        const body = await readJsonBody<Partial<LeadProps> & { id: string; fullName: string }>(req);
        if (!body.id || !body.fullName) {
          throw new ValidationError('Los campos "id" y "fullName" son obligatorios.');
        }
        const saved = engine.leads.upsert(body);
        sendJson(res, 201, { lead: saved });
        return;
      }

      if (method === 'GET' && path === '/api/boards') {
        sendJson(res, 200, { boards: engine.leads.listBoards() });
        return;
      }

      // GET /api/leads/:id/entity-probabilities
      const entityProbMatch = /^\/api\/leads\/([^/]+)\/entity-probabilities$/.exec(path);
      if (method === 'GET' && entityProbMatch) {
        const leadId = decodeURIComponent(entityProbMatch[1]!);
        const probabilities = engine.entityMatching.evaluateProbabilities.execute(leadId);
        sendJson(res, 200, { leadId, probabilities });
        return;
      }

      // GET /api/leads/:id
      const leadByIdMatch = /^\/api\/leads\/([^/]+)$/.exec(path);
      if (method === 'GET' && leadByIdMatch) {
        const leadId = decodeURIComponent(leadByIdMatch[1]!);
        const lead = engine.leads.getById(leadId);
        if (!lead) {
          sendJson(res, 404, { error: `Lead '${leadId}' no encontrado.` });
          return;
        }
        sendJson(res, 200, { lead });
        return;
      }

      // Sub-motor 1: Pipeline Gates
      if (method === 'POST' && path === '/api/pipeline/check-transition') {
        const body = await readJsonBody<{ leadId: string; targetStageId: PipelineStageId }>(req);
        if (!body.leadId || !body.targetStageId) {
          throw new ValidationError('Los campos "leadId" y "targetStageId" son obligatorios.');
        }
        const check = engine.pipelineGates.canTransitionStage.execute(body);
        sendJson(res, 200, check);
        return;
      }

      if (method === 'POST' && path === '/api/pipeline/move-stage') {
        const body = await readJsonBody<{
          leadId: string;
          targetStageId: PipelineStageId;
          forceOverride?: boolean;
        }>(req);
        if (!body.leadId || !body.targetStageId) {
          throw new ValidationError('Los campos "leadId" y "targetStageId" son obligatorios.');
        }
        const result = engine.pipelineGates.moveLeadStage.execute(actor, body);
        sendJson(res, result.moved ? 200 : 422, result);
        return;
      }

      // Sub-motor 3: Qualification
      const qualifyLeadMatch = /^\/api\/qualification\/lead\/([^/]+)$/.exec(path);
      if (method === 'POST' && qualifyLeadMatch) {
        const leadId = decodeURIComponent(qualifyLeadMatch[1]!);
        const result = engine.qualification.qualifyIndividual.execute(actor, leadId);
        sendJson(res, 200, result);
        return;
      }

      if (method === 'POST' && path === '/api/qualification/bulk') {
        const body = await readJsonBody<{ leadIds?: string[] }>(req);
        const batch = engine.qualification.runBulkQualification.execute(actor, body.leadIds);
        sendJson(res, 200, batch);
        return;
      }

      // Sub-motor 4: Next Best Action & Prioritization
      if (method === 'POST' && path === '/api/tasks/complete') {
        const body = await readJsonBody<{
          leadId: string;
          taskId: string;
          outcome: TaskOutcome;
          notes?: string;
          agreedAppointmentIso?: string;
        }>(req);
        if (!body.leadId || !body.taskId || !body.outcome) {
          throw new ValidationError('Los campos "leadId", "taskId" y "outcome" son obligatorios.');
        }
        const result = engine.nextBestAction.completeTask.execute(actor, body);
        sendJson(res, 200, result);
        return;
      }

      if (method === 'GET' && path === '/api/priority/queue') {
        const queue = engine.nextBestAction.prioritizeQueue.execute();
        sendJson(res, 200, { queue });
        return;
      }

      if (method === 'GET' && path === '/api/priority/policy') {
        sendJson(res, 200, engine.nextBestAction.priorityPolicy.getCurrent());
        return;
      }

      if (method === 'PUT' && path === '/api/priority/policy') {
        const body = await readJsonBody<{ items: PriorityPolicyItem[] }>(req);
        const updated = engine.nextBestAction.priorityPolicy.execute(actor, body.items ?? []);
        sendJson(res, 200, updated);
        return;
      }

      // Sub-motor 5: Automation (Action Tags + Rails Daemon)
      if (method === 'POST' && path === '/api/automation/action-tags/trigger') {
        const body = await readJsonBody<TriggerActionTagInput>(req);
        if (!body.leadId || !body.tag) {
          throw new ValidationError('Los campos "leadId" y "tag" son obligatorios.');
        }
        const result = engine.automation.triggerActionTag.execute(actor, body);
        sendJson(res, 200, result);
        return;
      }

      if (method === 'GET' && path === '/api/automation/action-tags') {
        sendJson(res, 200, { tags: engine.automation.manageActionTags.listAll() });
        return;
      }

      if (method === 'POST' && path === '/api/automation/action-tags') {
        const body = await readJsonBody<Omit<CommercialActionTag, 'isStandard'>>(req);
        if (!body.code || !body.label || !body.automationType) {
          throw new ValidationError(
            'Los campos "code", "label" y "automationType" son obligatorios.',
          );
        }
        const created = engine.automation.manageActionTags.createTag(actor, {
          ...body,
          priority: body.priority ?? 'media',
        });
        sendJson(res, 201, { tag: created });
        return;
      }

      if (method === 'POST' && path === '/api/automation/daemon/sweep') {
        const result = engine.automation.runDaemonSweep.execute(actor);
        sendJson(res, 200, result);
        return;
      }

      if (method === 'GET' && path === '/api/automation/events') {
        const limit = Number(url.searchParams.get('limit') ?? '50');
        sendJson(res, 200, {
          events: engine.repositories.liveEvents.listRecent(limit),
        });
        return;
      }

      // Sub-motor 6: Sandbox Simulator
      if (method === 'POST' && path === '/api/sandbox/simulate') {
        const body = await readJsonBody<SandboxSimulationInput>(req);
        if (
          !body.simSegment ||
          typeof body.simPagaduria !== 'string' ||
          typeof body.simNetIncome !== 'number' ||
          typeof body.simRequestedInstallment !== 'number'
        ) {
          throw new ValidationError(
            'Los campos "simSegment", "simPagaduria", "simNetIncome" y "simRequestedInstallment" son obligatorios.',
          );
        }
        const result = engine.sandbox.simulate.execute(body);
        sendJson(res, 200, result);
        return;
      }

      // Governance: Rules, Exceptions & Audit Logs
      if (method === 'GET' && path === '/api/governance/rules') {
        sendJson(res, 200, {
          rules: engine.governance.rules.listRules().map((r) => r.toJSON()),
        });
        return;
      }

      if (method === 'POST' && path === '/api/governance/rules') {
        const body = await readJsonBody<Omit<DeterministicRuleProps, 'isBuiltIn'>>(req);
        if (!body.code || !body.name || !body.category || !body.stage) {
          throw new ValidationError(
            'Los campos "code", "name", "category" y "stage" son obligatorios.',
          );
        }
        const created = engine.governance.rules.createRule(actor, {
          ...body,
          description: body.description ?? body.name,
          governanceOwner: body.governanceOwner ?? 'ADMINISTRACION',
          isActive: body.isActive ?? true,
          conditions: body.conditions ?? [],
        });
        sendJson(res, 201, { rule: created.toJSON() });
        return;
      }

      const toggleRuleMatch = /^\/api\/governance\/rules\/([^/]+)\/toggle$/.exec(path);
      if (method === 'PATCH' && toggleRuleMatch) {
        const code = decodeURIComponent(toggleRuleMatch[1]!);
        const body = await readJsonBody<{ isActive: boolean }>(req);
        const updated = engine.governance.rules.toggleRule(actor, code, Boolean(body.isActive));
        sendJson(res, 200, { rule: updated.toJSON() });
        return;
      }

      const deleteRuleMatch = /^\/api\/governance\/rules\/([^/]+)$/.exec(path);
      if (method === 'DELETE' && deleteRuleMatch) {
        const code = decodeURIComponent(deleteRuleMatch[1]!);
        engine.governance.rules.deleteRule(actor, code);
        sendJson(res, 200, { deleted: true, code });
        return;
      }

      if (method === 'GET' && path === '/api/governance/exceptions') {
        sendJson(res, 200, {
          exceptions: engine.governance.exceptions.listAll().map((e) => e.toJSON()),
        });
        return;
      }

      if (method === 'POST' && path === '/api/governance/exceptions') {
        const body = await readJsonBody<{
          leadId: string;
          leadName?: string;
          ruleCode: string;
          justification: string;
        }>(req);
        if (!body.leadId || !body.ruleCode || !body.justification) {
          throw new ValidationError(
            'Los campos "leadId", "ruleCode" y "justification" son obligatorios.',
          );
        }
        const created = engine.governance.exceptions.submitException(actor, body);
        sendJson(res, 201, { exception: created.toJSON() });
        return;
      }

      const reviewExceptionMatch = /^\/api\/governance\/exceptions\/([^/]+)\/review$/.exec(path);
      if (method === 'POST' && reviewExceptionMatch) {
        const exceptionId = decodeURIComponent(reviewExceptionMatch[1]!);
        const body = await readJsonBody<{
          decision: 'aprobada' | 'rechazada';
          comment?: string;
        }>(req);
        if (body.decision !== 'aprobada' && body.decision !== 'rechazada') {
          throw new ValidationError(
            'El campo "decision" debe ser "aprobada" o "rechazada".',
          );
        }
        const reviewed = engine.governance.exceptions.reviewException(actor, {
          exceptionId,
          decision: body.decision,
          comment: body.comment,
        });
        sendJson(res, 200, { exception: reviewed.toJSON() });
        return;
      }

      if (method === 'GET' && path === '/api/governance/audit-logs') {
        const leadId = url.searchParams.get('leadId') ?? undefined;
        const ruleId = url.searchParams.get('ruleId') ?? undefined;
        const limitParam = url.searchParams.get('limit');
        const limit = limitParam ? Number(limitParam) : undefined;
        const logs = engine.governance.auditLogs.execute({ leadId, ruleId, limit });
        sendJson(res, 200, { count: logs.length, logs });
        return;
      }

      // Financial Parameters
      if (method === 'GET' && path === '/api/config/financial-parameters') {
        sendJson(res, 200, engine.config.getFinancialParameters());
        return;
      }

      if (method === 'PUT' && path === '/api/config/financial-parameters') {
        const body = await readJsonBody<Partial<FinancialParametersProps>>(req);
        const updated = engine.config.updateFinancialParameters(actor, body);
        sendJson(res, 200, updated);
        return;
      }

      sendJson(res, 404, { error: `Ruta no encontrada: ${method} ${path}` });
    } catch (error) {
      if (error instanceof DomainError) {
        sendJson(res, mapDomainErrorStatus(error), {
          error: error.message,
          code: error.code,
          details: error.details,
        });
        return;
      }
      const message = error instanceof Error ? error.message : 'Error interno inesperado';
      sendJson(res, 500, { error: message });
    }
  });
}
