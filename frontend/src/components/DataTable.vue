<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue'
import { ElTable, ElTableColumn } from 'element-plus'
import 'element-plus/es/components/table/style/css'
import { fitColumnWidths, type WidthFitEntry } from '../utils/tableColumnFit'
/**
 * 通用列表组件：统一全站表格的容器描边、表头色块、隔行底纹、悬停高亮与数字对齐。
 * 内部用 Element Plus `ElTable` 渲染（排序表头、行态、空表占位交给组件）。
 * 高度交给父级控制——父级给固定高度时，只有列表区域内部滚动，表头保持吸顶。
 * 单元格默认渲染列取值，需要自定义时用 `cell-<key>` 插槽；
 * 列由数据动态生成（各等级件数 / 占比）时，退一步用通用 `cell` 插槽，按 `column.key` 自行分支；
 * 需要分页条 / 合计行这类贴着表格底边的内容时用 `footer` 插槽（留在外框内，看起来是一体）。
 */
export interface DataTableColumn<Row> {
  /** 列标识：默认取 `row[key]` 作为单元格内容，也是插槽名 `cell-<key>` 的后缀。 */
  key: string
  label: string
  /** 数值列右对齐并使用等宽数字；文本列默认左对齐。 */
  numeric?: boolean
  align?: 'left' | 'center' | 'right'
  width?: string
  /** 长文本列允许在单元格内折行；默认单元格不换行。 */
  wrap?: boolean
  /** 文字列（商号、单号）加粗，作为每行的阅读起点。 */
  emphasis?: boolean
  /** fitWidth 压缩时保持完整内容宽、不参与摊赤字；截断后无法辨认的关键列（单号）用。 */
  noShrink?: boolean
  /** 表尾合计行的取值；未配置的列在合计行留空。 */
  foot?: () => unknown
  /** 自定义取值，供按等级展开之类的动态列使用。 */
  value?: (row: Row) => unknown
  /** 可排序列由父页面处理数据请求；组件只负责表头交互与状态展示。 */
  sortable?: boolean
  sortKey?: string
  /** ElTable 列固定（横向滚动时钉在左/右缘）。 */
  fixed?: 'left' | 'right'
}

const emit = defineEmits<{ sort: [key: string] }>()

const props = withDefaults(
  defineProps<{
    columns: DataTableColumn<Row>[]
    rows: Row[]
    /** 行键；没有稳定 id 的可编辑行可以用第二个参数（行下标）兜底。 */
    rowKey: (row: Row, index: number) => string | number
    /** 供读屏使用的表格说明。 */
    caption?: string
    /** 表格最小宽度，容器放不下时在组件内部横向滚动。 */
    minWidth?: string
    /** 打开单元格边框，用于需要逐格对齐核对的明细表。 */
    bordered?: boolean
    /** 无数据时的占位文案。 */
    emptyText?: string
    /** 表尾合计行首列文案；配置后即使没有列声明 foot 也会渲染表尾。 */
    footLabel?: string
    /** 行级 class；例如导入复核用 `row-error` 标红整行。 */
    rowClass?: (row: Row, index: number) => string
    /** 紧凑模式：缩小单元格内边距与列宽下限，用于一屏多卡的对比小表。 */
    compact?: boolean
    activeSortKey?: string
    sortOrder?: 'asc' | 'desc'
    /** 服务端排序请求进行中；保留现有行，只锁定排序表头并展示局部状态。 */
    sortBusy?: boolean
    /** ElTable 以 100% 高度填充父容器（表体内部滚动、底栏插槽钉在面板底部）。 */
    fillHeight?: boolean
    /** 列宽自适应容器：内容总宽超出容器时按「表头下限」压缩列宽恰好铺满容器，
     *  被压缩单元格省略号 + 悬浮提示看全值；连表头都放不下时回退横向滚动。 */
    fitWidth?: boolean
  }>(),
  {
    caption: '',
    minWidth: '0px',
    bordered: false,
    emptyText: '暂无数据',
    footLabel: '',
    compact: false,
    activeSortKey: '',
    sortOrder: 'desc',
    sortBusy: false,
    fillHeight: false,
    fitWidth: false,
  },
)

const hasFoot = computed(() => Boolean(props.footLabel) || props.columns.some((column) => column.foot))

const tableRef = ref<InstanceType<typeof ElTable> | null>(null)
/** 组件根元素：ElTable 的 expose 对象不含 $el，DOM 测量挂在自研根 div 上。 */
const rootEl = ref<HTMLElement | null>(null)

