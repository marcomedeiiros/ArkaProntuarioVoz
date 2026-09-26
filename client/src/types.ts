export type Role = "ADMIN" | "DOCTOR" | "SECRETARY";
/** Chave de uma aba do catálogo (a lista completa vem do servidor, em session.catalog). */
export type Permission = string;

/** Uma aba da plataforma, como o servidor descreve no catálogo. */
export interface ModuleInfo {
  key: Permission;
  label: string;
  description: string;
  requires: Permission[];
}
export type ClinicStatus = "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED";
export type Template = "PUERICULTURA" | "URGENCIA";
export type ConsultationStatus = "DRAFT" | "GENERATED" | "FINALIZED";
export type TransactionType = "INCOME" | "EXPENSE";
export type TransactionStatus = "PAID" | "PENDING";
export type PaymentMethod = "PIX" | "CARTAO_CREDITO" | "CARTAO_DEBITO" | "DINHEIRO" | "CONVENIO" | "OUTRO";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  clinicId: string;
  active?: boolean;
  /** Consultas atendidas por esta pessoa (quem já atendeu não pode ser apagado). */
  consultationCount?: number;
  /** Conta da Arka (dona do SaaS). */
  platformAdmin?: boolean;
  /** Só na sessão: o que o cargo pode acessar (a tela esconde; o servidor decide). */
  permissions?: Permission[];
}

export interface Clinic {
  id: string;
  name: string;
  /** Módulos que a Arka liberou para a clínica. */
  modules?: Permission[];
}

export interface Patient {
  id: string;
  name: string;
  birthDate: string;
  sex: "M" | "F";
  guardianName: string;
  guardianPhone: string;
  allergies: string | null;
  notes: string | null;
}

export interface PrescriptionItem {
  medicamento: string;
  posologia: string;
  duracao: string;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: string;
  method: PaymentMethod;
  date: string;
  description: string | null;
  category: Category;
  patient: { id: string; name: string } | null;
}

export interface Consultation {
  id: string;
  template: Template;
  status: ConsultationStatus;
  weightKg: string | null;
  heightCm: string | null;
  transcript: string;
  evolution: string | null;
  prescription: PrescriptionItem[] | null;
  prescriptionNotes: string | null;
  parentGuide: string | null;
  alerts: string[] | null;
  generatedAt: string | null;
  createdAt: string;
  patient: Patient;
  doctor: { id: string; name: string };
  transactions: Transaction[];
}

export interface ConsultationListItem {
  id: string;
  template: Template;
  status: ConsultationStatus;
  createdAt: string;
  patient: { id: string; name: string };
  doctor: { name: string };
}

export interface FinanceSummary {
  income: number;
  expense: number;
  balance: number;
  pendingIncome: number;
  pendingExpense: number;
  byMethod: { method: PaymentMethod; total: number }[];
  byCategory: { categoryId: string; name: string; type: TransactionType; total: number }[];
}

export interface DashboardData {
  clinical: {
    todayCount: number;
    pendingCount: number;
    pending: ConsultationListItem[];
    recent: ConsultationListItem[];
  } | null;
  /** null quando o cargo não tem acesso ao financeiro. */
  finance: { income: number; pendingIncome: number } | null;
}

export type ConsultationCounts = Record<ConsultationStatus | "ALL", number>;

export type AppointmentKind = "PUERICULTURA" | "URGENCIA" | "RETORNO" | "OUTRO";
export type AppointmentStatus = "SCHEDULED" | "CONFIRMED" | "ARRIVED" | "DONE" | "CANCELED" | "NO_SHOW";

/** Horário na agenda da clínica. */
export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  startsAt: string;
  endsAt: string;
  kind: AppointmentKind;
  status: AppointmentStatus;
  notes: string | null;
  consultationId: string | null;
  patient: Pick<Patient, "id" | "name" | "birthDate" | "guardianName" | "guardianPhone" | "allergies">;
}

/** Quem pode ter agenda na clínica (administração e médicos). */
export interface Professional {
  id: string;
  name: string;
  role: Role;
}
