const FIXED_FEES = ['代卖佣金', '运费', '车位费', '入场费', '搬运费', '打冷费']
const VARIETIES = ['A', 'B', 'C', 'D', 'E', 'F']

let saleRows = [
  { date: '2026-09-13', variety: 'A', headCount: 4, specKg: 10, salesQuantity: 40, unitPrice: 22.5, remark: '金枕' },
  { date: '2026-09-13', variety: 'B', headCount: 3, specKg: 9, salesQuantity: 27, unitPrice: 18, remark: '' },
]
let afterRows = [
  { content: '破损赔付', summary: '运输破损', amount: 120 },
]
let customFees = []
let fixedFees = FIXED_FEES.map(() => 0)
let activeSheet = { type: null, index: null }
let nextRowId = 100

const salesBody = document.querySelector('#salesBody')
const afterBody = document.querySelector('#afterBody')
const feeBody = document.querySelector('#feeBody')
const toast = document.querySelector('#toast')
const conflictOverlay = document.querySelector('#conflictOverlay')
const mobileSalesList = document.querySelector('#mobileSalesList')
const mobileAfterList = document.querySelector('#mobileAfterList')
const mobileFeeList = document.querySelector('#mobileFeeList')
const mobileSheet = document.querySelector('#mobileSheet')
const sheetBody = document.querySelector('#sheetBody')
const sheetTitle = document.querySelector('#sheetTitle')
const arrivalQuantityInput = document.querySelector('#arrivalQuantity')
const mobileArrivalQuantityInput = document.querySelector('#mobileArrivalQuantity')
const piecesDiff = document.querySelector('#piecesDiff')
const mobilePiecesDiff = document.querySelector('#mobilePiecesDiff')

function formatMoney(value) {
  return Number(value || 0).toFixed(2)
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char])
}

function saleRow(row, index) {
  const id = row.id ?? `sale-${index}`
  return `
    <tr data-sale-index="${index}">
      <td data-label="销售日期"><input type="date" data-field="date" data-index="${index}" value="${row.date}" /></td>
      <td data-label="品种">
        <select class="variety-select" data-field="variety" data-index="${index}">
          ${VARIETIES.map((item) => `<option ${item === row.variety ? 'selected' : ''}>${item}</option>`).join('')}
        </select>
      </td>
      <td data-label="规格（头数）"><input type="number" min="0" step="1" data-field="headCount" data-index="${index}" value="${row.headCount}" /></td>
      <td data-label="规格（KG）"><input type="number" min="0" step="0.01" data-field="specKg" data-index="${index}" value="${row.specKg}" /></td>
      <td data-label="销售数量"><input type="number" min="0" step="0.01" data-field="salesQuantity" data-index="${index}" value="${row.salesQuantity}" /></td>
      <td data-label="单价"><input type="number" min="0" step="0.01" data-field="unitPrice" data-index="${index}" value="${row.unitPrice}" /></td>
      <td class="computed" data-label="金额" data-role="amount"><span>${formatMoney(row.salesQuantity * row.unitPrice)}</span></td>
      <td data-label="备注"><input class="remark-input" type="text" data-field="remark" data-index="${index}" value="${row.remark}" /></td>
      <td data-label="操作"><button class="delete-button" type="button" data-action="remove-sale" data-index="${index}">删除</button></td>
    </tr>
  `
}

function afterRow(row, index) {
  return `
    <tr data-after-index="${index}">
      <td data-label="内容"><input type="text" data-field="content" data-index="${index}" value="${row.content}" /></td>
      <td data-label="摘要"><input type="text" data-field="summary" data-index="${index}" value="${row.summary}" /></td>
      <td data-label="金额"><input type="number" min="0" step="0.01" data-field="afterAmount" data-index="${index}" value="${row.amount}" /></td>
      <td data-label="操作"><button class="delete-button" type="button" data-action="remove-after" data-index="${index}">删除</button></td>
    </tr>
  `
}

