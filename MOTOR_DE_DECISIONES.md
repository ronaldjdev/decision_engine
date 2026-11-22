# Documentación Técnica y Funcional del Motor de Decisiones (CrediFlow CRM – Credit Libranzas)

Este documento describe el funcionamiento actual del **Motor de Decisiones Determinístico** implementado en la aplicación, detallando su arquitectura, **datos de entrada**, **reglas y algoritmos de evaluación**, **datos de salida** y las **consideraciones técnicas, operativas y de gobernanza** que se deben tener en cuenta para su operación y evolución.

---

## 1. Visión General y Arquitectura Actual

El motor de decisiones opera bajo un enfoque **determinístico** (sin discrecionalidad subjetiva del asesor): ante un mismo conjunto de datos y eventos, siempre produce el mismo veredicto, bloqueo o siguiente acción obligatoria, dejando traza en una bitácora de auditoría (`EngineDecisionLog`).

Actualmente el motor está centralizado en el estado global de la aplicación (`src/context/CRMContext.tsx`), apoyado en los modelos de `src/types/crm.ts`, las políticas base de `src/data/seedData.ts`, el simulador sandbox (`src/components/modules/decisionEngine/DecisionEngineSimulatorView.tsx`) y la consola de gobernanza (`src/components/modules/engineRules/EngineRulesView.tsx`).

Se compone de **6 sub-motores coordinados**:

1. **Compuertas de Transición del Pipeline (`canTransitionStage` / `moveLeadStage`)**: Valida si un prospecto puede avanzar entre fases del embudo y bloquea saltos o incumplimientos normativos.
2. **Motor de Probabilidades Multientidad (`calculateFinancialEntityProbabilities`)**: Evalúa simultáneamente al prospecto frente a las políticas de las 5 financieras aliadas (*Valorenz, Capital, Bancoomeva, Coopcentral, Finandina*) y habilita rutas de **Plan B**.
3. **Evaluador Determinístico de Calificación y Tiers (`qualifyLeadDeterministic` / `runBulkQualification` / `qualifyIndividualLead`)**: Puntúa prospectos (0–100) en lote o individualmente, los clasifica por Tier (`TIER_A_PLUS` a `DECLINADO`) y define su cadencia multicanal.
4. **Motor de Siguiente Mejor Acción (`completeTask`) y Política de Priorización (`PriorityPolicyConfig`)**: Al completar una tarea, calcula automáticamente la siguiente etapa, tarea obligatoria o recordatorio, priorizando la cola por compromiso horario y SLA.
5. **Automatización por Etiquetas Operativas (`triggerActionTag`) y Demonio Continuo (`runRailsDaemonSweep`)**: Dispara acciones automáticas ante eventos de contacto/rechazo (`#NO_CONTESTA`, `#RECHAZADO_FINANCIERA`, etc.) y monitorea estados de WhatsApp, llamadas VoIP y correos.
6. **Simulador Sandbox (`DecisionEngineSimulatorView`)**: Laboratorio aislado para probar las compuertas `R-LIB-001` a `R-LIB-006` modificando parámetros sin alterar la base productiva.

---

## 2. Datos de Entrada (Inputs)

### 2.1. Las 9 Características Clave del Prospecto (`Lead`)

El motor evalúa los atributos del objeto `Lead` (`src/types/crm.ts`):

