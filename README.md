# Motor de Decisiones Determinístico (CrediFlow CRM – Credit Libranzas)

Implementación en **TypeScript puro** con **Arquitectura Hexagonal basada en Features (Vertical Slices) + Domain-Driven Design (DDD)** del motor descrito en [MOTOR_DE_DECISIONES.md](./MOTOR_DE_DECISIONES.md), sin dependencias externas de runtime (ejecución nativa en Node.js >= 22.18 / 26).

> Consulta la guía paso a paso con diagramas en [FLUJO_DE_TRABAJO.md](./FLUJO_DE_TRABAJO.md).

## Arquitectura

```text
src/
├── shared/                      # Shared Kernel DDD (AggregateRoot, ValueObjects, Money, Ley 1527, SMMLV, Lead)
├── features/                    # Vertical Slices Hexagonales (domain / application / infrastructure)
│   ├── governance/              # RBAC, Reglas Dinámicas (isActive + conditions), Excepciones Justificadas, Auditoría Inmutable
│   ├── leads/                   # Repositorios de Leads/Tableros y LeadSanitizer (Ley 1527)
│   ├── pipeline-gates/          # Sub-motor 1: Compuertas de transición (R-SEC-01, R-TSK-MANDATORY, R-LIB-001..006)
│   ├── entity-matching/         # Sub-motor 2: Probabilidades Multientidad (5 financieras) y Plan B
│   ├── qualification/           # Sub-motor 3: Calificación Determinística (0–100), Tiers y cadencia
│   ├── next-best-action/        # Sub-motor 4: Siguiente Mejor Acción (completeTask) y PriorityPolicyConfig
│   ├── automation/              # Sub-motor 5: Etiquetas Operativas (#...) y Rails Daemon Sweep
│   └── sandbox-simulator/       # Sub-motor 6: Simulador Sandbox aislado (cero mutación)
├── composition/                 # Composition Root (ensambla puertos + adaptadores InMemory o custom)
├── interfaces/                  # Driving Adapters
│   ├── http/                    # API REST (node:http)
│   └── cli/                     # Simulador Sandbox CLI ejecutable
└── index.ts                     # Punto de entrada de la librería
```

## Mejoras de Producción Incorporadas (Sección 5.3)

- **Intérprete dinámico de reglas**: las reglas configurables consultan `isActive` en tiempo de ejecución y las reglas creadas por `admin` evalúan dinámicamente `conditions[]`, respetando excepciones justificadas aprobadas por `supervisor`.
- **SMMLV parametrizable**: constante financiera configurable en `FinancialParametersStore` (por defecto `$1.400.000 COP`).
- **Amortización francesa configurable**: soporta cálculo de cuota por amortización francesa (tasa E.A. → M.V.) o modo `classic_approximation` (`round((monto / 60) * 1.35)`).
- **Etapas unificadas de 7 fases**: `lead_nuevo`, `perfilamiento`, `oferta_cierre`, `en_estudio`, `aprobado_formalizacion`, `desembolsado`, `rechazado_perdido`, con normalizador automático de alias heredados (`cerrado_no_interesado`, `primer_contacto`, etc.).

## Comandos Rápidos

```bash
# Ejecutar suite completa de pruebas unitarias e integración (14 tests)
node --test tests/*.test.ts

# Ejecutar Simulador Sandbox CLI (presets o interactivo)
node src/interfaces/cli/simulator.ts --all-presets
node src/interfaces/cli/simulator.ts --preset=aprobado
node src/interfaces/cli/simulator.ts --interactive

# Iniciar servidor HTTP REST API (puerto 3000 por defecto)
PORT=3000 node src/interfaces/http/server.ts
```

## Uso como Librería

```ts
import { createDecisionEngine } from './src/index.ts';

const engine = createDecisionEngine();
const probs = engine.entityMatching.evaluateProbabilities.execute('LEAD-002');
const batch = engine.qualification.runBulkQualification.execute({
  role: 'advisor',
  name: 'ana.comercial',
});
```