function fixedFeeRow(name, index) {
  return `
    <tr class="fee-fixed" data-fee-index="${index}">
      <td data-label="摘要">${name}</td>
      <td data-label="金额"><input type="number" min="0" step="0.01" data-field="fixedFee" data-index="${index}" value="${fixedFees[index]}" /></td>
      <td data-label="操作"></td>
    </tr>
  `
}

function customFeeRow(row, index) {
  return `
    <tr class="fee-custom" data-custom-index="${index}">
      <td data-label="摘要"><input type="text" data-field="customName" data-index="${index}" value="${row.name}" placeholder="其他费用名称" /></td>
      <td data-label="金额"><input type="number" min="0" step="0.01" data-field="customFee" data-index="${index}" value="${row.amount}" /></td>
      <td data-label="操作"><button class="delete-button" type="button" data-action="remove-custom" data-index="${index}">删除</button></td>
    </tr>
  `
}

function renderSales() {
  salesBody.innerHTML = saleRows.map(saleRow).join('')
}

function renderAfter() {
  afterBody.innerHTML = afterRows.map(afterRow).join('')
}

function renderFees() {
  feeBody.innerHTML = FIXED_FEES.map(fixedFeeRow).join('') + customFees.map(customFeeRow).join('')
}

function saleQuantity(row) {
  return Number(row.salesQuantity || 0)
}

function saleAmount(row) {
  return saleQuantity(row) * Number(row.unitPrice || 0)
}

function mobileSaleRow(row, index) {
  const remark = row.remark
    ? `<div class="mobile-row-remark">备注：${escapeHtml(row.remark)}</div>`
    : ''
  return `
    <div class="mobile-row">
      <div class="mobile-row-main">
        <div class="mobile-row-title">
          <span class="variety-pill">${escapeHtml(row.variety)}</span>
          <strong>${formatMoney(saleQuantity(row))} KG</strong>
          <em>¥${formatMoney(saleAmount(row))}</em>
        </div>
        <div class="mobile-row-meta">${escapeHtml(row.date)} · 规格（头数）${escapeHtml(row.headCount)} · ${escapeHtml(row.specKg)}KG · 销售数量 ${formatMoney(row.salesQuantity)} · ¥${formatMoney(row.unitPrice)}</div>
        ${remark}
      </div>
      <div class="mobile-row-actions">
        <button type="button" data-action="mobile-edit-sale" data-index="${index}">编辑</button>
        <button type="button" data-action="mobile-remove-sale" data-index="${index}">删除</button>
      </div>
    </div>
  `
}

function mobileAfterRow(row, index) {
  return `
    <div class="mobile-row">
      <div class="mobile-row-main">
        <div class="mobile-row-title">
          <strong>${escapeHtml(row.content || '未填写内容')}</strong>
          <em>-¥${formatMoney(row.amount)}</em>
        </div>
        <div class="mobile-row-meta">${escapeHtml(row.summary || '无摘要')}</div>
      </div>
      <div class="mobile-row-actions">
        <button type="button" data-action="mobile-edit-after" data-index="${index}">编辑</button>
        <button type="button" data-action="mobile-remove-after" data-index="${index}">删除</button>
      </div>
    </div>
  `
}

function mobileCustomFeeRow(row, index) {
  return `
    <div class="mobile-row">
      <div class="mobile-row-main">
        <div class="mobile-row-title"><strong>${escapeHtml(row.name || '其他费用')}</strong><em>¥${formatMoney(row.amount)}</em></div>
      </div>
      <div class="mobile-row-actions">
        <button type="button" data-action="mobile-edit-fee" data-index="${index}">编辑</button>
        <button type="button" data-action="mobile-remove-fee" data-index="${index}">删除</button>
      </div>
    </div>
  `
}

function renderMobileSales() {
  mobileSalesList.innerHTML = saleRows.length
    ? saleRows.map(mobileSaleRow).join('')
    : '<div class="mobile-empty">暂无销售明细，请添加一行</div>'
}