| # | Característica | Campos en `Lead` | Tipo / Valores | Uso en el Motor |
|---|---|---|---|---|
| 1 | **Tipo de Cliente (Segmento)** | `libranzaSegment`, `employmentType` | `'Pensionado' \| 'Empleado Público' \| 'Empleado Privado'` | Filtra qué entidades financieras atienden el perfil y asigna puntaje de estabilidad en Master of Sales. |
| 2 | **Pagaduría y Convenio** | `pagaduria`, `convenioCodigo` | `string` (ej. `'Colpensiones'`, `'CONV-COLP-001'` o `'SIN_CONVENIO'`) | Compuerta obligatoria (`R-LIB-001`): sin convenio activo se bloquea el trámite y el lead se declina. |
| 3 | **Edad** | `age`, `birthDate` | `number`, `string` | Evalúa asegurabilidad (`edad <= maxAge` por entidad o `edad + plazo <= 84` para pensionados). |
| 4 | **Situación Laboral / Pensional** | `pensionOrEmploymentDetails` (`type`, `seniorityYears`, `retirementFund`, `contractType`, `verifiedStatus`) | Objeto estructurado | Soporte de estabilidad de ingresos y riesgo de revocabilidad del descuento. |
| 5 | **Ingresos** | `monthlyIncome`, `netIncome`, `incomeDetails` (`baseIncome`, `additionalConcepts`, `totalVerified`, `minWageMultiple`) | `number` (COP) | Validación de salario mínimo legal (`>= $1.400.000` en compuerta) y cálculo base de Ley 1527. |
| 6 | **Descuentos y Obligaciones** | `currentDiscounts`, `obligationsDetails` (`existingDiscounts`, `activeCredits`, `portfolioBuyoutEligible`) | `number` (COP) | Se resta del 50% neto para calcular el cupo libre y evaluar viabilidad de compra de cartera. |
| 7 | **Capacidad Disponible (Ley 1527)** | `calculatedLibranzaCapacity`, `capacityDetails` (`availableCapacity`, `maxInstallment`, `isZeroOrNegative`) | `number` (COP) | Restricción dura (`R-LIB-002`): si es `<= 0` bloquea el paso a oferta/cierre; si es `< $100.000` declina en calificación masiva. |
| 8 | **Situación Crediticia (Buró)** | `creditScoreSimulated`, `creditBureauDetails` (`score`, `isReported`, `reportedAmount`, `hasPazYSalvo`, `bureau`) | `number` (score), `boolean` (`isReported`) | Penaliza entidades tradicionales (Bancoomeva, Coopcentral, Finandina) y prioriza entidades tolerantes (Valorenz, Capital). |
| 9 | **Canales y Disponibilidad** | `phone`, `email`, `contactPreferences` (`preferredChannel`, `preferredTimeSlot`, `agreedAppointment`) | Objeto estructurado | Orienta la cadencia multicanal, citas acordadas y reprogramaciones. |

### 2.2. Datos de Operación, Expediente y Contexto

Además de los atributos del cliente, el motor consume en tiempo real:

- **Solicitud de crédito**: `requestedAmount` (COP), `creditProduct`, `boardId` (tablero asignado), `currentStageId` (etapa actual).
- **Evidencias documentales**: `documents[]` (cantidad, `name` y `status`: `'pendiente' | 'verificado' | 'rechazado'`).
- **Preaprobación y visado**: `qualificationData` (`hasPreapproval`, `convenioActive`, `capacityApproved`, `visadoStatus`, `recommendedTermMonths`, `approvedAmount`).
- **Historial multientidad**: `selectedFinanciera`, `rejectedFinancieras[]`.
- **Tareas y comunicaciones previas**: `tasks[]` (especialmente tareas con `mandatory: true` en estado `pendiente`, `en_progreso` o `vencida`), `messages[]` (llamadas VoIP o mensajes del cliente), `notesHistory[]`.
- **Estado de procesos continuos (`LeadProcessState`)**: estado vivo de `chat`, `email` y `call` por cada lead.
- **Disparadores de usuario**: `outcome` (resultado elegido al completar tarea), `tag` (etiqueta operativa `#...`), `targetStageId` (etapa destino al arrastrar/mover tarjeta), `forceOverride` (bandera booleana para saltar compuertas internamente).

### 2.3. Datos de Configuración y Políticas del Motor

