import type { CommercialActionTag } from '../../../features/automation/domain/ActionTag.ts';
import type { FinancialEntityPolicy } from '../../../features/entity-matching/domain/FinancialEntityPolicy.ts';
import { DeterministicRule } from '../../../features/governance/domain/DeterministicRule.ts';
import type { PriorityPolicyConfig } from '../../../features/next-best-action/domain/PriorityPolicy.ts';
import { Lead } from '../../domain/value-objects/Lead.ts';
import type { PipelineBoard } from '../../domain/value-objects/PipelineStage.ts';
import { DEFAULT_BOARD_ID } from '../../domain/value-objects/PipelineStage.ts';

export function createSeedFinancialEntityPolicies(): FinancialEntityPolicy[] {
  return [
    {
      entityName: 'Valorenz',
      acceptedSegments: ['Pensionado', 'Empleado Público'],
      toleratesCreditBureauReport: true,
      maxAge: 84,
      minSmmlv: 1.0,
      maxDti: 0.5,
      minScore: 560,
      keyAgreements: [
        'Colpensiones',
        'FOPEP',
        'CASUR',
        'CREMIL',
        'FOMAG',
        'Policía Nacional',
      ],
      rateMV: 0.01453,
      rateEA: 0.189,
      maxTermMonths: 144,
      maxAmount: 150_000_000,
    },
    {
      entityName: 'Capital',
      acceptedSegments: ['Pensionado', 'Empleado Público'],
      toleratesCreditBureauReport: true,
      maxAge: 80,
      minSmmlv: 1.1,
      maxDti: 0.55,
      minScore: 580,
      keyAgreements: [
        'Colpensiones',
        'FOPEP',
        'FOMAG',
        'Ministerio de Educación',
        'CASUR',
      ],
      rateMV: 0.01524,
      rateEA: 0.199,
      maxTermMonths: 120,
      maxAmount: 120_000_000,
      isDefaultPlanB: true,
    },
    {
      entityName: 'Bancoomeva',
      acceptedSegments: ['Pensionado', 'Empleado Público', 'Empleado Privado'],
      toleratesCreditBureauReport: false,
      maxAge: 75,
      minSmmlv: 1.5,
      maxDti: 0.5,
      minScore: 680,
      keyAgreements: ['Colpensiones', 'Ecopetrol', 'FOMAG', 'SENA', 'Bancolombia'],
      rateMV: 0.01179,
      rateEA: 0.151,
      maxTermMonths: 108,
      maxAmount: 180_000_000,
    },
    {
      entityName: 'Coopcentral',
      acceptedSegments: ['Empleado Público', 'Pensionado'],
      toleratesCreditBureauReport: false,
      maxAge: 72,
      minSmmlv: 1.2,
      maxDti: 0.5,
      minScore: 620,
      keyAgreements: [
        'FOMAG',
        'Ministerio de Educación',
        'FOPEP',
        'Colpensiones',
        'Gobernación',
      ],
      rateMV: 0.01324,
      rateEA: 0.171,
      maxTermMonths: 96,
      maxAmount: 100_000_000,
    },
    {
      entityName: 'Finandina',
      acceptedSegments: ['Pensionado', 'Empleado Público', 'Empleado Privado'],
      toleratesCreditBureauReport: false,
      maxAge: 70,
      minSmmlv: 1.5,
      maxDti: 0.45,
      minScore: 650,
      keyAgreements: [
        'Ecopetrol',
        'Avianca',
        'Colpensiones',
        'Grupo Nutresa',
        'Alcaldía',
      ],
      rateMV: 0.01252,
      rateEA: 0.161,
      maxTermMonths: 84,
      maxAmount: 90_000_000,
    },
  ];
}

