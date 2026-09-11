/**
 * 结算单选择器的纯逻辑：搜索过滤与草稿勾选。
 *
 * 选择器在「草稿」上操作，点「确定」才把结果交给页面刷新对比，
 * 避免每勾一下就重新请求一次接口。
 */

import type { SettlementListItem } from '../api/types'

/** 按商号、单号、系列或柜号匹配；关键词为空时返回全部。 */
export function filterSettlementOptions(
  items: SettlementListItem[],
  keyword: string,
): SettlementListItem[] {
  const needle = keyword.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) =>
    [item.merchantNo, item.orderNo, item.series, item.containerNo]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)),
  )
}

export interface DraftToggleResult {
  next: string[]
  /** 是否因为已经选满上限而没有选上。 */
  limited: boolean
}

/** 草稿勾选：已选则取消；未选且没到上限才加入。 */
export function toggleDraftSelection(
  draft: string[],
  merchantNo: string,
  max: number,
): DraftToggleResult {
  if (draft.includes(merchantNo)) {
    return { next: draft.filter((item) => item !== merchantNo), limited: false }
  }
  if (draft.length >= max) return { next: draft, limited: true }
  return { next: [...draft, merchantNo], limited: false }
}

/** 追加整组结算单，按上限截断；返回是否被上限截断。 */
export function addWholeSeries(
  draft: string[],
  seriesMerchantNos: string[],
  max: number,
): DraftToggleResult {
  const next = [...draft]
  let limited = false
  for (const merchantNo of seriesMerchantNos) {
    if (next.includes(merchantNo)) continue
    if (next.length >= max) {
      limited = true
      break
    }
    next.push(merchantNo)
  }
  return { next, limited }
}

/** 该系列是否已经全部选中，用于切换「全选本系列 / 取消本系列」文案。 */
export function isWholeSeriesSelected(draft: string[], seriesMerchantNos: string[]): boolean {
  return (
    seriesMerchantNos.length > 0 &&
    seriesMerchantNos.every((merchantNo) => draft.includes(merchantNo))
  )
}
