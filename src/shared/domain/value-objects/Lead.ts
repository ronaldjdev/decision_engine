import { AggregateRoot } from '../Entity.ts';
import type { PipelineStageId } from './PipelineStage.ts';
import { DEFAULT_BOARD_ID, normalizeStageId } from './PipelineStage.ts';

export type LibranzaSegment =
  | 'Pensionado'
  | 'Empleado Público'
  | 'Empleado Privado';

export type DocumentStatus = 'pendiente' | 'verificado' | 'rechazado';

export interface LeadDocument {
  id: string;
  name: string;
  status: DocumentStatus;
  uploadedAt?: string;
}

export type TaskStatus = 'pendiente' | 'en_progreso' | 'vencida' | 'completada' | 'cancelada';

export type TaskPriority = 'urgente' | 'alta' | 'media' | 'baja';

export type TaskCategory =
  | 'primer_contacto'
  | 'whatsapp_urgente'
  | 'reintento_voip'
  | 'cierre_oferta'
  | 'plan_b_reactivacion'
  | 'validacion_documentos'
  | 'seguimiento_estudio'
  | 'formalizacion_pagare'
  | 'cita_acordada'
  | 'subsanar_glosa'
  | 'llamada_solicitada'
  | 'personalizada';

export interface CommercialTask {
  id: string;
  leadId: string;
  title: string;
  description?: string;
  category: TaskCategory;
  status: TaskStatus;
  mandatory: boolean;
  priority: TaskPriority;
  dueAt: string;
  slaMinutes: number;
  createdAt: string;
  completedAt?: string;
  outcome?: string;
  assignedAdvisor?: string;
}

export interface Reminder {
  id: string;
  leadId: string;
  message: string;
  scheduledFor: string;
  priority: TaskPriority;
  createdAt: string;
  completed: boolean;
}

export type MessageChannel = 'whatsapp' | 'voip_call' | 'email' | 'sms';

export interface OmnichannelMessage {
  id: string;
  leadId: string;
  channel: MessageChannel;
  sender: 'advisor' | 'lead' | 'system';
  content: string;
  sentAt: string;
}

export interface LeadNote {
  id: string;
  content: string;
  author: string;
  createdAt: string;
}

export interface PensionOrEmploymentDetails {
  type: LibranzaSegment;
  seniorityYears: number;
  retirementFund?: string;
  contractType?: 'Indefinido' | 'Planta' | 'Provisional' | 'Fijo' | 'Pensionado';
  verifiedStatus: boolean;
}

export interface IncomeDetails {
  baseIncome: number;
  additionalConcepts: number;
  totalVerified: number;
  minWageMultiple: number;
}

export interface ObligationsDetails {
  existingDiscounts: number;
  activeCredits: number;
  portfolioBuyoutEligible: boolean;
}

export interface CapacityDetails {
  availableCapacity: number;
  maxInstallment: number;
  isZeroOrNegative: boolean;
}

export interface CreditBureauDetails {
  score: number;
  isReported: boolean;
  reportedAmount?: number;
  hasPazYSalvo?: boolean;
  bureau?: 'DataCrédito' | 'TransUnion' | 'Simulado';
}

export interface ContactPreferences {
  preferredChannel: MessageChannel;
  preferredTimeSlot?: string;
  agreedAppointment?: string;
}

export interface QualificationData {
  hasPreapproval: boolean;
  convenioActive: boolean;
  capacityApproved: boolean;
  visadoStatus: 'pendiente' | 'aprobado' | 'rechazado';
  recommendedTermMonths?: number;
  approvedAmount?: number;
}

export type RailTier =
  | 'TIER_A_PLUS'
  | 'TIER_A'
  | 'TIER_B'
  | 'TIER_C_CONDICIONAL'
  | 'DECLINADO';

export interface CadenceState {
  channel: MessageChannel;
  step: number;
  retryCount: number;
  nextRetrySchedule?: string;
}

export interface LeadProcessState {
  chat: {
    status: 'idle' | 'mensaje_recibido_urgente' | 'respondido';
    lastUpdatedAt?: string;
  };
  email: {
    status: 'idle' | 'enviado' | 'propuesta_abierta' | 'click_simulacion';
    lastUpdatedAt?: string;
  };
  call: {
    status: 'idle' | 'conectada' | 'no_contesta_reintento_requerido' | 'solicitada_por_cliente';
    lastUpdatedAt?: string;
  };
  hasPendingGlosa?: boolean;
  lastFollowUpAt?: string;
}

