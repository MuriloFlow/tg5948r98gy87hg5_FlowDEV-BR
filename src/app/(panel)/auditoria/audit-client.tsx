"use client";

import * as React from "react";
import { ArrowUpRight, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, CodeBlock } from "@/components/ui/misc";
import { SidePanel } from "@/components/ui/modal";
import { Table, TableEmpty, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DataToolbar, Pagination } from "@/components/panel/toolbar";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { Tone } from "@/lib/labels";
import type { ActorType } from "@/lib/types";

export interface FilterValue {
  value: string;
  label: string;
}

export interface AuditRow {
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
  diff: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  created_at: string;
}

const ACTOR_TONES: Record<ActorType, Tone> = {
  ADMIN: "info",
  API: "violet",
  SYSTEM: "neutral",
  WEBHOOK: "warning",
  PUBLIC: "neutral",
};

const ACTOR_LABELS: Record<ActorType, string> = {
  ADMIN: "Painel",
  API: "API",
  SYSTEM: "Automação",
  WEBHOOK: "Webhook",
  PUBLIC: "Checkout público",
};

/** Ações destrutivas ganham destaque visual na listagem. */
function actionTone(action: string): Tone {
  if (/deleted|revoked|blocked|deactivated|canceled/.test(action)) return "danger";
  if (/created|paid|activated|reactivated|unblocked/.test(action)) return "success";
  if (/updated|changed|reset/.test(action)) return "warning";
  return "neutral";
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

export function AuditClient({
  rows,
  actions,
  entities,
  actors,
  total,
  page,
  pageSize,
}: {
  rows: AuditRow[];
  actions: FilterValue[];
  entities: FilterValue[];
  actors: FilterValue[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const [selected, setSelected] = React.useState<AuditRow | null>(null);

  const diffEntries = React.useMemo(() => {
    if (!selected?.diff) return [];
    return Object.entries(selected.diff).map(([field, change]) => {
      const value = change as { de?: unknown; para?: unknown } | null;
      return {
        field,
        from: value && "de" in value ? value.de : null,
        to: value && "para" in value ? value.para : null,
      };
    });
  }, [selected]);

  return (
    <>
      <DataToolbar
        searchPlaceholder="Buscar por ação, entidade ou responsável..."
        filters={[
          { key: "acao", label: "Ação", options: actions },
          { key: "entidade", label: "Tipo de entidade", options: entities },
          { key: "ator", label: "Responsável", options: actors },
          {
            key: "periodo",
            label: "Período",
            allLabel: "Todo o histórico",
            options: [
              { value: "24h", label: "Últimas 24 horas" },
              { value: "7d", label: "Últimos 7 dias" },
              { value: "30d", label: "Últimos 30 dias" },
              { value: "90d", label: "Últimos 90 dias" },
            ],
          },
        ]}
      />

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Responsável</TH>
              <TH>Ação</TH>
              <TH>Entidade</TH>
              <TH>IP</TH>
              <TH>Data</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty
                colSpan={6}
                icon={<ScrollText />}
                title="Nenhum registro de auditoria"
                description="Toda alteração feita no painel ou pela API é registrada aqui automaticamente."
              />
            ) : (
              rows.map((row) => (
                <TR key={row.id} clickable onClick={() => setSelected(row)}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={row.actor_label ?? ACTOR_LABELS[row.actor_type] ?? "?"} size="xs" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink-900">
                          {row.actor_label ?? "—"}
                        </span>
                        <Badge tone={ACTOR_TONES[row.actor_type] ?? "neutral"} size="sm">
                          {ACTOR_LABELS[row.actor_type] ?? row.actor_type}
                        </Badge>
                      </span>
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={actionTone(row.action)} size="sm" dot>
                      <span className="font-mono text-[10.5px]">{row.action}</span>
                    </Badge>
                  </TD>
                  <TD>
                    <span className="block truncate text-[12.5px] font-medium text-ink-800">
                      {row.entity_label ?? row.entity_type}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-ink-400">
                      {row.entity_type}
                      {row.entity_id ? ` · ${row.entity_id.slice(0, 8)}…` : ""}
                    </span>
                  </TD>
                  <TD>
                    <span className="font-mono text-[11.5px] text-ink-500">{row.ip ?? "—"}</span>
                  </TD>
                  <TD>
                    <span className="block text-[12.5px] text-ink-700">
                      {formatDateTime(row.created_at)}
                    </span>
                    <span className="block text-[11px] text-ink-400">
                      {formatRelative(row.created_at)}
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
        title={selected?.action ?? ""}
        description={
          selected
            ? `${selected.entity_label ?? selected.entity_type} · ${formatDateTime(selected.created_at)}`
            : undefined
        }
        width="max-w-2xl"
      >
        {selected && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-ink-200 bg-ink-50/40 px-4 py-3.5">
              <Detail label="Responsável" value={selected.actor_label ?? "—"} />
              <Detail
                label="Origem"
                value={ACTOR_LABELS[selected.actor_type] ?? selected.actor_type}
              />
              <Detail label="Entidade" value={selected.entity_type} />
              <Detail label="ID da entidade" value={selected.entity_id ?? "—"} mono />
              <Detail label="IP" value={selected.ip ?? "—"} mono />
              <Detail label="Request ID" value={selected.request_id ?? "—"} mono />
            </dl>

            {selected.user_agent && (
              <p className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-[11.5px] leading-relaxed text-ink-500">
                {selected.user_agent}
              </p>
            )}

            <section className="space-y-2">
              <h3 className="text-[13px] font-semibold text-ink-800">O que mudou</h3>
              {diffEntries.length === 0 ? (
                <p className="rounded-lg border border-dashed border-ink-200 px-3 py-4 text-center text-[12.5px] text-ink-400">
                  Esta ação não alterou campos comparáveis.
                </p>
              ) : (
                <ul className="divide-y divide-ink-200/70 overflow-hidden rounded-xl border border-ink-200">
                  {diffEntries.map((entry) => (
                    <li key={entry.field} className="space-y-1.5 px-3.5 py-2.5">
                      <p className="font-mono text-[11.5px] font-semibold text-ink-700">
                        {entry.field}
                      </p>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        <p className="rounded-md bg-rose-50 px-2 py-1 font-mono text-[11.5px] text-rose-700">
                          − {prettyJson(entry.from).slice(0, 200)}
                        </p>
                        <p className="rounded-md bg-emerald-50 px-2 py-1 font-mono text-[11.5px] text-emerald-700">
                          + {prettyJson(entry.to).slice(0, 200)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {selected.before_data && (
              <section className="space-y-2">
                <h3 className="text-[13px] font-semibold text-ink-800">Estado anterior</h3>
                <CodeBlock code={prettyJson(selected.before_data)} filename="before.json" />
              </section>
            )}

            {selected.after_data && (
              <section className="space-y-2">
                <h3 className="text-[13px] font-semibold text-ink-800">Estado posterior</h3>
                <CodeBlock code={prettyJson(selected.after_data)} filename="after.json" />
              </section>
            )}
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
