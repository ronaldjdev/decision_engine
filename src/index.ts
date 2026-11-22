// Public Library API for @crediflow/decision-engine

// Composition Root
export {
  createDecisionEngine,
  type DecisionEngine,
  type DecisionEngineAdapters,
} from './composition/DecisionEngineContainer.ts';

// Shared Kernel
export * from './shared/domain/DomainError.ts';
export * from './shared/domain/Entity.ts';
export * from './shared/domain/ValueObject.ts';
export * from './shared/domain/Clock.ts';
export * from './shared/domain/IdGenerator.ts';
export * from './shared/domain/value-objects/Money.ts';
export * from './shared/domain/value-objects/FinancialParameters.ts';
export * from './shared/domain/value-objects/PipelineStage.ts';
export * from './shared/domain/value-objects/LibranzaCapacity.ts';
export * from './shared/domain/value-objects/Lead.ts';
export * from './shared/infrastructure/SystemClock.ts';
export * from './shared/infrastructure/CryptoIdGenerator.ts';
export * from './shared/infrastructure/seed/SeedData.ts';

// Feature: Governance
export * from './features/governance/domain/Role.ts';
export * from './features/governance/domain/DeterministicRule.ts';
export * from './features/governance/domain/RuleConditionEvaluator.ts';
export * from './features/governance/domain/EngineDecisionLog.ts';
export * from './features/governance/domain/JustifiedExceptionRequest.ts';
export type * from './features/governance/domain/ports/RuleRepository.ts';
export type * from './features/governance/domain/ports/DecisionLogRepository.ts';
export type * from './features/governance/domain/ports/ExceptionRequestRepository.ts';

// Feature: Leads
export * from './features/leads/domain/LeadSanitizer.ts';
export type * from './features/leads/domain/ports/LeadRepository.ts';
export type * from './features/leads/domain/ports/BoardRepository.ts';

// Feature: Pipeline Gates (Sub-motor 1)
export type * from './features/pipeline-gates/domain/TransitionCheckResult.ts';
export * from './features/pipeline-gates/domain/PipelineGateEvaluator.ts';

// Feature: Entity Matching (Sub-motor 2)
export type * from './features/entity-matching/domain/FinancialEntityPolicy.ts';
export type * from './features/entity-matching/domain/FinancialEntityProbability.ts';
export * from './features/entity-matching/domain/MultiEntityProbabilityService.ts';
export type * from './features/entity-matching/domain/ports/FinancialEntityPolicyRepository.ts';

// Feature: Qualification (Sub-motor 3)
export type * from './features/qualification/domain/QualificationModels.ts';
export * from './features/qualification/domain/DeterministicQualifierService.ts';

// Feature: Next Best Action & Prioritization (Sub-motor 4)
export * from './features/next-best-action/domain/PriorityPolicy.ts';
export * from './features/next-best-action/domain/TaskOutcomeRules.ts';
export type * from './features/next-best-action/domain/ports/PriorityPolicyRepository.ts';

// Feature: Automation (Sub-motor 5)
export type * from './features/automation/domain/ActionTag.ts';
export type * from './features/automation/domain/RailsLiveEvent.ts';
export type * from './features/automation/domain/ports/ActionTagRepository.ts';
export type * from './features/automation/domain/ports/NotificationGateway.ts';
export type * from './features/automation/domain/ports/LiveEventStore.ts';

// Feature: Sandbox Simulator (Sub-motor 6)
export type * from './features/sandbox-simulator/domain/SimulationModels.ts';
export * from './features/sandbox-simulator/domain/SandboxSimulatorService.ts';

// Driving Adapter: HTTP REST API
export { createDecisionEngineHttpServer } from './interfaces/http/HttpServer.ts';
