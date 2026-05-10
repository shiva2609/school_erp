/** Maps exportKey → summary strip cards (keys match API `data.summary` from reports). */

export type SummaryCardFormat = 'inr' | 'number' | 'text';

export type SummaryCardConfig = {
  key: string;
  label: string;
  format?: SummaryCardFormat;
};

export const reportSummaryCardsByExportKey: Record<string, SummaryCardConfig[]> = {
  PAYMENTS_FEE_BALANCES: [
    { key: 'total_outstanding', label: 'Total balance due', format: 'inr' },
    { key: 'total_paid', label: 'Total collected (on invoices)', format: 'inr' },
    { key: 'total_net', label: 'Total net (invoices)', format: 'inr' },
  ],
  PAYMENTS_FEE_BALANCES_TEACHERS: [
    { key: 'total_outstanding', label: 'Total balance due', format: 'inr' },
    { key: 'total_paid', label: 'Total collected', format: 'inr' },
    { key: 'total_net', label: 'Total net', format: 'inr' },
  ],
  PAYMENTS_FEE_BALANCES_NO_CONCESSION: [
    { key: 'total_outstanding', label: 'Total balance due', format: 'inr' },
    { key: 'total_paid', label: 'Total collected', format: 'inr' },
    { key: 'total_net', label: 'Total net', format: 'inr' },
  ],
  PAYMENTS_DAILY_COLLECTIONS: [{ key: 'total_amount', label: 'Total collected', format: 'inr' }],
  PAYMENTS_RECEIPTS: [{ key: 'total_amount', label: 'Total receipt amount', format: 'inr' }],
  PAYMENTS_DELETED_RECEIPTS: [{ key: 'total_amount', label: 'Total (refunded)', format: 'inr' }],
  PAYMENTS_EXPENSES: [{ key: 'total_amount', label: 'Total expenses', format: 'inr' }],
  PAYMENTS_OTHER_INCOME: [{ key: 'total_amount', label: 'Total other income', format: 'inr' }],
  PAYMENTS_DELETED_OTHER_INCOME: [{ key: 'total_amount', label: 'Total adjustments', format: 'inr' }],
  PAYMENTS_CHEQUES: [{ key: 'total_amount', label: 'Total cheque amount', format: 'inr' }],
  PAYMENTS_CONCESSIONS: [
    { key: 'total_concession', label: 'Total concession', format: 'inr' },
    { key: 'total_net', label: 'Total net fee', format: 'inr' },
    { key: 'total_gross', label: 'Total gross fee', format: 'inr' },
  ],
  PAYMENTS_FEES_PAID: [{ key: 'total_amount', label: 'Total by all modes', format: 'inr' }],
  PAYMENTS_BANK_TRANSACTIONS: [{ key: 'total_amount', label: 'Total bank / transfer', format: 'inr' }],
  PAYMENTS_BUS_EXPENSES: [{ key: 'total_amount', label: 'Total bus expenses', format: 'inr' }],
  PAYMENTS_ALL_RECEIPTS: [{ key: 'total_amount', label: 'Total receipt amount', format: 'inr' }],
  PAYMENTS_ALL_RECEIPTS_WITH_MISMATCH: [
    { key: 'record_count', label: 'Invoices with mismatch', format: 'number' },
    { key: 'total_abs_delta', label: 'Sum of |delta|', format: 'inr' },
  ],
  PAYMENTS_ALL_INCOME_EXPENSES: [
    { key: 'total_income', label: 'Total income', format: 'inr' },
    { key: 'total_expense', label: 'Total expense', format: 'inr' },
    { key: 'net_cashflow', label: 'Net (income − expense)', format: 'inr' },
  ],
  PAYMENTS_STUDENT_DETAILED_BALANCES: [
    { key: 'total_outstanding', label: 'Total outstanding', format: 'inr' },
    { key: 'total_paid', label: 'Total paid', format: 'inr' },
    { key: 'total_net', label: 'Total net', format: 'inr' },
  ],
  PAYMENTS_INCOME_STATEMENT: [{ key: 'total_amount', label: 'Total income', format: 'inr' }],
  BUS_FEE_BALANCES: [
    { key: 'total_outstanding', label: 'Total transport balance', format: 'inr' },
    { key: 'total_net', label: 'Total net', format: 'inr' },
  ],
  PAST_DUES_LIST: [
    { key: 'total_outstanding', label: 'Total overdue balance', format: 'inr' },
    { key: 'total_net', label: 'Total net (invoices)', format: 'inr' },
  ],

  ADMIT_APPLICANTS: [
    { key: 'total_allocated', label: 'Total allocated fees', format: 'inr' },
    { key: 'record_count', label: 'Applicants in filter', format: 'number' },
  ],
  ADMIT_FEE_ALLOCATIONS: [
    { key: 'total_allocated', label: 'Total allocated fees', format: 'inr' },
    { key: 'record_count', label: 'Applicants', format: 'number' },
  ],
  ADMIT_COUNTS_BY_CLASS: [{ key: 'total_applications', label: 'Total applications', format: 'number' }],
  ADMIT_COUNTS_BY_MONTH: [{ key: 'total_applications', label: 'Total applications', format: 'number' }],

  ACADEMICS_STUDENTS: [
    { key: 'total_initial_income', label: 'Total initial income (ADM+FD)', format: 'inr' },
    { key: 'admission_fee_collected', label: 'Admission fees collected', format: 'inr' },
    { key: 'fixed_deposit_collected', label: 'Fixed deposits collected', format: 'inr' },
  ],
  ACADEMICS_STRENGTH: [{ key: 'total_students', label: 'Total students', format: 'number' }],
  ACADEMICS_YEAR_TRANSITION: [
    { key: 'records_total', label: 'Records', format: 'number' },
    { key: 'active', label: 'Active', format: 'number' },
    { key: 'promoted', label: 'Promoted', format: 'number' },
    { key: 'detained', label: 'Detained', format: 'number' },
    { key: 'dropout', label: 'Dropout', format: 'number' },
    { key: 'graduated', label: 'Graduated', format: 'number' },
    { key: 'transferred', label: 'Transferred', format: 'number' },
  ],
  ACADEMICS_ATTENDANCE: [{ key: 'record_count', label: 'Attendance rows', format: 'number' }],
  ACADEMICS_NOTES: [{ key: 'record_count', label: 'Note entries', format: 'number' }],
  ACADEMICS_HALL_TICKETS: [{ key: 'record_count', label: 'Students', format: 'number' }],
  ACADEMICS_CONSOLIDATED_MARKS: [{ key: 'record_count', label: 'Mark rows', format: 'number' }],
  ACADEMICS_SECTION_REPORT_CARDS: [{ key: 'record_count', label: 'Students', format: 'number' }],
  ACADEMICS_SECTION_REPORT_CARDS_SUMMARY: [{ key: 'record_count', label: 'Students in summary', format: 'number' }],
  ACADEMICS_RANKS: [{ key: 'record_count', label: 'Rank rows', format: 'number' }],
  ACADEMICS_MISSING_PARENT_APP: [{ key: 'record_count', label: 'Students', format: 'number' }],
  ACADEMICS_ID_CARDS: [{ key: 'record_count', label: 'Students', format: 'number' }],

  STAFF_ATTENDANCE: [{ key: 'record_count', label: 'Attendance rows', format: 'number' }],
};

export function getSummaryCardsForExportKey(exportKey: string): SummaryCardConfig[] {
  return reportSummaryCardsByExportKey[exportKey] ?? [];
}
