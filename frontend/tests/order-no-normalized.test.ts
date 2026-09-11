import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeImportBatch, normalizeSettlementList, normalizeSeriesComparison } from '../src/api/normalize.ts'
import { displayOrderNo, rawOrderNo } from '../src/utils/orderNo.ts'
import { settlementOptionLabel } from '../src/utils/settlementComparison.ts'
import { shortLabel } from '../src/utils/seriesComparison.ts'
import { filterSettlementOptions } from '../src/utils/settlementPicker.ts'

test('displayOrderNo 优先展示适配后单号并保留原始单号', () => {
  const item = { orderNo: '宝贝01', orderNoNormalized: '宝贝-001' }

  assert.equal(displayOrderNo(item), '宝贝-001')
  assert.equal(rawOrderNo(item), '宝贝01')
})

test('displayOrderNo 在缺少适配后单号时回退原始单号', () => {
  assert.equal(displayOrderNo({ orderNo: '宝贝01' }), '宝贝01')
  assert.equal(displayOrderNo({}), '')
  assert.equal(rawOrderNo({}), '')
})

test('下拉标签与图表短标签统一使用适配后单号', () => {
  const item = { merchantNo: '单624', orderNo: '宝贝01', orderNoNormalized: '宝贝-001' }

  assert.equal(settlementOptionLabel(item), '商号 单624（宝贝-001）')
  assert.equal(shortLabel(item), '宝贝-001')
})

test('归一化函数读取 order_no_normalized 字段', () => {
  const list = normalizeSettlementList({
    date_range: { start_date: '2026-08-01', end_date: '2026-09-01' },
    settlements: [{ merchant_no: '单624', order_no: '宝贝01', order_no_normalized: '宝贝-001' }],
  })
  assert.equal(list.settlements[0].orderNo, '宝贝01')
  assert.equal(list.settlements[0].orderNoNormalized, '宝贝-001')

  const series = normalizeSeriesComparison({
    settlements: [{ merchant_no: '单624', order_no: '宝贝01', order_no_normalized: '宝贝-001', series: '宝贝' }],
  })
  assert.equal(series.settlements[0].orderNoNormalized, '宝贝-001')
})

test('缺失新字段时归一化结果为空串，不影响旧响应渲染', () => {
  const list = normalizeSettlementList({
    settlements: [{ merchant_no: '单624', order_no: '宝贝01' }],
  })

  assert.equal(list.settlements[0].orderNoNormalized, '')
  assert.equal(displayOrderNo(list.settlements[0]), '宝贝01')
})

test('导入批次解析适配后单号并回退原始文件名', () => {
  const batch = normalizeImportBatch({
    id: 1,
    file_name: '637结算单（宝贝003）+清关费.xlsx',
    merchant_no: '单637',
    order_no: '宝贝003',
    order_no_normalized: '宝贝-003',
  })

  assert.equal(batch.orderNoNormalized, '宝贝-003')
  assert.equal(batch.fileName, '637结算单（宝贝003）+清关费.xlsx')
  assert.equal(batch.merchantNo, '单637')
})

test('选择器可以按适配后单号搜索', () => {
  const items = [
    { merchantNo: '单624', orderNo: '宝贝01', orderNoNormalized: '宝贝-001', series: '宝贝', containerNo: '' },
    { merchantNo: '单637', orderNo: '宝贝003', orderNoNormalized: '宝贝-003', series: '宝贝', containerNo: '' },
  ] as never[]

  assert.deepEqual(
    filterSettlementOptions(items, '宝贝-003').map((item: { merchantNo: string }) => item.merchantNo),
    ['单637'],
  )
  assert.deepEqual(
    filterSettlementOptions(items, '宝贝01').map((item: { merchantNo: string }) => item.merchantNo),
    ['单624'],
  )
})
