import type { ImportReviewIssue } from '../api/types'

export const SALES_FIELD_TO_CELL: Record<string, string> = {
  sale_date: 'saleDate',
  variety: 'variety',
  grade: 'grade',
  head_count: 'headCount',
  spec_kg: 'specKg',
  sales_quantity: 'salesQuantity',
  unit_price: 'unitPrice',
  remark: 'remark',
  amount: 'amount',
}

export function rowIssuesFor(
  issues: ImportReviewIssue[],
  section: string,
  rowIndex: number,
): ImportReviewIssue[] {
  return issues.filter((issue) => issue.section === section && Number(issue.row) === rowIndex)
}

export function cellClassFor(
  issues: ImportReviewIssue[],
  section: string,
  rowIndex: number,
  field?: string,
): string {
  const rows = rowIssuesFor(issues, section, rowIndex)
  const hasRowLevelError = rows.some((issue) => issue.severity === 'error' && !issue.field)
  if (hasRowLevelError) return 'cell-error'
  const cellKey = field ? SALES_FIELD_TO_CELL[field] : undefined
  const relevant = cellKey
    ? rows.filter((issue) => issue.field && SALES_FIELD_TO_CELL[issue.field] === cellKey)
    : rows
  if (relevant.some((issue) => issue.severity === 'error')) return 'cell-error'
  if (relevant.some((issue) => issue.severity === 'warning')) return 'cell-warning'
  return ''
}

export function rowClassFor(
  issues: ImportReviewIssue[],
  section: string,
  rowIndex: number,
): string {
  return rowIssuesFor(issues, section, rowIndex).some((issue) => issue.severity === 'error')
    ? 'row-invalid'
    : ''
}
