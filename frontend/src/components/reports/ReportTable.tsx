import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
}

interface ReportTableProps {
  columns: Column[];
  data: any[];
  loading: boolean;
  /** Grand totals for numeric columns (full filtered set, not only current page). Keys match row field names / column keys. */
  footerTotals?: Record<string, string> | null;
  pagination?: {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalCount: number;
  };
  onPageChange?: (page: number) => void;
}

function buildFooterRowForRender(footerTotals: Record<string, string>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(footerTotals)) {
    if (v === '' || v === null || v === undefined) continue;
    const n = parseFloat(String(v));
    row[k] = Number.isFinite(n) ? n : v;
  }
  return row;
}

export default function ReportTable({ columns, data, loading, pagination, onPageChange, footerTotals }: ReportTableProps) {
  const showFooter =
    !loading &&
    data.length > 0 &&
    footerTotals &&
    Object.keys(footerTotals).length > 0;
  const footerRow = showFooter ? buildFooterRowForRender(footerTotals) : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 border-b border-slate-100 text-xs uppercase font-semibold text-slate-500">
            <tr>
              {columns.map(col => (
                <th key={col.key} className="px-6 py-4">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map(col => (
                    <td key={col.key + i} className="px-6 py-4">
                      <div className="h-4 bg-slate-200 rounded w-full"></div>
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-lg font-medium">No results found</span>
                    <span className="text-xs">Try adjusting your filters or date range</span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  {columns.map(col => (
                    <td key={col.key} className="px-6 py-4 font-medium whitespace-nowrap">
                      {col.render ? col.render(row[col.key], row) : row[col.key] || '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {showFooter && footerRow && (
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 text-slate-800">
                {columns.map((col, idx) => {
                  const raw = footerTotals![col.key];
                  const hasVal = raw !== undefined && raw !== null && String(raw).trim() !== '';
                  // If backend provided a label for this cell (even non-numeric), use it as-is.
                  // Fall back to 'Total' for the first column only when not provided.
                  const isLabelCell = hasVal && isNaN(Number(raw));
                  const cell =
                    isLabelCell
                      ? raw
                      : idx === 0
                        ? 'Total'
                        : hasVal
                          ? col.render
                            ? col.render(footerRow![col.key] as never, footerRow as never)
                            : raw
                          : '—';
                  return (
                    <td key={col.key} className="px-6 py-4 font-semibold whitespace-nowrap">
                      {cell}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="text-xs text-slate-500 font-medium">
            Showing {((pagination.currentPage - 1) * pagination.pageSize) + 1} to {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalCount)} of {pagination.totalCount} results
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange?.(pagination.currentPage - 1)}
              disabled={pagination.currentPage === 1 || loading}
              className="p-1 rounded bg-white border border-slate-200 text-slate-600 disabled:opacity-50 hover:bg-slate-50"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1 text-sm font-semibold text-slate-700">
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>
            <button
              onClick={() => onPageChange?.(pagination.currentPage + 1)}
              disabled={pagination.currentPage === pagination.totalPages || loading}
              className="p-1 rounded bg-white border border-slate-200 text-slate-600 disabled:opacity-50 hover:bg-slate-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
