<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import type { SettlementListItem } from '../api/types'
import { formatNumber, formatPrice } from '../utils/format'
import { groupBySeries, MAX_SERIES_COMPARISON } from '../utils/seriesComparison'
import { settlementOptionLabel } from '../utils/settlementComparison'
import {
  addWholeSeries,
  filterSettlementOptions,
  isWholeSeriesSelected,
  sortByRecentArrival,
  toggleDraftSelection,
} from '../utils/settlementPicker'

/**
 * 结算单选择器：主页面只显示「已选摘要」，点按钮才打开选择面板。
 * 单量变大时靠搜索和品牌折叠定位，不再把全部结算单平铺在页面上。
 */
const props = defineProps<{
  options: SettlementListItem[]
  selected: string[]
  max?: number
  loading?: boolean
}>()

const emit = defineEmits<{ apply: [merchantNos: string[]] }>()

const open = ref(false)
const draft = ref<string[]>([])
const keyword = ref('')
const limitHit = ref(false)
const collapsed = ref<string[]>([])
const searchInput = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
// 排列方式：按品牌分组（默认）或按到达日期从近到远铺开。
const sortMode = ref<'series' | 'recent'>('series')

const maxSelect = computed(() => props.max ?? MAX_SERIES_COMPARISON)
const filtered = computed(() => filterSettlementOptions(props.options, keyword.value))
const groups = computed(() => {
  if (sortMode.value === 'recent') {
    const items = sortByRecentArrival(filtered.value)
    return items.length ? [{ series: '最近到达', items, canSelectAll: false }] : []
  }
  return groupBySeries(filtered.value).map((group) => ({ ...group, canSelectAll: true }))
})
const selectedItems = computed(() =>
  props.selected
    .map((merchantNo) => props.options.find((item) => item.merchantNo === merchantNo))
    .filter((item): item is SettlementListItem => Boolean(item)),
)
const atLimit = computed(() => draft.value.length >= maxSelect.value)

/** 搜索时一律展开，保证命中结果直接可见。 */
function isGroupOpen(series: string): boolean {
  return Boolean(keyword.value.trim()) || !collapsed.value.includes(series)
}

function toggleGroup(series: string) {
  collapsed.value = collapsed.value.includes(series)
    ? collapsed.value.filter((item) => item !== series)
    : [...collapsed.value, series]
}

function groupMerchantNos(items: SettlementListItem[]): string[] {
  return items.map((item) => item.merchantNo)
}

function lockScroll(locked: boolean) {
  document.body.style.overflow = locked ? 'hidden' : ''
}

function openPicker() {
  draft.value = [...props.selected]
  keyword.value = ''
  limitHit.value = false
  collapsed.value = []
  open.value = true
  lockScroll(true)
  void nextTick(() => searchInput.value?.focus())
}

function closePicker() {
  open.value = false
  lockScroll(false)
}

function confirmSelection() {
  emit('apply', [...draft.value])
  closePicker()
}

function toggleDraft(merchantNo: string) {
  const result = toggleDraftSelection(draft.value, merchantNo, maxSelect.value)
  draft.value = result.next
  limitHit.value = result.limited
}

function toggleSeries(items: SettlementListItem[]) {
  const merchantNos = groupMerchantNos(items)
  if (isWholeSeriesSelected(draft.value, merchantNos)) {
    draft.value = draft.value.filter((merchantNo) => !merchantNos.includes(merchantNo))
    limitHit.value = false
    return
  }
  const result = addWholeSeries(draft.value, merchantNos, maxSelect.value)
  draft.value = result.next
  limitHit.value = result.limited
}

function removeSelected(merchantNo: string) {
  emit(
    'apply',
    props.selected.filter((item) => item !== merchantNo),
  )
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closePicker()
    return
  }
  if (event.key !== 'Tab' || !open.value) return
  const focusable = focusableElements()
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement as HTMLElement | null
  const inside = active ? panelRef.value?.contains(active) : false
  if (event.shiftKey && (!inside || active === first)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault()
    first.focus()
  }
}

