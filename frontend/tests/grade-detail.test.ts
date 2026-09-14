import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { normalizeGradeDetails, normalizeSeriesComparison } from '../src/api/normalize.ts'
import { GRADE_DETAIL_HEADINGS, parseAnalysisSections } from '../src/utils/seriesAnalysis.ts'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const read = (relative: string) => fs.readFileSync(path.join(src, relative), 'utf8')

test('normalizeGradeDetails 读取号别阶梯并保留区间标签', () => {
  const data = normalizeGradeDetails({
    buckets: [
      {
        label: 'B6/7',
        grade: 'B',
        fruit_type: '榴莲',
        sales_quantity: 426,
        sales_amount: 186540,
        weighted_avg_price: 437.89,
        quantity_share: 0.1115,
        amount_share: 0.1127,
        record_count: 3,
        quality_marks: ['熟'],
      },
    ],
    unrecognized: { label: '其他', record_count: 0, sales_quantity: 0 },
    total: { sales_quantity: 3821, sales_amount: 1654520, weighted_avg_price: 433.01 },
  })

  assert.equal(data.buckets.length, 1)
  assert.equal(data.buckets[0].label, 'B6/7')
  assert.equal(data.buckets[0].grade, 'B')
  assert.deepEqual(data.buckets[0].qualityMarks, ['熟'])
  assert.equal(data.total.salesQuantity, 3821)
})

test('normalizeGradeDetails 兼容后端未返回该字段', () => {
  const data = normalizeGradeDetails(undefined)
  assert.deepEqual(data.buckets, [])
  assert.equal(data.unrecognized.recordCount, 0)
  assert.equal(data.total.weightedAvgPrice, null)
})

test('normalizeSeriesComparison 带上 gradeDetails', () => {
  const data = normalizeSeriesComparison({ settlements: [], series: [], total: {} })
  assert.deepEqual(data.gradeDetails.buckets, [])
})

test('号别小结按自己的小标题切分，不误用系列小标题', () => {
  const content = [
    '这批货的等级结构',
    '- 共 3 821 件。',
    '哪个号最值钱',
    '- A6 平均每件 530.28 元。',
  ].join('\n')

  assert.deepEqual(
    parseAnalysisSections(content, GRADE_DETAIL_HEADINGS).map((section) => section.title),
    ['这批货的等级结构', '哪个号最值钱'],
  )
  // 用系列小标题解析同一段内容时不应切出标题。
  assert.equal(parseAnalysisSections(content)[0].title, '分析结论')
})

test('等级细分页面使用果农能看懂的文案且不出现专业术语', () => {
  const component = read('components/SeriesGradeDetail.vue')
  assert.match(component, /平均每公斤售价/)
  assert.match(component, /号别/)
  assert.doesNotMatch(component, /加权均价|贡献度|环比|同比/)

  const ai = read('components/GradeDetailAiAnalysis.vue')
  assert.match(ai, /号别小结/)
  assert.doesNotMatch(ai, /加权均价|贡献度|环比|同比/)
})

test('系列对比页提供按系列与按等级号别两个视图', () => {
  const view = read('views/SeriesComparisonView.vue')
  assert.match(view, /按等级号别/)
  assert.match(view, /role="tablist"/)
  assert.match(view, /SeriesGradeDetail/)
  assert.match(view, /GradeDetailAiAnalysis/)
})
