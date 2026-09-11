import type { Grade, GradeMetric, SettlementComparisonItem } from '../api/types'
import { displayOrderNo } from './orderNo.ts'
import { displayMerchantNo } from './merchantNo.ts'

export const MAX_COMPARISON_SETTLEMENTS = 3
export const MIN_COMPARISON_SETTLEMENTS = 2

/** 下拉框以商号作为唯一取值，并按「商号（单号）」展示，避免重复柜号或重复单号造成误选。 */
export function settlementOptionLabel(item: {
  merchantNo?: string | null
  merchantNoNormalized?: string | null
  orderNo?: string | null
  orderNoNormalized?: string | null
}): string {
  const orderNo = displayOrderNo(item)
  const merchantNo = displayMerchantNo(item)
  if (merchantNo && orderNo) return `商号 ${merchantNo}（${orderNo}）`
  if (merchantNo) return `商号 ${merchantNo}`
  return orderNo || '未知结算单'
}

/** 总览页：下拉候选保持全部结算单，展示列表跟随所选商号收窄到该商号自己的数据。 */
export function filterSettlementsByMerchant(
  items: SettlementComparisonItem[],
  merchantNo: string,
): SettlementComparisonItem[] {
  return merchantNo ? items.filter((item) => item.merchantNo === merchantNo) : items
}

export function toggleComparisonSelection(selectedIds: string[], settlementId: string): string[] {
  if (selectedIds.includes(settlementId)) return selectedIds.filter((id) => id !== settlementId)
  if (selectedIds.length >= MAX_COMPARISON_SETTLEMENTS) return selectedIds
  return [...selectedIds, settlementId]
}

export function initialComparisonSelection(items: SettlementComparisonItem[]): string[] {
  return items.slice(0, MAX_COMPARISON_SETTLEMENTS - 1).map((item) => item.merchantNo)
}

export function buildOtherSettlementGradeBaseline(
  items: SettlementComparisonItem[],
  activeMerchantNo: string,
): GradeMetric[] {
  const grades: Grade[] = ['A', 'B', 'C']
  const peers = items.filter((item) => item.merchantNo !== activeMerchantNo)
  const overallQuantity = peers.reduce((total, item) => total + item.salesQuantity, 0)
  return grades.map((grade) => {
    const rows = peers.flatMap((item) => item.grades.filter((row) => row.grade === grade))
    const salesQuantity = rows.reduce((total, row) => total + row.salesQuantity, 0)
    const salesAmount = rows.reduce((total, row) => total + row.salesAmount, 0)
    return {
      grade,
      salesQuantity,
      salesAmount,
      weightedAvgPrice: salesQuantity ? salesAmount / salesQuantity : null,
      quantityShare: overallQuantity ? salesQuantity / overallQuantity : null,
    }
  })
}
