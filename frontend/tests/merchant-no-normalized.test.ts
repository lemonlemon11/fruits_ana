import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeImportBatch, normalizeSettlementList, normalizeSeriesComparison } from '../src/api/normalize.ts'
import { displayMerchantNo, rawMerchantNo } from '../src/utils/merchantNo.ts'
import { settlementOptionLabel } from '../src/utils/settlementComparison.ts'

test('displayMerchantNo 优先展示适配后商号并保留原始商号', () => {
  const item = { merchantNo: '单637', merchantNoNormalized: '637' }

  assert.equal(displayMerchantNo(item), '637')
  assert.equal(rawMerchantNo(item), '单637')
})

test('displayMerchantNo 在缺少适配后商号时回退原始商号', () => {
  assert.equal(displayMerchantNo({ merchantNo: '640' }), '640')
  assert.equal(displayMerchantNo({}), '')
  assert.equal(rawMerchantNo({}), '')
})

test('下拉标签同时使用适配后商号与适配后单号', () => {
  const item = {
    merchantNo: '单624',
    merchantNoNormalized: '624',
    orderNo: '宝贝01',
    orderNoNormalized: '宝贝-001',
  }

  assert.equal(settlementOptionLabel(item), '商号 624（宝贝-001）')
})

test('归一化函数读取 merchant_no_normalized 字段', () => {
  const list = normalizeSettlementList({
    settlements: [{ merchant_no: '单637', merchant_no_normalized: '637', order_no: '宝贝003' }],
  })
  assert.equal(list.settlements[0].merchantNo, '单637')
  assert.equal(list.settlements[0].merchantNoNormalized, '637')

  const series = normalizeSeriesComparison({
    settlements: [{ merchant_no: '单637', merchant_no_normalized: '637', series: '宝贝' }],
  })
  assert.equal(series.settlements[0].merchantNoNormalized, '637')
})

test('缺失新字段时归一化为空串，展示层回退原始商号', () => {
  const list = normalizeSettlementList({
    settlements: [{ merchant_no: '单637', order_no: '宝贝003' }],
  })

  assert.equal(list.settlements[0].merchantNoNormalized, '')
  assert.equal(displayMerchantNo(list.settlements[0]), '单637')
})

test('导入批次解析适配后商号', () => {
  const batch = normalizeImportBatch({
    id: 1,
    file_name: '637结算单（宝贝003）+清关费.xlsx',
    merchant_no: '单637',
    merchant_no_normalized: '637',
    order_no: '宝贝003',
    order_no_normalized: '宝贝-003',
  })

  assert.equal(batch.merchantNoNormalized, '637')
  assert.equal(batch.orderNoNormalized, '宝贝-003')
})
