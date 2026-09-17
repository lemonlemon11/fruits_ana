import assert from 'node:assert/strict'
import test from 'node:test'

import { parseSpecRange, splitSpecCell } from '../src/utils/specRange.ts'

test('parseSpecRange 归一区间写法：升序、去单位、连接符统一', () => {
  assert.deepEqual(parseSpecRange('3/4'), { canonical: '3/4', minimum: 3, maximum: 4, representative: 4 })
  assert.deepEqual(parseSpecRange('7/5'), { canonical: '5/7', minimum: 5, maximum: 7, representative: 7 })
  assert.deepEqual(parseSpecRange('5/7/8'), { canonical: '5/7/8', minimum: 5, maximum: 8, representative: 8 })
  assert.deepEqual(parseSpecRange('B3/B4'), { canonical: '3/4', minimum: 3, maximum: 4, representative: 4 })
  assert.deepEqual(parseSpecRange('9-10KG'), { canonical: '9/10', minimum: 9, maximum: 10, representative: 10 })
  assert.deepEqual(parseSpecRange('１０／９'), { canonical: '9/10', minimum: 9, maximum: 10, representative: 10 })
  assert.deepEqual(parseSpecRange('10'), { canonical: '10', minimum: 10, maximum: 10, representative: 10 })
})

test('parseSpecRange 解析不出来时返回 null，交给人工补全', () => {
  for (const raw of ['', '   ', '—', '无', '硬包', '10+11', '0']) {
    assert.equal(parseSpecRange(raw), null)
  }
})

test('splitSpecCell 按 A1~A11 拆分等级 / 头数 / KG / 后缀', () => {
  assert.deepEqual(splitSpecCell('C6/C8(17KG)'), {
    raw: 'C6/C8(17KG)', gradeRaw: 'C', headCount: parseSpecRange('6/8'),
    specKg: parseSpecRange('17'), suffix: '', isSalesRow: true,
  })
  // A8：括号里不是数字 → 整段当后缀
  assert.equal(splitSpecCell('B7/5(大裂）')?.suffix, '大裂')
  assert.equal(splitSpecCell('B7/5(大裂）')?.headCount?.canonical, '5/7')
  assert.equal(splitSpecCell('A5/6（熟）')?.specKg, null)
  // A7：括号未闭合容错
  assert.equal(splitSpecCell('A5（19.5KG')?.specKg?.canonical, '19.5')
  // A11：整行没有 KG 时留空
  assert.equal(splitSpecCell('B6/7熟')?.specKg, null)
  // A9：后缀整段进备注
  assert.equal(splitSpecCell('B3/4(9KG)尾/微裂')?.suffix, '尾/微裂')
})

test('splitSpecCell 识别非销售行（损/霉、验果抽检、硬包）', () => {
  for (const raw of ['损/少果', '验果抽检', '补果', '硬包/白肉']) {
    const cell = splitSpecCell(raw)
    assert.equal(cell?.isSalesRow, false)
    assert.equal(cell?.headCount, null)
    assert.equal(cell?.specKg, null)
    assert.equal(cell?.suffix, raw)
  }
})
