import type {
  BillingInterval,
  InvoiceStatus,
  PaymentLinkStatus,
  PaymentMethod,
  PaymentStatus,
  ProjectStatus,
  SubscriptionStatus,
  DeliveryStatus,
  AdminRole,
  EntityStatus,
} from "./types";

export type Tone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "violet";

export interface StatusMeta {
  label: string;
  tone: Tone;
  description?: string;
}

export const INVOICE_STATUS: Record<InvoiceStatus, StatusMeta> = {
  DRAFT: { label: "Rascunho", tone: "neutral", description: "Ainda não enviada ao cliente" },
  OPEN: { label: "Em aberto", tone: "info", description: "Aguardando pagamento" },
  PENDING: { label: "Processando", tone: "warning", description: "Pagamento iniciado no gateway" },
  PAID: { label: "Pago", tone: "success", description: "Cobrança quitada" },
  PARTIALLY_PAID: { label: "Parcial", tone: "warning", description: "Pagamento parcial recebido" },
  OVERDUE: { label: "Atrasado", tone: "danger", description: "Vencida sem pagamento" },
  CANCELED: { label: "Cancelado", tone: "neutral", description: "Cobrança cancelada" },
  REFUNDED: { label: "Estornado", tone: "violet", description: "Valor devolvido ao cliente" },
  EXPIRED: { label: "Expirado", tone: "danger", description: "Prazo máximo ultrapassado" },
};

export const PROJECT_STATUS: Record<ProjectStatus, StatusMeta> = {
  TRIAL: { label: "Trial", tone: "violet", description: "Período de avaliação" },
  ACTIVE: { label: "Ativo", tone: "success", description: "Acesso liberado" },
  BLOCKED_PAYMENT: { label: "Bloqueado", tone: "danger", description: "Bloqueado por falta de pagamento" },
  SUSPENDED: { label: "Suspenso", tone: "warning", description: "Suspenso manualmente" },
  ARCHIVED: { label: "Arquivado", tone: "neutral", description: "Projeto encerrado" },
};

export const PAYMENT_STATUS: Record<PaymentStatus, StatusMeta> = {
  PENDING: { label: "Pendente", tone: "warning" },
  IN_PROCESS: { label: "Em análise", tone: "warning" },
  AUTHORIZED: { label: "Autorizado", tone: "info" },
  APPROVED: { label: "Aprovado", tone: "success" },
  IN_MEDIATION: { label: "Em disputa", tone: "violet" },
  REJECTED: { label: "Recusado", tone: "danger" },
  CANCELLED: { label: "Cancelado", tone: "neutral" },
  REFUNDED: { label: "Estornado", tone: "violet" },
  CHARGED_BACK: { label: "Chargeback", tone: "danger" },
};

export const PAYMENT_METHOD: Record<PaymentMethod, StatusMeta> = {
  PIX: { label: "Pix", tone: "success" },
  CREDIT_CARD: { label: "Cartão de crédito", tone: "info" },
  DEBIT_CARD: { label: "Cartão de débito", tone: "info" },
  BOLETO: { label: "Boleto", tone: "neutral" },
  ACCOUNT_MONEY: { label: "Saldo Mercado Pago", tone: "info" },
  BANK_TRANSFER: { label: "Transferência", tone: "neutral" },
  CASH: { label: "Dinheiro", tone: "neutral" },
  MANUAL: { label: "Baixa manual", tone: "violet" },
  OTHER: { label: "Outro", tone: "neutral" },
};

export const BILLING_INTERVAL: Record<BillingInterval, StatusMeta> = {
  ONE_TIME: { label: "Cobrança única", tone: "neutral" },
  WEEKLY: { label: "Semanal", tone: "info" },
  BIWEEKLY: { label: "Quinzenal", tone: "info" },
  MONTHLY: { label: "Mensal", tone: "success" },
  BIMONTHLY: { label: "Bimestral", tone: "info" },
  QUARTERLY: { label: "Trimestral", tone: "info" },
  SEMIANNUAL: { label: "Semestral", tone: "violet" },
  ANNUAL: { label: "Anual", tone: "violet" },
};

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, StatusMeta> = {
  ACTIVE: { label: "Ativa", tone: "success" },
  PAUSED: { label: "Pausada", tone: "warning" },
  PAST_DUE: { label: "Inadimplente", tone: "danger" },
  CANCELED: { label: "Cancelada", tone: "neutral" },
  COMPLETED: { label: "Concluída", tone: "info" },
};

export const PAYMENT_LINK_STATUS: Record<PaymentLinkStatus, StatusMeta> = {
  ACTIVE: { label: "Ativo", tone: "success" },
  PAID: { label: "Pago", tone: "info" },
  EXPIRED: { label: "Expirado", tone: "danger" },
  DISABLED: { label: "Desativado", tone: "neutral" },
};

export const DELIVERY_STATUS: Record<DeliveryStatus, StatusMeta> = {
  PENDING: { label: "Na fila", tone: "neutral" },
  SUCCESS: { label: "Entregue", tone: "success" },
  FAILED: { label: "Falhou", tone: "danger" },
  RETRYING: { label: "Reenviando", tone: "warning" },
  DROPPED: { label: "Descartado", tone: "neutral" },
};

export const ENTITY_STATUS: Record<EntityStatus, StatusMeta> = {
  ACTIVE: { label: "Ativo", tone: "success" },
  INACTIVE: { label: "Inativo", tone: "warning" },
  ARCHIVED: { label: "Arquivado", tone: "neutral" },
};

export const ADMIN_ROLE: Record<AdminRole, StatusMeta> = {
  OWNER: { label: "Proprietário", tone: "violet", description: "Acesso total, inclusive faturamento" },
  ADMIN: { label: "Administrador", tone: "info", description: "Gerencia clientes, projetos e cobranças" },
  FINANCE: { label: "Financeiro", tone: "success", description: "Cobranças, pagamentos e relatórios" },
  SUPPORT: { label: "Suporte", tone: "neutral", description: "Consulta e reenvio de cobranças" },
  READONLY: { label: "Somente leitura", tone: "neutral", description: "Apenas visualização" },
};

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-slate-400",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-sky-500",
  violet: "bg-violet-500",
};

export function invoiceStatusMeta(status: InvoiceStatus): StatusMeta {
  return INVOICE_STATUS[status] ?? { label: status, tone: "neutral" };
}

export function projectStatusMeta(status: ProjectStatus): StatusMeta {
  return PROJECT_STATUS[status] ?? { label: status, tone: "neutral" };
}

/** Rótulos amigáveis para os eventos disparados nos webhooks. */
export const EVENT_LABELS: Record<string, string> = {
  "payment.created": "Cobrança criada",
  "payment.pending": "Pagamento pendente",
  "payment.paid": "Cobrança paga",
  "payment.succeeded": "Pagamento aprovado",
  "payment.failed": "Pagamento recusado",
  "payment.expired": "Cobrança expirada",
  "payment.overdue": "Cobrança vencida",
  "payment.canceled": "Cobrança cancelada",
  "payment.refunded": "Pagamento estornado",
  "project.blocked": "Projeto bloqueado",
  "project.unblocked": "Projeto liberado",
};

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type;
}
