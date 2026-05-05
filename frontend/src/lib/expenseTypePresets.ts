/**
 * Common operational expense labels for quick-select + free typing.
 * Merged at runtime with categories returned from the API.
 */
export const EXPENSE_TYPE_PRESETS: string[] = [
  'Building Rent',
  'Celebrations',
  'Donation',
  'Electricity Bill',
  'Fire cylinder',
  'Flex',
  'Incentives',
  'Interest',
  'Loan Repayment',
  'Miscellaneous',
  'PF and ESI',
  'Pamphlets',
  'Refreshment charges',
  'School Maintenance',
  'School Pooja',
  'Staff Salaries',
  'Stationery',
  'Tea bill',
  'Tent house',
  'Transport Charges',
  'Travelling Allowance',
  'Visiting',
  'Visiting Charges',
  'Water bill',
  'Water Bubbles',
  'Xerox Printing',
].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
