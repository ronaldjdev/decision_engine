import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import {
  createDecisionEngine,
  createDecisionEngineHttpServer,
  FixedClock,
} from '../src/index.ts';

describe('Sub-motor 6 (Simulador Sandbox) y Adaptador HTTP REST API', () => {
  it('simula R-LIB-001..R-LIB-006 de forma aislada sin mutar leads ni logs productivos', () => {
    const engine = createDecisionEngine({
      clock: new FixedClock('2026-11-22T10:00:00.000Z'),
      seedSampleLeads: true,
    });
    const leadsBefore = JSON.stringify(engine.leads.list());
    const logsBefore = engine.governance.auditLogs.execute().length;

    // Caso 1: Aprobado para desembolso
    const approved = engine.sandbox.simulate.execute({
      simSegment: 'Pensionado',
      simPagaduria: 'Colpensiones',
      simConvenioActivo: true,
      simNetIncome: 4_600_000,
      simExistingDiscounts: 500_000,
      simRequestedInstallment: 900_000,
      simApplicantAge: 65,
      simLoanTermYears: 7,
      simCallOutcome: 'contacto_exitoso_interesado',
      simColillasVerified: true,
      simVisadoApproved: true,
      simPromissorySigned: true,
    });
    assert.equal(approved.isolated, true);
    assert.equal(approved.ley1527Breakdown.availableCapacity, 1_800_000);
    assert.equal(approved.finalVerdict.status, 'APROBADO_DESEMBOLSO');
    assert.equal(approved.evaluationSteps.length, 6);

    // Caso 2: Pensionado con edad + plazo > 84 -> bloqueo R-LIB-003
    const overAge = engine.sandbox.simulate.execute({
      simSegment: 'Pensionado',
      simPagaduria: 'Colpensiones',
      simConvenioActivo: true,
      simNetIncome: 4_600_000,
      simExistingDiscounts: 0,
      simRequestedInstallment: 800_000,
      simApplicantAge: 78,
      simLoanTermYears: 8,
      simCallOutcome: 'contacto_exitoso_interesado',
      simColillasVerified: true,
      simVisadoApproved: true,
      simPromissorySigned: true,
    });
    const r3 = overAge.evaluationSteps.find((s) => s.ruleCode === 'R-LIB-003')!;
    assert.equal(r3.status, 'BLOQUEADO');
    assert.equal(overAge.finalVerdict.status, 'BLOQUEADO');

    // Verificación estricta de aislamiento
    assert.equal(JSON.stringify(engine.leads.list()), leadsBefore);
    assert.equal(engine.governance.auditLogs.execute().length, logsBefore);
  });

  it('expone todos los sub-motores y RBAC por REST API', async () => {
    const engine = createDecisionEngine({
      clock: new FixedClock('2026-11-22T15:00:00.000Z'),
      seedSampleLeads: true,
    });
    const server = createDecisionEngineHttpServer(engine);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const { port } = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${port}`;

      // 1. Health check
      const healthRes = await fetch(`${base}/health`);
      assert.equal(healthRes.status, 200);
      const health = (await healthRes.json()) as { status: string };
      assert.equal(health.status, 'ok');

      // 2. Probabilidades multientidad para LEAD-002
      const probRes = await fetch(`${base}/api/leads/LEAD-002/entity-probabilities`);
      assert.equal(probRes.status, 200);
      const probData = (await probRes.json()) as { probabilities: { entityName: string }[] };
      assert.equal(probData.probabilities.length, 5);

      // 3. Calificación masiva
      const bulkRes = await fetch(`${base}/api/qualification/bulk`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-actor-role': 'advisor',
          'x-actor-name': 'ana.asesora',
        },
        body: JSON.stringify({}),
      });
      assert.equal(bulkRes.status, 200);
      const bulkData = (await bulkRes.json()) as { totalLeadsEvaluated: number };
      assert.equal(bulkData.totalLeadsEvaluated, 3);

      // 4. Simulador Sandbox vía POST
      const simRes = await fetch(`${base}/api/sandbox/simulate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          simSegment: 'Pensionado',
          simPagaduria: 'Colpensiones',
          simConvenioActivo: true,
          simNetIncome: 4_000_000,
          simExistingDiscounts: 300_000,
          simRequestedInstallment: 700_000,
          simApplicantAge: 64,
          simLoanTermYears: 5,
          simCallOutcome: 'contacto_exitoso_interesado',
          simColillasVerified: true,
          simVisadoApproved: true,
          simPromissorySigned: true,
        }),
      });
      assert.equal(simRes.status, 200);
      const simData = (await simRes.json()) as { finalVerdict: { status: string } };
      assert.equal(simData.finalVerdict.status, 'APROBADO_DESEMBOLSO');

      // 5. RBAC en API: advisor recibe 403 al intentar desactivar regla
      const forbiddenRes = await fetch(
        `${base}/api/governance/rules/R-LIB-005/toggle`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'x-actor-role': 'advisor',
          },
          body: JSON.stringify({ isActive: false }),
        },
      );
      assert.equal(forbiddenRes.status, 403);

      // Supervisor recibe 200 al desactivar regla configurable R-LIB-005
      const okToggle = await fetch(
        `${base}/api/governance/rules/R-LIB-005/toggle`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'x-actor-role': 'supervisor',
            'x-actor-name': 'carlos.sup',
          },
          body: JSON.stringify({ isActive: false }),
        },
      );
      assert.equal(okToggle.status, 200);

      // 6. Audit logs accesibles
      const logsRes = await fetch(`${base}/api/governance/audit-logs`);
      assert.equal(logsRes.status, 200);
      const logsData = (await logsRes.json()) as { count: number };
      assert.ok(logsData.count >= 3);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
