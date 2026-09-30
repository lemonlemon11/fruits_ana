import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const review = fs.readFileSync(path.join(root, 'views', 'ImportReviewView.vue'), 'utf8')
const entry = fs.readFileSync(path.join(root, 'views', 'EntryView.vue'), 'utf8')
const moneyInput = fs.readFileSync(path.join(root, 'components', 'MoneyInput.vue'), 'utf8')

test('导入二次确认数量字段使用“数量（件）”文案', () => {
  assert.match(review, /label: '数量（件）'/)
  assert.doesNotMatch(review, /label: '销售数量'/)
  assert.match(review, /aria-label="数量（件）"/)
  assert.match(review, /总件数/)
})

test('导入二次确认品种保留用户原文输入，不使用下拉选择', () => {
  const varietyCell = review.match(/<template #cell-variety="\{ row \}">([\s\S]*?)<\/template>/)?.[1] ?? ''
  assert.match(varietyCell, /<ElInput v-if="!isReadonly" v-model="row\.variety"/)
  assert.doesNotMatch(varietyCell, /<ElSelect[^>]*v-model="row\.variety"/)
})

test('只读查看明细以纯文本呈现记录，不再满屏灰色禁用输入框', () => {
  assert.doesNotMatch(review, /:disabled="isReadonly"/)
  assert.match(review, /class="field-static"/)
  assert.match(review, /class="cell-text"/)
  // 编辑态（导入二次确认）的输入控件原样保留。
  assert.match(review, /<ElInput v-if="!isReadonly" v-model="row\.variety"/)
  assert.match(review, /aria-label="数量（件）"/)
})

test('查看明细销售明细按导出同口径合并展示，表头与单元格居中', () => {
  // 合并键与后端导出 _merge_sales_rows 一致：同日/品种/等级/规格头数/KG/单价/备注。
  assert.match(review, /const displaySalesRows = computed<EntrySaleItem\[\]>\(\(\) => \{/)
  assert.match(review, /\[row\.saleDate, row\.variety, row\.grade, row\.headCount, row\.specKg, row\.unitPrice, row\.remark\]/)
  // 数量与原文件金额各自汇总；显示金额按 数量×单价 重算，合计走原始行 totals。
  assert.match(review, /hit\.salesQuantity = Number\(hit\.salesQuantity \|\| 0\) \+ Number\(row\.salesQuantity \|\| 0\)/)
  assert.match(review, /hit\.amount = Number\(hit\.amount \|\| 0\) \+ Number\(row\.amount \|\| 0\)/)
  // 表格绑定合并行，行数随只读态显示合并后计数。
  assert.match(review, /:rows="displaySalesRows"/)
  assert.match(review, /const displaySalesCount = computed/)
  // 只读态三张表（销售/售后/支出费用）表头与单元格居中，编辑态保持默认对齐。
  assert.match(review, /function centerColumns<Row>\(columns: DataTableColumn<Row>\[\]\): DataTableColumn<Row>\[\] \{/)
  assert.match(review, /columns\.map\(\(column\) => \(\{ \.\.\.column, align: 'center' as const \}\)\)/)
  assert.match(review, /const saleColumns = computed<DataTableColumn<EntrySaleItem>\[\]>\(\(\) => centerColumns\(\[/)
  assert.match(review, /const afterSaleColumns = computed<DataTableColumn<EntryAfterSaleItem>\[\]>\(\(\) => centerColumns\(\[/)
  assert.match(review, /const feeColumns = computed<DataTableColumn<EntryFeeItem>\[\]>\(\(\) => centerColumns\(\[/)
})

test('导入二次确认不合并行：文件是什么行就展示什么行（用户 2026-09-30 定稿）', () => {
  // 编辑态直接返回原始行，无合并组 / 展开机制；合并仅保留在「查看明细」只读态与导出口径。
  assert.match(review, /if \(!isReadonly\.value\) return form\.sales/)
  assert.doesNotMatch(review, /mergeSalesRows/)
  assert.doesNotMatch(review, /toggleSaleGroup/)
  assert.doesNotMatch(review, /SaleGroupRow/)
  assert.doesNotMatch(review, /含错误 · 已展开/)
  // 逐行展示也要看全不拖动：去掉 1080px 最小宽强制，列宽全部按内容自适应。
  assert.doesNotMatch(review, /min-width="1080px"/)
})

test('导入二次确认头部只保留「结算单」一栏，「待确认文件」头部已删除', () => {
  assert.doesNotMatch(review, /<label>待确认文件<\/label>/)
  assert.match(review, /<label>结算单<\/label>/)
  // 多文件任务的文件切换下拉并入「结算单」栏，单文件不显示。
  assert.match(review, /v-if="!isReadonly && \(job\?\.drafts\.length \?\? 0\) > 1"/)
})

test('错误行底色标红在编辑态可见：行内输入框透出红底', () => {
  assert.match(review, /\.review-table :deep\(tbody tr\.row-invalid \.el-input__wrapper\),/)
  assert.match(review, /tr\.row-invalid \.el-date-editor\.el-input \.el-input__wrapper\) \{ background: #ffd9d6; \}/)
})

test('改完立马重审：失焦快速重校验 + 版本守卫丢弃乱序旧响应', () => {
  assert.match(review, /function revalidateSoon\(\) \{/)
  assert.match(review, /scheduleRevalidate\(200\)/)
  assert.match(review, /@focusout="revalidateSoon"/)
  assert.match(review, /value\.version >= appliedDraftVersion/)
})

test('单价/售后金额/费用金额失焦后按两位小数展示', () => {
  // MoneyInput：失焦展示 toFixed(2)，聚焦回显原值；失焦同时四舍五入到分。
  assert.match(review, /<MoneyInput v-if="!isReadonly" v-model="row\.unitPrice"/)
  assert.match(review, /<MoneyInput v-if="!isReadonly" v-model="row\.amount" :class="cellClass\('after_sales'/)
  assert.match(review, /<MoneyInput v-if="!isReadonly" v-model="row\.amount" :class="cellClass\('fees'/)
  assert.match(moneyInput, /roundMoney\(Number\(props\.modelValue \|\| 0\)\)\.toFixed\(2\)/)
  assert.match(moneyInput, /emit\('update:modelValue', roundMoney\(Number\(props\.modelValue \|\| 0\)\)\)/)
})

test('编辑态列宽按内容自适应：日期控件不再以固有宽撑出容器', () => {
  assert.match(review, /\.review-table :deep\(\.el-date-editor\.el-input\) \{ width: 100%; \}/)
  assert.match(review, /\{ key: 'actions', label: '操作', width: '72px' \}/)
})

test('二次确认弹窗三表启用 fit-width 确定性列宽，弹窗加宽到 1560px', () => {
  // EP 表格在弹窗里挂载瞬间把容器量得偏大且不自愈，弹性分配撑出可视区——
  // 三表全部走确定性列宽（放得下也铺满、放不下压缩、连表头都放不下才横滚）。
  assert.doesNotMatch(review, /:fit-width="isReadonly"/)
  assert.match(review, /caption="售后明细二次确认"\s*\n\s*fit-width/)
  assert.match(review, /caption="支出费用二次确认"\s*\n\s*fit-width/)
  assert.doesNotMatch(review, /min-width="640px"/)
  assert.doesNotMatch(review, /min-width="540px"/)
  assert.match(review, /width: min\(1560px, 100%\)/)
})

test('DataTable fitWidth 放得下时也输出确定性列宽（不交回 EP 弹性）', () => {
  const dataTable = fs.readFileSync(path.join(root, 'components', 'DataTable.vue'), 'utf8')
  assert.match(dataTable, /放得下也要输出确定性列宽/)
  assert.match(dataTable, /stretched\[widestKey\] \+= budget - used/)
})

test('结算核对内容统一居左，不再右对齐文件填写/系统计算列', () => {
  assert.doesNotMatch(review, /\.summary-line span:nth-child\(n\+2\) \{ text-align: right; \}/)
})

test('保存前取消挂起的自动重校验，避免与保存 PUT 并发叠车', () => {
  // 点「确认提交」时失焦重校验可能已排上 200ms 定时器；保存前先取消，
  // 且保存进行中（saving）不再发起新的重校验——远程库 PUT 慢，叠发会拖到超时。
  assert.match(review, /function cancelRevalidate\(\) \{/)
  assert.match(review, /cancelRevalidate\(\)\s*const value = await updateImportDraft/)
  assert.match(review, /if \(!draft\.value \|\| isReadonly\.value \|\| saving\.value\) return/)
})

test('查看明细不显示「只读查看」状态提示条（用户要求删除）', () => {
  // 状态条只服务导入二次确认（问题计数 / 定位问题），只读态整块不渲染。
  assert.match(review, /<div v-if="!isReadonly" class="status-panel"/)
  assert.doesNotMatch(review, /已入库结算单 · 只读查看/)
  assert.doesNotMatch(review, /该页面仅用于查看，不能修改或重新提交/)
})

test('查看明细（只读）整页展示：无遮罩无弹窗语义，编辑态保持弹窗', () => {
  // 根容器按只读 / 编辑分流：只读＝普通页面流（随页签页面滚动），编辑＝原弹窗遮罩。
  assert.match(review, /:class="isReadonly \? 'review-page' : 'review-modal'"/)
  assert.match(review, /:class="isReadonly \? 'review-page-panel mobile-form-page' : 'review-dialog mobile-form-page'"/)
  assert.match(review, /:role="isReadonly \? undefined : 'dialog'"/)
  assert.match(review, /:aria-modal="isReadonly \? undefined : 'true'"/)
  // 整页形态样式：不限高、不内部滚动，铺满页签页面宽度（宽屏不留两侧空白）。
  assert.match(review, /\.review-page \{ display: block; \}/)
  assert.match(review, /\.review-page-panel \{ display: flex; flex-direction: column; width: 100%; \}/)
  assert.match(review, /\.review-page-panel \.review-body \{ flex: 0 0 auto; overflow: visible;/)
  // 只读与编辑态销售明细表都启用列宽自适应：窄容器压缩铺满不横滚，悬浮提示看全值。
  assert.match(review, /caption="销售明细二次确认"\s*\n\s*fit-width/)
})

test('手工录单同步使用“数量（件）”文案', () => {
  assert.match(entry, /label: '数量（件）'/)
  assert.doesNotMatch(entry, /label: '销售数量'/)
  assert.match(entry, /aria-label="数量（件）"/)
})

test('文件导入二次确认不提供“保存当前修改”，保留还原与确认提交', () => {
  assert.doesNotMatch(review, /@click="saveDraft"/)
  assert.match(review, /@click="restoreCurrentDraft"/)
  assert.match(review, /@click="openConfirm"/)
})

test('导入二次确认按具体操作展示等待文案', () => {
  assert.match(review, /type SavingAction = 'switch' \| 'restore' \| 'prepare' \| 'submit' \| ''/)
  assert.match(review, /正在切换文件…/)
  assert.match(review, /正在还原…/)
  assert.match(review, /正在保存…/)
  assert.match(review, /正在提交…/)
  assert.match(review, /savingAction === 'switch' \? savingMessage : '正在加载复核数据…'/)
  assert.match(review, /role="status" aria-live="polite"/)
})

test('手工录单区分暂存和正式保存状态', () => {
  assert.match(entry, /const draftSaving = ref\(false\)/)
  assert.match(entry, /暂存中…/)
  assert.match(entry, /保存中…/)
  assert.match(entry, /savingAsOverwrite \? '覆盖中…' : '保存中…'/)
  assert.match(entry, /const saved = await flushDraft\(\)/)
  // 暂存结果提示改走 ElMessage（showToast 包装）。
  assert.match(entry, /showToast\('已暂存，可稍后继续录单'\)/)
  assert.match(entry, /showToast\('暂存失败，请稍后重试', 'error'\)/)
})
