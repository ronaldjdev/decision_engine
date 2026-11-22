import type { ManageActionTagsUseCase } from '../features/automation/application/ManageActionTagsUseCase.ts';
import type { RunRailsDaemonSweepUseCase } from '../features/automation/application/RunRailsDaemonSweepUseCase.ts';
import type { TriggerActionTagUseCase } from '../features/automation/application/TriggerActionTagUseCase.ts';
import type { ActionTagRepository } from '../features/automation/domain/ports/ActionTagRepository.ts';
import type { LiveEventStore } from '../features/automation/domain/ports/LiveEventStore.ts';
import type { NotificationGateway } from '../features/automation/domain/ports/NotificationGateway.ts';
import type { EvaluateEntityProbabilitiesUseCase } from '../features/entity-matching/application/EvaluateEntityProbabilitiesUseCase.ts';
import type { FinancialEntityPolicyRepository } from '../features/entity-matching/domain/ports/FinancialEntityPolicyRepository.ts';
import type { ManageExceptionsUseCase } from '../features/governance/application/ManageExceptionsUseCase.ts';
import type { ManageRulesUseCase } from '../features/governance/application/ManageRulesUseCase.ts';
import type { QueryAuditLogsUseCase } from '../features/governance/application/QueryAuditLogsUseCase.ts';
import type { DecisionLogRepository } from '../features/governance/domain/ports/DecisionLogRepository.ts';
import type { ExceptionRequestRepository } from '../features/governance/domain/ports/ExceptionRequestRepository.ts';
import type { RuleRepository } from '../features/governance/domain/ports/RuleRepository.ts';
import type { ActorContext } from '../features/governance/domain/Role.ts';
import type { BoardRepository } from '../features/leads/domain/ports/BoardRepository.ts';
import type { LeadRepository } from '../features/leads/domain/ports/LeadRepository.ts';
import type { CompleteTaskUseCase } from '../features/next-best-action/application/CompleteTaskUseCase.ts';
import type { PrioritizeWorkQueueUseCase } from '../features/next-best-action/application/PrioritizeWorkQueueUseCase.ts';
import type { UpdatePriorityPolicyUseCase } from '../features/next-best-action/application/UpdatePriorityPolicyUseCase.ts';
import type { PriorityPolicyRepository } from '../features/next-best-action/domain/ports/PriorityPolicyRepository.ts';
import type { CheckStageTransitionUseCase } from '../features/pipeline-gates/application/CheckStageTransitionUseCase.ts';
import type { MoveLeadStageUseCase } from '../features/pipeline-gates/application/MoveLeadStageUseCase.ts';
import type { QualifyIndividualLeadUseCase } from '../features/qualification/application/QualifyIndividualLeadUseCase.ts';
import type { RunBulkQualificationUseCase } from '../features/qualification/application/RunBulkQualificationUseCase.ts';
import type { RunSandboxSimulationUseCase } from '../features/sandbox-simulator/application/RunSandboxSimulationUseCase.ts';
import type { Clock } from '../shared/domain/Clock.ts';
import type { IdGenerator } from '../shared/domain/IdGenerator.ts';
import type {
  FinancialParametersProps,
  FinancialParametersStore,
} from '../shared/domain/value-objects/FinancialParameters.ts';
import type { LeadProps } from '../shared/domain/value-objects/Lead.ts';
import type { PipelineBoard } from '../shared/domain/value-objects/PipelineStage.ts';

/**
 * Conjunto opcional de Driven Adapters y opciones de inicialización inyectables
 * al Composition Root (`createDecisionEngine`).
 *
 * Cualquier puerto omitido se resuelve automáticamente con su adaptador `InMemory`
 * precargado con los datos semilla del dominio.
 */
export interface DecisionEngineAdapters {
  /** Reloj del sistema o reloj determinístico (`FixedClock`) para pruebas. */
  clock?: Clock;
  /** Generador de identificadores únicos (`CryptoIdGenerator` o `SequentialIdGenerator`). */
  idGenerator?: IdGenerator;
  /** Sobrescritura parcial de parámetros financieros iniciales (SMMLV, modo de cuota, etc.). */
  financialParameters?: Partial<FinancialParametersProps>;
  /** Si es `false`, inicia el repositorio de leads vacío sin datos de ejemplo. */
  seedSampleLeads?: boolean;
  leadRepository?: LeadRepository;
  boardRepository?: BoardRepository;
  ruleRepository?: RuleRepository;
  decisionLogRepository?: DecisionLogRepository;
  exceptionRepository?: ExceptionRequestRepository;
  policyRepository?: FinancialEntityPolicyRepository;
  priorityPolicyRepository?: PriorityPolicyRepository;
  actionTagRepository?: ActionTagRepository;
  notificationGateway?: NotificationGateway;
  liveEventStore?: LiveEventStore;
}

