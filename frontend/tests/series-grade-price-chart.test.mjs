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

test('等级均价对比为纯折线单轴：每等级一条折线挂均价轴（不从 0 开始），无柱状系列', () => {
  const source = read('components/SeriesGradePriceChart.vue')

  assert.doesNotMatch(source, /type: 'bar',/, '不应再有件数柱系列')
  assert.match(source, /series: gradeOrder\.value\.map\(\(grade\) => \(/, '每个等级一个系列')
  assert.match(source, /type: 'line',/, '应为折线系列')
  assert.doesNotMatch(source, /yAxisIndex/, '单轴无需再指定 yAxisIndex')
  assert.doesNotMatch(source, /name: '件',/, '件数轴已随柱状一起移除')
  assert.match(source, /const priceAxisBounds = computed/, '缺少均价轴范围计算')
  assert.match(source, /\(max - min\) \* 0\.15/, '均价轴应按数据跨度 15% 放宽')
  assert.match(source, /min: priceAxisBounds\.value\.min/, '均价轴 min 应接入计算结果')
})

test('每条均价折线用等级色区分，并在每个点旁标注均价数字', () => {
  const source = read('components/SeriesGradePriceChart.vue')
  const lineSeries = source.match(/series: gradeOrder\.value\.map\(\(grade\) => \(\{[\s\S]*?\}\)\),/)?.[0] ?? ''

  assert.ok(lineSeries, '应能找到折线系列构建')
  assert.match(lineSeries, /color: gradeColors\[grade\]/, '折线应使用等级色')
  assert.match(lineSeries, /itemStyle: \{ color: gradeColors\[grade\] \}/, '折线圆点应使用等级色')
  assert.doesNotMatch(lineSeries, /echartTheme\.ink/, '折线不应统一用黑色')
  // 点旁数字：label 常显 + formatPrice，空值不标；多线近点防叠压。
  assert.match(lineSeries, /label: \{\s*\n\s*show: true,/, '每个点应显示均价数字')
  assert.match(lineSeries, /formatPrice\(value\)/, '均价数字用 formatPrice 格式化')
  assert.match(lineSeries, /labelLayout: \{ hideOverlap: true \}/, '数字标签应防叠压')
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
