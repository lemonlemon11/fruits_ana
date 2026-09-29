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

test('销售情况总柜数改为结算单数口径（container_count），不再显示件数合计', () => {
  const summary = fs.readFileSync(path.join(src, 'components', 'GradeSummary.vue'), 'utf8')
  const normalizeSrc = fs.readFileSync(path.join(src, 'api', 'normalize.ts'), 'utf8')

  // 汇总条总柜数取 total.containerCount（结算单数），兜底 0。
  assert.match(summary, /总柜数<\/span>\s*\n\s*<strong>\{\{ formatNumber\(total\.containerCount \?\? 0\) \}\}<\/strong>/)
  assert.doesNotMatch(summary, /formatNumber\(total\.salesQuantity\)\}\}<\/strong>\s*\n\s*<\/div>\s*\n\s*<div>\s*\n\s*<span>销售金额/)
  // 归一化映射 container_count -> containerCount。
  assert.match(normalizeSrc, /containerCount: numberOr\(pick\(explicitTotal, 'container_count', 'containerCount'\), 0\)/)
})

test('卖得怎么样区块改名并启用 overview 版式等级图表', () => {
  const view = fs.readFileSync(path.join(src, 'views', 'OverviewView.vue'), 'utf8')
  const breakdown = fs.readFileSync(path.join(src, 'components', 'SettlementGradeBreakdown.vue'), 'utf8')

  assert.match(view, /title="销售情况"/)
  assert.match(view, /title="销售分析"/)
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

test('卖得怎么样规格表支持品牌与等级筛选，仅 overview 版式', () => {
  const breakdown = fs.readFileSync(path.join(src, 'components', 'SettlementGradeBreakdown.vue'), 'utf8')

  // 筛选行仅 overview 渲染；品牌口径与分组一致（详情页整单品牌优先）。
  assert.match(breakdown, /<div v-if="isOverview" class="spec-filter-row">/)
  assert.match(breakdown, /const specBrandFilter = ref\(''\)/)
  assert.match(breakdown, /const specGradeFilter = ref<Grade \| ''>\(''\)/)
  assert.match(breakdown, /function recordBrandLabel\(record: SettlementRecord\): string/)
  // 过滤发生在聚合之前，合计/占比随筛选重算；详情版式不参与过滤。
  assert.match(breakdown, /filteredSpecRecords\.value\.forEach\(\(record\) => \{/)
  assert.match(breakdown, /if \(!isOverview\.value\) return props\.records/)
  assert.match(breakdown, /recordBrandLabel\(record\) !== specBrandFilter\.value/)
  assert.match(breakdown, /record\.grade !== specGradeFilter\.value/)
  assert.match(breakdown, /filteredSpecRecords\.value\.reduce\(\(total, record\) => total \+ record\.quantity, 0\)/)
})

test('卖得怎么样等级销售分析与每日销售折线图同行，支持金额/件数切换', () => {
  const view = fs.readFileSync(path.join(src, 'views', 'OverviewView.vue'), 'utf8')
  const breakdown = fs.readFileSync(path.join(src, 'components', 'SettlementGradeBreakdown.vue'), 'utf8')
  const chart = fs.readFileSync(path.join(src, 'components', 'DailySalesTrendChart.vue'), 'utf8')

  // 折线图经 overview-aside 插槽与饼图同行；数据走 trend 接口、独立 loading / error。
  assert.match(view, /import DailySalesTrendChart from '\.\.\/components\/DailySalesTrendChart\.vue'/)
  assert.match(view, /getTrend/)
  assert.match(view, /<template #overview-aside>/)
  assert.match(view, /:points="dailyTrend"/)
  assert.match(view, /requestErrors\.dailyTrend && `每日销售金额：\$\{requestErrors\.dailyTrend\}`/)
  assert.match(breakdown, /<slot name="overview-aside" \/>/)
  assert.match(breakdown, /\.breakdown-grid--overview \.overview-aside-block \{ grid-row: 1; grid-column: 2; \}/)
  // 参考稿样式：灰调平滑折线 + 面积渐变 + 末点空心圆；Y 轴显示浅色刻度（万级缩写），悬停按日看数值。
  assert.match(chart, /const metricLabel = computed\(\(\) => \(isAmount\.value \? '销售金额' : '销售件数'\)\)/)
  // 标题带稳定 id 且容器 aria-labelledby 接线（与 settlement-grade-breakdown-title 同款约定）。
  assert.match(chart, /aria-labelledby="daily-sales-trend-title"/)
  assert.match(chart, /<h3 id="daily-sales-trend-title">/)
  assert.match(chart, /yAxis: \{\s+type: 'value',\s+axisLine: \{ show: false \},\s+axisTick: \{ show: false \},\s+splitLine: \{ lineStyle: \{ color: echartTheme\.line \} \},\s+axisLabel: \{ color: echartTheme\.muted, fontSize: 10, formatter: formatAxisValue \},\s+\}/)
  assert.match(chart, /function formatAxisValue\(value: number\): string \{\s+if \(value >= 10000\) return `\$\{\(value \/ 10000\)\.toFixed\(1\)\}万`/)
  assert.match(chart, /type: 'line'[\s\S]*?smooth: true/)
  assert.match(chart, /areaStyle/)
  assert.match(chart, /type: 'scatter'[\s\S]*?borderColor: LINE_COLOR/)
  // 右上角「金额 / 件数」分段切换（参考稿）：默认金额，切换后画 salesQuantity。
  assert.match(chart, /<h3 id="daily-sales-trend-title">每日\{\{ metricLabel \}\}<\/h3>/)
  assert.match(chart, /\{ value: 'amount', label: '金额' \},\s*\n\s*\{ value: 'quantity', label: '件数' \},/)
  assert.match(chart, /:aria-pressed="mode === option\.value"/)
  assert.match(chart, /isAmount\.value \? point\.salesAmount : point\.salesQuantity/)
  assert.match(chart, /isAmount\.value \? formatCurrency\(value\) : `\$\{formatNumber\(value\)\} 件`/)
})

test('市场销售分析块跟随市场筛选，全部市场同图分组、单市场按档口展示', () => {
  const view = fs.readFileSync(path.join(src, 'views', 'OverviewView.vue'), 'utf8')
  const market = fs.readFileSync(path.join(src, 'components', 'MarketSalesAnalysis.vue'), 'utf8')

  // 市场销售分析块挂在等级销售分析上方（用户要求调序），消费 market_brand_containers。
  assert.match(view, /<MarketSalesAnalysis[\s\S]*?:rows="gradeBreakdown\?\.marketBrandContainers \?\? \[\]"[\s\S]*?:loading="gradeBreakdownLoading"/)
  const breakdownAt = view.indexOf('<SettlementGradeBreakdown')
  const marketAt = view.indexOf('<MarketSalesAnalysis')
  assert.ok(breakdownAt >= 0 && marketAt >= 0 && marketAt < breakdownAt, '市场销售分析应在等级销售分析之前')

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
