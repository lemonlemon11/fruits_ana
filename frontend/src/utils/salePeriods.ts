/**
 * 销售日期快速筛选：快捷区间/年度/月度选项的编码与起止日期计算。
 *
 * 选项值约定：`recent:7` / `year:2026` / `month:2026-09`；对应起止日期为
 * 近 N 天（今天 - N 天 至 今天）或该年/月的自然边界（年 1-1~12-31，月 1 日~月末）。
 * 纯函数，不依赖接口。
 */

export interface SalePeriodBounds {
  start: string
  end: string
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

export function yearBounds(year: number): SalePeriodBounds {
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

export function monthBounds(month: string): SalePeriodBounds | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return null
  const year = Number(match[1])
  const monthIndex = Number(match[2])
  if (monthIndex < 1 || monthIndex > 12) return null
  const lastDay = new Date(year, monthIndex, 0).getDate()
  return { start: dayKey(year, monthIndex, 1), end: dayKey(year, monthIndex, lastDay) }
}

/** 解析下拉选项值（`recent:7` / `year:2026` / `month:2026-09`）为起止日期；非快捷选项返回 null。 */
export function periodBoundsForOption(optionValue: string): SalePeriodBounds | null {
  if (optionValue.startsWith('recent:')) {
    return recentBounds(Number(optionValue.slice(7)))
  }
  if (optionValue.startsWith('year:')) {
    const year = Number(optionValue.slice(5))
    return Number.isInteger(year) && year > 0 ? yearBounds(year) : null
  }
  if (optionValue.startsWith('month:')) {
    return monthBounds(optionValue.slice(6))
  }
  return null
}

export function yearOptionLabel(year: number): string {
  return `${year}年`
}

export function monthOptionLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return month
  return `${match[1]}年${Number(match[2])}月`
}

/** 相对快捷选项：近 N 天（起点 = 今天 - N 天，止点 = 今天）。 */
export const RECENT_DAY_OPTIONS: readonly { days: number; label: string }[] = [
  { days: 7, label: '近七天' },
  { days: 14, label: '近十四天' },
  { days: 30, label: '近三十天' },
  { days: 90, label: '近九十天' },
]

function localDateKey(date: Date): string {
  return dayKey(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** 近 N 天区间：七天前到今天（以浏览器本地时区计算自然日，不含时分秒）。 */
export function recentBounds(days: number): SalePeriodBounds | null {
  if (!Number.isInteger(days) || days <= 0) return null
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  return { start: localDateKey(start), end: localDateKey(end) }
}