- **Políticas por Entidad Financiera (`FINANCIAL_ENTITY_POLICIES`)**: Segmentos aceptados, tolerancia a reportes, edad máxima, ingreso mínimo en SMMLV, DTI máximo, score mínimo, convenios clave, tasa M.V./E.A., plazo máximo y monto máximo.
- **Catálogo de Reglas (`DeterministicRule[]`)**: Reglas `R-LIB-001` a `R-LIB-008` más reglas creadas por el administrador (categoría dura vs. configurable, estado `isActive`, etapa).
- **Política de Priorización (`PriorityPolicyConfig`)**: Ranking de los 6 tipos de casos con `slaMinutes` y `scoreBase`.
- **Catálogo de Etiquetas Operativas (`CommercialActionTag[]`)**: Etiquetas estándar y personalizadas con `automationType`, plantillas de mensaje, etapa destino y prioridad.

### 2.4. Entradas Específicas del Simulador Sandbox (`DecisionEngineSimulatorView`)

El simulador recibe de forma controlada (sin mutar los leads reales):
- `simSegment`, `simPagaduria`, `simConvenioActivo`
- `simNetIncome` ($1.4M–$12M COP), `simExistingDiscounts` ($0–$4M COP), `simRequestedInstallment` ($200k–$3.5M COP)
- `simApplicantAge` (50–85 años) y `simLoanTermYears` (1–10 años) — evaluados cuando `simSegment === 'Pensionado'`
- `simCallOutcome` (resultado de primer contacto)
- Banderas booleanas de hitos: `simColillasVerified`, `simVisadoApproved`, `simPromissorySigned`

---

## 3. Reglas, Fórmulas y Lógica de Decisión

### 3.1. Fórmula Legal Ley 1527 (Remanente Inembargable del 50%)

El cálculo transversal aplicado en el motor es:

$$\text{Remanente Inembargable (50\%)} = \text{Ingreso Neto} \times 0.50$$

$$\text{Capacidad Disponible de Libranza} = \max\big(0,\ (\text{Ingreso Neto} \times 0.50) - \text{Descuentos Previos de Nómina}\big)$$

- En `sanitizeLead` (cuando falta `netIncome`), se asume `netIncome = round(monthlyIncome * 0.88)`.
- En `qualifyLeadDeterministic` (cuando falta `netIncome`), se asume `netIncome = monthlyIncome * 0.85` y se estima una cuota de referencia de:

$$\text{Cuota Estimada} = \text{round}\left(\frac{\text{Monto Solicitado}}{60} \times 1.35\right)$$

### 3.2. Compuertas de Transición de Etapas (`canTransitionStage`)

#### A. En el Pipeline Estándar de Libranzas (`board-libranzas-principal`)

El motor evalúa en orden estricto las siguientes compuertas antes de permitir mover un lead a `targetStageId`:

| Orden | Regla / Código | Condición Evaluada | Si NO cumple (Bloqueo) |
|---|---|---|---|
| 1 | Excepción de cierre | `targetStageId === 'cerrado_no_interesado'` | Autoriza cierre inmediatamente. |
| 2 | `R-SEC-01` (Secuencia) | `targetStage.order - currentStage.order <= 1` | Bloquea saltos de etapas; exige progresión paso a paso. |
| 3 | `R-TSK-MANDATORY` | No existe tarea del lead con `mandatory === true` en estado `pendiente`, `en_progreso` o `vencida`. | Bloquea avance hasta completar la tarea obligatoria activa. |
| 4 | `R-LIB-001` (Convenio) | `lead.convenioCodigo !== 'SIN_CONVENIO'` y `lead.pagaduria` presente. | Bloquea avance por ausencia de convenio activo. |
| 5 | `R-LIB-001` → `perfilamiento` | Existe al menos un mensaje (`voip_call` o `sender === 'lead'`) o una nota en `notesHistory` con `"contacto"` o `"interesad"`. | Bloquea paso a *2. Perfilamiento*. |
| 6 | `R-LIB-002` / `R-LIB-002B` → `oferta_cierre` | `calculatedLibranzaCapacity > 0` **y** `monthlyIncome >= 1.400.000`. | Bloquea paso a *3. Oferta y Cierre* (Ley 1527 / 1 SMMLV). |
| 7 | `R-LIB-FIN` y `R-LIB-004` → `en_estudio` | `lead.selectedFinanciera` definida **y** `documents.length >= 2` **y** todos los documentos en estado `'verificado'`. | Bloquea radicación a *4. En Estudio*. |
| 8 | `R-LIB-005` → `aprobado_formalizacion` | `lead.qualificationData?.hasPreapproval === true`. | Bloquea paso a *5. Aprobado y Formalización*. |
| 9 | `R-LIB-006` → `desembolsado` | Existe al menos un documento cuyo `name` contenga `"pagaré"`, `"deceval"` o `"libranza"`. | Bloquea paso a *6. Desembolsado*. |

