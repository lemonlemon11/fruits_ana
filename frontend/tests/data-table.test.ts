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
  // ElTable 排序表头：sortable=custom 交给父页面，排序变化统一换 sortKey 广播。
  assert.match(source, /:sortable="column\.sortable \? 'custom' : false"/)
  assert.match(source, /@sort-change="onSortChange"/)
  // 外部受控排序态：按 activeSortKey 给排序表头加类，caret 颜色由样式接管。
  assert.match(source, /function headerCellClass\(/)
  assert.match(source, /th\.is-sorted-asc \.sort-caret\.ascending/)
})

test('排序请求期间保留表格并阻止重复点击', () => {
  assert.match(source, /sortBusy\?: boolean/)
  assert.match(source, /:aria-busy="props\.sortBusy"/)
  assert.match(source, /v-if="props\.sortBusy" class="data-table-busy"/)
  assert.match(source, /正在排序/)
})

test('通用列表组件按列配置决定对齐与取值', () => {
  // 数值列默认右对齐，文本列默认左对齐，列可显式覆盖。
  assert.match(source, /column\.align \?\? \(column\.numeric \? 'right' : 'left'\)/)
  // 未配置 value 时回退到 row[key]，空值显示占位符。
  assert.match(source, /if \(column\.value\) return column\.value\(row\)/)
  assert.match(source, /\)\[column\.key\] \?\? '—'/)
})

test('用 Element Plus 表格渲染', () => {
  // ElTable 承载行态、空表占位与服务端排序表头；bordered 映射 border。
  assert.match(source, /import \{ ElTable, ElTableColumn \} from 'element-plus'/)
  assert.match(source, /<ElTable[\s\S]*?:data="props\.rows"/)
  assert.match(source, /:border="props\.bordered"/)
  assert.match(source, /:row-class-name="rowClassName"/)
  assert.match(source, /:empty-text="props\.emptyText"/)
})

