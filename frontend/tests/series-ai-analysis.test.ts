import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { normalizeSeriesAnalysis } from '../src/api/normalize.ts'
import { parseAnalysisSections } from '../src/utils/seriesAnalysis.ts'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

test('normalizeSeriesAnalysis 解析结论、模型与缓存标记', () => {
  const parsed = normalizeSeriesAnalysis({
    content: '整体行情\n- 合计 100 件。',
    model: 'deepseek-v4-flash',
    generated_at: '2026-09-10T08:30:00+00:00',
    cached: true,
  })
  assert.equal(parsed.content, '整体行情\n- 合计 100 件。')
  assert.equal(parsed.model, 'deepseek-v4-flash')
  assert.equal(parsed.generatedAt, '2026-09-10T08:30:00+00:00')
  assert.equal(parsed.cached, true)
})

test('normalizeSeriesAnalysis 缺字段时给出可展示的默认值', () => {
  const parsed = normalizeSeriesAnalysis({})
  assert.equal(parsed.content, '')
  assert.equal(parsed.model, '未知模型')
  assert.equal(parsed.cached, false)
})

test('parseAnalysisSections 按小标题切分并去掉列表符号', () => {
  const sections = parseAnalysisSections(
    [
      '整体行情',
      '- 三张单合计 2 847 件（平均每件 460.00 元）。',
      'A果',
      '- A 果 913 件，平均每件 514.52 元。',
      '- A 果最贵。',
      '可以留意的地方',
      '- C 果件数占比上升。',
    ].join('\n'),
  )
  assert.deepEqual(
    sections.map((section) => section.title),
    ['整体行情', 'A果', '可以留意的地方'],
  )
  assert.deepEqual(sections[1].points, ['A 果 913 件，平均每件 514.52 元。', 'A 果最贵。'])
})

test('parseAnalysisSections 兼容加粗标题、冒号与没有小标题的输出', () => {
  assert.deepEqual(parseAnalysisSections('**A果**：- A 果 913 件。'), [
    { title: 'A果', points: ['A 果 913 件。'] },
  ])
  assert.deepEqual(parseAnalysisSections('先看整体：每件 460 元。'), [
    { title: '分析结论', points: ['先看整体：每件 460 元。'] },
  ])
  assert.deepEqual(parseAnalysisSections(''), [])
})

test('AI 分析卡片使用果农能看懂的文案', () => {
  const component = fs.readFileSync(path.join(src, 'components', 'SeriesAiAnalysis.vue'), 'utf8')
  assert.match(component, /AI 分析结论/)
  assert.match(component, /生成分析/)
  assert.match(component, /正在生成/)
  assert.match(component, /只作参考/)
  assert.doesNotMatch(component, /加权均价|贡献度|环比|同比/)
})