> **Transformación automática a Cliente Activo**: Cuando `moveLeadStage` autoriza el movimiento a `desembolsado`, `credito_desembolsado`, a una fase cuyo ID contenga `"desembolso"`, o a la última fase de un tablero con más de 2 fases, el motor marca automáticamente `lead.isClient = true` y registra `lead.clientSince`.

#### B. En Tableros / Procesos Personalizados (`isDefault === false`)

Para los tableros personalizados creados por el administrador, `canTransitionStage` relaja las compuertas fijas de libranza estándar y valida únicamente **`R-TSK-MANDATORY`** (no tener tareas obligatorias pendientes/en progreso/vencidas), permitiendo avanzar libremente entre las fases personalizadas del tablero.

### 3.3. Catálogo de Reglas de Gobernanza (`R-LIB-001` a `R-LIB-008`)

| Código | Categoría | Gobernanza | Propósito |
|---|---|---|---|
| `R-LIB-001` | Restricción Dura | Ley 1527 / Compliance Legal | Validación de convenio activo y tarea obligatoria de primer contacto (`SLA < 15 min`). |
| `R-LIB-002` | Restricción Dura | Ley 1527 / Compliance Legal | Protección del 50% inembargable; capacidad `$0` bloquea avance sin compra de cartera. |
| `R-LIB-003` | Política Configurable | Gerencia de Riesgos | Edad máxima al vencimiento según póliza de cada entidad (70 a 84 años). |
| `R-LIB-004` | Restricción Dura | Ley 1527 / Compliance Legal | Mínimo 2 soportes verificados (cédula y colillas) para radicar a estudio. |
| `R-LIB-005` | Política Configurable | Comité Comercial | Selección obligatoria de entidad financiera principal antes de radicar. |
| `R-LIB-006` | Restricción Dura | Ley 1527 / Compliance Legal | Pagaré desmaterializado DECEVAL y visado confirmado antes de desembolso. |
| `R-LIB-007` | Política Configurable | Gerencia de Riesgos | Activación automática de **Plan B** ante rechazo de una financiera (no cerrar al cliente). |
| `R-LIB-008` | Política Configurable | Gerencia de Riesgos | Tolerancia a reportes en centrales (habilita Valorenz/Capital; restringe Bancoomeva/Finandina). |

### 3.4. Motor de Probabilidades Multientidad (`calculateFinancialEntityProbabilities`)

Para cada una de las 5 entidades en `FINANCIAL_ENTITY_POLICIES`:

1. **Si la entidad ya está en `rejectedFinancieras`**: retorna `probability = 0%`, `status = 'rechazada'`.
2. **Si `libranzaSegment` no está en `policy.acceptedSegments`**: retorna `probability = 10%`, `status = 'no_aplica'`.
3. **Cálculo de probabilidad** (parte en **72%**):
   - **Convenio con pagaduría** (coincidencia textual por primera palabra entre `pagaduria` y `keyAgreements`): `+14` si hay convenio, `-15` si no.
   - **Edad vs. `policy.maxAge`**: `-40` si `age > maxAge`; `+6` si `age <= maxAge - 8`.
   - **Centrales de riesgo** (`isReported = creditBureauDetails?.isReported ?? (score < 600)`):
     - Si está reportado: `+10` si `toleratesCreditBureauReport === true`; `-45` si es `false`.
     - Si no está reportado: `+8` si `score >= policy.minScore`; `-18` si es menor.
   - **Capacidad Ley 1527**: si `capacity <= 0` se trunca a máximo `15%`; si `capacity > $1.200.000` suma `+6`.
