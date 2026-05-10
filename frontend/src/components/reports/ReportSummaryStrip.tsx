'use client';

import React from 'react';
import type { SummaryCardConfig, SummaryCardFormat } from '@/lib/reportSummaryCards';

function formatValue(raw: string | undefined, format: SummaryCardFormat | undefined): string {
  if (raw === undefined || raw === null || raw === '') return '—';
  if (format === 'inr') {
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return raw;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(n);
  }
  if (format === 'number') {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return raw;
    return n.toLocaleString('en-IN');
  }
  return raw;
}

type Props = {
  cards: SummaryCardConfig[];
  summary: Record<string, string> | null | undefined;
};

export default function ReportSummaryStrip({ cards, summary }: Props) {
  if (!cards.length || !summary || typeof summary !== 'object') return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div
          key={c.key}
          className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{c.label}</p>
          <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
            {formatValue(summary[c.key], c.format)}
          </p>
        </div>
      ))}
    </div>
  );
}