function renderMobileAfter() {
  mobileAfterList.innerHTML = afterRows.length
    ? afterRows.map(mobileAfterRow).join('')
    : '<div class="mobile-empty">暂无售后明细</div>'
}

function renderMobileFees() {
  const fixedGrid = `
    <div class="mobile-fee-grid">
      ${FIXED_FEES.map((name, index) => `
        <label>${name}<input type="number" min="0" step="0.01" data-mobile-fixed-fee="${index}" value="${fixedFees[index]}" /></label>
      `).join('')}
    </div>
  `
  const customRows = customFees.map(mobileCustomFeeRow).join('')
  mobileFeeList.innerHTML = fixedGrid + customRows
}

function renderMobile() {
  renderMobileSales()
  renderMobileAfter()
  renderMobileFees()
  refreshMobileTotals()
}

function refreshMobileTotals() {
  const totals = computeTotals()
  document.querySelector('#mobileTotalPieces').textContent = String(totals.totalPieces)
  document.querySelector('#mobileSalesAmount').textContent = formatMoney(totals.salesAmount)
  document.querySelector('#mobileAfterAmount').textContent = formatMoney(totals.afterAmount)
  document.querySelector('#mobileFeeAmount').textContent = formatMoney(totals.feeAmount)
  document.querySelector('#mobilePayable').textContent = formatMoney(totals.payable)
  document.querySelector('#mobileSummarySales').textContent = formatMoney(totals.salesAmount)
  document.querySelector('#mobileSummaryAfter').textContent = formatMoney(totals.afterAmount)
  document.querySelector('#mobileGoodsAmount').textContent = formatMoney(totals.goodsAmount)
  document.querySelector('#mobileSummaryFee').textContent = formatMoney(totals.feeAmount)
}

function updatePiecesDiff(totalPieces) {
  const desktopDiff = readNumber(arrivalQuantityInput) - totalPieces
  piecesDiff.textContent = desktopDiff === 0 ? '' : `差异 ${desktopDiff > 0 ? '+' : ''}${desktopDiff} 件`
  piecesDiff.hidden = desktopDiff === 0

  const mobileDiff = readNumber(mobileArrivalQuantityInput) - totalPieces
  mobilePiecesDiff.textContent = mobileDiff === 0 ? '' : `差异 ${mobileDiff > 0 ? '+' : ''}${mobileDiff} 件`
  mobilePiecesDiff.hidden = mobileDiff === 0
}

