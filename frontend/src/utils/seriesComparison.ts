import type { Grade, GradeMetric, SeriesComparisonItem } from '../api/types'
import { displayOrderNo } from './orderNo.ts'
import { UNKNOWN_SERIES } from '../api/normalize.ts'

/** 一次最多勾选的结算单数量，保证图表可读；后端不做数量限制。 */
export const MAX_SERIES_COMPARISON = 6

export interface SeriesGroup<T> {
  series: string
  items: T[]
}

/** 按品牌分组，品牌名缺失时归入「未识别品牌」。 */
export function groupBySeries<T extends { series: string }>(items: T[]): SeriesGroup<T>[] {
  const groups = new Map<string, T[]>()
  items.forEach((item) => {
    const key = item.series?.trim() || UNKNOWN_SERIES
    groups.set(key, [...(groups.get(key) ?? []), item])
  })
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'zh-Hans-CN'))
    .map(([series, grouped]) => ({ series, items: grouped }))
}

/** 勾选或取消一张结算单；超过上限时保持原选择不变。 */
export function toggleSelection(
  selected: string[],
  merchantNo: string,
  max: number = MAX_SERIES_COMPARISON,
): string[] {
  if (selected.includes(merchantNo)) {
    return selected.filter((item) => item !== merchantNo)
  }
  if (selected.length >= max) return selected
  return [...selected, merchantNo]
}

/** 追加同一品牌的结算单，按上限截断并去重。 */
export function selectWholeSeries(
  selected: string[],
  seriesMerchantNos: string[],
  max: number = MAX_SERIES_COMPARISON,
): string[] {
  const merged = [...selected]
  seriesMerchantNos.forEach((merchantNo) => {
    if (!merged.includes(merchantNo) && merged.length < max) merged.push(merchantNo)
  })
  return merged
}

export function deselectSeries(selected: string[], seriesMerchantNos: string[]): string[] {
  return selected.filter((merchantNo) => !seriesMerchantNos.includes(merchantNo))
}

export function gradePrice(item: SeriesComparisonItem, grade: Grade): number | null {
  return gradeOf(item, grade)?.weightedAvgPrice ?? null
}

/** 返回等级指标；该等级没有数据时返回零值行，避免表格出现空单元格。 */
export function gradeRow(grades: GradeMetric[], grade: Grade): GradeMetric {
  return grades.find((row) => row.grade === grade) ?? {
    grade,
    salesQuantity: 0,
    salesAmount: 0,
    weightedAvgPrice: null,
    quantityShare: null,
  }
}

export function gradeOf(item: SeriesComparisonItem, grade: Grade): GradeMetric {
  return gradeRow(item.grades, grade)
}

/** 结算单在图表中的短标签：优先适配后单号，其次商号。 */
export function shortLabel(item: {
  orderNo?: string
  orderNoNormalized?: string
  merchantNo?: string
}): string {
  return displayOrderNo(item) || item.merchantNo?.trim() || '未知结算单'
}