/** 抽屉内可聚焦的控件，用于把 Tab 键锁在面板里。 */
function focusableElements(): HTMLElement[] {
  const panel = panelRef.value
  if (!panel) return []
  return Array.from(
    panel.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && element.offsetParent !== null)
}

watch(open, (value) => {
  if (value) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  lockScroll(false)
})
</script>

<template>
  <section class="dashboard-section" aria-labelledby="settlement-picker-title">
    <header class="section-heading">
      <div>
        <h2 id="settlement-picker-title">选择要对比的结算单</h2>
        <p class="section-note">已选 {{ selected.length }} / {{ maxSelect }}，至少选两张</p>
      </div>
      <div class="picker-trigger-actions">
        <button type="button" class="primary-button" @click="openPicker">选择结算单</button>
        <button v-if="selected.length" type="button" class="text-button" @click="emit('apply', [])">
          清空
        </button>
      </div>
    </header>

    <div class="picker-mobile-actions">
      <button type="button" class="primary-button" @click="openPicker">选择结算单</button>
      <button v-if="selected.length" type="button" class="text-button" @click="emit('apply', [])">
        清空
      </button>
    </div>

    <ul v-if="selectedItems.length" class="picker-chips">
      <li v-for="item in selectedItems" :key="item.merchantNo">
        <span class="picker-chip-text">{{ settlementOptionLabel(item) }}</span>
        <button
          type="button"
          class="picker-chip-remove"
          :aria-label="`移除 ${settlementOptionLabel(item)}`"
          @click="removeSelected(item.merchantNo)"
        >
          ×
        </button>
      </li>
    </ul>
    <div v-else class="empty-state compact">
      <strong>还没有选择结算单</strong>
      <span>点右上角「选择结算单」，挑两张及以上开始对比。</span>
    </div>

    <Teleport to="body">
      <div v-if="open" class="picker-overlay" @click.self="closePicker">
        <section
          ref="panelRef"
          class="picker-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settlement-picker-dialog-title"
        >
          <header class="picker-head">
            <div>
              <h2 id="settlement-picker-dialog-title">选择要对比的结算单</h2>
              <p class="section-note">
                最多选 {{ maxSelect }} 张；先在面板里挑好，点「确定」再刷新对比结果
              </p>
            </div>
            <button type="button" class="text-button" @click="closePicker">关闭</button>
          </header>

          <label class="picker-search">
            <span class="sr-only">搜索结算单</span>
            <input
              ref="searchInput"
              v-model="keyword"
              type="search"
              placeholder="搜商号、单号或品牌"
              autocomplete="off"
            >
          </label>

          <div class="picker-status" aria-live="polite">
            <strong>已选 {{ draft.length }} / {{ maxSelect }}</strong>
            <span v-if="limitHit" class="picker-limit">已选满 {{ maxSelect }} 张，先取消一张再选</span>
            <span v-else-if="keyword.trim()" class="section-note">找到 {{ filtered.length }} 张</span>
            <span v-else class="section-note">共 {{ options.length }} 张</span>
            <span class="picker-sort" role="group" aria-label="排列方式">
              <button
                type="button"
                :aria-pressed="sortMode === 'series'"
                @click="sortMode = 'series'"
              >
                按品牌
              </button>
              <button
                type="button"
                :aria-pressed="sortMode === 'recent'"
                @click="sortMode = 'recent'"
              >
                最近到达
              </button>
            </span>
          </div>

          <div class="picker-body">
            <div v-if="loading" class="picker-skeleton skeleton-block">正在加载结算单</div>
            <div v-else-if="!filtered.length" class="empty-state compact">
              <strong>{{ options.length ? '没有匹配的结算单' : '当前范围内没有结算单' }}</strong>
              <span>{{ options.length ? '换个商号或单号再搜。' : '请调整到达日期范围，或先导入结算单。' }}</span>
            </div>
            <div v-else class="picker-groups">
              <article v-for="group in groups" :key="group.series" class="picker-group">
                <header class="picker-group-head">
                  <button
                    v-if="group.canSelectAll"
                    type="button"
                    class="picker-group-toggle"
                    :aria-expanded="isGroupOpen(group.series)"
                    @click="toggleGroup(group.series)"
                  >
                    <strong>{{ group.series }}</strong>
                    <span>{{ group.items.length }} 张</span>
                    <span class="picker-caret" aria-hidden="true">
                      {{ isGroupOpen(group.series) ? '收起' : '展开' }}
                    </span>
                  </button>
                  <span v-else class="picker-group-plain">
                    <strong>{{ group.series }}</strong>
                    <span>{{ group.items.length }} 张</span>
                  </span>
                  <button
                    v-if="group.canSelectAll"
                    type="button"
                    class="text-button"
                    @click="toggleSeries(group.items)"
                  >
                    {{
                      isWholeSeriesSelected(draft, groupMerchantNos(group.items))
                        ? '取消本品牌'
                        : '全选本品牌'
                    }}
                  </button>
                </header>
                <div v-show="isGroupOpen(group.series)" class="series-options">
                  <label
                    v-for="item in group.items"
                    :key="item.merchantNo"
                    class="series-option"
                    :class="{ selected: draft.includes(item.merchantNo) }"
                  >
                    <input
                      type="checkbox"
                      :value="item.merchantNo"
                      :checked="draft.includes(item.merchantNo)"
                      :disabled="atLimit && !draft.includes(item.merchantNo)"
                      @change="toggleDraft(item.merchantNo)"
                    >
                    <span class="series-option-name">{{ settlementOptionLabel(item) }}</span>
                    <span class="series-option-metrics">
                      <span>{{ formatNumber(item.totalQuantity) }} 件</span>
                      <span>{{ formatPrice(item.averagePrice) }}</span>
                    </span>
                  </label>
                </div>
              </article>
            </div>
          </div>

          <footer class="picker-foot">
            <button type="button" class="text-button" @click="closePicker">取消</button>
            <button type="button" class="primary-button" @click="confirmSelection">
              确定（{{ draft.length }} 张）
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.picker-trigger-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.picker-mobile-actions { display: none; }
.picker-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.picker-chips li {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 6px 0 14px;
  border: 1px solid var(--primary); border-radius: 999px;
  background: color-mix(in srgb, var(--primary-soft) 55%, white);
  font-size: .95rem;
}
.picker-chip-text { font-variant-numeric: tabular-nums; }
.picker-chip-remove {
  width: 32px; height: 32px; padding: 0;
  border: 0; border-radius: 50%; background: transparent;
  color: var(--primary-dark); font-size: 1.2rem; line-height: 1; cursor: pointer;
}
.picker-chip-remove:hover { background: var(--primary-soft); }

