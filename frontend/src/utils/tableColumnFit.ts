/**
 * 列宽自适应容器分配（DataTable 的 fitWidth 模式）。
 *
 * 内容理想宽总和超出容器时，把每列从理想宽向「表头下限」压缩，让总宽恰好等于容器宽。
 * 压缩量按 (理想 − 下限) 的平方加权：长文本列（单号 / 柜号 / 时间）多担赤字，
 * 数值列内容短、几乎不被压；某列压到下限后退出，剩余赤字继续分给未到下限的列。
 * 两种情况返回 null，由调用方回退为 min-width 弹性分配（放得下时拉伸铺满、
 * 放不下时横向滚动）：
 * - 理想总宽 ≤ 预算：无需压缩；
 * - 下限总宽 > 预算：连表头都摆不下，压缩只会截断表头。
 */
export interface WidthFitEntry {
  key: string
  /** 内容理想宽（零截断所需宽度）。 */
  ideal: number
  /** 表头下限：低于它表头文案 / 排序箭头会被截断。 */
  floor: number
}

export function fitColumnWidths(
  budget: number,
  entries: WidthFitEntry[],
): Record<string, number> | null {
  if (!entries.length || budget <= 0) return null
  const items = entries.map((entry) => ({
    key: entry.key,
    ideal: Math.max(entry.ideal, 0),
    floor: Math.max(Math.min(entry.floor, entry.ideal), 0),
  }))
  const totalIdeal = items.reduce((total, item) => total + item.ideal, 0)
  if (totalIdeal <= budget) return null
  const totalFloor = items.reduce((total, item) => total + item.floor, 0)
  if (totalFloor > budget) return null

  let deficit = totalIdeal - budget
  const take: Record<string, number> = {}
  let active = items
  // 平方加权逐轮分配：被压到下限的列退出，剩余赤字在未到下限的列间继续分摊。
  // 每轮封顶用「剩余可压量」（slack − 已承担量）——若按完整 slack 封顶，多轮累计
  // 会超过下限余量，把列压破表头下限。
  while (deficit > 0.5 && active.length) {
    const totalWeight = active.reduce((total, item) => total + (item.ideal - item.floor) ** 2, 0)
    if (totalWeight <= 0) break
    let allocated = 0
    const remaining: typeof active = []
    for (const item of active) {
      const slack = item.ideal - item.floor
      const room = slack - (take[item.key] ?? 0)
      const share = Math.min(room, (deficit * slack ** 2) / totalWeight)
      take[item.key] = (take[item.key] ?? 0) + share
      allocated += share
      if (share < room - 0.5) remaining.push(item)
    }
    if (allocated <= 0.5) break
    deficit -= allocated
    active = remaining
  }

  const widths: Record<string, number> = {}
  let sum = 0
  let widestKey = items[0].key
  for (const item of items) {
    const width = Math.max(Math.round(item.ideal - (take[item.key] ?? 0)), item.floor)
    widths[item.key] = width
    sum += width
    if (width > widths[widestKey]) widestKey = item.key
  }
  // 取整误差统一补给最宽的列，保证 Σ列宽 === 预算（避免末列与容器右缘留缝或溢出 1px）。
  widths[widestKey] += budget - sum
  return widths
}
