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

test('时间筛选提供按年度/按月度/自定义时间三种方式', () => {
  // 方式下拉固定提供三种选项。
  assert.match(source, /class="date-range-mode"[\s\S]*?<option value="year">按年度<\/option>\s*<option value="month">按月度<\/option>\s*<option value="custom">自定义时间<\/option>/)
  // 年度/月度方式各自渲染数据驱动选项，选中后同步起止日期并广播 change。
  assert.match(source, /v-if="mode === 'year'"[\s\S]*?aria-label="选择年度"[\s\S]*?@change="onYearChange"/)
  assert.match(source, /v-else-if="mode === 'month'"[\s\S]*?aria-label="选择月度"[\s\S]*?@change="onMonthChange"/)
  assert.match(source, /function applyBounds\(start: string, end: string\)[\s\S]*?emit\('update:startDate', start\)[\s\S]*?emit\('change'\)/)
  // 年度选项兜底包含当前年份，无数据也能选今年。
  assert.match(source, /years\.add\(new Date\(\)\.getFullYear\(\)\)/)
  // 自定义方式才渲染日期范围选择器。
  assert.match(source, /<ElConfigProvider v-else :locale="zhCn">[\s\S]*?<ElDatePicker/)
  // 起止日期等于年/月自然边界时控件回显对应方式，否则回到自定义。
  assert.match(source, /mode\.value = 'year'/)
  assert.match(source, /mode\.value = 'month'/)
  assert.match(source, /if \(mode\.value !== 'custom'\) mode\.value = 'custom'/)
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

test('年/月下拉宽度固定：吃满剩余行宽，切换选项不改变输入框长度', () => {
  // 快捷下拉与日期范围选择器同为 flex:1 1 auto，宽度恒等于剩余行宽。
  assert.match(source, /\.date-range-quick \{\s*\n\s*flex: 1 1 auto;\s*\n\s*width: auto;/)
  assert.match(source, /\.date-range-picker \{\s*\n\s*flex: 1 1 auto;/)
  // 方式下拉固定宽度，不随选项变化。
  assert.match(source, /\.date-range-mode \{\s*\n\s*flex: 0 0 auto;/)
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
