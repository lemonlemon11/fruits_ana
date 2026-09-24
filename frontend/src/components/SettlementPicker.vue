<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import type { SettlementListItem } from '../api/types'
import { formatNumber, formatPrice } from '../utils/format'
import { groupBySeries, MAX_SERIES_COMPARISON } from '../utils/seriesComparison'
import { settlementOptionLabel } from '../utils/settlementComparison'
import {
  addWholeSeries,
  filterSettlementOptions,
  groupByCategory,
  isWholeSeriesSelected,
  normalizeSameSeriesSelection,
  paginateSettlementOptions,
  sortByRecentArrival,
  toggleDraftSelection,
  UNKNOWN_CATEGORY,
} from '../utils/settlementPicker'

/**
 * 结算单选择器：先选品类，再选品牌，最后选同品牌结算单。
 * 品牌内支持搜索与分页，确认时只返回同一品牌的商号。
 */
import './SettlementPicker.css'

const props = defineProps<{
  options: SettlementListItem[]
  selected: string[]
  max?: number
  loading?: boolean
}>()

const emit = defineEmits<{ apply: [merchantNos: string[]] }>()

const open = ref(false)
const step = ref<'category' | 'brand' | 'settlement'>('category')
const activeCategory = ref('')
const activeSeries = ref('')
const draft = ref<string[]>([])
const categoryKeyword = ref('')
const brandKeyword = ref('')
const keyword = ref('')
const limitHit = ref(false)
const page = ref(1)
const pageSize = 6
const categorySearchInput = ref<HTMLInputElement | null>(null)
const brandSearchInput = ref<HTMLInputElement | null>(null)
const settlementSearchInput = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

const maxSelect = computed(() => props.max ?? MAX_SERIES_COMPARISON)
const selectedItems = computed(() =>
  props.selected
    .map((merchantNo) => props.options.find((item) => item.merchantNo === merchantNo))
    .filter((item): item is SettlementListItem => Boolean(item)),
)
const atLimit = computed(() => draft.value.length >= maxSelect.value)

const categoryGroups = computed(() => {
  const groups = groupByCategory(props.options)
  const needle = categoryKeyword.value.trim().toLowerCase()
  if (!needle) return groups
  return groups.filter((group) => group.category.toLowerCase().includes(needle))
})

const activeCategoryItems = computed(() =>
  props.options.filter((item) => itemCategory(item) === activeCategory.value),
)

const brandGroups = computed(() => {
  const groups = groupBySeries(activeCategoryItems.value)
  const needle = brandKeyword.value.trim().toLowerCase()
  if (!needle) return groups
  return groups.filter((group) => group.series.toLowerCase().includes(needle))
})

const activeBrandItems = computed(() =>
  activeCategoryItems.value.filter((item) => item.series === activeSeries.value),
)
const filteredActiveItems = computed(() =>
  sortByRecentArrival(filterSettlementOptions(activeBrandItems.value, keyword.value)),
)
const currentPage = computed(() =>
  paginateSettlementOptions(filteredActiveItems.value, page.value, pageSize),
)

function groupMerchantNos(items: SettlementListItem[]): string[] {
  return items.map((item) => item.merchantNo)
}

function itemCategory(item: SettlementListItem): string {
  return item.fruitType?.trim() || UNKNOWN_CATEGORY
}

function lockScroll(locked: boolean) {
  document.body.style.overflow = locked ? 'hidden' : ''
}

function openPicker() {
  draft.value = props.selected.length
    ? normalizeSameSeriesSelection(props.options, props.selected, maxSelect.value)
    : []
  categoryKeyword.value = ''
  brandKeyword.value = ''
  keyword.value = ''
  limitHit.value = false
  page.value = 1
  activeCategory.value = ''
  activeSeries.value = ''
  step.value = 'category'
  open.value = true
  lockScroll(true)
  void nextTick(() => categorySearchInput.value?.focus())
}

function closePicker() {
  open.value = false
  lockScroll(false)
}

function chooseCategory(category: string) {
  const items = props.options.filter((item) => itemCategory(item) === category)
  const merchantNos = new Set(groupMerchantNos(items))
  draft.value = draft.value.filter((merchantNo) => merchantNos.has(merchantNo))
  activeCategory.value = category
  activeSeries.value = ''
  brandKeyword.value = ''
  keyword.value = ''
  page.value = 1
  limitHit.value = false
  step.value = 'brand'
  void nextTick(() => brandSearchInput.value?.focus())
}

