// ============================================================================
// Tipos de domínio do FlowDesk — espelham 001_schema.sql
// ============================================================================

export type CustomerType = "PF" | "PJ";
export type EntityStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type ProjectStatus =
  | "TRIAL"
  | "ACTIVE"
  | "BLOCKED_PAYMENT"
  | "SUSPENDED"
  | "ARCHIVED";

export type BlockMode = "AUTO" | "MANUAL";
export type ApiEnvironment = "TEST" | "LIVE";
export type ApiKeyStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export type InvoiceStatus =
  | "DRAFT"
  | "OPEN"
  | "PENDING"
  | "PAID"
  | "PARTIALLY_PAID"
  | "OVERDUE"
  | "CANCELED"
  | "REFUNDED"
  | "EXPIRED";

export type PaymentStatus =
  | "PENDING"
  | "IN_PROCESS"
  | "AUTHORIZED"
  | "APPROVED"
  | "IN_MEDIATION"
  | "REJECTED"
  | "CANCELLED"
  | "REFUNDED"
  | "CHARGED_BACK";

export type PaymentMethod =
  | "PIX"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "BOLETO"
  | "ACCOUNT_MONEY"
  | "BANK_TRANSFER"
  | "CASH"
  | "MANUAL"
  | "OTHER";

export type BillingInterval =
  | "ONE_TIME"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "BIMONTHLY"
  | "QUARTERLY"
  | "SEMIANNUAL"
  | "ANNUAL";

export type SubscriptionStatus =
  | "ACTIVE"
  | "PAUSED"
  | "PAST_DUE"
  | "CANCELED"
  | "COMPLETED";

export type PaymentLinkStatus = "ACTIVE" | "PAID" | "EXPIRED" | "DISABLED";
export type WebhookStatus = "ACTIVE" | "DISABLED";
export type DeliveryStatus = "PENDING" | "SUCCESS" | "FAILED" | "RETRYING" | "DROPPED";
export type AdminRole = "OWNER" | "ADMIN" | "FINANCE" | "SUPPORT" | "READONLY";
export type ActorType = "ADMIN" | "API" | "SYSTEM" | "WEBHOOK" | "PUBLIC";
export type NotificationSeverity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: EntityStatus;
  avatar_url: string | null;
  phone: string | null;
  timezone: string;
  locale: string;
  two_factor_enabled: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  code: string;
  type: CustomerType;
  name: string;
  legal_name: string | null;
  document: string | null;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  avatar_url: string | null;
  website: string | null;
  zip_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  country: string;
  status: EntityStatus;
  tags: string[];
  notes: string | null;
  metadata: Record<string, unknown>;
  default_due_day: number | null;
  default_payment_methods: PaymentMethod[];
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  customer_id: string;
  legal_name: string;
  trade_name: string | null;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logo_url: string | null;
  city: string | null;
  state: string | null;
  status: EntityStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  code: string;
  customer_id: string;
  company_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  color: string;
  primary_domain: string | null;
  domains: string[];
  environment: ApiEnvironment;
  tech_stack: string[];
  repository_url: string | null;
  status: ProjectStatus;
  block_mode: BlockMode;
  grace_days: number;
  blocked_at: string | null;
  blocked_reason: string | null;
  unblocked_at: string | null;
  trial_ends_at: string | null;
  contract_value: number;
  monthly_amount: number;
  currency: string;
  started_at: string | null;
  ends_at: string | null;
  tags: string[];
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  project_id: string;
  name: string;
  environment: ApiEnvironment;
  key_id: string;
  secret_prefix: string;
  secret_last4: string;
  scopes: string[];
  allowed_ips: string[];
  allowed_origins: string[];
  rate_limit_per_minute: number;
  status: ApiKeyStatus;
  last_used_at: string | null;
  usage_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  project_id: string;
  customer_id: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  interval: BillingInterval;
  interval_count: number;
  billing_day: number | null;
  generate_days_before: number;
  start_date: string;
  end_date: string | null;
  next_billing_date: string | null;
  last_billed_at: string | null;
  cycles_billed: number;
  max_cycles: number | null;
  auto_charge: boolean;
  is_mandatory: boolean;
  grace_days: number;
  late_fee_percent: number;
  interest_percent_month: number;
  payment_methods: PaymentMethod[];
  status: SubscriptionStatus;
  canceled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  code: string;
  project_id: string;
  customer_id: string;
  subscription_id: string | null;
  description: string;
  reference: string | null;
  period_start: string | null;
  period_end: string | null;
  subtotal: number;
  discount_amount: number;
  late_fee_amount: number;
  interest_amount: number;
  total: number;
  paid_amount: number;
  currency: string;
  status: InvoiceStatus;
  due_date: string;
  issued_at: string;
  paid_at: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  expires_at: string | null;
  is_mandatory: boolean;
  blocks_at: string | null;
  payment_methods: PaymentMethod[];
  allow_installments: boolean;
  max_installments: number;
  notes: string | null;
  internal_notes: string | null;
  metadata: Record<string, unknown>;
  reminder_count: number;
  last_reminder_at: string | null;
  created_via: ActorType;
  created_at: string;
  updated_at: string;
}

