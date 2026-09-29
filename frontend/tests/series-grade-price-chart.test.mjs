import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const read = (file) => fs.readFileSync(path.join(src, file), 'utf8')

test('等级均价对比图不展示「其他」兜底等级', () => {
  const source = read('components/SeriesGradePriceChart.vue')

  assert.match(
    source,
    /activeGrades\(props\.items\.flatMap\(\(item\) => item\.grades\)\)\.filter\(\(grade\) => grade !== 'OTHER'\)/,
    'gradeOrder 应过滤掉 OTHER',
  )
})

test('等级均价对比为柱线双轴组合：柱=件数（左轴从 0），黑色折线=均价（右轴不从 0）', () => {
  const source = read('components/SeriesGradePriceChart.vue')

  assert.match(source, /type: 'bar',/, '应有件数柱系列')
  assert.match(source, /type: 'line',\s*\n\s*yAxisIndex: 1,/, '均价折线应挂右轴')
  assert.match(source, /name: '件',\s*\n\s*min: 0,/, '件数轴（左）应从 0 开始')
  assert.match(source, /const priceAxisBounds = computed/, '缺少均价轴范围计算')
  assert.match(source, /\(max - min\) \* 0\.15/, '均价轴应按数据跨度 15% 放宽')
  assert.match(source, /min: priceAxisBounds\.value\.min/, '均价轴 min 应接入计算结果')
})

test('均价折线统一用黑色（echartTheme.ink），等级色只上柱', () => {
  const source = read('components/SeriesGradePriceChart.vue')
  const lineSeries = source.match(/name: `\$\{gradeLabel\(grade\)\}·均价`,[\s\S]*?emphasis: \{ focus: 'series' \},/)?.[0] ?? ''

  assert.ok(lineSeries, '应能找到均价折线系列')
  assert.match(lineSeries, /color: echartTheme\.ink/, '折线应为黑色')
  assert.match(lineSeries, /itemStyle: \{ color: echartTheme\.ink \}/, '折线圆点应为黑色')
  assert.doesNotMatch(lineSeries, /gradeColors\[grade\]/, '折线不应使用等级色')
  assert.match(source, /itemStyle: \{ color: gradeColors\[grade\]/, '柱应使用等级色')
})

test('等级均价对比横轴标签完整显示，不截断成省略号', () => {
  const source = read('components/SeriesGradePriceChart.vue')

  assert.doesNotMatch(source, /overflow: 'truncate'/, '横轴标签不应截断')
  assert.match(source, /overflow: 'break', width: labelWidth/, '横轴标签应按列宽换行显示')
  assert.match(source, /const labelWidth = 150/, '标签列宽 150：放不下换行仍完整显示')
})

test('总览表仍保留「其他」等级列', () => {
  const source = read('components/SeriesOverviewTable.vue')

  assert.match(
    source,
    /const gradeOrder = computed\(\(\) => activeGrades\(props\.items\.flatMap\(\(item\) => item\.grades\)\)\)/,
    '总览表 gradeOrder 不应过滤等级',
  )
})