function alignOf(column: DataTableColumn<Row>): 'left' | 'center' | 'right' {
  return column.align ?? (column.numeric ? 'right' : 'left')
}

function cellValue(column: DataTableColumn<Row>, row: Row): unknown {
  if (column.value) return column.value(row)
  return (row as Record<string, unknown>)[column.key] ?? '—'
}

function footValue(column: DataTableColumn<Row>, index: number): unknown {
  if (index === 0 && !column.foot && props.footLabel) return props.footLabel
  return column.foot ? column.foot() : ''
}

/** ElTable 单元格附加 class：保留 numeric/emphasis/wrap 语义与列 key 定位。 */
function cellClassName(column: DataTableColumn<Row>): string {
  const classes = [`col-${column.key}`]
  if (column.numeric) classes.push('is-numeric')
  if (column.emphasis) classes.push('is-emphasis')
  if (column.wrap) classes.push('is-wrap')
  return classes.join(' ')
}

function rowClassName({ row, rowIndex }: { row: Row; rowIndex: number }): string {
  return props.rowClass ? props.rowClass(row, rowIndex) : ''
}

/** 表尾行内容全部由列的 #footer 插槽 / foot() 提供，方法本身只占位。 */
function summaryPlaceholder(): string[] {
  return props.columns.map(() => '')
}

/**
 * 文本测量：用 canvas measureText 按全站表格字体（.95rem 雅黑）取真实排版宽度——
 * 字符数估算在 CJK/数字混排下误差太大，会出现省略号截断。等宽数字比比例数字略宽，
 * 统一放大 4% 兜余量；无 canvas 环境（测试/SSR）退回字符估算。
 */
const CJK_CHAR = /[\u2e80-\ufaff\uff01-\uff60\u3000-\u303f]/
let measureCanvas: HTMLCanvasElement | null | undefined
function textWidth(value: unknown): number {
  const text = String(value ?? '')
  if (!text) return 0
  if (measureCanvas === undefined) {
    measureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
  }
  if (measureCanvas) {
    const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.95
    const context = measureCanvas.getContext('2d')
    if (context) {
      context.font = `${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`
      // 等宽数字与字体回退（无雅黑时 Noto 等）都比 measureText 的比例宽度略宽，留 12% 裕量。
      return context.measureText(text).width * 1.12
    }
  }
  let width = 0
  for (const ch of text) width += CJK_CHAR.test(ch) ? 14 : 7.6
  return width
}

/**
 * ElTable 不像原生表格那样按内容分列宽（默认等分剩余空间，窄内容列留大片空白、
 * 长内容列换行）。这里按「表头 + 全部行取值」测量每列所需宽度作为 min-width 交给
 * ElTable：剩余空间按 min-width 比例分配，总宽超出容器时表格内部横向滚动——
 * 与原手写表格的 auto 布局观感一致。自定义插槽的列量不出内容，交给调用方
 * 传 width，未传时给保守下限。
 */
const slots = useSlots()
/** 单元格左右内边距补偿：紧凑模式内边距小，需要的列宽余量同减，小卡也能放下全部列。 */
const cellPadAllowance = computed(() => (props.compact ? 16 : 28))
const measuredMinWidths = computed<Record<string, number>>(() => {
  const widths: Record<string, number> = {}
  for (const column of props.columns) {
    if (column.width) continue
    const hasCellSlot = Boolean(slots[`cell-${column.key}`] || slots.cell)
    let max = textWidth(column.label) + (column.sortable ? 20 : 4) + cellPadAllowance.value
    if (!hasCellSlot) {
      for (const row of props.rows) {
        max = Math.max(max, textWidth(cellValue(column, row)) + cellPadAllowance.value)
      }
    }
    widths[column.key] = Math.round(
      Math.min(Math.max(max, column.wrap ? 120 : props.compact ? 56 : 76), 420),
    )
  }
  return widths
})

/**
 * 二次校准 + 自主分配：首帧渲染后读取每个单元格的真实 scrollWidth（浏览器按实际字体
 * 排版的结果，canvas/字符估算在字体回退下会偏小、出现省略号截断）与表头宽度，得到每列
 * 内容最小宽；再按滚动区实测可用宽度把富余空间按最小宽比例分给各列，得出**确定的
 * 列宽**交给 ElTable（全部列都是固定宽时 EP 不再做弹性分配——EP 在弹窗等场景对容器
 * 宽的测量会偏大，按 min-width 弹性分配会把表体撑出容器、末尾列被挤出可视区）。
 * EP 不响应已注册列的宽度变更，结果变化时递增 fitEpoch 重建表格；容器尺寸变化由
 * ResizeObserver 触发重算。仅在 ElTable 路径生效。
 */