test('ElTable 列宽按内容测量、单元格默认不换行（对齐 admin 端列表观感）', () => {
  // ElTable 默认等分列宽会导致窄内容列留白、长内容列换行；先按表头+行值估算，再自主分配。
  assert.match(source, /function textWidth\(value: unknown\): number/)
  assert.match(source, /const measuredMinWidths = computed<Record<string, number>>/)
  // 单元格默认 nowrap（原 DataTable 语义），仅 wrap 列折行。
  assert.match(source, /\.data-table-el :deep\(\.el-table__cell \.cell\) \{ white-space: nowrap; \}/)
  assert.match(source, /\.data-table-el :deep\(\.el-table__cell\.is-wrap \.cell\) \{ white-space: normal/)
  // 列宽按真实渲染结果二次校准（首帧后读单元格 scrollWidth），杜绝省略号截断。
  assert.match(source, /function refitColumns\(\)/)
  assert.match(source, /cell\.scrollWidth/)
  // EP 弹性分配在挂载瞬间可能量到布局未稳的容器宽且不自愈，测宽后强制 doLayout 重排。
  assert.match(source, /function relayoutTable\(\)/)
  assert.match(source, /tableRef\.value\?\.doLayout\(\)/)
  assert.match(source, /function columnMinWidth\(key: string\): number/)
  assert.match(source, /fittedMinWidths\.value\[key\] \?\? measuredMinWidths\.value\[key\]/)
  assert.match(source, /new ResizeObserver/)
})

test('fillHeight 让表格撑满父容器且横向滚动条常驻可拖', () => {
  assert.match(source, /fillHeight\?: boolean/)
  assert.match(source, /:height="props\.fillHeight \? '100%' : undefined"/)
  assert.match(source, /\.data-table-el\.is-fill-height \{ height: 100%; \}/)
  // EP 滚动条默认 hover 才出现；常驻显示否则用户不知道右侧还有列。
  assert.match(source, /\.data-table-el :deep\(\.el-scrollbar__bar\.is-horizontal\) \{/)
  assert.match(source, /opacity: 1;/)
})

test('fitWidth 列宽自适应：超宽按表头下限压缩铺满容器，放不下回退滚动', () => {
  // 分配算法在 utils/tableColumnFit（平方加权：长文本列多担、数值列保完整）。
  assert.match(source, /import \{ fitColumnWidths, type WidthFitEntry \} from '\.\.\/utils\/tableColumnFit'/)
  assert.match(source, /fitWidth\?: boolean/)
  assert.match(source, /fitWidth: false,/)
  // 固定宽列不参与压缩；弹性列下限＝表头实测自然宽（克隆量宽）+ 压缩内边距。
  assert.match(source, /function computeFittedWidths\(/)
  assert.match(source, /const FIT_CELL_PAD = 26/)
  assert.match(source, /function measureHeaderWidths\(el: HTMLElement\)/)
  assert.match(source, /computeFittedWidths\(next, el\.clientWidth, measureHeaderWidths\(el\)\)/)
  assert.match(source, /const budget = available - fixedTotal/)
  assert.match(source, /const granted = fitColumnWidths\(budget, entries\)/)
  // 放得下也输出确定性列宽（按理想宽比例摊余量铺满）：弹窗场景 EP 弹性分配
  // 挂载瞬间把容器量得偏大且不自愈，不能把「放得下」交回 EP 弹性。
  assert.match(source, /放得下也要输出确定性列宽/)
  assert.match(source, /stretched\[widestKey\] \+= budget - used/)
  // 分配结果与内容宽同快照比较：容器或内容任一变化都重建表格。
  assert.match(source, /fittedWidths\.value = granted/)
  // 有分配结果时列用确定 width（EP 不再弹性分配），否则沿用 min-width。
  assert.match(source, /:width="column\.width \?\? \(fittedWidths \? fittedWidths\[column\.key\] : undefined\)"/)
  assert.match(source, /:min-width="column\.width \|\| fittedWidths \? undefined : columnMinWidth\(column\.key\)"/)
  // 被压缩单元格省略号 + 悬浮提示看全值；压缩模式收紧内边距腾列宽。
  assert.match(source, /:show-overflow-tooltip="props\.fitWidth && !column\.wrap && !column\.width"/)
  assert.match(source, /'is-width-fitted': fittedWidths !== null/)
  assert.match(source, /\.data-table-el\.is-width-fitted :deep\(\.el-table__cell\) \{ padding: \.3rem \.5rem; \}/)
  assert.match(source, /\.data-table-el\.is-width-fitted :deep\(\.el-table__cell \.cell\) \{ padding: 0 4px; \}/)
  // noShrink 列（单号）不参与压缩：下限＝理想宽，保证关键列内容完整可读。
  assert.match(source, /noShrink\?: boolean/)
  assert.match(source, /floor: column\.noShrink \? ideal : Math\.min\(ideal, headerNeed\)/)
})

test('单元格自定义走 cell-<key> 插槽', () => {
  assert.match(source, /:name="`cell-\$\{column\.key\}`"/)
})

test('列支持居中对齐，紧凑模式缩小内边距与列宽下限', () => {
  // 居中列供销售对比总览等场景使用。
  assert.match(source, /align\?: 'left' \| 'center' \| 'right'/)
  // 紧凑模式：内边距补偿与列宽下限同步缩小。
  assert.match(source, /compact\?: boolean/)
  assert.match(source, /compact: false,/)
  assert.match(source, /const cellPadAllowance = computed\(\(\) => \(props\.compact \? 16 : 28\)\)/)
  assert.match(source, /'is-compact': props\.compact/)
  assert.match(source, /\.data-table\.is-compact :deep\(\.el-table__cell\) \{ padding: \.28rem \.5rem; \}/)
})

test('动态列可通过通用 cell 插槽兜底，仍保留默认取值', () => {
  // cell-<key> 优先级最高；没有对应插槽时退回通用 cell，最后才是列取值。
  assert.match(source, /<slot name="cell" :row="row" :column="column" :value="cellValue\(column, row\)">/)
  assert.match(source, /\{\{ cellValue\(column, row\) \}\}<\/slot>/)
})

test('通用列表样式统一：外框描边与圆角（表头/底纹由 ElTable 全局样式接管）', () => {
  assert.match(source, /\.data-table \{[\s\S]*?border: 2px solid var\(--line-strong\)/)
  assert.match(source, /\.data-table \{[\s\S]*?border-radius: var\(--radius-md\)/)
})

test('通用列表组件提供无数据占位', () => {
  assert.match(source, /emptyText\?: string/)
  assert.match(source, /emptyText: '暂无数据'/)
  assert.match(source, /:empty-text="props\.emptyText"/)
})

test('通用列表组件提供表内底栏插槽，用于内嵌分页 / 合计行', () => {
  assert.match(source, /<div v-if="\$slots\.footer" class="data-table-foot">/)
  assert.match(source, /<slot name="footer" \/>/)
  // 底栏固定在表格外框内、不参与数据区滚动。
  assert.match(source, /\.data-table \{[\s\S]*?display: grid;\n  grid-template-columns: minmax\(0, 1fr\);\n  grid-template-rows: minmax\(0, 1fr\) auto;/)
  assert.match(source, /\.data-table-foot \{[\s\S]*?border-top: 1px solid var\(--line\)/)
})

test('通用列表组件默认禁止单元格换行，长文本列可显式折行', () => {
  assert.match(source, /wrap\?: boolean/)
  assert.match(source, /is-wrap/)
  assert.match(source, /\.data-table-el :deep\(\.el-table__cell \.cell\) \{ white-space: nowrap; \}/)
  assert.match(source, /\.data-table-el :deep\(\.el-table__cell\.is-wrap \.cell\) \{ white-space: normal; overflow-wrap: anywhere; \}/)
})

test('通用列表组件支持表尾合计行', () => {
  // 合计行按列声明取值，由 ElTable 的 summary 行渲染（footer 插槽占位）。
  assert.match(source, /foot\?: \(\) => unknown/)
  assert.match(source, /footLabel\?: string/)
  assert.match(source, /const hasFoot = computed\(\(\) => Boolean\(props\.footLabel\) \|\| props\.columns\.some\(\(column\) => column\.foot\)\)/)
  assert.match(source, /:show-summary="hasFoot"/)
  assert.match(source, /:summary-method="summaryPlaceholder"/)
  assert.match(source, /<slot :name="`foot-\$\{column\.key\}`" :value="footValue\(column, columnIndex\)">/)
})
