import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { filterSettlementsByMerchant } from '../src/utils/settlementComparison.ts'
import { normalizeFilterOptions } from '../src/api/normalize.ts'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

test('filter-options 的年/月是原始标量数组，归一化不得丢失', () => {
  const options = normalizeFilterOptions({
    brands: [],
    countries: [],
    markets: [],
    years: [2026, 2025],
    months: ['2026-09', '2026-08', 'invalid'],
  })
  assert.deepEqual(options.years, [2026, 2025])
  assert.deepEqual(options.months, ['2026-09', '2026-08'])
})

const items = [
  { merchantNo: '单624', orderNo: '宝贝01' },
  { merchantNo: '626', orderNo: '宝贝02' },
] as never[]

test('下拉候选按商号过滤的纯函数行为保持不变', () => {
  assert.deepEqual(
    filterSettlementsByMerchant(items, '626').map((item: { merchantNo: string }) => item.merchantNo),
    ['626'],
  )
  assert.deepEqual(filterSettlementsByMerchant(items, ''), items)
  assert.deepEqual(filterSettlementsByMerchant(items, '不存在的商号'), [])
})

test('卖得怎么样筛选条改为国家+市场，不再提供商号下拉', () => {
  const view = fs.readFileSync(path.join(src, 'views', 'OverviewView.vue'), 'utf8')

  assert.match(view, /filters = reactive\(\{ startDate: '', endDate: '', country: '', market: '' \}\)/)
  assert.match(view, /v-model="filters\.country"[\s\S]*?label="国家"/)
  assert.match(view, /v-model="filters\.market"[\s\S]*?label="市场"/)
  assert.doesNotMatch(view, /filters\.merchantNo/)
  assert.doesNotMatch(view, /getSettlementComparison/)
  assert.match(view, /<SearchableSelect[\s\S]*?:loading="filterOptionsLoading"/)
})

test('卖得怎么样隐藏等级卡片，等级项不展示 AB 与 OTHER，总量口径不变', () => {
  const view = fs.readFileSync(path.join(src, 'views', 'OverviewView.vue'), 'utf8')
  const summary = fs.readFileSync(path.join(src, 'components', 'GradeSummary.vue'), 'utf8')

  // 「销售情况」区块移除等级卡片，只保留总柜数/销售金额汇总条。
  assert.match(view, /:hide-grade-cards="true"/)
  assert.match(summary, /v-if="!hideGradeCards && visibleItems\.length" class="grade-grid"/)
  // 「等级销售分析」的饼图/规格表仍隐藏 AB/OTHER。
  assert.match(view, /HIDDEN_OVERVIEW_GRADES = new Set<Grade>\(\['AB', 'OTHER'\]\)/)
  assert.match(view, /:grade-order="breakdownGradeOrder"/)
  // 总量仍来自 overview.total（全量），不因隐藏等级而重算。
  assert.match(view, /:total="overview\?\.total \?\? \{ salesQuantity: 0, salesAmount: 0, weightedAvgPrice: null \}"/)
})

