/**
 * Driving Adapter CLI del Simulador Sandbox (Sub-motor 6).
 *
 * Permite evaluar las compuertas `R-LIB-001` a `R-LIB-006` y la matriz multientidad
 * de forma 100% aislada (sin mutar la base de leads ni la bitácora productiva) mediante:
 * - Presets (`--preset=<nombre>` o `--all-presets`)
 * - Entrada JSON (`--json='{...}'`, opcionalmente con `--raw`)
 * - Modo interactivo por consola (`--interactive`)
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createDecisionEngine } from '../../composition/DecisionEngineContainer.ts';
import type {
  SandboxSimulationInput,
  SandboxSimulationResult,
  SimCallOutcome,
} from '../../features/sandbox-simulator/domain/SimulationModels.ts';
import type { LibranzaSegment } from '../../shared/domain/value-objects/Lead.ts';

const PRESETS: Record<string, { label: string; sim: SandboxSimulationInput }> = {
  aprobado: {
    label: 'Pensionado Colpensiones – Flujo completo aprobado para desembolso',
    sim: {
      simSegment: 'Pensionado',
      simPagaduria: 'Colpensiones',
      simConvenioActivo: true,
      simNetIncome: 4_500_000,
      simExistingDiscounts: 400_000,
      simRequestedInstallment: 850_000,
      simApplicantAge: 66,
      simLoanTermYears: 7,
      simCallOutcome: 'contacto_exitoso_interesado',
      simColillasVerified: true,
      simVisadoApproved: true,
      simPromissorySigned: true,
      simCreditScore: 760,
      simIsReported: false,
    },
  },
  'sin-convenio': {
    label: 'Empleado Privado sin convenio – Bloqueo R-LIB-001',
    sim: {
      simSegment: 'Empleado Privado',
      simPagaduria: 'Empresa Sin Convenio SAS',
      simConvenioActivo: false,
      simNetIncome: 3_800_000,
      simExistingDiscounts: 0,
      simRequestedInstallment: 600_000,
      simApplicantAge: 36,
      simLoanTermYears: 5,
      simCallOutcome: 'contacto_exitoso_interesado',
      simColillasVerified: false,
      simVisadoApproved: false,
      simPromissorySigned: false,
    },
  },
  'capacidad-cero': {
    label: 'Empleado Público con descuentos > 50% – Bloqueo Ley 1527 (R-LIB-002)',
    sim: {
      simSegment: 'Empleado Público',
      simPagaduria: 'FOMAG Magisterio',
      simConvenioActivo: true,
      simNetIncome: 3_200_000,
      simExistingDiscounts: 1_750_000,
      simRequestedInstallment: 500_000,
      simApplicantAge: 48,
      simLoanTermYears: 5,
      simCallOutcome: 'contacto_exitoso_interesado',
      simColillasVerified: true,
      simVisadoApproved: false,
      simPromissorySigned: false,
    },
  },
  sobreedad: {
    label: 'Pensionado 79 años a 8 años (87 > 84) – Bloqueo R-LIB-003',
    sim: {
      simSegment: 'Pensionado',
      simPagaduria: 'FOPEP',
      simConvenioActivo: true,
      simNetIncome: 5_000_000,
      simExistingDiscounts: 300_000,
      simRequestedInstallment: 900_000,
      simApplicantAge: 79,
      simLoanTermYears: 8,
      simCallOutcome: 'contacto_exitoso_interesado',
      simColillasVerified: true,
      simVisadoApproved: false,
      simPromissorySigned: false,
    },
  },
  'reportado-plan-b': {
    label: 'Pensionado reportado en centrales – Prioriza Valorenz / Capital (R-LIB-008)',
    sim: {
      simSegment: 'Pensionado',
      simPagaduria: 'CASUR',
      simConvenioActivo: true,
      simNetIncome: 4_200_000,
      simExistingDiscounts: 500_000,
      simRequestedInstallment: 700_000,
      simApplicantAge: 62,
      simLoanTermYears: 6,
      simCallOutcome: 'contacto_exitoso_interesado',
      simColillasVerified: true,
      simVisadoApproved: false,
      simPromissorySigned: false,
      simCreditScore: 540,
      simIsReported: true,
    },
  },
};

/** Formatea un valor numérico en Pesos Colombianos (COP). */
function formatCop(amount: number): string {
  return `$${amount.toLocaleString('es-CO')} COP`;
}