export function createSeedRules(): DeterministicRule[] {
  return [
    DeterministicRule.create({
      code: 'R-LIB-001',
      name: 'Validación de Convenio Activo y Primer Contacto',
      description:
        'Exige convenio vigente con pagaduría y evidencia de primer contacto (SLA < 15 min) para avanzar a perfilamiento.',
      category: 'HARD_RESTRICTION',
      governanceOwner: 'LEY_1527_COMPLIANCE',
      stage: 'perfilamiento',
      isActive: true,
      isBuiltIn: true,
      conditions: [
        {
          field: 'convenioCodigo',
          operator: 'neq',
          value: 'SIN_CONVENIO',
          description: 'Código de convenio activo requerido',
        },
        {
          field: 'pagaduria',
          operator: 'exists',
          description: 'Pagaduría registrada',
        },
      ],
    }),
    DeterministicRule.create({
      code: 'R-LIB-002',
      name: 'Protección 50% Inembargable (Ley 1527)',
      description:
        'Protección legal del 50% del ingreso neto; capacidad $0 o ingreso < 1 SMMLV bloquea avance a oferta y cierre.',
      category: 'HARD_RESTRICTION',
      governanceOwner: 'LEY_1527_COMPLIANCE',
      stage: 'oferta_cierre',
      isActive: true,
      isBuiltIn: true,
      conditions: [
        {
          field: 'calculatedLibranzaCapacity',
          operator: 'gt',
          value: 0,
          description: 'Capacidad disponible Ley 1527 > $0',
        },
      ],
    }),
    DeterministicRule.create({
      code: 'R-LIB-003',
      name: 'Edad Máxima al Vencimiento',
      description:
        'Valida la edad máxima al vencimiento según póliza de asegurabilidad de cada entidad (70 a 84 años).',
      category: 'CONFIGURABLE_POLICY',
      governanceOwner: 'GERENCIA_RIESGOS',
      stage: 'oferta_cierre',
      isActive: true,
      isBuiltIn: true,
      conditions: [
        {
          field: 'age',
          operator: 'lte',
          value: 84,
          description: 'Edad dentro de límites de póliza',
        },
      ],
    }),
    DeterministicRule.create({
      code: 'R-LIB-004',
      name: 'Verificación Documental Completa',
      description:
        'Exige mínimo 2 soportes cargados (cédula y colillas) y el 100% en estado verificado para radicar a estudio.',
      category: 'HARD_RESTRICTION',
      governanceOwner: 'LEY_1527_COMPLIANCE',
      stage: 'en_estudio',
      isActive: true,
      isBuiltIn: true,
      conditions: [
        {
          field: 'documents',
          operator: 'all_documents_verified',
          value: 2,
          description: 'Mínimo 2 documentos y todos verificados',
        },
      ],
    }),
    DeterministicRule.create({
      code: 'R-LIB-005',
      name: 'Selección Obligatoria de Entidad Financiera',
      description:
        'Exige entidad financiera principal seleccionada antes de radicar a estudio y preaprobación para formalización.',
      category: 'CONFIGURABLE_POLICY',
      governanceOwner: 'COMITE_COMERCIAL',
      stage: 'en_estudio',
      isActive: true,
      isBuiltIn: true,
      conditions: [
        {
          field: 'selectedFinanciera',
          operator: 'exists',
          description: 'Entidad financiera principal definida',
        },
      ],
    }),
    DeterministicRule.create({
      code: 'R-LIB-006',
      name: 'Pagaré DECEVAL y Visado antes de Desembolso',
      description:
        'Exige documento legal de pagaré desmaterializado DECEVAL o libranza cargado antes de desembolso.',
      category: 'HARD_RESTRICTION',
      governanceOwner: 'LEY_1527_COMPLIANCE',
      stage: 'desembolsado',
      isActive: true,
      isBuiltIn: true,
      conditions: [
        {
          field: 'documents',
          operator: 'exists',
          description: 'Documento de pagaré/DECEVAL/libranza presente',
        },
      ],
    }),
    DeterministicRule.create({
      code: 'R-LIB-007',
      name: 'Activación Automática de Plan B Multientidad',
      description:
        'Ante rechazo de una entidad financiera, reasigna a financiera alternativa (Plan B) sin cerrar al cliente.',
      category: 'CONFIGURABLE_POLICY',
      governanceOwner: 'GERENCIA_RIESGOS',
      stage: 'ALL',
      isActive: true,
      isBuiltIn: true,
      conditions: [],
    }),
    DeterministicRule.create({
      code: 'R-LIB-008',
      name: 'Tolerancia a Reportes en Centrales de Riesgo',
      description:
        'Habilita entidades tolerantes (Valorenz, Capital) para clientes reportados y restringe entidades tradicionales.',
      category: 'CONFIGURABLE_POLICY',
      governanceOwner: 'GERENCIA_RIESGOS',
      stage: 'ALL',
      isActive: true,
      isBuiltIn: true,
      conditions: [],
    }),
  ];
}