export interface LeadProps {
  id: string;
  fullName: string;
  documentNumber?: string;
  // 1. Tipo de Cliente (Segmento)
  libranzaSegment: LibranzaSegment;
  employmentType: LibranzaSegment;
  // 2. Pagaduría y Convenio
  pagaduria: string;
  convenioCodigo: string;
  // 3. Edad
  age: number;
  birthDate?: string;
  // 4. Situación Laboral / Pensional
  pensionOrEmploymentDetails?: PensionOrEmploymentDetails;
  // 5. Ingresos
  monthlyIncome: number;
  netIncome?: number;
  incomeDetails?: IncomeDetails;
  // 6. Descuentos y Obligaciones
  currentDiscounts: number;
  obligationsDetails?: ObligationsDetails;
  // 7. Capacidad Disponible (Ley 1527)
  calculatedLibranzaCapacity: number;
  capacityDetails?: CapacityDetails;
  // 8. Situación Crediticia (Buró)
  creditScoreSimulated: number;
  creditBureauDetails?: CreditBureauDetails;
  // 9. Canales y Disponibilidad
  phone: string;
  email: string;
  contactPreferences?: ContactPreferences;

  // Datos de operación, expediente y contexto (Sección 2.2)
  requestedAmount: number;
  creditProduct: string;
  boardId: string;
  currentStageId: PipelineStageId;
  documents: LeadDocument[];
  qualificationData: QualificationData;
  selectedFinanciera?: string;
  rejectedFinancieras: string[];
  tasks: CommercialTask[];
  reminders: Reminder[];
  messages: OmnichannelMessage[];
  notesHistory: LeadNote[];
  processState: LeadProcessState;

  // Estado de calificación y prioridad
  railTier?: RailTier;
  railScore?: number;
  priority: TaskPriority;
  cadenceState: CadenceState;
  currentMandatoryTaskId?: string;
  assignedAdvisor: string;

  // Transformación a cliente
  isClient: boolean;
  clientSince?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Aggregate Root `Lead` (Prospecto de Libranza).
 *
 * Modela las 9 características clave del prospecto (Sección 2.1) junto con su expediente
 * operativo, documentos, tareas obligatorias, mensajes omnicanal y estado de procesos
 * continuos (`LeadProcessState`). Emite eventos de dominio en transiciones relevantes.
 */
export class Lead extends AggregateRoot<string> {
  public props: LeadProps;

  private constructor(props: LeadProps) {
    super(props.id);
    this.props = props;
  }

  public static create(input: Partial<LeadProps> & { id: string; fullName: string }): Lead {
    const now = input.createdAt ?? new Date().toISOString();
    const segment: LibranzaSegment = input.libranzaSegment ?? input.employmentType ?? 'Pensionado';
    const props: LeadProps = {
      id: input.id,
      fullName: input.fullName,
      documentNumber: input.documentNumber,
      libranzaSegment: segment,
      employmentType: input.employmentType ?? segment,
      pagaduria: input.pagaduria ?? '',
      convenioCodigo: input.convenioCodigo ?? 'SIN_CONVENIO',
      age: input.age ?? 45,
      birthDate: input.birthDate,
      pensionOrEmploymentDetails: input.pensionOrEmploymentDetails,
      monthlyIncome: input.monthlyIncome ?? 0,
      netIncome: input.netIncome,
      incomeDetails: input.incomeDetails,
      currentDiscounts: input.currentDiscounts ?? 0,
      obligationsDetails: input.obligationsDetails,
      calculatedLibranzaCapacity: input.calculatedLibranzaCapacity ?? 0,
      capacityDetails: input.capacityDetails,
      creditScoreSimulated: input.creditScoreSimulated ?? 600,
      creditBureauDetails: input.creditBureauDetails,
      phone: input.phone ?? '',
      email: input.email ?? '',
      contactPreferences: input.contactPreferences ?? {
        preferredChannel: 'whatsapp',
      },
      requestedAmount: input.requestedAmount ?? 15_000_000,
      creditProduct: input.creditProduct ?? 'Crédito de Libranza',
      boardId: input.boardId ?? DEFAULT_BOARD_ID,
      currentStageId: normalizeStageId(input.currentStageId ?? 'lead_nuevo'),
      documents: input.documents ? input.documents.map((d) => ({ ...d })) : [],
      qualificationData: input.qualificationData
        ? { ...input.qualificationData }
        : {
            hasPreapproval: false,
            convenioActive: (input.convenioCodigo ?? 'SIN_CONVENIO') !== 'SIN_CONVENIO',
            capacityApproved: (input.calculatedLibranzaCapacity ?? 0) > 0,
            visadoStatus: 'pendiente',
          },
      selectedFinanciera: input.selectedFinanciera,
      rejectedFinancieras: input.rejectedFinancieras ? [...input.rejectedFinancieras] : [],
      tasks: input.tasks ? input.tasks.map((t) => ({ ...t })) : [],
      reminders: input.reminders ? input.reminders.map((r) => ({ ...r })) : [],
      messages: input.messages ? input.messages.map((m) => ({ ...m })) : [],
      notesHistory: input.notesHistory ? input.notesHistory.map((n) => ({ ...n })) : [],
      processState: input.processState
        ? {
            chat: { ...input.processState.chat },
            email: { ...input.processState.email },
            call: { ...input.processState.call },
            hasPendingGlosa: input.processState.hasPendingGlosa,
            lastFollowUpAt: input.processState.lastFollowUpAt,
          }
        : {
            chat: { status: 'idle' },
            email: { status: 'idle' },
            call: { status: 'idle' },
          },
      railTier: input.railTier,
      railScore: input.railScore,
      priority: input.priority ?? 'media',
      cadenceState: input.cadenceState
        ? { ...input.cadenceState }
        : {
            channel: 'voip_call',
            step: 1,
            retryCount: 0,
          },
      currentMandatoryTaskId: input.currentMandatoryTaskId,
      assignedAdvisor: input.assignedAdvisor ?? 'asesor.sistema',
      isClient: input.isClient ?? false,
      clientSince: input.clientSince,
      createdAt: now,
      updatedAt: input.updatedAt ?? now,
    };

    return new Lead(props);
  }

