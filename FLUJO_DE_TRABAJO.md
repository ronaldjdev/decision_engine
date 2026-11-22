# Flujo de Trabajo del Motor de Decisiones (CrediFlow CRM – Credit Libranzas)

Este documento describe de extremo a extremo el **flujo de trabajo técnico y operativo** del motor de decisiones implementado bajo **Arquitectura Hexagonal basada en Features + DDD**, desde la entrada de un prospecto (`Lead`) hasta su desembolso y transformación automática en **Cliente Activo**.

---

## 1. Flujo Arquitectónico (Entrada → Dominio → Persistencia)

Toda operación entra por un **Driving Adapter** (Librería TS, REST API o CLI Sandbox), atraviesa el **Composition Root** (`createDecisionEngine`), ejecuta un **Caso de Uso** de su feature y delega las reglas puras a **Servicios de Dominio / Agregados**, persistiendo efectos a través de **Driven Ports**.

```mermaid
flowchart LR
    subgraph Driving["Driving Adapters (Entrada)"]
        LIB["Librería TS (src/index.ts)"]
        HTTP["REST API (src/interfaces/http/HttpServer.ts)"]
        CLI["CLI Sandbox (src/interfaces/cli/simulator.ts)"]
    end

    subgraph Comp["Composition Root (src/composition/)"]
        CR["createDecisionEngine()"]
    end

    subgraph App["Application Layer (Use Cases por Feature)"]
        UC1["pipeline-gates"]
        UC2["entity-matching"]
        UC3["qualification"]
        UC4["next-best-action"]
        UC5["automation"]
        UC6["sandbox-simulator"]
        UCG["governance"]
    end

    subgraph Dom["Domain Layer (DDD Puro)"]
        AGG["Lead Aggregate + Value Objects (Ley 1527, Money)"]
        SRV["Domain Services (Evaluadores, Reglas Dinámicas, RBAC)"]
    end

    subgraph Driven["Driven Adapters (Salida / Persistencia)"]
        REPO["Repositories (InMemory / DB futura)"]
        LOG["DecisionLogRepository (Auditoría Inmutable)"]
        NOTIF["NotificationGateway (WhatsApp/SMS/Email)"]
        EVT["LiveEventStore (Ventana 50 eventos)"]
    end

    LIB --> CR
    HTTP --> CR
    CLI --> CR
    CR --> UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UCG
    UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UCG --> AGG & SRV
    UC1 & UC2 & UC3 & UC4 & UC5 & UCG --> REPO & LOG & NOTIF & EVT
```

---

## 2. Flujo de Ciclo de Vida del Prospecto (Pipeline de 7 Etapas)

El tablero estándar (`board-libranzas-principal`) aplica compuertas determinísticas en orden estricto. Ningún asesor puede saltar etapas (`R-SEC-01`) ni mover un lead con tareas obligatorias abiertas (`R-TSK-MANDATORY`).

```mermaid
stateDiagram-v2
    [*] --> lead_nuevo: Ingreso + LeadSanitizer (Ley 1527)
    lead_nuevo --> perfilamiento: R-LIB-001 (Convenio activo + evidencia de contacto)
    perfilamiento --> oferta_cierre: R-LIB-002 / R-LIB-002B (Capacidad > $0 e Ingreso >= 1 SMMLV)
    oferta_cierre --> en_estudio: R-LIB-005 (Financiera) + R-LIB-004 (>=2 docs todos verificados)
    en_estudio --> aprobado_formalizacion: R-LIB-005 (hasPreapproval = true)
    aprobado_formalizacion --> desembolsado: R-LIB-006 (Documento pagaré / DECEVAL / libranza)
    desembolsado --> [*]: isClient = true + clientSince

    lead_nuevo --> rechazado_perdido: Excepción de cierre inmediato
    perfilamiento --> rechazado_perdido: Excepción de cierre inmediato
    oferta_cierre --> rechazado_perdido: Excepción de cierre inmediato
    en_estudio --> rechazado_perdido: Excepción de cierre inmediato
    aprobado_formalizacion --> rechazado_perdido: Excepción de cierre inmediato
```

### Detalle del Flujo por Compuerta

1. **Ingreso y Sanitización (`engine.leads.upsert`)**:
   - Normaliza alias heredados (`primer_contacto` → `perfilamiento`, `cerrado_no_interesado` → `rechazado_perdido`, etc.).
   - Si falta `netIncome`, estima `round(monthlyIncome * 0.88)`.
   - Calcula la capacidad disponible bajo **Ley 1527**:
     $$\text{Capacidad} = \max\big(0,\ (\text{Ingreso Neto} \times 0.50) - \text{Descuentos Previos}\big)$$