function readNumber(input) {
  const value = Number(input.value)
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function computeTotals() {
  let totalPieces = 0
  let salesAmount = 0
  saleRows.forEach((row) => {
    const quantity = Number(row.salesQuantity || 0)
    const amount = quantity * Number(row.unitPrice || 0)
    totalPieces += Number(row.headCount || 0)
    salesAmount += amount
  })
  const afterAmount = afterRows.reduce((total, row) => total + Number(row.amount || 0), 0)
  const feeAmount = fixedFees.reduce((total, value) => total + Number(value || 0), 0)
    + customFees.reduce((total, row) => total + Number(row.amount || 0), 0)
  const goodsAmount = salesAmount - afterAmount
  const payable = salesAmount - afterAmount - feeAmount
  return { totalPieces, salesAmount, afterAmount, feeAmount, goodsAmount, payable }
}

function refreshTotals() {
  const totals = computeTotals()

  salesBody.querySelectorAll('tr').forEach((tr, index) => {
    const row = saleRows[index]
    const amount = Number(row.salesQuantity || 0) * Number(row.unitPrice || 0)
    tr.querySelector('[data-role="amount"] span').textContent = formatMoney(amount)
  })

  document.querySelector('#totalPieces').textContent = String(totals.totalPieces)
  document.querySelector('#salesAmount').textContent = formatMoney(totals.salesAmount)
  document.querySelector('#afterAmount').textContent = formatMoney(totals.afterAmount)
  document.querySelector('#feeAmount').textContent = formatMoney(totals.feeAmount)
  document.querySelector('#summarySales').textContent = formatMoney(totals.salesAmount)
  document.querySelector('#summaryAfter').textContent = formatMoney(totals.afterAmount)
  document.querySelector('#summaryGoods').textContent = formatMoney(totals.goodsAmount)
  document.querySelector('#summaryFee').textContent = formatMoney(totals.feeAmount)
  document.querySelector('#summaryPayable').textContent = formatMoney(totals.payable)

  updatePiecesDiff(totals.totalPieces)
  refreshMobileTotals()
}

function syncInput(event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return

  const field = target.dataset.field
  const index = Number(target.dataset.index)

  if (field === 'date') saleRows[index].date = target.value
  if (field === 'variety') saleRows[index].variety = target.value
  if (field === 'headCount') saleRows[index].headCount = readNumber(target)
  if (field === 'specKg') saleRows[index].specKg = readNumber(target)
  if (field === 'salesQuantity') saleRows[index].salesQuantity = readNumber(target)
  if (field === 'unitPrice') saleRows[index].unitPrice = readNumber(target)
  if (field === 'remark') saleRows[index].remark = target.value
  if (field === 'content') afterRows[index].content = target.value
  if (field === 'summary') afterRows[index].summary = target.value
  if (field === 'afterAmount') afterRows[index].amount = readNumber(target)
  if (field === 'fixedFee') fixedFees[index] = readNumber(target)
  if (field === 'customName') customFees[index].name = target.value
  if (field === 'customFee') customFees[index].amount = readNumber(target)

  refreshTotals()
}

function addSale() {
  saleRows.push({ date: '2026-09-14', variety: 'A', headCount: 1, specKg: 10, salesQuantity: 0, unitPrice: 20, remark: '' })
  renderSales()
  renderMobileSales()
  refreshTotals()
}

function addAfter() {
  afterRows.push({ content: '', summary: '', amount: 0 })
  renderAfter()
  renderMobileAfter()
  refreshTotals()
}

function addCustomFee() {
  customFees.push({ name: '', amount: 0 })
  renderFees()
  renderMobileFees()
  refreshTotals()
}

function removeSale(index) {
  saleRows = saleRows.filter((_, itemIndex) => itemIndex !== index)
  renderSales()
  renderMobileSales()
  refreshTotals()
}

function removeAfter(index) {
  afterRows = afterRows.filter((_, itemIndex) => itemIndex !== index)
  renderAfter()
  renderMobileAfter()
  refreshTotals()
}

function removeCustom(index) {
  customFees = customFees.filter((_, itemIndex) => itemIndex !== index)
  renderFees()
  renderMobileFees()
  refreshTotals()
}

function showToast(message) {
  toast.textContent = message
  toast.hidden = false
  window.clearTimeout(showToast.timer)
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true
  }, 1800)
}

