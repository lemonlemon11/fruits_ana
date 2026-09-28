import { ref } from 'vue'

import { getFilterOptions } from '../api/client'

/**
 * 日期快捷选项（按年度 / 按月度）的共用加载器：
 * 选项来自 `GET /api/analytics/filter-options`（有销售记录的年份/月份，降序）。
 * 加载失败静默降级——页面仍可用「自定义时间」手动选择日期。
 */
export function useQuickPeriods() {
  const quickYears = ref<number[]>([])
  const quickMonths = ref<string[]>([])

  async function loadQuickPeriods() {
    try {
      const options = await getFilterOptions()
      quickYears.value = options.years
      quickMonths.value = options.months
    } catch {
      // 快捷选项加载失败不阻塞页面；日期范围选择器仍可用。
    }
  }

  return { quickYears, quickMonths, loadQuickPeriods }
}