2. **Evaluación de Compuertas (`canTransitionStage` / `moveLeadStage`)**:
   - En tablero estándar: valida `Cierre inmediato` → `R-SEC-01` → `R-TSK-MANDATORY` → `R-LIB-001` → compuerta de etapa destino → **reglas dinámicas activas** creadas por `admin` (si una política configurable falla, consulta si existe una **Excepción Justificada aprobada**).
   - En tableros personalizados (`isDefault === false`): valida únicamente `R-TSK-MANDATORY` y reglas dinámicas asociadas.
   - Si es bloqueado: registra `verdict = 'BLOQUEADO'` en `EngineDecisionLog` y devuelve `ruleId` y `missingCondition`.
   - Si es autorizado: actualiza `currentStageId`, anexa nota histórica, activa `isClient = true` si llega a desembolso o última etapa de tablero (> 2 fases), y registra `verdict = 'AUTORIZADO'`.

---

## 3. Flujo de Calificación, Probabilidades Multientidad y Plan B

```mermaid
flowchart TD
    IN["Lead Sanitizado"] --> QUAL["Sub-motor 3: qualifyIndividual / runBulkQualification"]
    QUAL --> CAP["Calcula Capacidad Ley 1527 + Cuota (Amortización Francesa o Clásica)"]
    CAP --> SCORE["Puntaje Determinístico (Base 50, máx 100)"]
    SCORE --> TIER{"Clasificación Tier"}

    TIER -->|"Sin convenio"| D1["DECLINADO (SIN_CONVENIO) → SMS"]
    TIER -->|"Capacidad < $100k"| D2["DECLINADO (BLOQUEADO_LEY_1527) → Email"]
    TIER -->|"Score >= 90 & cupo & buró >= 720"| TA["TIER_A_PLUS → VoIP Urgente (15 min)"]
    TIER -->|"Score >= 70 & cupo"| TB["TIER_A → VoIP Alta (30 min)"]
    TIER -->|"Sin cupo para cuota"| TC["TIER_C_CONDICIONAL → WhatsApp Plan B"]
    TIER -->|"Resto viables"| TD["TIER_B → VoIP Media (60 min)"]

    TA & TB & TC & TD --> MULTI["Sub-motor 2: evaluateProbabilities (5 Financieras)"]
    MULTI --> RANK["Ranking descendente (Valorenz, Capital, Bancoomeva, Coopcentral, Finandina)"]
    RANK --> SEL["Selección de Financiera Principal"]
    SEL -->|"Rechazo (#RECHAZADO_FINANCIERA)"| PLANB["Plan B Automático (R-LIB-007 / R-MULTI-FIN-01)"]
    PLANB -->|"Valorenz → Capital / Bancoomeva → Valorenz"| KEEP["Lead sigue activo + Tarea Urgente Plan B"]
```

---

## 4. Flujo Operativo Diario del Asesor (Cola, Tareas, Etiquetas y Daemon)

El trabajo diario del asesor está guiado de forma determinística por tres mecanismos coordinados:

```mermaid
sequenceDiagram
    participant Daemon as Rails Daemon (Sub-motor 5)
    participant Queue as PriorityPolicy (Sub-motor 4)
    participant Advisor as Asesor Comercial
    participant NBA as CompleteTask / ActionTags
    participant Gate as PipelineGates (Sub-motor 1)
    participant Audit as EngineDecisionLog

    Daemon->>Daemon: runRailsDaemonSweep() en leads activos
    Daemon-->>Queue: Crea tareas obligatorias (chat urgente / VoIP +2h / email abierto) sin duplicar

    Advisor->>Queue: GET /api/priority/queue
    Queue-->>Advisor: Cola ordenada por compromiso y SLA (Rank 1..6)

    Advisor->>NBA: completeTask(leadId, taskId, outcome)
    NBA->>NBA: Marca tarea completada (libera R-TSK-MANDATORY)
    NBA->>Gate: moveLeadStage(etapa unificada destino)
    Gate->>Audit: Registra AUTORIZADO o BLOQUEADO
    NBA->>NBA: Crea siguiente tarea obligatoria y/o recordatorio
    NBA->>Audit: Registra SIGUIENTE_ACCION_GENERADA
```

### Prioridad de Atención (`PriorityPolicyConfig`)

| Rank | Tipo de Caso (`caseType`) | SLA | Score Base |
|---|---|---|---|
| 1 | `cita_acordada` | 5 min | 100 |
| 2 | `chat_reciente` | 5 min | 90 |
| 3 | `devolucion_glosa` | 30 min | 80 |
| 4 | `llamada_solicitada` | 60 min | 70 |
| 5 | `lead_nuevo` | 15 min | 60 |
| 6 | `credito_sin_seguimiento_12h` | 120 min | 50 |

*(Si el tiempo transcurrido supera el SLA, el priorizador añade un impulso automático de `+15 pts` y marca `slaBreached = true`.)*

### Etiquetas Operativas (`triggerActionTag`)

