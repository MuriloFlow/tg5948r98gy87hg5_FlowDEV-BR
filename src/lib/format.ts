import { onlyDigits } from "./utils";

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const COMPACT = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCurrency(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return "R$ 0,00";
  return BRL.format(n);
}

export function formatCompactCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "R$ 0";
  if (Math.abs(value) < 10_000) return BRL.format(value);
  return `R$ ${COMPACT.format(value)}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "0";
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "0%";
  return `${value.toFixed(digits).replace(".", ",")}%`;
}

export function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  // datas puras (YYYY-MM-DD) precisam ser lidas como locais, não UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateLong(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatRelative(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "—";
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (abs < minute) return "agora mesmo";
  if (abs < hour) return rtf.format(Math.round(diff / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  if (abs < month) return rtf.format(Math.round(diff / day), "day");
  if (abs < year) return rtf.format(Math.round(diff / month), "month");
  return rtf.format(Math.round(diff / year), "year");
}

export function daysBetween(a: string | Date, b: string | Date = new Date()): number {
  const da = parseDate(a);
  const dbb = parseDate(b);
  if (!da || !dbb) return 0;
  const ms = da.setHours(0, 0, 0, 0) - dbb.setHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
}

export function formatDocument(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = onlyDigits(value);
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return value;
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = onlyDigits(value);
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return value;
}

export function formatZip(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = onlyDigits(value);
  if (digits.length === 8) return digits.replace(/(\d{5})(\d{3})/, "$1-$2");
  return value;
}

export function maskSecret(value: string, visible = 6): string {
  if (value.length <= visible * 2) return value;
  return `${value.slice(0, visible)}${"•".repeat(12)}${value.slice(-4)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
