import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = fs.readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'src',
    'components',
    'DataTable.vue',
  ),
  'utf8',
)

test('通用列表组件暴露列 / 行 / 行键三个必需属性', () => {
  assert.match(source, /columns: DataTableColumn<Row>\[\]/)
  assert.match(source, /rows: Row\[\]/)
  assert.match(source, /rowKey: \(row: Row, index: number\) => string \| number/)
})

test('通用列表组件支持可访问的排序表头', () => {
  assert.match(source, /sortable\?: boolean/)
  assert.match(source, /sortKey\?: string/)
  assert.match(source, /activeSortKey\?: string/)
  assert.match(source, /sortOrder\?: 'asc' \| 'desc'/)
  assert.match(source, /defineEmits<\{ sort: \[key: string\] \}>/)
  assert.match(source, /:aria-sort="ariaSort\(column\)"/)
  assert.match(source, /class="data-table-sort"/)
  assert.match(source, /@click="emit\('sort', column\.sortKey \?\? column\.key\)"/)
})

test('排序请求期间保留表格并阻止重复点击', () => {
  assert.match(source, /sortBusy\?: boolean/)
  assert.match(source, /:aria-busy="props\.sortBusy"/)
  assert.match(source, /:disabled="props\.sortBusy"/)
  assert.match(source, /v-if="props\.sortBusy" class="data-table-busy"/)
  assert.match(source, /正在排序/)
})

test('通用列表组件按列配置决定对齐与取值', () => {
  // 数值列默认右对齐，文本列默认左对齐，列可显式覆盖。
  assert.match(source, /return column\.numeric \? 'right' : 'left'/)
  // 未配置 value 时回退到 row[key]，空值显示占位符。
  assert.match(source, /if \(column\.value\) return column\.value\(row\)/)
  assert.match(source, /\)\[column\.key\] \?\? '—'/)
})

test('单元格自定义走 cell-<key> 插槽', () => {
  assert.match(source, /:name="`cell-\$\{column\.key\}`"/)
})

test('动态列可通过通用 cell 插槽兜底，仍保留默认取值', () => {
  // cell-<key> 优先级最高；没有对应插槽时退回通用 cell，最后才是列取值。
  assert.match(source, /<slot name="cell" :row="row" :column="column" :value="cellValue\(column, row\)">/)
  assert.match(source, /\{\{ cellValue\(column, row\) \}\}<\/slot>\n              <\/slot>/)
})

test('通用列表样式统一：容器描边、表头吸顶、行分隔线与隔行底纹', () => {
  assert.match(source, /\.data-table \{[^}]*border: 2px solid var\(--line-strong\)/)
  assert.match(source, /\.data-table \{[^}]*border-radius: var\(--radius-md\)/)
  assert.match(source, /\.data-table thead th \{[^}]*position: sticky/)
  // 表头用主题浅绿打底，并与数据行之间留一条 2px 分隔线，避免“看不出是表格”。
  assert.match(source, /\.data-table thead th \{[\s\S]*?background: color-mix\(in srgb, var\(--primary-soft\) 55%, var\(--surface\)\)/)
  assert.match(source, /\.data-table thead th \{[\s\S]*?border-bottom: 2px solid var\(--line-strong\)/)
  assert.match(source, /\.data-table th,\n\.data-table td \{[^}]*border-bottom: 1px solid var\(--line\)/)
  assert.match(source, /\.data-table tbody tr:nth-child\(even\) \{ background: color-mix/)
  assert.match(source, /\.data-table tbody tr:last-child td,\n\.data-table tbody tr:last-child th \{ border-bottom: 0; \}/)
  // 非边框模式也保留浅色列分隔线，长表照旧能对齐列。
  assert.match(source, /\.data-table:not\(\.is-bordered\) tbody td \+ td \{ border-left: 1px solid color-mix/)
})

test('通用列表组件提供无数据占位行', () => {
  assert.match(source, /emptyText\?: string/)
  assert.match(source, /emptyText: '暂无数据'/)
  assert.match(source, /<tr v-if="!props\.rows\.length">/)
  assert.match(source, /:colspan="props\.columns\.length"/)
})

test('通用列表组件提供表内底栏插槽，用于内嵌分页 / 合计行', () => {
  // 行标题列渲染 th[scope=row]，用于“等级 / 规格”这类行主键。
  assert.match(source, /rowHeader\?: boolean/)
  assert.match(source, /:is="column\.rowHeader \? 'th' : 'td'"/)
  assert.match(source, /:scope="column\.rowHeader \? 'row' : undefined"/)
  assert.match(source, /<div v-if="\$slots\.footer" class="data-table-foot">/)
  assert.match(source, /<slot name="footer" \/>/)
  // 底栏固定在表格外框内、不参与数据区滚动。
  assert.match(source, /\.data-table \{[\s\S]*?display: grid;\n  grid-template-columns: minmax\(0, 1fr\);\n  grid-template-rows: minmax\(0, 1fr\) auto;/)
  assert.match(source, /\.data-table-foot \{[\s\S]*?border-top: 1px solid var\(--line\)/)
})

test('通用列表组件默认禁止单元格换行，长文本列可显式折行', () => {
  assert.match(source, /wrap\?: boolean/)
  assert.match(source, /'is-wrap': column\.wrap/)
  assert.match(source, /\.data-table th,\n\.data-table td \{ [^}]*white-space: nowrap; \}/)
  assert.match(source, /\.data-table th\.is-wrap,\n\.data-table td\.is-wrap \{ white-space: normal; overflow-wrap: anywhere; \}/)
})

test('通用列表组件支持表尾合计行与卡片化 data-label', () => {
  // 合计行按列声明取值，首列渲染行标题，数字列沿用列对齐。
  assert.match(source, /foot\?: \(\) => unknown/)
  assert.match(source, /footLabel\?: string/)
  assert.match(source, /const hasFoot = computed\(\(\) => Boolean\(props\.footLabel\) \|\| props\.columns\.some\(\(column\) => column\.foot\)\)/)
  assert.match(source, /<tfoot v-if="hasFoot">/)
  assert.match(source, /<slot :name="`foot-\$\{column\.key\}`" :value="footValue\(column, index\)">/)
  // 窄屏卡片化需要的 data-label 由组件统一挂到单元格上。
  assert.match(source, /dataLabels\?: boolean/)
  assert.match(source, /:data-label="props\.dataLabels \|\| props\.cardsOnNarrow \? column\.label : undefined"/)
  assert.match(source, /\.data-table tfoot th,\n\.data-table tfoot td \{ border-top: 2px solid var\(--line-strong\);/)
})
