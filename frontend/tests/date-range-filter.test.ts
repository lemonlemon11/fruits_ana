import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const source = fs.readFileSync(path.join(root, 'components', 'DateRangeFilter.vue'), 'utf8')

test('日期筛选使用单个日期范围选择器并保持双绑定', () => {
  assert.match(source, /ElDatePicker/)
  assert.match(source, /type="daterange"/)
  assert.match(source, /value-format="YYYY-MM-DD"/)
  assert.match(source, /range-separator="至"/)
  assert.match(source, /start-placeholder="开始日期"/)
  assert.match(source, /end-placeholder="结束日期"/)
  assert.match(source, /'update:startDate'/)
  assert.match(source, /'update:endDate'/)
  assert.match(source, /ref="root" class="date-range-filter"/)
})

test('日期范围选择器为单一控件，桌面与手机端共用同一结构', () => {
  assert.match(source, /date-range-control/)
  assert.match(source, /date-range-picker/)
  assert.doesNotMatch(source, /date-range-fields/)
  assert.doesNotMatch(source, /type="date"/)
})

test('时间筛选下拉提供快捷区间/年度/月度选项，右侧日历常驻并自动填充', () => {
  // 快捷下拉单选：自定义时间 + 近 N 天快捷区间 + 数据驱动的年度/月度分组。
  assert.match(source, /class="date-range-quick"[\s\S]*?aria-label="时间快捷选项"[\s\S]*?@change="onQuickChange"/)
  assert.match(source, /<ElOption value="custom" label="自定义时间" \/>/)
  assert.match(source, /<ElOptionGroup label="快捷区间">[\s\S]*?v-for="item in RECENT_DAY_OPTIONS"/)
  assert.match(source, /<ElOptionGroup v-if="yearOptions\.length" label="按年度">/)
  assert.match(source, /<ElOptionGroup v-if="monthOptions\.length" label="按月度">/)
  // 选中快捷选项即同步起止日期并广播 change（父级自动刷新查询）。
  assert.match(source, /function onQuickChange\(\)[\s\S]*?periodBoundsForOption\(quickValue\.value\)[\s\S]*?applyBounds/)
  assert.match(source, /function applyBounds\(start: string, end: string\)[\s\S]*?emit\('update:startDate', start\)[\s\S]*?emit\('change'\)/)
  // 年度选项兜底包含当前年份，无数据也能选今年。
  assert.match(source, /years\.add\(new Date\(\)\.getFullYear\(\)\)/)
  // 日历组件无条件渲染（不再随方式切换 v-if/v-else 互斥）。
  assert.match(source, /<ElConfigProvider :locale="zhCn">[\s\S]*?<ElDatePicker/)
  assert.doesNotMatch(source, /v-else/)
  // 起止日期等于某快捷选项边界时下拉回显该选项，否则回到自定义。
  assert.match(source, /quickValue\.value = `year:/)
  assert.match(source, /quickValue\.value = `month:/)
  assert.match(source, /quickValue\.value = `recent:/)
  assert.match(source, /if \(quickValue\.value !== 'custom'\) quickValue\.value = 'custom'/)
})

test('四个时间筛选页共用快捷选项加载器并接入年度/月度方式', () => {
  for (const view of ['OverviewView.vue', 'SettlementListView.vue', 'SettlementView.vue', 'SeriesComparisonView.vue']) {
    const content = fs.readFileSync(path.join(root, 'views', view), 'utf8')
    assert.match(content, /:years="quickYears"[\s\S]*?:months="quickMonths"/, view)
  }
  // 卖得怎么样自带完整 filter-options 加载（含国家/市场选项）。
  const overview = fs.readFileSync(path.join(root, 'views', 'OverviewView.vue'), 'utf8')
  assert.match(overview, /const filterOptions = ref<FilterOptionsData \| null>\(null\)/)
  // 其余三页共用 useQuickPeriods，加载失败静默降级。
  const util = fs.readFileSync(path.join(root, 'utils', 'quickPeriods.ts'), 'utf8')
  assert.match(util, /export function useQuickPeriods\(\)[\s\S]*?loadQuickPeriods[\s\S]*?catch/)
})

test('快捷下拉固定宽度、日历吃满剩余行宽且不截字', () => {
  // 快捷下拉固定宽度（原生 select 按最宽选项布局），日期范围选择器 flex:1 1 auto 吃满剩余行宽。
  assert.match(source, /\.date-range-quick \{\s*\n\s*flex: 0 0 auto;\s*\n\s*width: 11rem;/)
  assert.match(source, /\.date-range-picker \{\s*\n\s*flex: 1 1 auto;/)
  // 日历编辑器最小 19rem：全站字号基线 16px 下「YYYY-MM-DD 至 YYYY-MM-DD」完整显示；
  // 外层整块最小宽 = 快捷下拉 + gap + 编辑器，筛选栏空间不足时换行而不是压缩截字。
  assert.match(source, /\.date-range-picker \{[\s\S]*?min-width: 19rem;/)
  assert.match(source, /\.date-range-filter \{[\s\S]*?min-width: calc\(11rem \+ \.5rem \+ 19rem\);/)
})

test('每一单已删除统计周期组件，时间筛选只保留销售日期三方式', () => {
  const source = fs.readFileSync(path.join(root, 'views', 'SettlementListView.vue'), 'utf8')
  assert.doesNotMatch(source, /period-filter|periodPreset|onPeriodChange|PeriodPreset/)
})

test('卖得怎么样默认自定义时间 + 当年起止，其余页面保留日期回显', () => {
  // 组件提供 autoMatchMode 开关：关闭时不做「日期=年/月边界自动切方式」的回显。
  assert.match(source, /autoMatchMode\?: boolean/)
  assert.match(source, /if \(props\.autoMatchMode === false\) return/)
  // 卖得怎么样：传 false 且挂载时预填当年起止日期。
  const overview = fs.readFileSync(path.join(root, 'views', 'OverviewView.vue'), 'utf8')
  assert.match(overview, /:auto-match-mode="false"/)
  assert.match(overview, /yearBounds\(new Date\(\)\.getFullYear\(\)\)/)
  // 其余三页不传该开关，日期边界回显行为保持（如结算单详情 URL 回填日期）。
  for (const view of ['SettlementListView.vue', 'SettlementView.vue', 'SeriesComparisonView.vue']) {
    const content = fs.readFileSync(path.join(root, 'views', view), 'utf8')
    assert.doesNotMatch(content, /auto-match-mode/, view)
  }
})
