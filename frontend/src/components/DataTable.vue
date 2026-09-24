<script setup lang="ts" generic="Row extends object">
import { computed } from 'vue'
/**
 * 通用列表组件：统一全站表格的容器描边、表头色块、隔行底纹、悬停高亮与数字对齐。
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
  align?: 'left' | 'right'
  width?: string
  /** 文字列（商号、单号）加粗，作为每行的阅读起点。 */
  emphasis?: boolean
  /** 该列作为行标题（渲染 `th scope="row"`），用于“等级 / 规格”这类行主键。 */
  rowHeader?: boolean
  /** 表尾合计行的取值；未配置的列在合计行留空。 */
  foot?: () => unknown
  /** 自定义取值，供按等级展开之类的动态列使用。 */
  value?: (row: Row) => unknown
  /** 可排序列由父页面处理数据请求；组件只负责表头交互与状态展示。 */
  sortable?: boolean
  sortKey?: string
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
    /** 给每个单元格加 `data-label`（= 列名），供页面在窄屏把表格转成卡片。 */
    dataLabels?: boolean
    /** 窄屏（≤560px）自动把每行折成一张带列名的卡片，不再横向滚动。 */
    cardsOnNarrow?: boolean
    activeSortKey?: string
    sortOrder?: 'asc' | 'desc'
    /** 服务端排序请求进行中；保留现有行，只锁定排序表头并展示局部状态。 */
    sortBusy?: boolean
  }>(),
  {
    caption: '',
    minWidth: '0px',
    bordered: false,
    emptyText: '暂无数据',
    footLabel: '',
    dataLabels: false,
    cardsOnNarrow: false,
    activeSortKey: '',
    sortOrder: 'desc',
    sortBusy: false,
  },
)

const hasFoot = computed(() => Boolean(props.footLabel) || props.columns.some((column) => column.foot))

function alignOf(column: DataTableColumn<Row>): 'left' | 'right' {
  if (column.align) return column.align
  return column.numeric ? 'right' : 'left'
}

function cellValue(column: DataTableColumn<Row>, row: Row): unknown {
  if (column.value) return column.value(row)
  return (row as Record<string, unknown>)[column.key] ?? '—'
}

function footValue(column: DataTableColumn<Row>, index: number): unknown {
  if (index === 0 && !column.foot && props.footLabel) return props.footLabel
  return column.foot ? column.foot() : ''
}

function isActiveSort(column: DataTableColumn<Row>): boolean {
  return props.activeSortKey === (column.sortKey ?? column.key)
}

function ariaSort(column: DataTableColumn<Row>): 'ascending' | 'descending' | 'none' | undefined {
  if (!column.sortable) return undefined
  if (!isActiveSort(column)) return 'none'
  return props.sortOrder === 'asc' ? 'ascending' : 'descending'
}

function sortIndicator(column: DataTableColumn<Row>): string {
  if (!isActiveSort(column)) return '↕'
  if (props.sortBusy) return '…'
  return props.sortOrder === 'asc' ? '↑' : '↓'
}
</script>

