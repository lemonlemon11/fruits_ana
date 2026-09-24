import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { filterSettlementsByMerchant } from '../src/utils/settlementComparison.ts'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

const items = [
  { merchantNo: '单624', orderNo: '宝贝01' },
  { merchantNo: '626', orderNo: '宝贝02' },
] as never[]

test('总览页销量与均价跟随商号收窄', () => {
  assert.deepEqual(
    filterSettlementsByMerchant(items, '626').map((item: { merchantNo: string }) => item.merchantNo),
    ['626'],
  )
  assert.deepEqual(filterSettlementsByMerchant(items, ''), items)
  assert.deepEqual(filterSettlementsByMerchant(items, '不存在的商号'), [])
})

test('总览页下拉候选保留全部结算单，避免选中后无法切回', () => {
  const view = fs.readFileSync(path.join(src, 'views', 'OverviewView.vue'), 'utf8')

  assert.match(view, /getSettlementComparison\(\{ \.\.\.query, includeAllSettlements: true \}(?:, \{ signal: controller\.signal \})?\)/)
  assert.match(view, /settlementOptions\.value = nextSettlements/)
  assert.match(view, /:options="merchantSelectOptions"/)
  assert.match(view, /const query: AnalyticsFilters = \{ \.\.\.filters \}/)
})

test('总览核心指标、等级图表与商号候选独立结束加载', () => {
  const view = fs.readFileSync(path.join(src, 'views', 'OverviewView.vue'), 'utf8')

  assert.match(view, /const overviewLoading = ref\(true\)/)
  assert.match(view, /const gradeBreakdownLoading = ref\(true\)/)
  assert.match(view, /const settlementOptionsLoading = ref\(true\)/)
  assert.match(view, /async function loadOverviewData/)
  assert.match(view, /async function loadGradeBreakdownData/)
  assert.match(view, /async function loadSettlementOptions/)
  assert.match(view, /<GradeSummary[\s\S]*?:loading="overviewLoading"/)
  assert.match(view, /<SettlementGradeBreakdown[\s\S]*?:loading="gradeBreakdownLoading"/)
  assert.match(view, /<SearchableSelect[\s\S]*?:loading="settlementOptionsLoading"/)
  assert.doesNotMatch(view, /const \[nextOverview, nextSettlements, nextGradeBreakdown\] = await Promise\.all/)
})
