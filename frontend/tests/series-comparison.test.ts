import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { normalizeSeriesComparison, normalizeSettlementList } from '../src/api/normalize.ts'
import {
  deselectSeries,
  gradeRow,
  groupBySeries,
  selectWholeSeries,
  toggleSelection,
} from '../src/utils/seriesComparison.ts'

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

test('「按等级号别」对比视图已移除，品牌对比只保留按品牌视图', () => {
  const view = fs.readFileSync(path.join(srcRoot, 'views', 'SeriesComparisonView.vue'), 'utf8')
  assert.doesNotMatch(view, /按等级号别|SeriesGradeDetail|GradeDetailAiAnalysis|role="tablist"/)
  // gradeDetails 数据链路（类型/归一化/请求）一并移除。
  const types = fs.readFileSync(path.join(srcRoot, 'api', 'types.ts'), 'utf8')
  assert.doesNotMatch(types, /GradeDetailData|GradeDetailBucket|gradeDetails/)
  const normalize = fs.readFileSync(path.join(srcRoot, 'api', 'normalize.ts'), 'utf8')
  assert.doesNotMatch(normalize, /normalizeGradeDetails/)
  const client = fs.readFileSync(path.join(srcRoot, 'api', 'client.ts'), 'utf8')
  assert.doesNotMatch(client, /grade-detail/)
})

test('总览表单行紧凑居中，等级独立对比不出现卡片内滚动条', () => {
  const overview = fs.readFileSync(path.join(srcRoot, 'components', 'SeriesOverviewTable.vue'), 'utf8')
  // 所有列显式居中；启用紧凑模式并压低整表最小宽，减少触发内部横向滚动。
  assert.match(overview, /align: 'center'/)
  assert.match(overview, /min-width="560px"/)
  assert.match(overview, /\n        compact\n/)
  // 商号+单号、件数+占比条都同行排布，行内不再出现堆叠换行。
  assert.match(overview, /\.merchant-cell \{ display: inline-flex; align-items: baseline/)
  assert.match(overview, /\.grade-cell \{ display: inline-flex; align-items: center/)
  assert.doesNotMatch(overview, /share-line/)

  const gradeTables = fs.readFileSync(path.join(srcRoot, 'components', 'SeriesGradeTables.vue'), 'utf8')
  // 卡片最小轨道钳制在容器内：任何分辨率下每行卡片都装得下整张表，无卡片内滚动条。
  assert.match(gradeTables, /repeat\(auto-fit, minmax\(min\(600px, 100%\), 1fr\)\)/)
  assert.match(gradeTables, /\n          compact\n/)
})

const payload = {
  settlements: [
    {
      merchant_no: '单624',
      order_no: '宝贝01',
      series: '宝贝',
      container_no: 'MWCU1823691',
      vehicle_no: '桂AAB087',
      start_date: '2026-08-27',
      end_date: '2026-08-28',
      total: { sales_quantity: 30, sales_amount: 2000, weighted_avg_price: 66.6667 },
      grades: [
        { grade: 'A', sales_quantity: 10, sales_amount: 1000, weighted_avg_price: 100, quantity_share: 0.3333 },
        { grade: 'B', sales_quantity: 20, sales_amount: 1000, weighted_avg_price: 50, quantity_share: 0.6667 },
        { grade: 'C', sales_quantity: 0, sales_amount: 0, weighted_avg_price: null, quantity_share: 0 },
      ],
      grade_amount_shares: { A: 0.5, B: 0.5, C: null },
    },
  ],
  series: [
    { name: '宝贝', merchant_nos: ['单624'], settlement_count: 1, total: { sales_quantity: 30, sales_amount: 2000 } },
  ],
  total: {
    total: { sales_quantity: 30, sales_amount: 2000, weighted_avg_price: 66.6667 },
    grades: [{ grade: 'A', sales_quantity: 10, sales_amount: 1000 }],
    grade_amount_shares: { A: 0.5 },
  },
}

test('normalizeSeriesComparison 解析结算单、系列与合计三部分', () => {
  const data = normalizeSeriesComparison(payload)

  assert.equal(data.settlements.length, 1)
  assert.equal(data.settlements[0].merchantNo, '单624')
  assert.equal(data.settlements[0].series, '宝贝')
  assert.equal(data.settlements[0].total.salesAmount, 2000)
  assert.equal(data.settlements[0].gradeAmountShares.B, 0.5)
  assert.equal(data.series[0].name, '宝贝')
  assert.deepEqual(data.series[0].merchantNos, ['单624'])
  assert.equal(data.total.gradeAmountShares.A, 0.5)
})

test('normalizeSeriesComparison 缺字段时给出可展示的零值', () => {
  const data = normalizeSeriesComparison({})

  assert.deepEqual(data.settlements, [])
  assert.deepEqual(data.series, [])
  assert.equal(data.total.total.salesQuantity, 0)
  assert.deepEqual(data.total.grades, [])
})

test('normalizeSettlementList 带出系列字段', () => {
  const data = normalizeSettlementList({
    date_range: { start_date: '2026-08-27', end_date: '2026-09-06', is_default: true },
    settlements: [
      { merchant_no: '单624', order_no: '宝贝01', series: '宝贝', total_quantity: 30 },
      { merchant_no: '626', order_no: '626' },
    ],
  })

  assert.equal(data.settlements[0].series, '宝贝')
  assert.equal(data.settlements[1].series, '未识别品牌')
  assert.equal(data.dateRange?.isDefault, true)
})

test('groupBySeries 按品牌分组，品牌内保持原顺序', () => {
  const groups = groupBySeries([
    { series: '宝贝', merchantNo: '单624' },
    { series: '香香', merchantNo: '单637' },
    { series: '宝贝', merchantNo: '626' },
  ])

  assert.deepEqual(groups.map((group) => group.series), ['宝贝', '香香'])
  assert.deepEqual(groups[0].items.map((item) => item.merchantNo), ['单624', '626'])
})

test('toggleSelection 支持勾选与取消，不设张数上限', () => {
  assert.deepEqual(toggleSelection(['单624'], '626'), ['单624', '626'])
  assert.deepEqual(toggleSelection(['单624', '626'], '626'), ['单624'])

  const many = Array.from({ length: 12 }, (_, index) => `商号${index}`)
  assert.deepEqual(toggleSelection(many, '新增'), [...many, '新增'])
})

test('selectWholeSeries 追加去重，不设张数上限', () => {
  assert.deepEqual(selectWholeSeries(['单624'], ['单624', '626']), ['单624', '626'])

  const many = Array.from({ length: 12 }, (_, index) => `商号${index}`)
  assert.deepEqual(selectWholeSeries(many, ['新增']), [...many, '新增'])
})

test('deselectSeries 移除整组选择', () => {
  assert.deepEqual(deselectSeries(['单624', '626', '单637'], ['单624', '626']), ['单637'])
})

test('gradeRow 在缺少等级时返回零值行', () => {
  const row = gradeRow([], 'C')

  assert.deepEqual(row, {
    grade: 'C',
    salesQuantity: 0,
    salesAmount: 0,
    weightedAvgPrice: null,
    quantityShare: null,
  })
})