test('卖得怎么样区块改名并启用 overview 版式等级图表', () => {
  const view = fs.readFileSync(path.join(src, 'views', 'OverviewView.vue'), 'utf8')
  const breakdown = fs.readFileSync(path.join(src, 'components', 'SettlementGradeBreakdown.vue'), 'utf8')

  assert.match(view, /title="销售情况"/)
  assert.match(view, /title="等级销售分析"/)
  assert.match(view, /variant="overview"/)

  // 等级均价图已整体删除；饼图（等级件数结构）仅 overview 保留，结算单详情不渲染。
  assert.doesNotMatch(breakdown, /等级均价/)
  assert.match(breakdown, /v-if="isOverview" class="chart-block pie-chart-block"/)
  // 规格表（方案A）：一行 = 品牌+等级+头数+KG+备注（相同组合合并统计），七列全部居中。
  assert.match(breakdown, /<table class="spec-table">[\s\S]*?<th>品牌<\/th>\s*<th>等级<\/th>\s*<th>头数<\/th>\s*<th>KG<\/th>\s*<th>备注<\/th>\s*<th>总件数<\/th>\s*<th>每件均价<\/th>/)
  assert.match(breakdown, /const key = `\$\{brand\}::\$\{grade\}::\$\{head\}::\$\{kg\}::\$\{remark\}`/)
  // 详情页（单张结算单）经 brand prop 传入整单品牌，优先于记录级 brand。
  assert.match(breakdown, /props\.brand\?\.trim\(\) \|\| record\.brand\.trim\(\) \|\| '未识别品牌'/)
  assert.match(breakdown, /\.spec-table thead th \{[\s\S]*?text-align: center;/)
  assert.match(breakdown, /\.spec-table tbody td \{[\s\S]*?text-align: center;/)
  // 每个 品牌×等级 小计 + 底部合计，小计/合计的每件均价按金额加权。
  assert.match(breakdown, /小计 · \{\{ group\.brand \}\} \{\{ gradeLabel\(group\.grade\) \}\}/)
  assert.match(breakdown, /合计 · 全部品牌等级/)
  assert.match(breakdown, /price: quantity \? amount \/ quantity : null/)
  // 布局：饼图独占一行居中，规格长表独占下一行全宽；销售柜数统计移除、统一到「市场销售分析」。
  assert.match(breakdown, /\.breakdown-grid--overview \.pie-chart-block \{ grid-row: 1; \}/)
  assert.match(breakdown, /\.breakdown-grid--overview \.spec-block \{ grid-column: 1 \/ -1; grid-row: 2; \}/)
  assert.doesNotMatch(breakdown, /销售柜数统计|brandContainers/)
  // 结算单详情版式：等级件数结构/等级均价图已删，规格区与 overview 共用同一张七列表格。
  assert.match(breakdown, /sectionTitle = computed\(\(\) => props\.title \?\? '等级图表'\)/)
  assert.doesNotMatch(breakdown, /const key = `\$\{grade\}::\$\{spec}`/)
  assert.doesNotMatch(breakdown, /spec-list|spec-row/)
})

test('市场销售分析块跟随市场筛选，全部市场同图分组、单市场按档口展示', () => {
  const view = fs.readFileSync(path.join(src, 'views', 'OverviewView.vue'), 'utf8')
  const market = fs.readFileSync(path.join(src, 'components', 'MarketSalesAnalysis.vue'), 'utf8')

  // 新块挂在等级销售分析下方，消费 market_brand_containers。
  assert.match(view, /<MarketSalesAnalysis[\s\S]*?:rows="gradeBreakdown\?\.marketBrandContainers \?\? \[\]"[\s\S]*?:loading="gradeBreakdownLoading"/)
  const breakdownAt = view.indexOf('<SettlementGradeBreakdown')
  const marketAt = view.indexOf('<MarketSalesAnalysis')
  assert.ok(breakdownAt >= 0 && marketAt > breakdownAt, '市场销售分析应在等级销售分析之后')

  // 标题：期间 + 市场/全部市场 + 合计柜数（参考稿口径）。
  assert.match(market, /档口销售柜数统计（合计 \$\{formatNumber\(totalCount\.value\)\} 柜）/)
  assert.match(market, /全部市场销售柜数统计/)
  // 全部市场：同一柱状图按市场分组对比各品牌；单市场：参考稿的饼图+柱图。
  assert.match(market, /isSingleMarket/)
  assert.match(market, /series: markets\.value\.map\(\(market\) => \(/)
  // 市场色必须设在系列级（barGap 之后）：图例与 tooltip marker 只认系列颜色，
  // 挪回数据级 itemStyle 会导致提示圆点与图例回落到 ECharts 默认色板。
  assert.match(market, /barGap: '30%',[\s\S]{0,200}itemStyle: \{ color: marketColor\(market\)/)
  assert.match(market, /return row\?\.containerCount \?\? 0/)
  assert.match(market, /selectedMode: 'single'/)
  // 柱体顶部展示数量与单位，Y 轴标注「柜数」。
  assert.match(market, /position: 'top'[\s\S]*?柜/)
  assert.match(market, /name: '柜数'/)
})

test('卖得怎么样默认展示今年数据，日期筛选提供年度/月度/自定义三种方式', () => {
  const view = fs.readFileSync(path.join(src, 'views', 'OverviewView.vue'), 'utf8')

  // 打开页面默认今年的自然边界（仅卖得怎么样）。
  assert.match(view, /const bounds = yearBounds\(new Date\(\)\.getFullYear\(\)\)/)
  assert.match(view, /filters\.startDate = bounds\.start/)
})

test('卖得怎么样核心指标与等级明细独立结束加载', () => {
  const view = fs.readFileSync(path.join(src, 'views', 'OverviewView.vue'), 'utf8')

  assert.match(view, /const overviewLoading = ref\(true\)/)
  assert.match(view, /const gradeBreakdownLoading = ref\(true\)/)
  assert.match(view, /async function loadOverviewData/)
  assert.match(view, /async function loadGradeBreakdownData/)
  assert.match(view, /<GradeSummary[\s\S]*?:loading="overviewLoading"/)
  assert.match(view, /<SettlementGradeBreakdown[\s\S]*?:loading="gradeBreakdownLoading"/)
  assert.doesNotMatch(view, /const \[nextOverview, nextGradeBreakdown\] = await Promise\.all/)
})
