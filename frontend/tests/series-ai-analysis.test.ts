import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { normalizeSeriesAnalysis } from '../src/api/normalize.ts'
import {
  friendlyErrorMessage,
  highlightNumbers,
  isAdviceHeading,
  parseAnalysisSections,
} from '../src/utils/seriesAnalysis.ts'

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

test('friendlyErrorMessage 把英文报错换成中文提示', () => {
  assert.equal(friendlyErrorMessage('Not Found'), '生成失败，请稍后重试')
  assert.equal(friendlyErrorMessage(''), '生成失败，请稍后重试')
  assert.equal(friendlyErrorMessage('Not Found', '对比数据加载失败，请稍后重试'), '对比数据加载失败，请稍后重试')
  assert.equal(friendlyErrorMessage('大模型服务返回错误（429），请稍后重试'), '大模型服务返回错误（429），请稍后重试')
})

test('highlightNumbers 只高亮指标数字，不动号别里的数字', () => {
  const segments = highlightNumbers('A6 共 913 件、平均每件 514.52 元（42.7%），B6/7 区间')
  const strong = segments.filter((segment) => segment.strong).map((segment) => segment.text)

  assert.deepEqual(strong, ['913', '514.52', '42.7%'])
  const plain = segments.filter((segment) => !segment.strong).map((segment) => segment.text).join('')
  assert.match(plain, /A6 共 /)
  assert.match(plain, /B6\/7 区间/)
})

test('highlightNumbers 遇到没有数字的句子原样返回', () => {
  assert.deepEqual(highlightNumbers('这批货整体偏甜'), [
    { text: '这批货整体偏甜', strong: false },
  ])
})

test('isAdviceHeading 识别「可以留意的地方」这类建议小节', () => {
  assert.equal(isAdviceHeading('可以留意的地方'), true)
  assert.equal(isAdviceHeading('A果'), false)
})

test('AI 分析卡片使用果农能看懂的文案', () => {
  // 通用卡片负责交互文案，各页面封装负责标题与说明。
  const card = fs.readFileSync(path.join(src, 'components', 'AiAnalysisCard.vue'), 'utf8')
  assert.match(card, /生成分析/)
  assert.match(card, /正在生成/)
  assert.match(card, /autoRun\?: boolean/)
  assert.match(card, /generate\(false\)/)
  assert.doesNotMatch(card, /加权均价|贡献度|环比|同比/)

  const series = fs.readFileSync(path.join(src, 'components', 'SeriesAiAnalysis.vue'), 'utf8')
  assert.match(series, /AI 分析结论/)
  assert.match(series, /只作参考/)
  assert.doesNotMatch(series, /加权均价|贡献度|环比|同比/)
})