const fittedMinWidths = ref<Record<string, number>>({})
/** fitWidth 分配结果：key → 确定列宽；null＝未启用 / 放得下（min-width 拉伸）/ 放不下（滚动）。 */
const fittedWidths = ref<Record<string, number> | null>(null)
let fitSnapshot = ''
const fitEpoch = ref(0)
let contentObserver: ResizeObserver | null = null

/** fitWidth 模式的表头下限补充：被压缩单元格内边距（.cell 4px×2 + td .5rem×2）。 */
const FIT_CELL_PAD = 26

/** 实测表头自然宽：把表头 .cell 克隆进隐藏量宽容器（去内边距、width:auto），
 *  按真实字体量「文案 + 排序箭头」宽度——比 canvas 估算精确（表头 .88rem 加粗、
 *  canvas 按正文常规体估会偏大 15~20%，把本可铺满的宽度误判成回退滚动）。 */
function measureHeaderWidths(el: HTMLElement): Record<string, number> {
  const widths: Record<string, number> = {}
  const measurer = document.createElement('div')
  measurer.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap'
  el.appendChild(measurer)
  try {
    for (const th of el.querySelectorAll<HTMLElement>('.el-table__header th')) {
      const key = [...th.classList].find((name) => name.startsWith('col-'))
      const cell = th.querySelector<HTMLElement>('.cell')
      if (!key || !cell) continue
      const clone = cell.cloneNode(true) as HTMLElement
      clone.style.width = 'auto'
      clone.style.padding = '0'
      measurer.appendChild(clone)
      widths[key.slice(4)] = clone.offsetWidth + 2
      clone.remove()
    }
  } finally {
    measurer.remove()
  }
  return widths
}

/** fitWidth 分配：固定宽列（width）不参与压缩，弹性列在「理想宽 → 表头下限」间摊赤字。 */
function computeFittedWidths(
  mins: Record<string, number>,
  available: number,
  headerWidths: Record<string, number>,
): Record<string, number> | null {
  if (!props.fitWidth) return null
  let fixedTotal = 0
  const entries: WidthFitEntry[] = []
  for (const column of props.columns) {
    if (column.width) {
      fixedTotal += Number.parseFloat(column.width) || 0
      continue
    }
    // 理想宽不低于表头需求（canvas 估算偏小时以实测表头兜底），下限＝表头下限——
    // 列再窄也得放下自己的表头，放不下就整体回退滚动而不是截断表头。
    const headerNeed = Math.round(
      (headerWidths[column.key] ?? textWidth(column.label) + (column.sortable ? 20 : 4)) + FIT_CELL_PAD,
    )
    const ideal = Math.max(mins[column.key] ?? 0, headerNeed)
    entries.push({ key: column.key, ideal, floor: column.noShrink ? ideal : Math.min(ideal, headerNeed) })
  }
  if (!entries.length) return null
  return fitColumnWidths(available - fixedTotal, entries)
}

function refitColumns() {
  const el = rootEl.value
  if (!el) return
  const next: Record<string, number> = {}
  let sawCells = false
  for (const column of props.columns) {
    if (column.width) continue
    // 基准取「上一轮校准值 / canvas 估算」的较大者（稳定、不随渲染变化）；
    // DOM 测量只用来上调实际溢出的列——未溢出时 scrollWidth === clientWidth（等于当前
    // 列宽），采信它会让 min 每轮自增（+28 补偿）无限蠕动。
    const prev = fittedMinWidths.value[column.key]
    let content = prev !== undefined
      ? prev - cellPadAllowance.value
      : measuredMinWidths.value[column.key] ?? 0
    el.querySelectorAll<HTMLElement>(`.el-table__body td.col-${column.key} .cell`).forEach((cell) => {
      sawCells = true
      if (cell.scrollWidth > cell.clientWidth + 1) content = Math.max(content, cell.scrollWidth)
    })
    // 表头（含排序 caret）可能与正文不等宽，一并测量。
    el.querySelectorAll<HTMLElement>(`.el-table__header th.col-${column.key} .cell`).forEach((cell) => {
      if (cell.scrollWidth > cell.clientWidth + 1) content = Math.max(content, cell.scrollWidth)
    })
    next[column.key] = Math.round(
      Math.min(Math.max(content + cellPadAllowance.value, column.wrap ? 120 : props.compact ? 56 : 80), 420),
    )
  }
  // fitWidth 分配与列宽同轮计算、同快照比较：容器宽（RO 触发）或内容宽任一变化都重建表格。
  const granted = props.fitWidth
    ? computeFittedWidths(next, el.clientWidth, measureHeaderWidths(el))
    : null
  const snapshot = JSON.stringify({ next, granted })
  if (snapshot === fitSnapshot) return
  fitSnapshot = snapshot
  fittedMinWidths.value = next
  fittedWidths.value = granted
  fitEpoch.value += 1
}

