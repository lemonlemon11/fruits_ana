const { MAX, PAGE_SIZE, brandConfigs, settlements } = window.SETTLEMENT_DEMO

const state = {
  open: false,
  activeBrand: null,
  draft: [],
  selected: [],
  brandKeyword: '',
  keyword: '',
  page: 1,
  pageSize: PAGE_SIZE,
}

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => Array.from(document.querySelectorAll(selector))

const overlay = $('#pickerOverlay')
const stage = $('#stage')
const openPickerButton = $('#openPicker')
const closePickerButton = $('#closePicker')
const cancelPickerButton = $('#cancelPicker')
const confirmPickerButton = $('#confirmPicker')
const backButton = $('#backToBrand')
const stepBrand = $('#stepBrand')
const stepSettlement = $('#stepSettlement')
const drawerStepTitle = $('#drawerStepTitle')
const drawerHint = $('#drawerHint')
const activeBrandName = $('#activeBrandName')
const activeBrandCount = $('#activeBrandCount')
const brandSearch = $('#brandSearch')
const settlementSearch = $('#settlementSearch')
const brandList = $('#brandList')
const settlementList = $('#settlementList')
const selectedChips = $('#selectedChips')
const emptySelection = $('#emptySelection')
const pageNotice = $('#pageNotice')
const selectedCount = $('#selectedCount')
const draftCount = $('#draftCount')
const pageInfo = $('#pageInfo')
const prevPage = $('#prevPage')
const nextPage = $('#nextPage')
const selectAllBrand = $('#selectAllBrand')
const clearBrandDraft = $('#clearBrandDraft')
const clearSelection = $('#clearSelection')

const brandStats = brandConfigs.map((config) => {
  const items = settlements.filter((item) => item.series === config.name)
  return { name: config.name, count: config.count, items }
})

function brandItems(name) {
  return settlements.filter((item) => item.series === name)
}

function filteredBrands() {
  const needle = state.brandKeyword.trim().toLowerCase()
  if (!needle) return brandStats
  return brandStats.filter((brand) => brand.name.toLowerCase().includes(needle))
}

function filteredSettlements() {
  const items = brandItems(state.activeBrand || '')
  const needle = state.keyword.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) =>
    [item.merchantNo, item.orderNo, item.containerNo].some((value) =>
      String(value).toLowerCase().includes(needle),
    ),
  )
}

function pageItems() {
  const items = filteredSettlements()
  const start = (state.page - 1) * state.pageSize
  return { items: items.slice(start, start + state.pageSize), total: items.length, pages: Math.max(1, Math.ceil(items.length / state.pageSize)) }
}

function openPicker() {
  state.open = true
  state.activeBrand = null
  state.brandKeyword = ''
  state.keyword = ''
  state.page = 1
  state.draft = [...state.selected]
  brandSearch.value = ''
  settlementSearch.value = ''
  overlay.hidden = false
  document.body.style.overflow = 'hidden'
  showBrandStep()
  renderBrands()
  renderFooter()
  brandSearch.focus()
}

function closePicker() {
  state.open = false
  overlay.hidden = true
  document.body.style.overflow = ''
}

function showBrandStep() {
  stepBrand.hidden = false
  stepSettlement.hidden = true
  drawerStepTitle.textContent = '第一步：选择品牌'
  drawerHint.textContent = '对比只能在一个品牌内进行。'
}

function showSettlementStep(brandName) {
  state.activeBrand = brandName
  state.keyword = ''
  state.page = 1
  settlementSearch.value = ''
  const items = brandItems(brandName)
  const brand = brandStats.find((item) => item.name === brandName)
  const kept = state.draft.filter((merchantNo) =>
    items.some((item) => item.merchantNo === merchantNo),
  )
  const hasOtherBrand = kept.length !== state.draft.length
  state.draft = kept
  stepBrand.hidden = true
  stepSettlement.hidden = false
  drawerStepTitle.textContent = '第二步：选择结算单'
  drawerHint.textContent = hasOtherBrand ? '已自动清空其他品牌的草稿。' : '只显示当前品牌下的结算单。'
  activeBrandName.textContent = brand?.name || brandName
  activeBrandCount.textContent = `共 ${brand?.count || items.length} 张`
  renderSettlements()
  renderFooter()
}

function toggleDraft(merchantNo) {
  if (state.draft.includes(merchantNo)) {
    state.draft = state.draft.filter((item) => item !== merchantNo)
  } else if (state.draft.length < MAX) {
    state.draft = [...state.draft, merchantNo]
  }
  renderSettlements()
  renderFooter()
}

function renderBrands() {
  const brands = filteredBrands()
  brandList.innerHTML = brands.length
    ? brands.map((brand) => `
      <button type="button" class="brand-option ${state.activeBrand === brand.name ? 'is-active' : ''}" data-brand="${brand.name}">
        <strong>${brand.name}</strong>
        <span>${brand.count} 张</span>
        <small>${brand.items.slice(0, 2).map((item) => item.orderNo).join('、')}${brand.count > 2 ? '…' : ''}</small>
      </button>
    `).join('')
    : '<div class="app-empty"><strong>没有匹配品牌</strong><span>换个品牌名再搜。</span></div>'
  $$('.brand-option').forEach((button) => {
    button.addEventListener('click', () => showSettlementStep(button.dataset.brand || ''))
  })
}