function openSheet(type, index = null) {
  activeSheet = { type, index }
  const isSale = type === 'sale'
  const isAfter = type === 'after'
  const isFee = type === 'fee'
  const row = isSale
    ? saleRows[index ?? saleRows.length]
    : isAfter
      ? afterRows[index ?? afterRows.length]
      : customFees[index ?? customFees.length]

  sheetTitle.textContent = index === null
    ? (isSale ? '添加销售' : isAfter ? '添加售后' : '添加其他费用')
    : (isSale ? '编辑销售' : isAfter ? '编辑售后' : '编辑其他费用')

  if (isSale) {
    const amount = index === null ? 0 : saleAmount(row)
    sheetBody.innerHTML = `
      <label class="sheet-field">销售日期<input id="sheetDate" type="date" value="${index === null ? '2026-09-14' : escapeHtml(row.date)}" /></label>
      <label class="sheet-field">品种<select id="sheetVariety">${VARIETIES.map((item) => `<option ${item === (index === null ? 'A' : row.variety) ? 'selected' : ''}>${item}</option>`).join('')}</select></label>
      <label class="sheet-field">规格（头数）<input id="sheetHeadCount" type="number" min="0" step="1" value="${index === null ? 1 : row.headCount}" /></label>
      <label class="sheet-field">规格（KG）<input id="sheetSpecKg" type="number" min="0" step="0.01" value="${index === null ? 10 : row.specKg}" /></label>
      <label class="sheet-field">销售数量<input id="sheetSalesQuantity" type="number" min="0" step="0.01" value="${index === null ? 0 : row.salesQuantity}" /></label>
      <label class="sheet-field">单价<input id="sheetUnitPrice" type="number" min="0" step="0.01" value="${index === null ? 20 : row.unitPrice}" /></label>
      <label class="sheet-field">备注<input id="sheetRemark" type="text" value="${index === null ? '' : escapeHtml(row.remark)}" /></label>
      <div class="sheet-calc" id="sheetCalc">金额 <strong>¥${formatMoney(amount)}</strong></div>
    `
  } else if (isAfter) {
    sheetBody.innerHTML = `
      <label class="sheet-field">内容<input id="sheetContent" type="text" value="${index === null ? '' : escapeHtml(row.content)}" placeholder="例如：破损赔付" /></label>
      <label class="sheet-field">摘要<input id="sheetSummary" type="text" value="${index === null ? '' : escapeHtml(row.summary)}" placeholder="例如：运输破损" /></label>
      <label class="sheet-field">金额<input id="sheetAmount" type="number" min="0" step="0.01" value="${index === null ? 0 : row.amount}" /></label>
    `
  } else {
    sheetBody.innerHTML = `
      <label class="sheet-field">费用名称<input id="sheetFeeName" type="text" value="${index === null ? '' : escapeHtml(row.name)}" placeholder="例如：装卸费" /></label>
      <label class="sheet-field">金额<input id="sheetFeeAmount" type="number" min="0" step="0.01" value="${index === null ? 0 : row.amount}" /></label>
    `
  }

  mobileSheet.hidden = false
}

function closeSheet() {
  mobileSheet.hidden = true
  activeSheet = { type: null, index: null }
}

function saveSheet() {
  const { type, index } = activeSheet
  if (type === 'sale') {
    const row = {
      date: document.querySelector('#sheetDate').value,
      variety: document.querySelector('#sheetVariety').value,
      headCount: readNumber(document.querySelector('#sheetHeadCount')),
      specKg: readNumber(document.querySelector('#sheetSpecKg')),
      salesQuantity: readNumber(document.querySelector('#sheetSalesQuantity')),
      unitPrice: readNumber(document.querySelector('#sheetUnitPrice')),
      remark: document.querySelector('#sheetRemark').value,
    }
    if (!row.date || !row.variety || row.headCount <= 0 || row.specKg <= 0 || row.salesQuantity <= 0 || row.unitPrice <= 0) {
      showToast('请完整填写销售日期、品种、规格（头数）、规格（KG）、销售数量和单价')
      return
    }
    if (index === null) saleRows.push(row)
    else saleRows[index] = row
    renderSales()
    renderMobileSales()
  } else if (type === 'after') {
    const row = {
      content: document.querySelector('#sheetContent').value.trim(),
      summary: document.querySelector('#sheetSummary').value.trim(),
      amount: readNumber(document.querySelector('#sheetAmount')),
    }
    if (!row.content || row.amount <= 0) {
      showToast('请填写售后内容和金额')
      return
    }
    if (index === null) afterRows.push(row)
    else afterRows[index] = row
    renderAfter()
    renderMobileAfter()
  } else if (type === 'fee') {
    const row = {
      name: document.querySelector('#sheetFeeName').value.trim(),
      amount: readNumber(document.querySelector('#sheetFeeAmount')),
    }
    if (!row.name || row.amount <= 0) {
      showToast('请填写费用名称和金额')
      return
    }
    if (index === null) customFees.push(row)
    else customFees[index] = row
    renderFees()
    renderMobileFees()
  }
  closeSheet()
  refreshTotals()
}

