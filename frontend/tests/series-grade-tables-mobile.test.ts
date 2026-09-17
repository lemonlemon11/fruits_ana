import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const component = fs.readFileSync(path.join(src, 'components', 'SeriesGradeTables.vue'), 'utf8')
const dataTable = fs.readFileSync(path.join(src, 'components', 'DataTable.vue'), 'utf8')
const mobileBlock = dataTable.match(/@media \(max-width: 560px\) \{([\s\S]*?)\n\}\n<\/style>/)?.[1] ?? ''

test('系列对比等级表改用通用列表组件，并打开窄屏卡片模式', () => {
  assert.match(component, /import DataTable, \{ type DataTableColumn \} from '\.\/DataTable\.vue'/)
  assert.match(component, /<DataTable/)
  assert.match(component, /cards-on-narrow/)
  assert.match(component, /grade-table-card/)
  assert.match(component, /foot-label="合计"/)
})

test('通用列表组件的窄屏卡片模式不再依赖横向滚动', () => {
  assert.match(dataTable, /cardsOnNarrow\?: boolean/)
  assert.match(dataTable, /props\.dataLabels \|\| props\.cardsOnNarrow \? column\.label : undefined/)
  assert.match(mobileBlock, /\.data-table\.cards-on-narrow \.data-table-scroll \{ overflow: visible; \}/)
  assert.match(mobileBlock, /\.data-table\.cards-on-narrow table \{ display: block; min-width: 0 !important; \}/)
  assert.match(mobileBlock, /\.data-table\.cards-on-narrow thead \{ display: none; \}/)
  assert.match(mobileBlock, /content: attr\(data-label\)/)
})
