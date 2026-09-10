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

test('总览页结算单销售情况跟随商号收窄', () => {
  assert.deepEqual(
    filterSettlementsByMerchant(items, '626').map((item: { merchantNo: string }) => item.merchantNo),
    ['626'],
  )
  assert.deepEqual(filterSettlementsByMerchant(items, ''), items)
  assert.deepEqual(filterSettlementsByMerchant(items, '不存在的商号'), [])
})

test('总览页下拉候选保留全部结算单，避免选中后无法切回', () => {
  const view = fs.readFileSync(path.join(src, 'views', 'OverviewView.vue'), 'utf8')

  assert.match(view, /getSettlementComparison\(\{ \.\.\.query, includeAllSettlements: true \}\)/)
  assert.match(view, /settlementOptions\.value = nextSettlements/)
  assert.match(view, /v-for="item in settlementOptions"/)
  assert.match(view, /filterSettlementsByMerchant\(settlementOptions\.value, filters\.merchantNo\)/)
})
