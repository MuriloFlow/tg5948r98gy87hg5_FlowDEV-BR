"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import type { MonthlyRevenue } from "@/lib/types";

const AXIS = {
  stroke: "#c1c9d2",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 shadow-[var(--shadow-pop)]">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </p>
      <ul className="space-y-1">
        {payload.map((entry) => (
          <li key={entry.name} className="flex items-center gap-2 text-[12.5px]">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            <span className="text-ink-500">{entry.name}</span>
            <span className="ml-auto font-medium tabular text-ink-900">
              {formatCurrency(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RevenueChart({ data }: { data: MonthlyRevenue[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-[13px] text-ink-400">
        Sem dados suficientes para o gráfico.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="fill-received" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#635BFF" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#635BFF" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fill-expected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00D4B1" stopOpacity={0.16} />
            <stop offset="100%" stopColor="#00D4B1" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="label" {...AXIS} dy={6} />
        <YAxis {...AXIS} tickFormatter={(v) => formatCompactCurrency(Number(v))} width={68} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#e3e8ee" }} />

        <Area
          type="monotone"
          dataKey="expected"
          name="Previsto"
          stroke="#00D4B1"
          strokeWidth={1.6}
          strokeDasharray="4 3"
          fill="url(#fill-expected)"
        />
        <Area
          type="monotone"
          dataKey="received"
          name="Recebido"
          stroke="#635BFF"
          strokeWidth={2.2}
          fill="url(#fill-received)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ComparisonBars({ data }: { data: MonthlyRevenue[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="label" {...AXIS} dy={6} />
        <YAxis {...AXIS} tickFormatter={(v) => formatCompactCurrency(Number(v))} width={68} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f6f9fc" }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8, color: "#697386" }}
        />
        <Bar dataKey="received" name="Recebido" fill="#635BFF" radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Bar dataKey="overdue" name="Atrasado" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const DONUT_COLORS = ["#635BFF", "#00D4B1", "#F59E0B", "#F43F5E", "#0EA5E9", "#8B5CF6"];

export function DonutChart({
  data,
  height = 240,
}: {
  data: { name: string; value: number }[];
  height?: number;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center text-[13px] text-ink-400"
        style={{ height }}
      >
        Sem dados no período.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="58%"
          outerRadius="82%"
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "#697386" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