export interface InvoiceFull extends Invoice {
  balance_due: number;
  days_overdue: number;
  customer_name: string;
  customer_email: string;
  customer_document: string | null;
  project_name: string;
  project_code: string;
  project_status: ProjectStatus;
  payment_link_token: string | null;
  checkout_url: string | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_amount: number;
  total: number;
  position: number;
}

export interface PaymentLink {
  id: string;
  invoice_id: string | null;
  project_id: string;
  customer_id: string;
  token: string;
  short_code: string | null;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  provider: string;
  provider_preference_id: string | null;
  checkout_url: string | null;
  status: PaymentLinkStatus;
  expires_at: string | null;
  max_uses: number;
  uses: number;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  paid_at: string | null;
  payment_methods: PaymentMethod[];
  max_installments: number;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  invoice_id: string | null;
  payment_link_id: string | null;
  project_id: string;
  customer_id: string;
  provider: string;
  provider_payment_id: string | null;
  provider_status: string | null;
  provider_status_detail: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  net_amount: number | null;
  fee_amount: number;
  refunded_amount: number;
  currency: string;
  installments: number;
  payer_name: string | null;
  payer_email: string | null;
  payer_document: string | null;
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  pix_expires_at: string | null;
  boleto_url: string | null;
  card_brand: string | null;
  card_last4: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlowEvent {
  id: string;
  type: string;
  project_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  payload: Record<string, unknown>;
  delivered: boolean;
  created_at: string;
}

export interface WebhookEndpoint {
  id: string;
  project_id: string;
  url: string;
  description: string | null;
  secret: string;
  events: string[];
  status: WebhookStatus;
  last_success_at: string | null;
  last_failure_at: string | null;
  consecutive_failures: number;
  total_deliveries: number;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  endpoint_id: string;
  event_id: string;
  event_type: string;
  attempt: number;
  status: DeliveryStatus;
  request_url: string;
  response_status: number | null;
  response_body: string | null;
  error_message: string | null;
  duration_ms: number | null;
  next_retry_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_type: ActorType;
  actor_id: string | null;
  actor_label: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

export interface ApiRequestLog {
  id: string;
  request_id: string;
  api_key_id: string | null;
  project_id: string | null;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  ip: string | null;
  error_code: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  severity: NotificationSeverity;
  category: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ActivityEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  description: string | null;
  icon: string | null;
  actor_type: ActorType;
  actor_label: string | null;
  created_at: string;
}

export interface ProjectEntitlement {
  project_id: string;
  project_code: string;
  project_name: string;
  slug: string;
  status: ProjectStatus;
  block_mode: BlockMode;
  blocked_at: string | null;
  blocked_reason: string | null;
  grace_days: number;
  primary_domain: string | null;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  is_blocked: boolean;
  has_access: boolean;
  blocking_invoice_id: string | null;
  blocking_invoice_code: string | null;
  blocking_invoice_total: number | null;
  blocking_invoice_due_date: string | null;
  blocking_invoice_description: string | null;
  open_invoices: number;
  open_amount: number;
}

export interface FinancialSummary {
  total_received: number;
  total_to_receive: number;
  total_overdue: number;
  received_this_month: number;
  due_this_month: number;
  overdue_count: number;
  open_count: number;
  paid_count: number;
}

export interface MonthlyRevenue {
  month: string;
  label: string;
  received: number;
  expected: number;
  overdue: number;
}

export interface ProjectHealth {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  primary_domain: string | null;
  customer_name: string;
  active_keys: number;
  last_api_call: string | null;
  requests_24h: number;
  errors_24h: number;
  webhooks: number;
  open_amount: number;
}

export interface Expense {
  id: string;
  description: string;
  category: string;
  amount: number;
  project_id: string | null;
  due_date: string | null;
  paid_at: string | null;
  is_recurring: boolean;
  created_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: "PERCENT" | "FIXED";
  discount_value: number;
  max_redemptions: number | null;
  redemptions: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

export const WEBHOOK_EVENT_TYPES = [
  "payment.created",
  "payment.pending",
  "payment.paid",
  "payment.succeeded",
  "payment.failed",
  "payment.expired",
  "payment.overdue",
  "payment.canceled",
  "payment.refunded",
  "project.blocked",
  "project.unblocked",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const API_SCOPES = [
  "entitlement:read",
  "charges:read",
  "charges:write",
  "links:write",
  "payments:read",
  "customers:read",
  "webhooks:read",
] as const;