4. **Normalización**: acotado entre **15% y 95%**.
5. **Clasificación de estado**:
   - `>= 80%`: `'altamente_recomendada'`
   - `55% – 79%`: `'viable'`
   - `35% – 54%`: `'condicional'`
   - `< 35%`: `'no_aplica'`
6. **Monto máximo estimado**: `min(policy.maxAmount, max(10.000.000, requestedAmount * (prob > 70 ? 1.2 : 0.9)))`.
7. **Ordenamiento**: descendente por `probability`.

#### Resumen de Políticas de las 5 Entidades Aliadas

| Entidad | Segmentos | Reportados | Edad Máx. | SMMLV Mín. | DTI Máx. | Score Mín. | Tasa E.A. | Plazo Máx. | Monto Máx. |
|---|---|---|---|---|---|---|---|---|---|
| **Valorenz** | Pensionado, Público | Sí | 84 | 1.0 | 50% | 560 | 18.9% | 144 m | $150M |
| **Capital** *(Plan B)* | Pensionado, Público | Sí | 80 | 1.1 | 55% | 580 | 19.9% | 120 m | $120M |
| **Bancoomeva** | Todos | No | 75 | 1.5 | 50% | 680 | 15.1% | 108 m | $180M |
| **Coopcentral** | Público, Pensionado | No | 72 | 1.2 | 50% | 620 | 17.1% | 96 m | $100M |
| **Finandina** | Todos | No | 70 | 1.5 | 45% | 650 | 16.1% | 84 m | $90M |

### 3.5. Calificación Determinística y Clasificación por Tiers (`qualifyLeadDeterministic`)

Puntaje base: **50 puntos** (tope máximo **100**):
- **Convenio activo** (pagaduría sin `"independiente"` ni `"sin convenio"` y `convenioCodigo !== 'SIN_CONVENIO'`): `+20 pts`.
- **Segmento**: `Pensionado` o `Empleado Público` `+15 pts`; `Empleado Privado` `+5 pts`.
- **Capacidad Ley 1527**: si `calculatedCapacity >= estimatedInstallment` suma `+20 pts`.
- **Score crediticio**: `>= 750` (`+25 pts`), `>= 650` (`+15 pts`), `>= 550` (`+5 pts`), `< 550` (`+0 pts`).

Asignación de **Tier**, **Veredicto** y **Canal**:

| Condición (en orden de evaluación) | `railTier` | `qualificationVerdict` | Canal Inicial | Prioridad Lead |
|---|---|---|---|---|
| Sin convenio activo | `DECLINADO` | `SIN_CONVENIO` | `sms` | `baja` |
| `calculatedCapacity < $100.000` | `DECLINADO` | `BLOQUEADO_LEY_1527` | `email` | `baja` |
| `score >= 90` y `capacityPassed` y `creditScore >= 720` | `TIER_A_PLUS` | `APROBADO_PARA_RAIL` | `voip_call` | `urgente` |
| `score >= 70` y `capacityPassed` | `TIER_A` | `APROBADO_PARA_RAIL` | `voip_call` | `alta` |
| `!capacityPassed` (pero capacidad >= $100k y convenio activo) | `TIER_C_CONDICIONAL` | `CONDICIONAL_PLAN_B` | `whatsapp` | `baja` |
| Resto de casos viables | `TIER_B` | `APROBADO_PARA_RAIL` | `voip_call` | `media` |

