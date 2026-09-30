import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const review = fs.readFileSync(path.join(root, 'views', 'ImportReviewView.vue'), 'utf8')
const entry = fs.readFileSync(path.join(root, 'views', 'EntryView.vue'), 'utf8')

test('导入二次确认数量字段使用“数量（件）”文案', () => {
  assert.match(review, /label: '数量（件）'/)
  assert.doesNotMatch(review, /label: '销售数量'/)
  assert.match(review, /aria-label="数量（件）"/)
  assert.match(review, /总件数/)
})

test('导入二次确认品种保留用户原文输入，不使用下拉选择', () => {
  const varietyCell = review.match(/<template #cell-variety="\{ row \}">([\s\S]*?)<\/template>/)?.[1] ?? ''
  assert.match(varietyCell, /<ElInput v-model="row\.variety"/)
  assert.doesNotMatch(varietyCell, /<ElSelect v-model="row\.variety"/)
})

test('只读查看明细以纯文本呈现记录，不再满屏灰色禁用输入框', () => {
  assert.doesNotMatch(review, /:disabled="isReadonly"/)
  assert.match(review, /class="field-static"/)
  assert.match(review, /class="cell-text"/)
  // 编辑态（导入二次确认）的输入控件原样保留。
  assert.match(review, /<ElInput v-model="row\.variety"/)
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
  // 只读态销售明细表启用列宽自适应：窄屏压缩铺满不横滚，编辑态保持稳定列宽。
  assert.match(review, /:fit-width="isReadonly"/)
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