/**
 * Colección consolidada de todos los Driven Ports (repositorios y gateways)
 * resueltos y compartidos entre los distintos features del motor.
 */
export interface DecisionEngineRepositories {
  readonly leads: LeadRepository;
  readonly boards: BoardRepository;
  readonly rules: RuleRepository;
  readonly decisionLogs: DecisionLogRepository;
  readonly exceptions: ExceptionRequestRepository;
  readonly financialEntities: FinancialEntityPolicyRepository;
  readonly priorityPolicy: PriorityPolicyRepository;
  readonly actionTags: ActionTagRepository;
  readonly notifications: NotificationGateway;
  readonly liveEvents: LiveEventStore;
}

/**
 * Contexto interno de ejecución compartido por los ensambladores de módulos del Composition Root.
 */
export interface EngineRuntimeContext {
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly financialParamsStore: FinancialParametersStore;
  readonly repositories: DecisionEngineRepositories;
}

/** Fachada de gestión de Leads y Tableros expuesta por el motor. */
export interface LeadsModuleFacade {
  list(): LeadProps[];
  getById(id: string): LeadProps | undefined;
  upsert(input: Partial<LeadProps> & { id: string; fullName: string }): LeadProps;
  createCustomBoard(actor: ActorContext, board: PipelineBoard): PipelineBoard;
  listBoards(): PipelineBoard[];
}

/** Fachada de configuración financiera parametrizable (SMMLV, Ley 1527, amortización). */
export interface ConfigModuleFacade {
  getFinancialParameters(): Readonly<FinancialParametersProps>;
  updateFinancialParameters(
    actor: ActorContext,
    patch: Partial<FinancialParametersProps>,
  ): Readonly<FinancialParametersProps>;
}

/** Módulo de gobernanza (reglas dinámicas, excepciones justificadas y auditoría). */
export interface GovernanceModule {
  readonly rules: ManageRulesUseCase;
  readonly exceptions: ManageExceptionsUseCase;
  readonly auditLogs: QueryAuditLogsUseCase;
}

/** Sub-motor 1: Compuertas de transición del pipeline. */
export interface PipelineGatesModule {
  readonly canTransitionStage: CheckStageTransitionUseCase;
  readonly moveLeadStage: MoveLeadStageUseCase;
}

/** Sub-motor 2: Motor de probabilidades multientidad y Plan B. */
export interface EntityMatchingModule {
  readonly evaluateProbabilities: EvaluateEntityProbabilitiesUseCase;
}

/** Sub-motor 3: Calificación determinística y clasificación por Tiers. */
export interface QualificationModule {
  readonly qualifyIndividual: QualifyIndividualLeadUseCase;
  readonly runBulkQualification: RunBulkQualificationUseCase;
}

/** Sub-motor 4: Siguiente Mejor Acción y política de priorización operativa. */
export interface NextBestActionModule {
  readonly completeTask: CompleteTaskUseCase;
  readonly prioritizeQueue: PrioritizeWorkQueueUseCase;
  readonly priorityPolicy: UpdatePriorityPolicyUseCase;
}

/** Sub-motor 5: Etiquetas operativas y demonio continuo multicanal. */
export interface AutomationModule {
  readonly triggerActionTag: TriggerActionTagUseCase;
  readonly runDaemonSweep: RunRailsDaemonSweepUseCase;
  readonly manageActionTags: ManageActionTagsUseCase;
}

/** Sub-motor 6: Simulador Sandbox aislado sin mutación productiva. */
export interface SandboxModule {
  readonly simulate: RunSandboxSimulationUseCase;
}

/**
 * Fachada principal del **Motor de Decisiones Determinístico (CrediFlow CRM)**.
 * Agrupa los 6 sub-motores, gobernanza, configuración financiera y acceso a puertos.
 */
export interface DecisionEngine {
  readonly clock: Clock;
  readonly repositories: DecisionEngineRepositories;
  readonly leads: LeadsModuleFacade;
  readonly config: ConfigModuleFacade;
  readonly pipelineGates: PipelineGatesModule;
  readonly entityMatching: EntityMatchingModule;
  readonly qualification: QualificationModule;
  readonly nextBestAction: NextBestActionModule;
  readonly automation: AutomationModule;
  readonly sandbox: SandboxModule;
  readonly governance: GovernanceModule;
}