export function createSeedPriorityPolicy(nowIso: string): PriorityPolicyConfig {
  return {
    updatedAt: nowIso,
    updatedBy: 'system.seed',
    items: [
      {
        rank: 1,
        caseType: 'cita_acordada',
        label: 'Cliente con cita acordada para ahora',
        slaMinutes: 5,
        scoreBase: 100,
      },
      {
        rank: 2,
        caseType: 'chat_reciente',
        label: 'Responder chat o mensaje reciente en vivo',
        slaMinutes: 5,
        scoreBase: 90,
      },
      {
        rank: 3,
        caseType: 'devolucion_glosa',
        label: 'Devolución / glosa pendiente de subsanar',
        slaMinutes: 30,
        scoreBase: 80,
      },
      {
        rank: 4,
        caseType: 'llamada_solicitada',
        label: 'Llamada pedida expresamente por el cliente',
        slaMinutes: 60,
        scoreBase: 70,
      },
      {
        rank: 5,
        caseType: 'lead_nuevo',
        label: 'Lead nuevo recién captado por campaña',
        slaMinutes: 15,
        scoreBase: 60,
      },
      {
        rank: 6,
        caseType: 'credito_sin_seguimiento_12h',
        label: 'Crédito en proceso sin seguimiento > 12h',
        slaMinutes: 120,
        scoreBase: 50,
      },
    ],
  };
}

export function createSeedActionTags(): CommercialActionTag[] {
  return [
    {
      code: '#NO_CONTESTA',
      label: 'No contesta llamada',
      isStandard: true,
      automationType: 'reprogramar_llamada',
      priority: 'media',
      slaMinutes: 120,
    },
    {
      code: '#ESTA_OCUPADO',
      label: 'Cliente ocupado – reprogramar hora acordada',
      isStandard: true,
      automationType: 'reprogramar_llamada',
      priority: 'urgente',
      slaMinutes: 60,
    },
    {
      code: '#FALTAN_DOCUMENTOS',
      label: 'Solicitar desprendibles y cédula al 150%',
      isStandard: true,
      automationType: 'enviar_whatsapp_recordatorio',
      priority: 'alta',
    },
    {
      code: '#SOLICITA_MENOR_MONTO',
      label: 'Recalibrar monto solicitado al 75%',
      isStandard: true,
      automationType: 'crear_tarea_obligatoria',
      priority: 'alta',
    },
    {
      code: '#RECHAZADO_FINANCIERA',
      label: 'Activar Plan B por rechazo de financiera',
      isStandard: true,
      automationType: 'activar_plan_b',
      priority: 'urgente',
      slaMinutes: 30,
    },
    {
      code: '#CLIENTE_INTERESADO',
      label: 'Cliente interesado – avanzar a perfilamiento',
      isStandard: true,
      automationType: 'cambiar_etapa_pipeline',
      targetStageId: 'perfilamiento',
      priority: 'alta',
    },
  ];
}

