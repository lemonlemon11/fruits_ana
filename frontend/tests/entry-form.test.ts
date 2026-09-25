import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeEntryDraft, normalizeEntryFieldOptions, normalizeEntryRead } from '../src/api/client.ts'
import {
  FIXED_FEES,
  arrivalPiecesDiff,
  computeEntryTotals,
  createEmptySale,
  money,
} from '../src/utils/entryForm.ts'

test('手工录单固定六项支出与空行默认值保持一致', () => {
  assert.deepEqual([...FIXED_FEES], ['代卖佣金', '运费', '车位费', '入场费', '搬运费', '打冷费'])
  assert.deepEqual(createEmptySale(), {
    saleDate: '',
    variety: '',
    grade: '',
    headCount: '',
    specKg: '',
    salesQuantity: '',
    unitPrice: 0,
    remark: '',
  })
})

test('录单金额按销售数量乘单价自动汇总，售后和费用为减项', () => {
  const totals = computeEntryTotals(
    [
      { saleDate: '2026-09-13', variety: 'A', headCount: '4', specKg: '10', salesQuantity: 20, unitPrice: 2.5, remark: '' },
      { saleDate: '2026-09-13', variety: 'B', headCount: '3/4', specKg: '9/10', salesQuantity: 30, unitPrice: 3, remark: '' },
    ],
    [
      { content: '坏果', summary: '', amount: 10 },
      { content: '补货', summary: '', amount: 20 },
    ],
    [
      { name: '代卖佣金', amount: 5, isCustom: false },
      { name: '临时人工', amount: 10, isCustom: true },
    ],
    20,
  )

  // 总件数按销售数量求和（20 + 30）：客户确认的分析口径。
  assert.equal(totals.totalPieces, 50)
  assert.equal(totals.salesAmount, 140)
  assert.equal(totals.afterAmount, 30)
  assert.equal(totals.goodsAmount, 110)
  assert.equal(totals.feeAmount, 15)
  assert.equal(totals.payable, 95)
  assert.equal(arrivalPiecesDiff(20, totals.totalPieces), -30)
  assert.equal(arrivalPiecesDiff(null, totals.totalPieces), null)
})

test('money 始终展示两位小数并按分四舍五入', () => {
  assert.equal(money(1), '1.00')
  assert.equal(money(1.005), '1.01')
  assert.equal(money(1386), '1386.00')
})

test('normalizeEntryRead 兼容 snake_case 录单响应', () => {
  const entry = normalizeEntryRead({
    merchant_no: '637',
    order_no: '宝贝-001',
    container_no: 'C001',
    vehicle_no: '桂A0001',
    market: '南宁海吉星',
    arrival_date: '2026-09-10',
    arrival_quantity: 20,
    source_type: 'manual',
    sales: [{
      sale_date: '2026-09-13',
      variety: 'A',
      head_count: '3/4',
      spec_kg: '9/10',
      sales_quantity: '20',
      unit_price: '2.50',
      remark: '备注',
    }],
    after_sales: [{ content: '坏果', summary: '', amount: '10.00' }],
    fees: [{ name: '代卖佣金', amount: '5.00', is_custom: false }],
  })

  assert.equal(entry.merchantNo, '637')
  assert.equal(entry.sourceType, 'manual')
  assert.equal(entry.arrivalDate, '2026-09-10')
  assert.equal(entry.arrivalQuantity, 20)
  assert.equal(entry.sales[0].headCount, '3/4')
  assert.equal(entry.sales[0].specKg, '9/10')
  assert.equal(entry.sales[0].salesQuantity, 20)
  assert.equal(entry.afterSales[0].amount, 10)
  assert.equal(entry.fees[0].isCustom, false)
})

test('normalizeEntryFieldOptions 读取 options 包装响应', () => {
  const options = normalizeEntryFieldOptions({
    options: [
      { field: 'market', value: '市场一', sort_order: 1 },
      { field: 'variety', value: 'C', sort_order: 2 },
    ],
  })

  assert.deepEqual(options, [
    { field: 'market', value: '市场一', sortOrder: 1 },
    { field: 'variety', value: 'C', sortOrder: 2 },
  ])
})

test('normalizeEntryDraft 可恢复刷新前的暂存内容', () => {
  const draft = normalizeEntryDraft({
    draft: {
      updated_at: '2026-09-20T09:00:00.000Z',
      editing: false,
      merchant_no: '638',
      order_no: '宝贝-002',
      sales_count: 1,
      payload: {
        merchant_no: '638',
        order_no: '宝贝-002',
        container_no: 'C002',
        vehicle_no: '桂A0002',
        market: '江南市场',
        arrival_date: '',
        arrival_quantity: null,
        sales: [{
          sale_date: '',
          variety: 'A',
          head_count: '',
          spec_kg: '',
          sales_quantity: '0',
          unit_price: '0',
          remark: '还在填',
        }],
        after_sales: [],
        fees: [],
      },
    },
  })

  assert.ok(draft)
  assert.equal(draft.merchantNo, '638')
  assert.equal(draft.orderNo, '宝贝-002')
  assert.equal(draft.salesCount, 1)
  assert.equal(draft.payload.sales[0].remark, '还在填')
})
