import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const component = fs.readFileSync(path.join(src, 'components', 'SeriesGradeTables.vue'), 'utf8')
const mobileBlock = component.match(/@media \(max-width: 560px\)([\s\S]*?)\n\}/)?.[1] ?? ''

test('系列对比移动端表格改为纵向卡片，不再依赖横向滚动', () => {
  assert.match(component, /data-label="件数"/)
  assert.match(component, /data-label="金额占比"/)
  assert.match(component, /spread-table-wrap/)
  assert.match(mobileBlock, /\.grade-table-card \.table-wrap,[\s\S]*?\.spread-table-wrap \{ overflow: visible;\s*\}/)
  assert.match(mobileBlock, /\.grade-table-card table,[\s\S]*?\.spread-table \{[\s\S]*?min-width: 0;[\s\S]*?display: block;\s*\}/)
  assert.match(mobileBlock, /content: attr\(data-label\)/)
})