function chooseSeries(series: string) {
  const items = activeCategoryItems.value.filter((item) => item.series === series)
  const merchantNos = new Set(groupMerchantNos(items))
  draft.value = draft.value.filter((merchantNo) => merchantNos.has(merchantNo))
  activeSeries.value = series
  keyword.value = ''
  page.value = 1
  limitHit.value = false
  step.value = 'settlement'
  void nextTick(() => settlementSearchInput.value?.focus())
}

function backToCategories() {
  activeCategory.value = ''
  activeSeries.value = ''
  brandKeyword.value = ''
  keyword.value = ''
  page.value = 1
  step.value = 'category'
  void nextTick(() => categorySearchInput.value?.focus())
}

function backToBrands() {
  activeSeries.value = ''
  keyword.value = ''
  page.value = 1
  step.value = 'brand'
  void nextTick(() => brandSearchInput.value?.focus())
}

function confirmSelection() {
  if (props.loading) return
  emit('apply', [...draft.value])
  closePicker()
}

function clearDraft() {
  draft.value = []
}

function toggleDraft(merchantNo: string) {
  const result = toggleDraftSelection(draft.value, merchantNo, maxSelect.value)
  draft.value = result.next
  limitHit.value = result.limited
}

function toggleActiveSeries() {
  const merchantNos = groupMerchantNos(activeBrandItems.value)
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
  if (props.loading) return
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

watch([keyword, filteredActiveItems], () => {
  page.value = 1
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
        <h2 id="settlement-picker-title">选择结算单</h2>
        <p class="section-note">
          已选 {{ selected.length }} / {{ maxSelect }}，先选品类，再选品牌，最后挑同品牌结算单
        </p>
      </div>
      <div class="picker-trigger-actions">
        <button type="button" class="primary-button" :disabled="loading" @click="openPicker">选择结算单</button>
        <button v-if="selected.length" type="button" class="text-button" :disabled="loading" @click="emit('apply', [])">
          清空
        </button>
      </div>
    </header>

    <div class="picker-mobile-actions">
      <button type="button" class="primary-button" :disabled="loading" @click="openPicker">选择结算单</button>
      <button v-if="selected.length" type="button" class="text-button" :disabled="loading" @click="emit('apply', [])">
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
          :disabled="loading"
          @click="removeSelected(item.merchantNo)"
        >
          ×
        </button>
      </li>
    </ul>
    <div v-else class="empty-state compact">
      <strong>还没有选择结算单</strong>
      <span>点右上角「选择结算单」，先选品类，再挑两张及以上。</span>
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
              <h2 id="settlement-picker-dialog-title">选择结算单</h2>
              <p class="section-note">
                {{
                  step === 'category'
                    ? '第一步：先选品类。'
                    : step === 'brand'
                      ? '第二步：再选品牌。'
                      : '第三步：在当前品牌内挑单。'
                }}
                对比只允许同一品牌，最多选 {{ maxSelect }} 张
              </p>
            </div>
            <button type="button" class="text-button" :disabled="loading" @click="closePicker">关闭</button>
          </header>

          <div class="picker-status" aria-live="polite">
            <strong>已选 {{ draft.length }} / {{ maxSelect }}</strong>
            <span v-if="limitHit" class="picker-limit">已选满 {{ maxSelect }} 张，先取消一张再选</span>
            <span v-else-if="step === 'settlement'" class="section-note">
              当前品牌 {{ filteredActiveItems.length }} 张
            </span>
            <span v-else-if="step === 'brand'" class="section-note">
              当前品类 {{ activeCategory }} · {{ brandGroups.length }} 个品牌
            </span>
            <span v-else class="section-note">共 {{ options.length }} 张</span>
          </div>

          <div class="picker-body">
            <div v-if="loading" class="picker-skeleton skeleton-block">正在加载结算单</div>

            <template v-else-if="step === 'category'">
              <label class="picker-search">
                <span class="sr-only">搜索品类</span>
                <input
                  ref="categorySearchInput"
                  v-model="categoryKeyword"
                  type="search"
                  placeholder="搜品类"
                  autocomplete="off"
                >
              </label>
              <div v-if="!categoryGroups.length" class="empty-state compact">
                <strong>没有匹配品类</strong>
                <span>换个品类名再搜，或调整销售日期范围。</span>
              </div>
              <div v-else class="brand-list">
                <button
                  v-for="group in categoryGroups"
                  :key="group.category"
                  type="button"
                  class="brand-option"
                  @click="chooseCategory(group.category)"
                >
                  <strong>{{ group.category }}</strong>
                  <span>{{ group.items.length }} 张</span>
                  <small>
                    {{ group.items.slice(0, 2).map((item) => item.series).join('、') }}
                    {{ group.items.length > 2 ? '…' : '' }}
                  </small>
                </button>
              </div>
            </template>

            <template v-else-if="step === 'brand'">
              <button type="button" class="picker-back" @click="backToCategories">
                ← 返回品类列表
              </button>
              <div class="active-brand">
                <div>
                  <span>当前品类</span>
                  <strong>{{ activeCategory }}</strong>
                </div>
                <span>共 {{ activeCategoryItems.length }} 张</span>
              </div>

              <label class="picker-search">
                <span class="sr-only">搜索品牌</span>
                <input
                  ref="brandSearchInput"
                  v-model="brandKeyword"
                  type="search"
                  placeholder="搜品牌名"
                  autocomplete="off"
                >
              </label>
              <div v-if="!brandGroups.length" class="empty-state compact">
                <strong>没有匹配品牌</strong>
                <span>换个品牌名再搜，或返回品类列表重新选择。</span>
              </div>
              <div v-else class="brand-list">
                <button
                  v-for="group in brandGroups"
                  :key="group.series"
                  type="button"
                  class="brand-option"
                  @click="chooseSeries(group.series)"
                >
                  <strong>{{ group.series }}</strong>
                  <span>{{ group.items.length }} 张</span>
                  <small>
                    {{ group.items.slice(0, 2).map((item) => item.orderNoNormalized || item.orderNo).join('、') }}
                    {{ group.items.length > 2 ? '…' : '' }}
                  </small>
                </button>
              </div>
            </template>

            <template v-else>
              <button type="button" class="picker-back" @click="backToBrands">
                ← 返回品牌列表
              </button>
              <div class="active-brand">
                <div>
                  <span>当前品牌</span>
                  <strong>{{ activeSeries }}</strong>
                </div>
                <span>共 {{ activeBrandItems.length }} 张</span>
              </div>

              <label class="picker-search">
                <span class="sr-only">搜索结算单</span>
                <input
                  ref="settlementSearchInput"
                  v-model="keyword"
                  type="search"
                  placeholder="搜商号、单号或柜号"
                  autocomplete="off"
                >
              </label>

              <div class="settlement-tools">
                <strong>找到 {{ filteredActiveItems.length }} 张</strong>
                <div>
                  <button type="button" class="text-button" :disabled="loading" @click="toggleActiveSeries">
                    {{
                      isWholeSeriesSelected(draft, groupMerchantNos(activeBrandItems))
                        ? '取消本品牌'
                        : '全选本品牌'
                    }}
                  </button>
                  <button type="button" class="text-button" :disabled="loading" @click="clearDraft">清空本品牌</button>
                </div>
              </div>

              <div v-if="!currentPage.items.length" class="empty-state compact">
                <strong>没有匹配的结算单</strong>
                <span>换个商号、单号或柜号再搜。</span>
              </div>
              <div v-else class="series-options">
                <label
                  v-for="item in currentPage.items"
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
                    <span>{{ item.saleDateStart }} 到达</span>
                  </span>
                </label>
              </div>

              <nav v-if="currentPage.pages > 1" class="picker-pagination" aria-label="结算单分页">
                <button type="button" :disabled="currentPage.page <= 1" @click="page -= 1">上一页</button>
                <span>第 {{ currentPage.page }} / {{ currentPage.pages }} 页</span>
                <button
                  type="button"
                  :disabled="currentPage.page >= currentPage.pages"
                  @click="page += 1"
                >
                  下一页
                </button>
              </nav>
            </template>
          </div>

          <footer class="picker-foot">
            <button type="button" class="text-button" :disabled="loading" @click="closePicker">取消</button>
            <button type="button" class="primary-button" :disabled="loading" @click="confirmSelection">
              {{ loading ? '正在更新…' : `确定（${draft.length} 张）` }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>