let fitRetries = 0

/** EP 挂载瞬间可能量到布局未稳的容器宽、弹性分配偏大且不再自愈；强制按真实容器重排。
 *  doLayout 的富余分配可能把插槽列（量不出内容、只有表头估算）压到内容宽以下，
 *  排版稳定后须再量一轮列宽，否则省略号截断后不再自愈。 */
function relayoutTable() {
  requestAnimationFrame(() => {
    tableRef.value?.doLayout()
    scheduleFit()
  })
}

function scheduleFit(delayMs = 0) {
  if (!delayMs) {
    void nextTick(refitColumns)
    return
  }
  // EP 的弹性分配晚于挂载/容器测量（内部分配不触发外层 RO、也无完成事件），
  // 延迟复测兜住「分配后挤压」；refit 快照相同即收敛，多跑几轮没有副作用。
  setTimeout(() => {
    refitColumns()
  }, delayMs)
}

function columnMinWidth(key: string): number {
  return fittedMinWidths.value[key] ?? measuredMinWidths.value[key] ?? (props.compact ? 56 : 76)
}

watch(() => props.rows, () => {
  fitRetries = 0
  scheduleFit()
  scheduleFit(160)
})
onMounted(() => {
  scheduleFit()
  relayoutTable()
  scheduleFit(160)
  scheduleFit(480)
  contentObserver = new ResizeObserver(() => {
    fitRetries = 0
    scheduleFit()
    scheduleFit(160)
    relayoutTable()
  })
  if (rootEl.value) contentObserver.observe(rootEl.value)
})
onBeforeUnmount(() => {
  contentObserver?.disconnect()
  contentObserver = null
})

function isActiveSort(column: DataTableColumn<Row>): boolean {
  return props.activeSortKey === (column.sortKey ?? column.key)
}

/** ElTable 表头排序变化 → 统一换成调用方约定的 sortKey 再广播。 */
function onSortChange({ prop, order }: { prop?: string; order?: string | null }) {
  if (!prop || !order) return
  const column = props.columns.find((item) => item.key === prop)
  emit('sort', column?.sortKey ?? prop)
}

/**
 * 外部受控排序（服务端排序）：EP 不会把 column.order 反映到表头（aria-sort 恒空、
 * caret 不变色），而 table.sort() 回写又有 sort-change 回环风险。改用受控做法——
 * 按外部 activeSortKey/sortOrder 给排序表头加 is-sorted-asc/desc 类，caret 颜色
 * 由 DataTable 的样式接管。
 */
function headerCellClass({ column }: { column: { property?: string } }): string {
  const def = props.columns.find((item) => item.key === column.property)
  if (!def || !def.sortable || !isActiveSort(def)) return ''
  return props.sortOrder === 'asc' ? 'is-sorted-asc' : 'is-sorted-desc'
}

/** 外部排序状态（activeSortKey/sortOrder）变化时同步 ElTable 表头指示。 */
const tableStyle = computed(() => (props.minWidth && props.minWidth !== '0px' ? { minWidth: props.minWidth } : undefined))
</script>

