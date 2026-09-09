const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })
const currencyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 0,
})
const priceFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const formatNumber = (value: number): string => numberFormatter.format(value)
export const formatCurrency = (value: number): string => currencyFormatter.format(value)
export const formatPrice = (value: number | null): string => value === null ? '暂无数据' : priceFormatter.format(value)
export const formatPercent = (value: number | null): string => value === null ? '暂无数据' : `${(value * 100).toFixed(1)}%`

export function formatAnomalyValue(type: string, value: number | null): string {
  if (value === null) return '暂无数据'
  const normalizedType = type.toLowerCase()
  if (normalizedType.includes('grade_share')) return formatPercent(value)
  if (normalizedType.includes('daily_quantity')) return formatNumber(value)
  if (normalizedType.includes('price')) return formatPrice(value)
  return formatNumber(value)
}

export function formatDate(value: string): string {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function formatDateTime(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