function updateSheetCalc() {
  if (activeSheet.type !== 'sale') return
  const salesQuantity = readNumber(document.querySelector('#sheetSalesQuantity'))
  const unitPrice = readNumber(document.querySelector('#sheetUnitPrice'))
  const amount = salesQuantity * unitPrice
  const calc = document.querySelector('#sheetCalc')
  if (calc) calc.innerHTML = `金额 <strong>¥${formatMoney(amount)}</strong>`
}

document.addEventListener('input', syncInput)
document.addEventListener('change', syncInput)

arrivalQuantityInput.addEventListener('input', () => {
  mobileArrivalQuantityInput.value = arrivalQuantityInput.value
  refreshTotals()
})

mobileArrivalQuantityInput.addEventListener('input', () => {
  arrivalQuantityInput.value = mobileArrivalQuantityInput.value
  refreshTotals()
})

document.querySelector('#addSale').addEventListener('click', addSale)
document.querySelector('#addAfter').addEventListener('click', addAfter)
document.querySelector('#addCustomFee').addEventListener('click', addCustomFee)
document.querySelector('#mobileAddSale').addEventListener('click', () => openSheet('sale'))
document.querySelector('#mobileAddAfter').addEventListener('click', () => openSheet('after'))
document.querySelector('#mobileAddCustomFee').addEventListener('click', () => openSheet('fee'))
document.querySelector('#mobileSaveEntry').addEventListener('click', () => {
  conflictOverlay.hidden = false
})
document.querySelector('#sheetClose').addEventListener('click', closeSheet)
document.querySelector('#sheetCancel').addEventListener('click', closeSheet)
document.querySelector('#sheetSave').addEventListener('click', saveSheet)

sheetBody.addEventListener('input', updateSheetCalc)
sheetBody.addEventListener('change', updateSheetCalc)

mobileFeeList.addEventListener('input', (event) => {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  if (target.dataset.mobileFixedFee !== undefined) {
    fixedFees[Number(target.dataset.mobileFixedFee)] = readNumber(target)
    refreshTotals()
  }
})

document.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('button') : null
  if (!button) return
  const action = button.dataset.action
  const index = Number(button.dataset.index)
  if (action === 'remove-sale') removeSale(index)
  if (action === 'remove-after') removeAfter(index)
  if (action === 'remove-custom') removeCustom(index)
  if (action === 'mobile-edit-sale') openSheet('sale', index)
  if (action === 'mobile-remove-sale') removeSale(index)
  if (action === 'mobile-edit-after') openSheet('after', index)
  if (action === 'mobile-remove-after') removeAfter(index)
  if (action === 'mobile-edit-fee') openSheet('fee', index)
  if (action === 'mobile-remove-fee') removeCustom(index)
})

document.querySelector('#saveEntry').addEventListener('click', () => {
  conflictOverlay.hidden = false
})

document.querySelector('#cancelConflict').addEventListener('click', () => {
  conflictOverlay.hidden = true
})

document.querySelector('#confirmConflict').addEventListener('click', () => {
  conflictOverlay.hidden = true
  document.querySelectorAll('.status-badge').forEach((badge) => {
    badge.textContent = '已保存'
  })
  showToast('已保存，正在跳转结算单详情（静态演示）')
})

document.querySelector('#exportPreview').addEventListener('click', () => {
  showToast('导出将按结算单模板版式生成，且不保留 Excel 公式')
})

function setMode(mode) {
  document.querySelector('.entry-shell').dataset.mode = mode
  document.querySelectorAll('.preview-toolbar button').forEach((item) => {
    item.setAttribute('aria-pressed', String(item.dataset.width === mode))
  })
  if (mode === 'mobile') renderMobile()
  else closeSheet()
}

document.querySelectorAll('.preview-toolbar button').forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.width === 'mobile' ? 'mobile' : 'desktop'))
})

const mobileMedia = window.matchMedia('(max-width: 640px)')
mobileMedia.addEventListener('change', (event) => {
  if (event.matches) setMode('mobile')
})
if (mobileMedia.matches) setMode('mobile')

renderSales()
renderAfter()
renderFees()
renderMobile()
refreshTotals()