<template>
  <div
    ref="rootEl"
    class="data-table"
    :class="{ 'is-bordered': props.bordered, 'is-compact': props.compact }"
    :aria-busy="props.sortBusy"
  >
    <div v-if="props.sortBusy" class="data-table-busy" role="status" aria-live="polite">
      <span class="data-table-busy-spinner" aria-hidden="true"></span>
      正在排序
    </div>
    <div class="data-table-scroll">
      <!-- Element Plus 表格。吸顶表头由全局样式（styles-element.css）接管。 -->
      <ElTable
        ref="tableRef"
        :key="fitEpoch"
        class="data-table-el"
        :class="{ 'is-fill-height': props.fillHeight, 'is-width-fitted': fittedWidths !== null }"
        :data="props.rows"
        :border="props.bordered"
        :empty-text="props.emptyText"
        :height="props.fillHeight ? '100%' : undefined"
        :row-class-name="rowClassName"
        :header-cell-class-name="headerCellClass"
        :show-summary="hasFoot"
        :summary-method="summaryPlaceholder"
        :style="tableStyle"
        @sort-change="onSortChange"
      >
        <ElTableColumn
          v-for="(column, columnIndex) in props.columns"
          :key="column.key"
          :prop="column.key"
          :label="column.label"
          :align="alignOf(column)"
          :width="column.width ?? (fittedWidths ? fittedWidths[column.key] : undefined)"
          :min-width="column.width || fittedWidths ? undefined : columnMinWidth(column.key)"
          :show-overflow-tooltip="props.fitWidth && !column.wrap && !column.width"
          :fixed="column.fixed"
          :class-name="cellClassName(column)"
          :sortable="column.sortable ? 'custom' : false"
        >
          <template #default="{ row, $index }">
            <slot :name="`cell-${column.key}`" :row="row" :index="$index" :value="cellValue(column, row)">
              <slot name="cell" :row="row" :column="column" :value="cellValue(column, row)">{{ cellValue(column, row) }}</slot>
            </slot>
          </template>
          <template v-if="hasFoot" #footer>
            <slot :name="`foot-${column.key}`" :value="footValue(column, columnIndex)">{{ footValue(column, columnIndex) }}</slot>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>
    <span v-if="caption" class="sr-only">{{ caption }}</span>
    <div v-if="$slots.footer" class="data-table-foot">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.data-table {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
  border: 2px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.data-table-busy {
  position: absolute;
  z-index: 5;
  top: .35rem;
  left: 50%;
  display: inline-flex;
  align-items: center;
  gap: .4rem;
  min-height: 1.8rem;
  padding: .2rem .65rem;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: var(--surface);
  box-shadow: 0 4px 14px rgb(24 49 42 / 12%);
  color: var(--primary-dark);
  font-size: .82rem;
  font-weight: 800;
  transform: translateX(-50%);
  pointer-events: none;
}
.data-table-busy-spinner {
  width: .8rem;
  height: .8rem;
  border: 2px solid var(--primary-soft);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: data-table-spin .7s linear infinite;
}
@keyframes data-table-spin { to { transform: rotate(360deg); } }
.data-table-scroll { min-height: 0; overflow: auto; }
/* 表内底栏：分页 / 合计等常驻内容，贴在外框内侧，不参与列表滚动。 */
/* 底栏插槽里没有内容时（例如只有一页、不渲染分页条）收起底栏，避免留一条空条。 */
.data-table-foot:not(:has(*)) { display: none; }
.data-table-foot {
  padding: .3rem .7rem;
  border-top: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface-soft) 45%, var(--surface));
}

/* ElTable 路径：单元格默认不换行（与原手写表格、admin 端列表同一语义），
   列宽由 measuredMinWidths 保证装得下内容，装不下时表格内部横向滚动；
   仅声明 wrap 的长文本列折行。 */
.data-table-el :deep(.el-table__cell .cell) { white-space: nowrap; }
.data-table-el :deep(.el-table__cell.is-wrap .cell) { white-space: normal; overflow-wrap: anywhere; }
/* 紧凑模式：缩小 ElTable 单元格内边距，与列宽的紧凑补偿保持一致。 */
.data-table.is-compact :deep(.el-table__cell) { padding: .28rem .5rem; }
/* 受控排序态：当前排序列的 caret 加深（等价原手写表的 ↑/↓ 加重）。 */
.data-table-el :deep(th.is-sorted-asc .sort-caret.ascending) { border-bottom-color: var(--primary-dark); }
.data-table-el :deep(th.is-sorted-desc .sort-caret.descending) { border-top-color: var(--primary-dark); }
/* 横向滚动条常驻（EP 默认 hover 才出现，用户不知道右侧还有列），加高方便拖拽。 */
.data-table-el :deep(.el-scrollbar__bar.is-horizontal) {
  height: 10px;
  opacity: 1;
}
.data-table-el :deep(.el-scrollbar__bar.is-horizontal .el-scrollbar__thumb) { border-radius: 6px; }
/* fillHeight：ElTable 100% 填充滚动区，超出行数在表体内部滚动、底栏钉在面板底部。 */
.data-table-el.is-fill-height { height: 100%; }
.data-table-el.is-fill-height :deep(.el-table__inner-wrapper) { height: 100%; }
/* fitWidth 压缩模式：收紧单元格内边距为列宽腾位，被压缩单元格由
   show-overflow-tooltip 省略号截断、悬浮提示看全值。 */
.data-table-el.is-width-fitted :deep(.el-table__cell) { padding: .3rem .5rem; }
.data-table-el.is-width-fitted :deep(.el-table__cell .cell) { padding: 0 4px; }
</style>
