"use client";

import * as React from "react";
import { ArrowUpRight, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/misc";
import { SidePanel } from "@/components/ui/modal";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DataToolbar, Pagination } from "@/components/panel/toolbar";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import type { Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface ProjectOption {
  id: string;
  name: string;
  code: string;
}

export interface HourBucket {
  label: string;
  total: number;
  errors: number;
}

export interface ApiRequestRow {
  id: string;
  request_id: string;
  api_key_id: string | null;
  project_id: string | null;
  method: string;
  path: string;
  query: string | null;
  status_code: number;
  duration_ms: number;
  ip: string | null;
  user_agent: string | null;
  idempotency_key: string | null;
  request_body: Record<string, unknown> | null;
  response_summary: Record<string, unknown> | null;
  error_code: string | null;
  created_at: string;
  project_name?: string | null;
}

const METHOD_TONES: Record<string, Tone> = {
  GET: "info",
  POST: "success",
  PUT: "warning",
  PATCH: "warning",
  DELETE: "danger",
};

function statusTone(code: number): Tone {
  if (code >= 500) return "danger";
  if (code >= 400) return "warning";
  if (code >= 300) return "neutral";
  return "success";
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

export function ApiLogsClient({
  rows,
  buckets,
  projects,
  total,
  page,
  pageSize,
}: {
  rows: ApiRequestRow[];
  buckets: HourBucket[];
  projects: ProjectOption[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const [selected, setSelected] = React.useState<ApiRequestRow | null>(null);
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.total));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="space-y-0.5">
            <CardTitle>Volume por hora</CardTitle>
            <p className="text-[12.5px] text-ink-500">Últimas 24 horas · pico de {formatNumber(peak)} requisições</p>
          </div>
          <div className="flex items-center gap-3 text-[11.5px] text-ink-500">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-brand-500" /> Sucesso
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-rose-400" /> Erros
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {buckets.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-400">
              Nenhuma requisição registrada nas últimas 24 horas.
            </p>
          ) : (
            <div className="flex h-32 items-end gap-1">
              {buckets.map((bucket, index) => {
                const height = (bucket.total / peak) * 100;
                const errorShare = bucket.total > 0 ? (bucket.errors / bucket.total) * 100 : 0;
                return (
                  <div
                    key={`${bucket.label}-${index}`}
                    className="group flex h-full flex-1 flex-col justify-end"
                    title={`${bucket.label} · ${bucket.total} requisições · ${bucket.errors} erros`}
                  >
                    <div
                      className="relative w-full overflow-hidden rounded-t-md bg-brand-500/85 transition-all duration-500 group-hover:bg-brand-600"
                      style={{ height: `${Math.max(bucket.total > 0 ? 4 : 1.5, height)}%` }}
                    >
                      {errorShare > 0 && (
                        <span
                          className="absolute inset-x-0 bottom-0 bg-rose-400"
                          style={{ height: `${errorShare}%` }}
                          aria-hidden
                        />
                      )}
                    </div>
                    <span className="mt-1.5 block truncate text-center text-[9.5px] text-ink-400">
                      {index % 3 === 0 ? bucket.label : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <DataToolbar
          searchPlaceholder="Buscar por rota (ex.: /v1/charges)..."
          filters={[
            {
              key: "metodo",
              label: "Método",
              options: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => ({
                value: method,
                label: method,
              })),
            },
            {
              key: "classe",
              label: "Status",
              options: [
                { value: "2xx", label: "2xx — sucesso" },
                { value: "4xx", label: "4xx — erro do cliente" },
                { value: "5xx", label: "5xx — erro do servidor" },
              ],
            },
            {
              key: "projeto",
              label: "Projeto",
              options: projects.map((project) => ({ value: project.id, label: project.name })),
            },
            {
              key: "periodo",
              label: "Período",
              allLabel: "Últimas 24 horas",
              options: [
                { value: "1h", label: "Última hora" },
                { value: "24h", label: "Últimas 24 horas" },
                { value: "7d", label: "Últimos 7 dias" },
                { value: "30d", label: "Últimos 30 dias" },
              ],
            },
          ]}
        />

        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>Data</TH>
                <TH>Método</TH>
                <TH>Rota</TH>
                <TH align="center">Status</TH>
                <TH align="right">Duração</TH>
                <TH>IP</TH>
                <TH>Projeto</TH>
                <TH className="w-10" />
              </tr>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <TableEmpty
                  colSpan={8}
                  icon={<Terminal />}
                  title="Nenhuma requisição no período"
                  description="Assim que sua aplicação chamar a API com uma chave válida, os detalhes aparecerão aqui."
                />
              ) : (
                rows.map((row) => (
                  <TR key={row.id} clickable onClick={() => setSelected(row)}>
                    <TD>
                      <span className="block text-[12.5px] text-ink-700">
                        {formatDateTime(row.created_at)}
                      </span>
                      <span className="block text-[11px] text-ink-400">
                        {formatRelative(row.created_at)}
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={METHOD_TONES[row.method] ?? "neutral"} size="sm">
                        <span className="font-mono text-[10.5px] font-semibold">{row.method}</span>
                      </Badge>
                    </TD>
                    <TD>
                      <span className="block max-w-[280px] truncate font-mono text-[12px] text-ink-800">
                        {row.path}
                      </span>
                      {row.error_code && (
                        <span className="block text-[11px] text-rose-600">{row.error_code}</span>
                      )}
                    </TD>
                    <TD align="center">
                      <Badge tone={statusTone(row.status_code)} size="sm">
                        <span className="font-mono text-[10.5px] font-semibold">
                          {row.status_code}
                        </span>
                      </Badge>
                    </TD>
                    <TD align="right">
                      <span
                        className={cn(
                          "tabular text-[12.5px]",
                          row.duration_ms > 1000 ? "font-semibold text-amber-600" : "text-ink-700"
                        )}
                      >
                        {row.duration_ms} ms
                      </span>
                    </TD>
                    <TD>
                      <span className="font-mono text-[11.5px] text-ink-500">
                        {row.ip ?? "—"}
                      </span>
                    </TD>
                    <TD>
                      <span className="block max-w-[160px] truncate text-[12.5px]">
                        {row.project_name ?? "—"}
                      </span>
                    </TD>
                    <TD>
                      <ArrowUpRight className="size-3.5 text-ink-300" />
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={pageSize} total={total} />
        </TableWrap>
      </div>

      <SidePanel
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected ? `${selected.method} ${selected.path}` : ""}
        description={selected ? formatDateTime(selected.created_at) : undefined}
        width="max-w-2xl"
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={METHOD_TONES[selected.method] ?? "neutral"} size="sm">
                {selected.method}
              </Badge>
              <Badge tone={statusTone(selected.status_code)} size="sm" dot>
                HTTP {selected.status_code}
              </Badge>
              <Badge tone="neutral" size="sm">
                {selected.duration_ms} ms
              </Badge>
              {selected.error_code && (
                <Badge tone="danger" size="sm">
                  {selected.error_code}
                </Badge>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-ink-200 bg-ink-50/40 px-4 py-3.5">
              <Detail label="Request ID" value={selected.request_id} mono />
              <Detail label="Projeto" value={selected.project_name ?? "—"} />
              <Detail label="IP de origem" value={selected.ip ?? "—"} mono />
              <Detail
                label="Chave de API"
                value={selected.api_key_id ? selected.api_key_id.slice(0, 8) + "…" : "—"}
                mono
              />
              <Detail label="Query" value={selected.query || "—"} mono />
              <Detail label="Idempotência" value={selected.idempotency_key ?? "—"} mono />
            </dl>

            {selected.user_agent && (
              <p className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-[11.5px] leading-relaxed text-ink-500">
                {selected.user_agent}
              </p>
            )}

            <section className="space-y-2">
              <h3 className="text-[13px] font-semibold text-ink-800">Corpo da requisição</h3>
              {selected.request_body ? (
                <CodeBlock code={prettyJson(selected.request_body)} filename="request.json" />
              ) : (
                <p className="rounded-lg border border-dashed border-ink-200 px-3 py-4 text-center text-[12.5px] text-ink-400">
                  Sem corpo registrado para esta requisição.
                </p>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-[13px] font-semibold text-ink-800">Resumo da resposta</h3>
              {selected.response_summary ? (
                <CodeBlock code={prettyJson(selected.response_summary)} filename="response.json" />
              ) : (
                <p className="rounded-lg border border-dashed border-ink-200 px-3 py-4 text-center text-[12.5px] text-ink-400">
                  Sem resumo de resposta registrado.
                </p>
              )}
            </section>
          </div>
        )}
      </SidePanel>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd
        className={
          mono
            ? "truncate font-mono text-[12px] text-ink-800"
            : "truncate text-[12.5px] text-ink-800"
        }
      >
        {value}
      </dd>
    </div>
  );
}