<template>
  <div
    class="data-table"
    :class="{ 'is-bordered': props.bordered, 'cards-on-narrow': props.cardsOnNarrow }"
    :aria-busy="props.sortBusy"
  >
    <div v-if="props.sortBusy" class="data-table-busy" role="status" aria-live="polite">
      <span class="data-table-busy-spinner" aria-hidden="true"></span>
      正在排序
    </div>
    <div class="data-table-scroll">
      <table :style="{ minWidth }">
        <caption v-if="caption" class="sr-only">{{ caption }}</caption>
        <thead>
          <tr>
            <th
              v-for="column in props.columns"
              :key="column.key"
              :style="{ width: column.width, textAlign: alignOf(column) }"
              :aria-sort="ariaSort(column)"
            >
              <button
                v-if="column.sortable"
                class="data-table-sort"
                type="button"
                :disabled="props.sortBusy"
                :class="{ 'is-active': isActiveSort(column) }"
                :style="{ justifyContent: alignOf(column) === 'right' ? 'flex-end' : 'flex-start' }"
                :title="`${column.label}：${isActiveSort(column) ? (props.sortOrder === 'asc' ? '当前升序，点击改为降序' : '当前降序，点击改为升序') : '点击排序'}`"
                @click="emit('sort', column.sortKey ?? column.key)"
              >
                <span>{{ column.label }}</span>
                <span class="data-table-sort-indicator" aria-hidden="true">{{ sortIndicator(column) }}</span>
                <span class="sr-only">
                  {{ isActiveSort(column) ? (props.sortOrder === 'asc' ? '当前升序' : '当前降序') : '当前未排序' }}
                </span>
              </button>
              <template v-else>{{ column.label }}</template>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!props.rows.length">
            <td class="data-table-empty" :colspan="props.columns.length">{{ emptyText }}</td>
          </tr>
          <tr v-for="(row, index) in props.rows" :key="rowKey(row, index)">
            <component
              v-for="column in props.columns"
              :key="column.key"
              :is="column.rowHeader ? 'th' : 'td'"
              :scope="column.rowHeader ? 'row' : undefined"
              :data-col="column.key"
              :data-label="props.dataLabels || props.cardsOnNarrow ? column.label : undefined"
              :class="{ 'is-emphasis': column.emphasis, 'is-numeric': column.numeric }"
              :style="{ textAlign: alignOf(column) }"
            >
              <slot :name="`cell-${column.key}`" :row="row" :value="cellValue(column, row)">
                <slot name="cell" :row="row" :column="column" :value="cellValue(column, row)">{{ cellValue(column, row) }}</slot>
              </slot>
            </component>
          </tr>
        </tbody>
        <tfoot v-if="hasFoot">
          <tr>
            <component
              v-for="(column, index) in props.columns"
              :key="column.key"
              :is="index === 0 ? 'th' : 'td'"
              :scope="index === 0 ? 'row' : undefined"
              :data-col="column.key"
              :data-label="props.dataLabels || props.cardsOnNarrow ? column.label : undefined"
              :class="{ 'is-numeric': column.numeric }"
              :style="{ textAlign: alignOf(column) }"
            >
              <slot :name="`foot-${column.key}`" :value="footValue(column, index)">{{ footValue(column, index) }}</slot>
            </component>
          </tr>
        </tfoot>
      </table>
    </div>
    <div v-if="$slots.footer" class="data-table-foot">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.data-table {
  position: relative;
  display: grid;
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
.data-table table { width: 100%; border-collapse: separate; border-spacing: 0; color: var(--ink); font-size: .95rem; }
.data-table th,
.data-table td { padding: .4rem .8rem; border-bottom: 1px solid var(--line); vertical-align: middle; }
.data-table thead th {
  position: sticky;
  z-index: 2;
  top: 0;
  border-bottom: 2px solid var(--line-strong);
  background: color-mix(in srgb, var(--primary-soft) 55%, var(--surface));
  color: var(--primary-dark);
  font-size: .88rem;
  font-weight: 700;
  white-space: nowrap;
}
.data-table-sort {
  display: inline-flex;
  width: 100%;
  align-items: center;
  gap: .3rem;
  padding: .15rem 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-weight: inherit;
  white-space: nowrap;
}
.data-table-sort:hover,
.data-table-sort:focus-visible { color: var(--primary); }
.data-table-sort:disabled { cursor: wait; opacity: .7; }
.data-table-sort:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.data-table-sort-indicator { min-width: .9rem; color: var(--muted); font-size: .82rem; text-align: center; }
.data-table-sort.is-active .data-table-sort-indicator { color: var(--primary-dark); font-weight: 800; }
.data-table tbody tr:last-child td,
.data-table tbody tr:last-child th { border-bottom: 0; }
.data-table tbody th[scope='row'] { text-align: left; }
/* 表尾合计行：与数据区区分，数字列仍按列对齐。 */
.data-table tfoot th,
.data-table tfoot td { border-top: 2px solid var(--line-strong); border-bottom: 0; background: color-mix(in srgb, var(--surface-soft) 60%, var(--surface)); font-weight: 700; }
.data-table tfoot th[scope='row'] { text-align: left; }
/* 默认模式只画浅色竖线：长表也能一眼看出列边界，又不像完整网格那样压住数据。 */
.data-table:not(.is-bordered) tbody td + td { border-left: 1px solid color-mix(in srgb, var(--line-strong) 45%, transparent); }
/* 边框模式：外框由 .data-table 提供，单元格只画右线，避免相邻边框叠成 2px。 */
.data-table.is-bordered th,
.data-table.is-bordered td { border-right: 1px solid var(--line-strong); }
.data-table.is-bordered th:last-child,
.data-table.is-bordered td:last-child { border-right: 0; }
.data-table.is-bordered thead th { background: color-mix(in srgb, var(--primary-soft) 70%, var(--surface)); }
.data-table tbody tr:nth-child(even) { background: color-mix(in srgb, var(--surface-soft) 45%, white); }
.data-table tbody tr:hover { background: color-mix(in srgb, var(--primary-soft) 50%, white); }
.data-table td.is-numeric { font-variant-numeric: tabular-nums; }
.data-table td.is-emphasis { font-weight: 700; }
.data-table td.data-table-empty { padding: 1.6rem .8rem; color: var(--muted); text-align: center; }
/* 表内底栏：分页 / 合计等常驻内容，贴在外框内侧，不参与列表滚动。 */
/* 底栏插槽里没有内容时（例如只有一页、不渲染分页条）收起底栏，避免留一条空条。 */
.data-table-foot:not(:has(*)) { display: none; }
.data-table-foot {
  padding: .3rem .7rem;
  border-top: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface-soft) 45%, var(--surface));
}

