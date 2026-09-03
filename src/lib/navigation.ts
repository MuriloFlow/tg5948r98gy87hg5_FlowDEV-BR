import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BadgePercent,
  BarChart3,
  Bell,
  Blocks,
  Book,
  Building2,
  CreditCard,
  FileText,
  Gauge,
  KeyRound,
  Landmark,
  Link2,
  MessageSquareText,
  Radio,
  Receipt,
  RefreshCcw,
  Repeat,
  ScrollText,
  Settings,
  ShieldAlert,
  Terminal,
  Users,
  UsersRound,
  Wallet,
  Webhook,
} from "lucide-react";
import type { Permission } from "./auth/guard";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Chave usada para exibir contadores dinâmicos no menu. */
  badgeKey?: "overdue" | "blocked" | "unreadNotifications" | "failedWebhooks";
  description?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAVIGATION: NavGroup[] = [
  {
    label: "Visão geral",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Gauge, description: "Resumo financeiro e operacional" },
      { href: "/tempo-real", label: "Tempo real", icon: Radio, description: "Fluxo ao vivo de eventos e pagamentos" },
    ],
  },
  {
    label: "Carteira",
    items: [
      { href: "/clientes", label: "Clientes", icon: Users, permission: "customers:read", description: "Cadastro de clientes e contatos" },
      { href: "/empresas", label: "Empresas", icon: Building2, permission: "customers:read", description: "Pessoas jurídicas vinculadas" },
      { href: "/projetos", label: "Projetos", icon: Blocks, permission: "projects:read", description: "Aplicações integradas e domínios" },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { href: "/cobrancas", label: "Cobranças", icon: Receipt, permission: "billing:read", description: "Faturas emitidas" },
      { href: "/assinaturas", label: "Assinaturas", icon: Repeat, permission: "billing:read", description: "Recorrências e dia fixo de cobrança" },
      { href: "/links", label: "Payment Links", icon: Link2, permission: "billing:read", description: "Links de pagamento únicos" },
      { href: "/pagamentos", label: "Pagamentos", icon: CreditCard, permission: "billing:read", description: "Transações do gateway" },
      { href: "/inadimplencia", label: "Inadimplência", icon: AlertTriangle, permission: "billing:read", badgeKey: "overdue", description: "Cobranças vencidas" },
      { href: "/reembolsos", label: "Reembolsos", icon: RefreshCcw, permission: "billing:read", description: "Estornos e chargebacks" },
      { href: "/despesas", label: "Despesas", icon: Wallet, permission: "billing:read", description: "Custos fixos e variáveis" },
      { href: "/fluxo-caixa", label: "Fluxo de caixa", icon: Landmark, permission: "billing:read", description: "Entradas x saídas projetadas" },
      { href: "/cupons", label: "Cupons", icon: BadgePercent, permission: "billing:write", description: "Descontos promocionais" },
    ],
  },
  {
    label: "Integração",
    items: [
      { href: "/credenciais", label: "API Keys", icon: KeyRound, permission: "apikeys:manage", description: "Chaves por projeto" },
      { href: "/webhooks", label: "Webhooks", icon: Webhook, permission: "webhooks:manage", badgeKey: "failedWebhooks", description: "Endpoints e entregas" },
      { href: "/eventos", label: "Eventos", icon: Activity, permission: "projects:read", description: "Log de eventos emitidos" },
      { href: "/logs-api", label: "Logs da API", icon: Terminal, permission: "projects:read", description: "Requisições recebidas" },
      { href: "/bloqueios", label: "Controle de acesso", icon: ShieldAlert, permission: "projects:read", badgeKey: "blocked", description: "Entitlement e bloqueios" },
      { href: "/documentacao", label: "Documentação", icon: Book, description: "Referência da API REST" },
    ],
  },
  {
    label: "Análise",
    items: [
      { href: "/relatorios", label: "Relatórios", icon: FileText, permission: "billing:read", description: "Exportações e fechamentos" },
      { href: "/metricas", label: "Métricas", icon: BarChart3, permission: "billing:read", description: "MRR, churn e conversão" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/notificacoes", label: "Notificações", icon: Bell, badgeKey: "unreadNotifications", description: "Alertas do sistema" },
      { href: "/auditoria", label: "Auditoria", icon: ScrollText, permission: "audit:read", description: "Histórico de ações" },
      { href: "/equipe", label: "Equipe", icon: UsersRound, permission: "team:manage", description: "Usuários e permissões" },
      { href: "/gateways", label: "Gateways", icon: Landmark, permission: "settings:manage", description: "Mercado Pago e credenciais" },
      { href: "/modelos", label: "Modelos", icon: MessageSquareText, permission: "settings:manage", description: "Templates de e-mail e WhatsApp" },
      { href: "/configuracoes", label: "Configurações", icon: Settings, description: "Preferências da conta" },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAVIGATION.flatMap((group) => group.items);

export function findNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.filter((item) => pathname.startsWith(item.href)).sort(
    (a, b) => b.href.length - a.href.length
  )[0];
}

export interface NavCounters {
  overdue: number;
  blocked: number;
  unreadNotifications: number;
  failedWebhooks: number;
}

export const EMPTY_COUNTERS: NavCounters = {
  overdue: 0,
  blocked: 0,
  unreadNotifications: 0,
  failedWebhooks: 0,
};