export function createSeedBoards(): PipelineBoard[] {
  return [
    {
      id: DEFAULT_BOARD_ID,
      name: 'Pipeline Estándar de Libranzas',
      isDefault: true,
      stages: [
        { id: 'lead_nuevo', name: '1. Lead Nuevo', order: 1 },
        { id: 'perfilamiento', name: '2. Perfilamiento', order: 2 },
        { id: 'oferta_cierre', name: '3. Oferta y Cierre', order: 3 },
        { id: 'en_estudio', name: '4. En Estudio', order: 4 },
        {
          id: 'aprobado_formalizacion',
          name: '5. Aprobado y Formalización',
          order: 5,
        },
        { id: 'desembolsado', name: '6. Desembolsado', order: 6 },
        {
          id: 'rechazado_perdido',
          name: '7. Rechazado / Perdido',
          order: 7,
          isTerminal: true,
        },
      ],
    },
    {
      id: 'board-compra-cartera-vip',
      name: 'Tablero Personalizado Compra de Cartera VIP',
      isDefault: false,
      stages: [
        { id: 'recepcion_vip', name: 'Recepción VIP', order: 1 },
        { id: 'estructuracion_cartera', name: 'Estructuración Cartera', order: 2 },
        { id: 'cierre_desembolso_vip', name: 'Cierre y Desembolso VIP', order: 3 },
      ],
    },
  ];
}

export function createSeedLeads(nowIso: string): Lead[] {
  return [
    Lead.create({
      id: 'LEAD-001',
      fullName: 'Carlos Alberto Mendoza',
      documentNumber: '79452100',
      libranzaSegment: 'Pensionado',
      employmentType: 'Pensionado',
      pagaduria: 'Colpensiones',
      convenioCodigo: 'CONV-COLP-001',
      age: 64,
      monthlyIncome: 4_800_000,
      netIncome: 4_224_000,
      currentDiscounts: 400_000,
      calculatedLibranzaCapacity: 1_712_000,
      creditScoreSimulated: 765,
      creditBureauDetails: { score: 765, isReported: false, bureau: 'DataCrédito' },
      phone: '+573001112233',
      email: 'carlos.mendoza@ejemplo.co',
      requestedAmount: 35_000_000,
      currentStageId: 'lead_nuevo',
      assignedAdvisor: 'ana.comercial',
      createdAt: nowIso,
      updatedAt: nowIso,
    }),
    Lead.create({
      id: 'LEAD-002',
      fullName: 'María Fernanda Rojas',
      documentNumber: '52881920',
      libranzaSegment: 'Empleado Público',
      employmentType: 'Empleado Público',
      pagaduria: 'FOMAG Magisterio',
      convenioCodigo: 'CONV-FOMAG-014',
      age: 49,
      monthlyIncome: 5_200_000,
      netIncome: 4_576_000,
      currentDiscounts: 900_000,
      calculatedLibranzaCapacity: 1_388_000,
      creditScoreSimulated: 575,
      creditBureauDetails: {
        score: 575,
        isReported: true,
        reportedAmount: 2_300_000,
        hasPazYSalvo: false,
        bureau: 'TransUnion',
      },
      phone: '+573109988776',
      email: 'maria.rojas@ejemplo.co',
      requestedAmount: 28_000_000,
      currentStageId: 'oferta_cierre',
      selectedFinanciera: 'Valorenz',
      documents: [
        { id: 'DOC-1', name: 'Cédula 150%.pdf', status: 'verificado' },
        { id: 'DOC-2', name: 'Desprendible Marzo.pdf', status: 'verificado' },
      ],
      processState: {
        chat: { status: 'mensaje_recibido_urgente', lastUpdatedAt: nowIso },
        email: { status: 'idle' },
        call: { status: 'idle' },
      },
      assignedAdvisor: 'ana.comercial',
      createdAt: nowIso,
      updatedAt: nowIso,
    }),
    Lead.create({
      id: 'LEAD-003',
      fullName: 'Jorge Enrique Patiño',
      documentNumber: '1018445221',
      libranzaSegment: 'Empleado Privado',
      employmentType: 'Empleado Privado',
      pagaduria: 'Independiente sin convenio',
      convenioCodigo: 'SIN_CONVENIO',
      age: 38,
      monthlyIncome: 3_500_000,
      netIncome: 3_080_000,
      currentDiscounts: 200_000,
      calculatedLibranzaCapacity: 1_340_000,
      creditScoreSimulated: 710,
      phone: '+573154433221',
      email: 'jorge.patino@ejemplo.co',
      requestedAmount: 20_000_000,
      currentStageId: 'lead_nuevo',
      assignedAdvisor: 'luis.asesor',
      createdAt: nowIso,
      updatedAt: nowIso,
    }),
  ];
}
