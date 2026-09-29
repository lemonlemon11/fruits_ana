import assert from 'node:assert/strict'
import test from 'node:test'

import { fitColumnWidths } from '../src/utils/tableColumnFit.ts'

const ENTRIES = [
  { key: 'short', ideal: 80, floor: 64 },
  { key: 'long', ideal: 300, floor: 64 },
  { key: 'mid', ideal: 120, floor: 96 },
]

test('理想总宽不超预算时返回 null，交给 min-width 拉伸铺满', () => {
  assert.equal(fitColumnWidths(600, ENTRIES), null)
})

test('表头下限总和超出预算时返回 null，回退横向滚动', () => {
  // 下限合计 64+64+96=224 > 预算 200，压缩只会截断表头。
  assert.equal(fitColumnWidths(200, ENTRIES), null)
})

test('压缩后各列落在 [下限, 理想] 区间且总和恰好等于预算', () => {
  const widths = fitColumnWidths(400, ENTRIES)
  assert.ok(widths)
  const total = Object.values(widths).reduce((sum, width) => sum + width, 0)
  assert.equal(total, 400)
  for (const entry of ENTRIES) {
    assert.ok(widths[entry.key] >= entry.floor, `${entry.key} 不低于表头下限`)
    assert.ok(widths[entry.key] <= entry.ideal, `${entry.key} 不超过理想宽`)
  }
})

test('赤字主要由富余最大的长文本列承担，短数值列尽量保住完整内容', () => {
  // 理想合计 500、预算 400 → 赤字 100；long 的富余 (300-64) 远大于其他列。
  const widths = fitColumnWidths(400, ENTRIES)
  assert.ok(widths)
  const cut = (key: string) => ENTRIES.find((e) => e.key === key)!.ideal - widths[key]
  assert.ok(cut('long') > cut('short'), '长列承担更多压缩')
  assert.ok(cut('long') > cut('mid'), '长列承担更多压缩（对比中列）')
})

test('预算逼近下限总和时仍恰好铺满且不破表头下限', () => {
  // 预算 240：下限合计 224，只比下限多 16px。
  const widths = fitColumnWidths(240, ENTRIES)
  assert.ok(widths)
  const total = Object.values(widths).reduce((sum, width) => sum + width, 0)
  assert.equal(total, 240)
  assert.ok(widths.short >= 64 && widths.mid >= 96 && widths.long >= 64)
})

test('floor 高于 ideal 的列钳回 ideal，不产生负宽度', () => {
  // a 的下限 100 被理想宽 60 钳回；理想合计 150 > 预算 130 → 赤字全部由富余的 b 承担。
  const widths = fitColumnWidths(130, [
    { key: 'a', ideal: 60, floor: 100 },
    { key: 'b', ideal: 90, floor: 40 },
  ])
  assert.ok(widths)
  assert.equal(widths.a, 60)
  assert.equal(widths.b, 70)
})

test('空列集或非正预算返回 null', () => {
  assert.equal(fitColumnWidths(500, []), null)
  assert.equal(fitColumnWidths(0, ENTRIES), null)
})

test('多轮分摊不压破下限：已承担的压缩量在后续轮次累计封顶（回归）', () => {
  // 结算单列表 1366 屏的真实输入（浏览器实测导出）：多数列第一轮分摊后未到下限、
  // 继续参与第二轮，旧实现每轮都按完整 slack 封顶，累计把表头最宽的列压破下限
  // （到达市场日期 109 < 128，表头出现省略号）。
  const entries = [
    { key: 'merchantNo', ideal: 104, floor: 56 },
    { key: 'brand', ideal: 104, floor: 56 },
    { key: 'orderNo', ideal: 179, floor: 56 },
    { key: 'arrivalDate', ideal: 163, floor: 128 },
    { key: 'totalQuantity', ideal: 120, floor: 86 },
    { key: 'grade-A', ideal: 130, floor: 95 },
    { key: 'grade-B', ideal: 129, floor: 96 },
    { key: 'grade-OTHER', ideal: 118, floor: 84 },
    { key: 'salesAmount', ideal: 134, floor: 100 },
    { key: 'averagePrice', ideal: 134, floor: 100 },
    { key: 'confirmedAt', ideal: 140, floor: 100 },
  ]
  const widths = fitColumnWidths(963, entries)
  assert.ok(widths)
  for (const entry of entries) {
    assert.ok(
      widths[entry.key] >= entry.floor,
      `${entry.key}=${widths[entry.key]} 低于下限 ${entry.floor}`,
    )
  }
  const total = Object.values(widths).reduce((sum, width) => sum + width, 0)
  assert.equal(total, 963)
})

test('floor=ideal 的列（noShrink，如单号）不参与压缩，赤字由其余列承担', () => {
  // 结算单列表单号列经 DataTable 的 noShrink 标记传入 floor=ideal：
  // 截断后无法辨认的关键列保持完整内容宽，压缩只落在时间 / 商号等列上。
  const widths = fitColumnWidths(400, [
    { key: 'orderNo', ideal: 179, floor: 179 },
    { key: 'confirmedAt', ideal: 140, floor: 100 },
    { key: 'merchantNo', ideal: 104, floor: 56 },
  ])
  assert.ok(widths)
  assert.equal(widths.orderNo, 179, 'noShrink 列保持理想宽')
  assert.ok(widths.confirmedAt < 140, '赤字由可压缩列承担')
  const total = Object.values(widths).reduce((sum, width) => sum + width, 0)
  assert.equal(total, 400)
})

test('noShrink 列撑爆预算时整体回退滚动，而不是截断关键列', () => {
  // 下限合计 179+100=279 > 预算 250：保持单号完整意味着放不下，
  // 返回 null 由调用方回退 min-width 横向滚动。
  assert.equal(fitColumnWidths(250, [
    { key: 'orderNo', ideal: 179, floor: 179 },
    { key: 'confirmedAt', ideal: 140, floor: 100 },
  ]), null)
})