### 3.6. Política de Priorización Operativa (`PriorityPolicyConfig`)

La cola de trabajo del asesor no se ordena por monto ni por fecha de creación, sino por **ranking de compromiso y SLA**:

| Rank | `caseType` | Caso | SLA Límite | Score Base |
|---|---|---|---|---|
| 1 | `cita_acordada` | Cliente con cita acordada para ahora | 0 – 5 min | 100 pts |
| 2 | `chat_reciente` | Responder chat o mensaje reciente en vivo | < 5 min | 90 pts |
| 3 | `devolucion_glosa` | Devolución / glosa pendiente de subsanar | < 30 min | 80 pts |
| 4 | `llamada_solicitada` | Llamada pedida expresamente por el cliente | < 60 min | 70 pts |
| 5 | `lead_nuevo` | Lead nuevo recién captado por campaña | < 15 min | 60 pts |
| 6 | `credito_sin_seguimiento_12h` | Crédito en proceso sin seguimiento > 12h | < 2 horas | 50 pts |

### 3.7. Reglas de Etiquetas Operativas (`triggerActionTag`) y Demonio Continuo (`runRailsDaemonSweep`)

- **`#NO_CONTESTA`**: Envía WhatsApp automático, agenda recordatorio de llamada en +2h e incrementa `cadenceState.retryCount`.
- **`#ESTA_OCUPADO`**: Agenda recordatorio urgente en la hora acordada (por defecto `16:00`) y envía confirmación por WhatsApp.
- **`#FALTAN_DOCUMENTOS`**: Envía mensaje por WhatsApp solicitando 2 últimos desprendibles y cédula al 150%.
- **`#SOLICITA_MENOR_MONTO`**: Reduce `requestedAmount` al 75% (o monto recibido) y recalibra `calculatedLibranzaCapacity` (`* 1.15`).
- **`#RECHAZADO_FINANCIERA`**: Registra el rechazo en `rejectedFinancieras`, reasigna `selectedFinanciera` al Plan B (`Valorenz -> Capital`, `Bancoomeva -> Valorenz`, otros `-> Capital`), crea una tarea obligatoria urgente de activación de Plan B y registra un `EngineDecisionLog` (`R-MULTI-FIN-01`) **sin mover el lead a rechazado**.
- **`#CLIENTE_INTERESADO`**: Si está en `lead_nuevo`, avanza automáticamente a `perfilamiento`.
- **Etiquetas personalizadas**: Ejecutan la automatización definida en `automationType` (`enviar_whatsapp_recordatorio`, `crear_tarea_obligatoria`, `reprogramar_llamada`, `cambiar_etapa_pipeline`, `bloquear_avance`, `activar_plan_b`).
- **Demonio continuo (`runRailsDaemonSweep`)**: Recorre todos los leads activos (excluyendo `desembolsado` y `rechazado_perdido`) y, evitando duplicar tareas abiertas del mismo tipo, crea tareas obligatorias cuando detecta:
  1. `chat.status === 'mensaje_recibido_urgente'` → Tarea WhatsApp SLA 15 min.
  2. `call.status === 'no_contesta_reintento_requerido'` → Tarea Reintento VoIP (+2h).
  3. `email.status === 'propuesta_abierta' | 'click_simulacion'` → Tarea Cierre de Oferta (+30 min).

---

## 4. Datos de Salida (Outputs)

El motor produce salidas estructuradas y efectos operativos auditables:

### 4.1. Resultado de Validación de Compuerta (`TransitionCheckResult`)

```ts
{
  allowed: boolean;
  reason: string;
  ruleId?: string;
  ruleName?: string;
  missingCondition?: string;
}
```
- Si `allowed === false`: activa `transitionBlockerModal` en la interfaz mostrando la regla infringida y la condición faltante.
- Si `allowed === true`: actualiza `lead.currentStageId`, `isClient`/`clientSince` (si corresponde) y anexa nota en `lead.notesHistory`.