function settlementLabel(item) {
  return `商号 ${item.merchantNo}（${item.orderNo}）`
}

function renderSettlements() {
  const all = filteredSettlements()
  const pages = Math.max(1, Math.ceil(all.length / state.pageSize))
  state.page = Math.min(state.page, pages)
  const start = (state.page - 1) * state.pageSize
  const items = all.slice(start, start + state.pageSize)
  const total = all.length
  settlementList.innerHTML = items.length
    ? items.map((item) => {
        const isSelected = state.draft.includes(item.merchantNo)
        return `
        <label class="settlement-option ${isSelected ? 'is-selected' : ''}">
          <input type="checkbox" data-merchant="${item.merchantNo}" ${isSelected ? 'checked' : ''} ${state.draft.length >= MAX && !isSelected ? 'disabled' : ''} />
          <span>
            <strong>${settlementLabel(item)}</strong>
            <small>${item.saleDate} 到达 · 柜号 ${item.containerNo}</small>
          </span>
          <em>${item.totalQuantity} 件 · ¥${item.averagePrice}</em>
        </label>
      `}).join('')
    : '<div class="app-empty"><strong>没有匹配的结算单</strong><span>换个商号、单号或柜号再搜。</span></div>'
  $$('.settlement-option input').forEach((input) => {
    input.addEventListener('change', () => toggleDraft(input.dataset.merchant || ''))
  })
  pageInfo.textContent = `第 ${state.page} / ${pages} 页 · 共 ${total} 张`
  prevPage.disabled = state.page <= 1
  nextPage.disabled = state.page >= pages
}

function renderFooter() {
  draftCount.textContent = String(state.draft.length)
  confirmPickerButton.textContent = `确定（${state.draft.length} 张）`
  confirmPickerButton.disabled = state.draft.length < 2
}

function renderMain() {
  const selectedItems = state.selected
    .map((merchantNo) => settlements.find((item) => item.merchantNo === merchantNo))
    .filter(Boolean)
  selectedCount.textContent = String(state.selected.length)
  selectedChips.innerHTML = selectedItems
    .map((item) => `
      <li>
        <span>${settlementLabel(item)}</span>
        <button type="button" data-remove="${item.merchantNo}" aria-label="移除 ${settlementLabel(item)}">×</button>
      </li>
    `).join('')
  emptySelection.hidden = selectedItems.length > 0
  selectedChips.hidden = selectedItems.length === 0
  pageNotice.textContent = state.selected.length >= 2
    ? `已选择「${selectedItems[0]?.series}」品牌的 ${state.selected.length} 张结算单，结果将按同品牌口径汇总。`
    : '请选择同一个品牌下的至少 2 张结算单。'
  pageNotice.classList.toggle('is-ready', state.selected.length >= 2)
  clearSelection.hidden = state.selected.length === 0
  $$('.app-chips button').forEach((button) => {
    button.addEventListener('click', () => {
      state.selected = state.selected.filter((merchantNo) => merchantNo !== button.dataset.remove)
      renderMain()
    })
  })
}

function selectAllCurrentBrand() {
  const items = filteredSettlements().filter((item) => !state.draft.includes(item.merchantNo))
  const room = MAX - state.draft.length
  state.draft = [...state.draft, ...items.slice(0, room).map((item) => item.merchantNo)]
  renderSettlements()
  renderFooter()
}

openPickerButton.addEventListener('click', openPicker)
closePickerButton.addEventListener('click', closePicker)
cancelPickerButton.addEventListener('click', closePicker)
clearSelection.addEventListener('click', () => {
  state.selected = []
  renderMain()
})

backButton.addEventListener('click', () => {
  state.activeBrand = null
  state.brandKeyword = ''
  brandSearch.value = ''
  showBrandStep()
  renderBrands()
  renderFooter()
})

brandSearch.addEventListener('input', () => {
  state.brandKeyword = brandSearch.value
  renderBrands()
})

settlementSearch.addEventListener('input', () => {
  state.keyword = settlementSearch.value
  state.page = 1
  renderSettlements()
})

prevPage.addEventListener('click', () => {
  state.page = Math.max(1, state.page - 1)
  renderSettlements()
})

nextPage.addEventListener('click', () => {
  state.page += 1
  renderSettlements()
})

selectAllBrand.addEventListener('click', selectAllCurrentBrand)
clearBrandDraft.addEventListener('click', () => {
  state.draft = []
  renderSettlements()
  renderFooter()
})

confirmPickerButton.addEventListener('click', () => {
  state.selected = [...state.draft]
  renderMain()
  closePicker()
})

overlay.addEventListener('click', (event) => {
  if (event.target === overlay) closePicker()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.open) closePicker()
})

$$('.vp-device-toggle button').forEach((button) => {
  button.addEventListener('click', () => {
    $$('.vp-device-toggle button').forEach((item) => item.classList.toggle('is-active', item === button))
    stage.classList.toggle('is-mobile', button.dataset.device === 'mobile')
  })
})

renderMain()