- `#NO_CONTESTA`: envía WhatsApp automático, agenda recordatorio en `+2h` e incrementa `cadenceState.retryCount`.
- `#ESTA_OCUPADO`: agenda recordatorio urgente a la hora acordada (por defecto `16:00`) y confirma por WhatsApp.
- `#FALTAN_DOCUMENTOS`: envía WhatsApp solicitando 2 últimos desprendibles y cédula al 150%.
- `#SOLICITA_MENOR_MONTO`: ajusta `requestedAmount` al 75% (o monto explícito) y recalibra capacidad (`* 1.15`).
- `#RECHAZADO_FINANCIERA`: registra rechazo, reasigna `selectedFinanciera` al **Plan B**, crea tarea obligatoria urgente y registra `R-MULTI-FIN-01` **sin mover el lead a rechazado**.
- `#CLIENTE_INTERESADO`: registra nota de interés y, si está en `lead_nuevo`, avanza automáticamente a `perfilamiento`.

---

## 5. Flujo de Gobernanza, RBAC y Excepciones Justificadas

```mermaid
flowchart LR
    ADV["Asesor (advisor)"] -->|"Radica excepción sobre política configurable"| EXC["JustifiedExceptionRequest (pendiente)"]
    SUP["Supervisor (supervisor)"] -->|"Aprueba / Rechaza"| EXC
    EXC -->|"aprobada"| BYPASS["PipelineGateEvaluator autoriza salto de esa política para ese Lead"]
    SUP -->|"Toggle isActive solo CONFIGURABLE_POLICY"| RULES["Catálogo de Reglas"]
    SUP -->|"Actualiza ranking SLA"| PRIO["PriorityPolicyConfig"]
    ADM["Administrador (admin)"] -->|"CRUD reglas dinámicas, ActionTags, Tableros, SMMLV"| RULES
    RULES -.->|"HARD_RESTRICTION (R-LIB-001, 002, 004, 006)"| LOCK["Inmutable: nunca desactivable ni excepcionable"]
```

| Acción | `advisor` | `supervisor` | `admin` |
|---|:---:|:---:|:---:|
| Operar leads, completar tareas, disparar etiquetas | Sí | Sí | Sí |
| Radicar `JustifiedExceptionRequest` (solo políticas configurables) | Sí | Sí | Sí |
| Aprobar / rechazar excepciones y `forceOverride` | No | Sí | Sí |
| Activar / desactivar reglas `CONFIGURABLE_POLICY` | No | Sí | Sí |
| Actualizar `PriorityPolicyConfig` | No | Sí | Sí |
| Crear / eliminar reglas dinámicas, etiquetas custom, tableros y SMMLV | No | No | Sí |
| Desactivar o excepcionar `HARD_RESTRICTION` (Ley 1527) | No | No | No |

---

## 6. Flujo del Simulador Sandbox Aislado (Sub-motor 6)

El simulador evalúa `R-LIB-001` a `R-LIB-006` (incluyendo `edad + plazo <= 84` para pensionados) y proyecta la matriz multientidad construyendo un `Lead` virtual efímero en memoria:

- **Cero mutación**: no modifica `LeadRepository`, `DecisionLogRepository` ni `LiveEventStore`.
- **Consumo**:
  - Por librería: `engine.sandbox.simulate.execute(input)`.
  - Por API REST: `POST /api/sandbox/simulate`.
  - Por CLI: `node src/interfaces/cli/simulator.ts --all-presets` o `--interactive`.

---

## 7. Recorrido Práctico de Extremo a Extremo (REST API)

Con el servidor levantado (`PORT=3000 node src/interfaces/http/server.ts`):

1. **Crear / sanitizar un prospecto**:
   ```bash
   curl -X POST http://127.0.0.1:3000/api/leads \
     -H "content-type: application/json" \
     -d '{"id":"LEAD-100","fullName":"Ana María Ruiz","libranzaSegment":"Pensionado","pagaduria":"Colpensiones","convenioCodigo":"CONV-COLP-001","age":63,"monthlyIncome":4500000,"currentDiscounts":300000,"creditScoreSimulated":760,"requestedAmount":30000000}'
   ```
2. **Calificar el prospecto (Sub-motor 3)**:
   ```bash
   curl -X POST http://127.0.0.1:3000/api/qualification/lead/LEAD-100 \
     -H "x-actor-role: advisor" -H "x-actor-name: ana.comercial"
   ```
3. **Consultar matriz de probabilidades multientidad (Sub-motor 2)**:
   ```bash
   curl http://127.0.0.1:3000/api/leads/LEAD-100/entity-probabilities
   ```
4. **Avanzar por el pipeline vía etiqueta `#CLIENTE_INTERESADO` o `move-stage` (Sub-motores 1 y 5)**:
   ```bash
   curl -X POST http://127.0.0.1:3000/api/automation/action-tags/trigger \
     -H "content-type: application/json" -H "x-actor-role: advisor" \
     -d '{"leadId":"LEAD-100","tag":"#CLIENTE_INTERESADO"}'
   ```
5. **Revisar cola priorizada y bitácora inmutable de auditoría**:
   ```bash
   curl http://127.0.0.1:3000/api/priority/queue
   curl "http://127.0.0.1:3000/api/governance/audit-logs?leadId=LEAD-100"
   ```