.picker-overlay {
  position: fixed; inset: 0; z-index: 60;
  display: flex; justify-content: flex-end;
  background: rgba(16, 26, 20, .45);
}
.picker-panel {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  width: min(460px, 100%); height: 100%;
  background: var(--surface);
  box-shadow: -8px 0 24px rgba(16, 26, 20, .18);
  animation: picker-slide-in 200ms ease-out;
}
@keyframes picker-slide-in {
  from { transform: translateX(24px); opacity: .6; }
  to { transform: translateX(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .picker-panel { animation: none; }
}
.picker-head {
  display: flex; flex-wrap: nowrap; align-items: flex-start; justify-content: space-between; gap: 10px;
  padding: 16px 18px 10px;
}
.picker-head > div { flex: 1 1 auto; min-width: 0; }
.picker-head > button { flex: 0 0 auto; }
.picker-head h2 { margin: 0 0 4px; font-size: 1.05rem; }
.picker-search { display: block; padding: 0 18px 10px; }
.picker-search input {
  width: 100%; min-height: 48px; padding: 0 14px;
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--ink); font-size: 1rem;
}
.picker-status {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px;
  padding: 0 18px 10px; border-bottom: 1px solid var(--line);
}
.picker-limit { color: var(--warning); font-size: .9rem; font-weight: 700; }
.picker-sort {
  display: inline-flex; margin-left: auto;
  border: 1px solid var(--line-strong); border-radius: 999px; overflow: hidden;
}
.picker-sort button {
  min-height: 44px; padding: 0 14px;
  border: 0; background: var(--surface); color: var(--muted);
  font-size: .9rem; cursor: pointer;
}
.picker-sort button[aria-pressed='true'] { background: var(--primary); color: white; font-weight: 700; }
.picker-body { min-height: 0; overflow-y: auto; padding: 12px 18px; }
.picker-skeleton { min-height: 120px; }
.picker-groups { display: grid; gap: 10px; }
.picker-group { border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); }
.picker-group-head {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
  padding: 6px 10px 6px 6px;
}
.picker-group-toggle {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 8px;
  border: 0; background: transparent; color: var(--ink); font-size: 1rem; cursor: pointer;
}
.picker-group-toggle span { color: var(--muted); font-size: .85rem; }
.picker-group-plain { display: inline-flex; align-items: baseline; gap: 8px; min-height: 44px; padding: 0 8px; }
.picker-group-plain span { color: var(--muted); font-size: .85rem; }
.picker-caret { font-weight: 700; color: var(--primary-dark) !important; }
/* 结算单多选：窄屏一行一个，宽屏自动并排，选中态用主色描边 + 浅底 + 勾选框。 */
.series-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; padding: 0 10px 10px; }
.series-option {
  display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 2px 10px;
  min-height: 58px; padding: 9px 12px;
  border: 1px solid var(--line); border-radius: var(--radius-sm);
  background: var(--surface); cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.series-option:hover { border-color: var(--line-strong); background: var(--surface-soft); }
.series-option.selected { border-color: var(--primary); background: color-mix(in srgb, var(--primary-soft) 55%, white); }
.series-option:has(input:disabled) { cursor: not-allowed; opacity: .55; }
.series-option input[type='checkbox'] {
  grid-row: 1 / span 2; width: 22px; height: 22px; margin: 0;
  border: 2px solid var(--line-strong); border-radius: 5px; background: var(--surface);
  appearance: none; cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.series-option input[type='checkbox']:checked {
  border-color: var(--primary); background: var(--primary) center / 15px no-repeat;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E");
}
.series-option-name { overflow-wrap: anywhere; font-size: .95rem; }
.series-option.selected .series-option-name { font-weight: 700; }
.series-option-metrics { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--muted); font-size: .9rem; font-variant-numeric: tabular-nums; }
.picker-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: 12px;
  padding: 12px 18px; border-top: 1px solid var(--line); background: var(--surface);
}

@media (max-width: 720px) {
  .picker-panel { width: 100%; }
  .series-options { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 560px) {
  .section-heading .picker-trigger-actions { display: none; }
  .picker-mobile-actions {
    display: flex;
    position: sticky;
    z-index: 20;
    bottom: calc(var(--mobile-tabbar-height) + env(safe-area-inset-bottom) + 10px);
    justify-content: stretch;
    gap: 8px;
    margin: 0 -14px;
    padding: 10px 14px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: rgba(255, 255, 255, .94);
    box-shadow: 0 8px 20px rgba(31, 41, 35, .08);
  }
  .picker-mobile-actions > * { flex: 1 1 auto; min-width: 0; }
  .picker-chips { display: none; }
  .picker-chip-remove { width: 44px; height: 44px; }
}
</style>