### 4.2. Registro de Auditoría Inmutable (`EngineDecisionLog`)

Cada bloqueo, transición autorizada, ejecución de tarea, activación de Plan B o calificación genera un log:

```ts
{
  id: string;
  timestamp: string;
  leadId: string;
  leadName: string;
  ruleId: string;
  ruleName: string;
  stageEvaluated: PipelineStageId;
  conditionsChecked: { condition: string; passed: boolean; actualValue: any }[];
  verdict: 'AUTORIZADO' | 'BLOQUEADO' | 'SIGUIENTE_ACCION_GENERADA';
  actionTaken: string;
  advisorResponsible: string;
}
```

### 4.3. Matriz de Probabilidades Multientidad (`FinancialEntityProbability[]`)

Arreglo ordenado de mayor a menor probabilidad por financiera con:
- `entityName`, `probability` (0–95%), `status`, `reason`
- `maxApprovedAmount`, `rateEA`, `termMonths`
- `isPlanBAlternative`, `selected`

### 4.4. Resultado de Calificación Masiva o Individual (`BulkQualificationBatch` / `BulkQualificationResultItem`)

- Resumen por lote: `totalLeadsEvaluated`, conteo por Tier (`tierAPlusCount`, `tierACount`, `tierBCount`, `tierConditionalCount`, `declinedCount`).
- Detalle por lead: `calculatedCapacity`, `railTier`, `railScore` (0–100), `qualificationVerdict`, `nextBestAction`, `cadenceChannel`, `cadenceStep`, `nextRetrySchedule`, `reasons[]`.
- Actualiza en el lead: `railTier`, `railScore`, `priority` y `cadenceState`.

### 4.5. Efectos Operativos Generados

- **Tareas obligatorias (`CommercialTask`)**: creadas por `completeTask`, `triggerActionTag` y `runRailsDaemonSweep`, vinculadas a `lead.currentMandatoryTaskId`.
- **Recordatorios (`Reminder`)**: agendados ante no respuesta o reprogramación.
- **Mensajes omnicanal (`OmnichannelMessage`)**: plantillas de WhatsApp disparadas automáticamente.
- **Eventos en vivo (`RailsLiveEvent`)**: telemetría del demonio continuo (ventana de últimos 50 eventos).
- **Dictamen del Simulador Sandbox**: arreglo `evaluationSteps[]` (estado por compuerta `R-LIB-001`..`R-LIB-006`) + `finalVerdict` (`status`, `title`, `description`, `nextAction`, `nextStage`).

---

## 5. Qué se Debe Tener en Cuenta para su Funcionamiento

### 5.1. Gobernanza y Control de Acceso por Rol

- **Asesor (`advisor`)**: No puede desactivar, crear ni eliminar reglas del motor; no puede saltarse compuertas ni etapas. Si requiere una excepción a una política (ej. ingresos adicionales o sobreedad con codeudor), debe radicar una **Excepción Justificada (`JustifiedExceptionRequest`)**.
- **Supervisor (`supervisor`)**: Puede activar/desactivar reglas configurables, reordenar y aprobar la `PriorityPolicyConfig`, y aprobar o rechazar excepciones justificadas.
- **Administrador (`admin`)**: Tiene control total para crear/eliminar reglas en el catálogo, administrar etiquetas operativas, crear tableros personalizados y configurar integraciones.

### 5.2. Requisitos de Calidad de Datos para Evitar Falsos Bloqueos

