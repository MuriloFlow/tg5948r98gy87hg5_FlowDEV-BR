"use client";

import * as React from "react";
import { Activity, ArrowUpRight, Webhook } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock, EmptyState } from "@/components/ui/misc";
import { SidePanel } from "@/components/ui/modal";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DataToolbar, Pagination } from "@/components/panel/toolbar";
import { DELIVERY_STATUS, eventLabel } from "@/lib/labels";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/format";
import { WEBHOOK_EVENT_TYPES, type DeliveryStatus } from "@/lib/types";

export interface ProjectOption {
  id: string;
  name: string;
  code: string;
}

export interface EventRow {
  id: string;
  type: string;
  project_id: string | null;
  customer_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  payload: Record<string, unknown>;
  api_version: string;
  delivered: boolean;
  created_at: string;
  project_name?: string | null;
}

export interface DeliveryRow {
  id: string;
  event_id: string;
  event_type: string;
  attempt: number;
  status: DeliveryStatus;
  request_url: string;
  response_status: number | null;
  error_message: string | null;
  duration_ms: number | null;
  delivered_at: string | null;
  next_retry_at: string | null;
  created_at: string;
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

export function EventsClient({
  rows,
  deliveries,
  projects,
  total,
  page,
  pageSize,
}: {
  rows: EventRow[];
  deliveries: DeliveryRow[];
  projects: ProjectOption[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const [selected, setSelected] = React.useState<EventRow | null>(null);

  const selectedDeliveries = React.useMemo(
    () => (selected ? deliveries.filter((delivery) => delivery.event_id === selected.id) : []),
    [selected, deliveries]
  );

  return (
    <>
      <DataToolbar
        searchPlaceholder="Buscar por tipo de evento ou recurso..."
        filters={[
          {
            key: "tipo",
            label: "Tipo de evento",
            options: WEBHOOK_EVENT_TYPES.map((type) => ({
              value: type,
              label: eventLabel(type),
            })),
          },
          {
            key: "projeto",
            label: "Projeto",
            options: projects.map((project) => ({
              value: project.id,
              label: project.name,
            })),
          },
          {
            key: "entrega",
            label: "Entregue?",
            options: [
              { value: "sim", label: "Entregue" },
              { value: "nao", label: "Na fila" },
            ],
          },
        ]}
      />

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Tipo</TH>
              <TH>Projeto</TH>
              <TH>Recurso</TH>
              <TH align="center">Entregue?</TH>
              <TH>Data</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty
                colSpan={6}
                icon={<Activity />}
                title="Nenhum evento encontrado"
                description="Os eventos são criados automaticamente quando cobranças, pagamentos e bloqueios mudam de estado."
              />
            ) : (
              rows.map((event) => (
                <TR key={event.id} clickable onClick={() => setSelected(event)}>
                  <TD>
                    <span className="block font-medium text-ink-900">{eventLabel(event.type)}</span>
                    <span className="block font-mono text-[11px] text-ink-400">{event.type}</span>
                  </TD>
                  <TD>
                    {event.project_name ?? <span className="text-ink-300">—</span>}
                  </TD>
                  <TD>
                    {event.resource_type ? (
                      <>
                        <span className="block text-[12.5px] text-ink-700">
                          {event.resource_type}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-ink-400">
                          {event.resource_id ?? "—"}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </TD>
                  <TD align="center">
                    <Badge tone={event.delivered ? "success" : "neutral"} size="sm" dot>
                      {event.delivered ? "Sim" : "Na fila"}
                    </Badge>
                  </TD>
                  <TD>
                    <span className="block text-[12.5px] text-ink-700">
                      {formatDateTime(event.created_at)}
                    </span>
                    <span className="block text-[11px] text-ink-400">
                      {formatRelative(event.created_at)}
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

      <SidePanel
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected ? eventLabel(selected.type) : ""}
        description={
          selected
            ? `${selected.type} · ${formatDateTime(selected.created_at)}`
            : undefined
        }
        width="max-w-2xl"
      >
        {selected && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-ink-200 bg-ink-50/40 px-4 py-3.5">
              <Detail label="Projeto" value={selected.project_name ?? "—"} />
              <Detail label="Versão da API" value={selected.api_version} />
              <Detail label="Recurso" value={selected.resource_type ?? "—"} />
              <Detail label="ID do recurso" value={selected.resource_id ?? "—"} mono />
              <Detail
                label="Entrega"
                value={selected.delivered ? "Entregue aos endpoints" : "Aguardando na fila"}
              />
              <Detail label="Registrado em" value={formatDateTime(selected.created_at)} />
            </dl>

            <section className="space-y-2">
              <h3 className="text-[13px] font-semibold text-ink-800">Payload</h3>
              <CodeBlock
                code={prettyJson(selected.payload)}
                filename={`${selected.type}.json`}
              />
            </section>

            <Card>
              <CardHeader>
                <CardTitle className="text-[14px]">Entregas deste evento</CardTitle>
                <Badge tone="neutral" size="sm">
                  {selectedDeliveries.length}
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                {selectedDeliveries.length === 0 ? (
                  <div className="px-5 py-6">
                    <EmptyState
                      icon={<Webhook />}
                      title="Nenhuma entrega registrada"
                      description="Cadastre um endpoint de webhook no projeto para receber este evento."
                      className="border-0 bg-transparent py-0"
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-ink-200/70">
                    {selectedDeliveries.map((delivery) => (
                      <li key={delivery.id} className="space-y-1.5 px-5 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <StatusBadge
                            meta={
                              DELIVERY_STATUS[delivery.status] ?? {
                                label: delivery.status,
                                tone: "neutral",
                              }
                            }
                            size="sm"
                          />
                          <span className="text-[11px] text-ink-400">
                            tentativa {delivery.attempt} ·{" "}
                            {delivery.duration_ms != null
                              ? formatDuration(delivery.duration_ms)
                              : "—"}
                          </span>
                        </div>
                        <p className="truncate font-mono text-[11.5px] text-ink-600">
                          {delivery.request_url}
                        </p>
                        <p className="text-[11.5px] text-ink-500">
                          HTTP {delivery.response_status ?? "—"} ·{" "}
                          {formatRelative(delivery.delivered_at ?? delivery.created_at)}
                        </p>
                        {delivery.error_message && (
                          <p className="rounded-md bg-rose-50 px-2 py-1 text-[11.5px] text-rose-700">
                            {delivery.error_message}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </SidePanel>
    </>
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
