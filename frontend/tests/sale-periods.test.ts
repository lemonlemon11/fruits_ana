import assert from 'node:assert/strict'
import test from 'node:test'

import {
  monthBounds,
  periodBoundsForOption,
  recentBounds,
  RECENT_DAY_OPTIONS,
  yearBounds,
} from '../src/utils/salePeriods.ts'

function localDateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

test('近 N 天区间：起点 = 今天 - N 天，止点 = 今天', () => {
  const today = new Date()
  for (const { days } of RECENT_DAY_OPTIONS) {
    const bounds = recentBounds(days)
    assert.notEqual(bounds, null, `recent:${days}`)
    const start = new Date()
    start.setDate(start.getDate() - days)
    assert.equal(bounds!.start, localDateKey(start), `recent:${days} start`)
    assert.equal(bounds!.end, localDateKey(today), `recent:${days} end`)
  }
})

test('快捷区间选项清单含近七天/近十四天/近三十天/近九十天', () => {
  assert.deepEqual(
    RECENT_DAY_OPTIONS.map((option) => option.label),
    ['近七天', '近十四天', '近三十天', '近九十天'],
  )
})

test('periodBoundsForOption 解析 recent/year/month 编码，非法值返回 null', () => {
  assert.deepEqual(periodBoundsForOption('year:2026'), yearBounds(2026))
  assert.deepEqual(periodBoundsForOption('month:2026-09'), monthBounds('2026-09'))
  assert.deepEqual(periodBoundsForOption('recent:30'), recentBounds(30))
  assert.equal(periodBoundsForOption('custom'), null)
  assert.equal(periodBoundsForOption('recent:abc'), null)
  assert.equal(periodBoundsForOption('recent:0'), null)
  assert.equal(periodBoundsForOption('recent:-7'), null)
  assert.equal(periodBoundsForOption('year:abc'), null)
})

test('年/月自然边界口径不变（回归）', () => {
  assert.deepEqual(yearBounds(2026), { start: '2026-01-01', end: '2026-12-31' })
  assert.deepEqual(monthBounds('2026-02'), { start: '2026-02-01', end: '2026-02-28' })
  assert.deepEqual(monthBounds('2026-09'), { start: '2026-09-01', end: '2026-09-30' })
  assert.equal(monthBounds('2026-13'), null)
})