Para que las compuertas y cálculos operen correctamente, los leads deben mantener actualizados estos campos críticos:
1. **`convenioCodigo` y `pagaduria`**: Nunca deben quedar vacíos ni con `'SIN_CONVENIO'` si el cliente sí tiene convenio; además, el emparejamiento de convenios en `calculateFinancialEntityProbabilities` compara la primera palabra del nombre de la pagaduría con `keyAgreements`.
2. **`monthlyIncome`, `netIncome`, `currentDiscounts` y `calculatedLibranzaCapacity`**: Una capacidad en `$0` o un ingreso bruto `< $1.400.000` bloquea automáticamente el avance a *Oferta y Cierre*.
3. **Verificación documental (`documents`)**: Para pasar a *En Estudio*, el expediente debe tener **al menos 2 documentos** y **todos** los documentos cargados deben estar en estado `'verificado'` (si hay un 3.er documento en estado `'pendiente'` o `'rechazado'`, la compuerta bloqueará la radicación).
4. **Nomenclatura del pagaré**: Para pasar a *Desembolsado* (`R-LIB-006`), el nombre del documento cargado debe incluir explícitamente alguna de las palabras `"pagaré"`, `"deceval"` o `"libranza"`.
5. **Preaprobación (`qualificationData.hasPreapproval`)**: Debe estar en `true` antes de intentar pasar a *Aprobado y Formalización*.
6. **Tareas obligatorias**: Mientras exista una tarea del lead con `mandatory: true` en estado `pendiente`, `en_progreso` o `vencida`, el lead **no podrá moverse de etapa** ni en el pipeline estándar ni en tableros personalizados.

### 5.3. Consideraciones Técnicas y Limitaciones de la Implementación Actual (Prototipo Cliente)

Al operar o planear el paso a producción, se deben tener presentes las siguientes características actuales del código:

1. **Persistencia local (`localStorage`)**: Todas las reglas, leads, tareas, políticas, bitácoras y excepciones se guardan en el navegador bajo claves `crediflow_*`. El botón **Reset Demo** limpia `localStorage` y restaura los datos semilla. En producción debe migrarse a base de datos centralizada con ejecución del motor en backend.
2. **Acoplamiento entre Catálogo Visual y Lógica Ejecutable**: Las reglas creadas o desactivadas desde `EngineRulesView` actualizan el estado `rules` y sirven de catálogo/gobernanza; sin embargo, las validaciones efectivas de `canTransitionStage`, `qualifyLeadDeterministic` y `DecisionEngineSimulatorView` están actualmente codificadas en TypeScript y **no consultan dinámicamente `rule.isActive` ni evalúan el arreglo `rule.conditions` en tiempo de ejecución**. Para un motor 100% dinámico en producción se recomienda implementar un intérprete de reglas que lea directamente el catálogo activo.
3. **Compatibilidad de Identificadores de Etapa**: El pipeline estándar usa las 7 etapas modernas (`lead_nuevo`, `perfilamiento`, `oferta_cierre`, `en_estudio`, `aprobado_formalizacion`, `desembolsado`, `rechazado_perdido`), mientras que algunas ramas internas de `completeTask` aún asignan identificadores heredados (`primer_contacto`, `documentacion_pendiente`, `solicitud_evaluacion`, `credito_aprobado`, `credito_desembolsado`, `cerrado_no_interesado`). Conviene unificar todos los destinos de `completeTask` a los 7 IDs actuales si se desea consistencia estricta con las columnas del tablero Kanban.
4. **Parámetros Financieros de Referencia**:
   - El SMMLV de referencia está fijo en `$1.400.000` en `canTransitionStage` y `$1.300.000` en `sanitizeLead`; debe parametrizarse como constante anual configurable.
   - La cuota en `qualifyLeadDeterministic` usa una aproximación fija (`(monto / 60) * 1.35`) en lugar de amortización francesa con la tasa E.A./M.V. y plazo máximo específico de cada financiera.
5. **Simulación de Fuentes Externas**: Las consultas de centrales de riesgo (`creditScoreSimulated`), envíos de WhatsApp/Email/VoIP, visado de pagaduría y firma DECEVAL operan actualmente de forma simulada en cliente. En producción deben conectarse a APIs reales mediante webhooks y servicios backend autenticados, preservando exactamente los mismos contratos de entrada/salida documentados en este archivo.