/** Parsea una entrada numérica de consola devolviendo `fallback` si está vacía o es inválida (`NaN`). */
function parseNumberOrDefault(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Imprime en consola el reporte estructurado del dictamen del Simulador Sandbox. */
function renderResult(title: string, res: SandboxSimulationResult): void {
  const statusIcon: Record<string, string> = {
    APROBADO: '[OK]',
    BLOQUEADO: '[BLOQ]',
    PENDIENTE: '[PEND]',
    OMITIDO: '[OMIT]',
  };

  console.log('\n' + '='.repeat(76));
  console.log(`SIMULADOR SANDBOX CREDIFLOW (AISLADO) :: ${title}`);
  console.log('='.repeat(76));

  const b = res.ley1527Breakdown;
  console.log('\n1) Balance Ley 1527 (50% Inembargable):');
  console.log(`   - Ingreso Neto:              ${formatCop(b.netIncome)}`);
  console.log(`   - Remanente 50%:             ${formatCop(b.unseizableRemainder)}`);
  console.log(`   - Descuentos Previos:        ${formatCop(b.existingDiscounts)}`);
  console.log(`   - Capacidad Disponible:      ${formatCop(b.availableCapacity)}`);
  console.log(
    `   - Cuota Solicitada:          ${formatCop(b.requestedInstallment)} (${b.installmentCovered ? 'CUBIERTA' : 'EXCEDE CUPO'})`,
  );

  console.log('\n2) Evaluación Compuertas R-LIB-001 a R-LIB-006:');
  for (const step of res.evaluationSteps) {
    console.log(
      `   ${statusIcon[step.status] ?? step.status} ${step.ruleCode} | ${step.ruleName}`,
    );
    console.log(`         -> ${step.detail}`);
  }

  console.log('\n3) Matriz Multientidad (Vista Previa):');
  for (const entity of res.entityProbabilitiesPreview) {
    console.log(
      `   - ${entity.entityName.padEnd(12)} | ${String(entity.probability).padStart(3)}% | ${entity.status.padEnd(21)} | Tasa ${(entity.rateEA * 100).toFixed(1)}% E.A. | Cuota est. ${formatCop(entity.estimatedMonthlyInstallment)}`,
    );
  }

  console.log('\n4) Dictamen Final Sandbox:');
  console.log(`   - Estado:           ${res.finalVerdict.status}`);
  console.log(`   - Veredicto:        ${res.finalVerdict.title}`);
  console.log(`   - Detalle:          ${res.finalVerdict.description}`);
  console.log(`   - Siguiente Acción: ${res.finalVerdict.nextAction}`);
  console.log(`   - Etapa Destino:    ${res.finalVerdict.nextStage}`);
}

async function runInteractive(): Promise<SandboxSimulationInput> {
  const rl = createInterface({ input, output });
  try {
    console.log('\n=== Simulador Sandbox Interactivo CrediFlow ===');
    const segRaw = (await rl.question('Segmento (Pensionado / Empleado Público / Empleado Privado) [Pensionado]: ')).trim();
    const simSegment: LibranzaSegment =
      segRaw === 'Empleado Público' || segRaw === 'Empleado Privado'
        ? segRaw
        : 'Pensionado';
    const simPagaduria = (await rl.question('Pagaduría [Colpensiones]: ')).trim() || 'Colpensiones';
    const convRaw = (await rl.question('¿Tiene convenio activo? (s/n) [s]: ')).trim().toLowerCase();
    const simConvenioActivo = convRaw !== 'n';
    const simNetIncome = parseNumberOrDefault(
      await rl.question('Ingreso neto mensual COP [4200000]: '),
      4_200_000,
    );
    const simExistingDiscounts = parseNumberOrDefault(
      await rl.question('Descuentos previos nómina COP [400000]: '),
      400_000,
    );
    const simRequestedInstallment = parseNumberOrDefault(
      await rl.question('Cuota solicitada COP [800000]: '),
      800_000,
    );
    const simApplicantAge = parseNumberOrDefault(
      await rl.question('Edad del solicitante [64]: '),
      64,
    );
    const simLoanTermYears = parseNumberOrDefault(
      await rl.question('Plazo en años [6]: '),
      6,
    );
    const callRaw = (await rl.question('Resultado primer contacto (contacto_exitoso_interesado / no_contesta / no_interesado) [contacto_exitoso_interesado]: ')).trim();
    const simCallOutcome = (callRaw || 'contacto_exitoso_interesado') as SimCallOutcome;
    const simColillasVerified = ((await rl.question('¿Colillas y cédula verificadas? (s/n) [s]: ')).trim().toLowerCase()) !== 'n';
    const simVisadoApproved = ((await rl.question('¿Visado de pagaduría aprobado? (s/n) [s]: ')).trim().toLowerCase()) !== 'n';
    const simPromissorySigned = ((await rl.question('¿Pagaré DECEVAL firmado? (s/n) [s]: ')).trim().toLowerCase()) !== 'n';

    return {
      simSegment,
      simPagaduria,
      simConvenioActivo,
      simNetIncome,
      simExistingDiscounts,
      simRequestedInstallment,
      simApplicantAge,
      simLoanTermYears,
      simCallOutcome,
      simColillasVerified,
      simVisadoApproved,
      simPromissorySigned,
    };
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const engine = createDecisionEngine();

  if (args.includes('--help') || args.includes('-h')) {
    console.log('Uso:');
    console.log('  node src/interfaces/cli/simulator.ts --all-presets');
    console.log(`  node src/interfaces/cli/simulator.ts --preset=<${Object.keys(PRESETS).join('|')}>`);
    console.log("  node src/interfaces/cli/simulator.ts --json='{\"simSegment\":\"Pensionado\",...}'");
    console.log('  node src/interfaces/cli/simulator.ts --interactive');
    return;
  }

  if (args.includes('--all-presets')) {
    for (const [key, preset] of Object.entries(PRESETS)) {
      const result = engine.sandbox.simulate.execute(preset.sim);
      renderResult(`${key} – ${preset.label}`, result);
    }
    return;
  }

  const presetArg = args.find((a) => a.startsWith('--preset='));
  if (presetArg) {
    const key = presetArg.slice('--preset='.length);
    const preset = PRESETS[key];
    if (!preset) {
      console.error(`Preset desconocido '${key}'. Disponibles: ${Object.keys(PRESETS).join(', ')}`);
      process.exitCode = 1;
      return;
    }
    const result = engine.sandbox.simulate.execute(preset.sim);
    renderResult(`${key} – ${preset.label}`, result);
    return;
  }

  const jsonArg = args.find((a) => a.startsWith('--json='));
  if (jsonArg) {
    let sim: SandboxSimulationInput;
    try {
      sim = JSON.parse(jsonArg.slice('--json='.length)) as SandboxSimulationInput;
    } catch {
      console.error('Error: el argumento --json no contiene un objeto JSON válido.');
      process.exitCode = 1;
      return;
    }
    const result = engine.sandbox.simulate.execute(sim);
    if (args.includes('--raw')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      renderResult('Escenario JSON personalizado', result);
    }
    return;
  }

  if (args.includes('--interactive')) {
    const sim = await runInteractive();
    const result = engine.sandbox.simulate.execute(sim);
    renderResult('Escenario Interactivo', result);
    return;
  }

  // Default: ejecutar preset aprobado para feedback inmediato
  const defaultPreset = PRESETS.aprobado!;
  renderResult(`aprobado – ${defaultPreset.label}`, engine.sandbox.simulate.execute(defaultPreset.sim));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