  /** Retorna tareas obligatorias abiertas (`pendiente`, `en_progreso` o `vencida`) que activan `R-TSK-MANDATORY`. */
  public get openMandatoryTasks(): CommercialTask[] {
    return this.props.tasks.filter(
      (task) =>
        task.mandatory &&
        (task.status === 'pendiente' ||
          task.status === 'en_progreso' ||
          task.status === 'vencida'),
    );
  }

  /** Evalúa si el prospecto cuenta con pagaduría válida y código de convenio activo (`R-LIB-001`). */
  public hasActiveConvenio(): boolean {
    const pagaduriaLower = this.props.pagaduria.trim().toLowerCase();
    return (
      pagaduriaLower.length > 0 &&
      !pagaduriaLower.includes('independiente') &&
      !pagaduriaLower.includes('sin convenio') &&
      this.props.convenioCodigo.trim().length > 0 &&
      this.props.convenioCodigo !== 'SIN_CONVENIO'
    );
  }

  /** Determina si el cliente figura reportado en centrales de riesgo (`isReported` o `score < 600`). */
  public isReportedInBureau(): boolean {
    return (
      this.props.creditBureauDetails?.isReported ??
      this.props.creditScoreSimulated < 600
    );
  }

  public addNote(id: string, content: string, author: string, createdAt: string): void {
    this.props.notesHistory.push({ id, content, author, createdAt });
    this.props.updatedAt = createdAt;
  }

  public addTask(task: CommercialTask): void {
    this.props.tasks.push(task);
    if (task.mandatory && task.status !== 'completada' && task.status !== 'cancelada') {
      this.props.currentMandatoryTaskId = task.id;
    }
    this.props.updatedAt = task.createdAt;
  }

  public addReminder(reminder: Reminder): void {
    this.props.reminders.push(reminder);
    this.props.updatedAt = reminder.createdAt;
  }

  public addMessage(message: OmnichannelMessage): void {
    this.props.messages.push(message);
    this.props.updatedAt = message.sentAt;
  }

  public moveToStage(stageId: PipelineStageId, nowIso: string, markAsClient: boolean): void {
    const normalized = normalizeStageId(stageId);
    const previous = this.props.currentStageId;
    this.props.currentStageId = normalized;
    this.props.updatedAt = nowIso;

    if (markAsClient && !this.props.isClient) {
      this.props.isClient = true;
      this.props.clientSince = nowIso;
    }

    this.recordEvent({
      eventName: 'LeadStageMoved',
      occurredAt: nowIso,
      aggregateId: this.id,
      payload: {
        fromStageId: previous,
        toStageId: normalized,
        becameClient: markAsClient,
      },
    });
  }

  public clone(): Lead {
    return Lead.create(structuredClone(this.props));
  }

  public toJSON(): LeadProps {
    return structuredClone(this.props);
  }
}