/* 窄屏卡片模式：每行一张卡片，列名由 data-label 前置，彻底去掉横向滚动。 */
@media (max-width: 560px) {
  .data-table.cards-on-narrow { border: 0; border-radius: 0; background: transparent; }
  .data-table.cards-on-narrow .data-table-scroll { overflow: visible; }
  .data-table.cards-on-narrow table { display: block; min-width: 0 !important; }
  .data-table.cards-on-narrow thead { display: none; }
  .data-table.cards-on-narrow tbody,
  .data-table.cards-on-narrow tfoot { display: block; }
  .data-table.cards-on-narrow tbody tr,
  .data-table.cards-on-narrow tfoot tr {
    display: grid;
    gap: .35rem;
    padding: .53rem 0;
    border-bottom: 1px solid var(--line);
    background: transparent;
  }
  .data-table.cards-on-narrow tbody tr:last-child { border-bottom: 0; }
  .data-table.cards-on-narrow tbody tr:hover { background: transparent; }
  .data-table.cards-on-narrow tbody th,
  .data-table.cards-on-narrow tbody td,
  .data-table.cards-on-narrow tfoot th,
  .data-table.cards-on-narrow tfoot td {
    display: flex;
    width: 100%;
    align-items: baseline;
    justify-content: space-between;
    gap: .59rem;
    padding: .12rem .6rem;
    border: 0;
    text-align: right;
    white-space: normal;
  }
  .data-table.cards-on-narrow tbody th::before,
  .data-table.cards-on-narrow tbody td::before,
  .data-table.cards-on-narrow tfoot th::before,
  .data-table.cards-on-narrow tfoot td::before {
    flex: 0 0 auto;
    color: var(--muted);
    content: attr(data-label);
    font-weight: 500;
    text-align: left;
  }
  /* 合计行在卡片模式下是“本页合计”卡片，给它独立底色而不是贴边。 */
  .data-table.cards-on-narrow tfoot tr {
    margin-top: .35rem;
    padding: .53rem .35rem;
    border-top: 2px solid var(--line-strong);
    background: color-mix(in srgb, var(--surface-soft) 60%, var(--surface));
  }
}
</style>
