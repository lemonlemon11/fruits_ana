<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import { getImportIssues, getImports, issuesCsvUrl, uploadImports, type ImportBatch, type ImportIssue } from '../api/client'
import { formatDateTime } from '../utils/format'
import { addSelectedFiles, isFileDrag } from '../utils/importFiles'
import { summarizeImportResults } from '../utils/importStatus'

const batches = ref<ImportBatch[]>([])
const selectedFiles = ref<File[]>([])
const loading = ref(true)
const uploading = ref(false)
const error = ref('')
const notice = ref('')
const conflictFiles = ref<File[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const expandedBatch = ref('')
const loadingIssues = ref('')
const issuesByBatch = reactive<Record<string, ImportIssue[]>>({})
const issueErrors = reactive<Record<string, string>>({})
const dragging = ref(false)
const detailOpen = ref(false)
let dragDepth = 0

const warningBatches = computed(() => batches.value.filter((batch) => batch.warningCount > 0).length)
const failedBatches = computed(() => batches.value.filter((batch) => batch.failureCount > 0 || batch.status.toLowerCase() === 'failed').length)
const totalIssues = computed(() => batches.value.reduce((total, batch) => total + batch.warningCount + batch.failureCount, 0))
const latestBatch = computed(() => batches.value[0])

function selectFiles(files: File[], append = true) {
  if (!files.length) return
  const { files: merged, ignored } = addSelectedFiles(append ? selectedFiles.value : [], files)
  selectedFiles.value = merged
  error.value = ignored ? '已忽略不支持的文件格式，请选择表格文件。' : ''
}

function onInput(event: Event) { selectFiles(Array.from((event.target as HTMLInputElement).files ?? [])) }
function openFilePicker() { fileInput.value?.click() }
function clearFiles() { selectedFiles.value = []; if (fileInput.value) fileInput.value.value = '' }

function onDragEnter(event: DragEvent) {
  if (!isFileDrag(event.dataTransfer)) return
  dragDepth += 1
  dragging.value = true
}

function onDragOver(event: DragEvent) {
  if (!isFileDrag(event.dataTransfer)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onDragLeave(event: DragEvent) {
  if (!isFileDrag(event.dataTransfer)) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}

function onDrop(event: DragEvent) {
  if (!isFileDrag(event.dataTransfer)) return
  event.preventDefault()
  dragDepth = 0
  dragging.value = false
  selectFiles(Array.from(event.dataTransfer?.files ?? []))
}

function preventBrowserFileOpen(event: DragEvent) {
  if (isFileDrag(event.dataTransfer)) event.preventDefault()
}

async function loadBatches() {
  loading.value = true
  error.value = ''
  try { batches.value = await getImports() }
  catch (caught) { error.value = caught instanceof Error ? caught.message : '导入记录加载失败' }
  finally { loading.value = false }
}

async function submit(overwrite = false) {
  if (!selectedFiles.value.length) return
  // 按钮绑定可能把点击事件当作参数传入，这里只认显式 true，避免误触发覆盖。
  const forceOverwrite = overwrite === true
  const files = [...selectedFiles.value]
  uploading.value = true
  error.value = ''
  notice.value = ''
  conflictFiles.value = []
  try {
    const result = await uploadImports(files, { overwrite: forceOverwrite })
    selectedFiles.value = []
    if (fileInput.value) fileInput.value.value = ''
    await loadBatches()
    const summary = summarizeImportResults(result)
    if (!forceOverwrite) conflictFiles.value = files.filter(
      (file) => result.some(
        (item) => item.status.toLowerCase() === 'conflict' && item.fileName === file.name,
      ),
    )
    if (result.some((item) => item.status.toLowerCase() === 'failed')) error.value = summary
    else notice.value = summary
  } catch (caught) { error.value = caught instanceof Error ? caught.message : '文件上传失败' }
  finally { uploading.value = false }
}

async function overwriteConflicts() {
  if (!conflictFiles.value.length) return
  selectedFiles.value = [...conflictFiles.value]
  await submit(true)
}

async function toggleIssues(batchId: string | number) {
  const key = String(batchId)
  if (expandedBatch.value === key) { expandedBatch.value = ''; return }
  expandedBatch.value = key
  if (issuesByBatch[key]) return
  loadingIssues.value = key
  issueErrors[key] = ''
  try { issuesByBatch[key] = await getImportIssues(batchId) }
  catch (caught) { issueErrors[key] = caught instanceof Error ? caught.message : '问题明细加载失败' }
  finally { loadingIssues.value = '' }
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = { success: '成功', completed: '成功', warning: '有警告', partial: '有警告', conflict: '已存在待确认', failed: '失败' }
  return labels[status.toLowerCase()] ?? '待确认'
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase()
  return normalized === 'failed' ? 'status-failed' : ['warning', 'partial', 'conflict'].includes(normalized) ? 'status-warning' : 'status-success'
}

function severityLabel(severity: string): string {
  const labels: Record<string, string> = { error: '错误', warning: '警告', info: '提示' }
  return labels[severity.toLowerCase()] ?? '提示'
}

function severityTone(severity: string): string { return severity.toLowerCase() === 'error' ? 'issue-error' : 'issue-warning' }

/** 批次标题统一用适配后单号；没有单号（导入失败）时回退原始文件名。 */
function batchTitle(batch: ImportBatch): string {
  return batch.orderNoNormalized || batch.orderNo || batch.fileName
}

/** 副标题给出适配后商号与原始文件名，便于追溯填写人员上传的文件。 */
function batchSubtitle(batch: ImportBatch): string {
  const merchant = batch.merchantNoNormalized || batch.merchantNo
  const meta = [
    merchant ? `商号 ${merchant}` : '',
    formatDateTime(batch.importedAt),
    `第 ${batch.id} 批`,
  ].filter(Boolean)
  return batch.fileName && batch.fileName !== batchTitle(batch)
    ? [batch.fileName, ...meta].join(' · ')
    : meta.join(' · ')
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)}兆字节`
  return `${(bytes / 1024).toFixed(0)}千字节`
}

function fieldLabel(fieldName: string): string {
  const labels: Record<string, string> = {
    amount: '金额', quantity: '数量', unit_price: '单价', sale_date: '到达日期',
    grade: '等级', merchant_no: '商号', order_no: '单号', container_no: '柜号', vehicle_no: '转运车号',
  }
  return labels[fieldName.toLowerCase()] ?? (fieldName || '—')
}

function issueTypeLabel(issueType: string): string {
  const labels: Record<string, string> = {
    amount_mismatch: '金额不一致',
    unknown_grade: '无法识别等级',
    missing_field: '缺少必要内容',
    invalid_date: '日期格式不正确',
    invalid_quantity: '数量不正确',
    invalid_price: '单价不正确',
    duplicate: '重复数据',
  }
  return labels[issueType.toLowerCase()] ?? '数据需要核对'
}

onMounted(() => {
  loadBatches()
  // 拖到拖拽区外时避免浏览器直接打开文件、把单页应用顶掉。
  window.addEventListener('dragover', preventBrowserFileOpen)
  window.addEventListener('drop', preventBrowserFileOpen)
})
onBeforeUnmount(() => {
  window.removeEventListener('dragover', preventBrowserFileOpen)
  window.removeEventListener('drop', preventBrowserFileOpen)
})
</script>

<template>
  <div class="page-stack import-page">
    <header class="page-header compact-page-header">
      <div><h1>数据导入</h1><p>上传结算单，查看导入结果和需要核对的问题。</p></div>
    </header>

    <section class="how-to" aria-label="导入方法">
      <strong>怎么查看</strong>
      <span>第一步：点击“选择结算单”选好文件，或把多个文件直接拖进下面的方框。第二步：点击“开始导入”，然后查看导入结果。</span>
    </section>

    <section class="upload-workbench upload-workbench--compact" :class="{ 'is-uploading': uploading }" aria-labelledby="upload-title" :aria-busy="uploading">
      <div class="upload-copy"><h2 id="upload-title">选择结算单</h2><p>可以一次选择或拖入多个文件。系统会记录导入结果，方便以后核对。</p></div>
      <div
        class="file-picker-panel"
        :class="{ 'is-dragging': dragging }"
        @dragenter.prevent.stop="onDragEnter"
        @dragover.prevent.stop="onDragOver"
        @dragleave.prevent.stop="onDragLeave"
        @drop.prevent.stop="onDrop"
      >
        <input id="settlement-files" ref="fileInput" class="sr-only" type="file" multiple accept=".csv,.xlsx" @click.stop @change="onInput">
        <button class="primary-button" type="button" @click="openFilePicker">选择结算单</button>
        <span>支持常见表格文件，单个文件不超过 20 兆字节；也可以把多个文件一起拖到这里</span>
      </div>
      <div v-if="selectedFiles.length" class="upload-queue" aria-live="polite">
        <div><strong>已选择 {{ selectedFiles.length }} 个文件</strong><span>{{ formatFileSize(selectedFiles.reduce((total, file) => total + file.size, 0)) }}</span></div>
        <ul><li v-for="file in selectedFiles" :key="`${file.name}-${file.size}`"><span>{{ file.name }}</span><small>{{ formatFileSize(file.size) }}</small></li></ul>
        <div class="upload-queue-actions">
          <button class="secondary-button" type="button" :disabled="uploading" @click="clearFiles">清空选择</button>
          <button class="primary-button" type="button" :disabled="uploading" @click="submit()">{{ uploading ? '正在导入' : '开始导入' }}</button>
        </div>
      </div>
      <p v-if="error" class="form-message error" role="alert">{{ error }}</p><p v-if="notice" class="form-message success" aria-live="polite">{{ notice }}</p>
      <div v-if="conflictFiles.length" class="overwrite-prompt" role="status">
        <span><strong>{{ conflictFiles.length }} 张结算单已存在</strong>继续导入会用新文件覆盖原有明细和结算信息。</span>
        <button class="primary-button" type="button" :disabled="uploading" @click="overwriteConflicts">{{ uploading ? '正在覆盖' : '覆盖并重新导入' }}</button>
      </div>
      <div v-if="uploading" class="uploading-mask" role="status" aria-live="polite">
        <span class="uploading-spinner" aria-hidden="true"></span>
        <strong>正在导入，请稍候</strong>
        <small>系统正在解析文件并写入结算单，请不要关闭页面。</small>
      </div>
    </section>

    <section class="quality-summary" aria-label="数据质量概览">
      <div><span>累计批次</span><strong>{{ batches.length }}</strong><small>{{ latestBatch ? `最近 ${formatDateTime(latestBatch.importedAt)}` : '等待首次导入' }}</small></div>
      <div><span>需关注批次</span><strong :class="{ 'is-alert': warningBatches }">{{ warningBatches }}</strong><small>{{ totalIssues }} 条问题待处理</small></div>
      <div><span>失败批次</span><strong :class="{ 'is-alert': failedBatches }">{{ failedBatches }}</strong><small>{{ failedBatches ? '请先修复后重新导入' : '当前没有失败批次' }}</small></div>
      <div><span>等级口径</span><strong>A果 / B果 / C果</strong><small>原始BC等级自动归入C果</small></div>
    </section>

    <button type="button" class="mobile-detail-toggle" :aria-expanded="detailOpen" aria-controls="import-mobile-history" @click="detailOpen = !detailOpen">{{ detailOpen ? '收起导入记录' : '查看导入记录' }}</button>

    <div v-show="detailOpen" id="import-mobile-history" class="import-mobile-history">
      <section class="dashboard-section" aria-labelledby="history-title">
        <header class="section-heading"><div><h2 id="history-title">导入记录和问题</h2><p class="section-note">只在需要时展开问题明细</p></div><button class="secondary-button" type="button" :disabled="loading" @click="loadBatches">重新加载</button></header>
        <div v-if="loading" class="history-skeleton skeleton-block">正在加载导入记录</div>
        <div v-else-if="!batches.length" class="empty-state prominent"><strong>还没有导入记录</strong><span>完成首次文件导入后，批次与质量统计会显示在这里。</span></div>
        <div v-else class="batch-list">
          <article v-for="batch in batches" :key="batch.id" class="batch-row">
            <div class="batch-file"><strong>{{ batchTitle(batch) }}</strong><small>{{ batchSubtitle(batch) }}</small></div>
            <span class="status-badge" :class="statusTone(batch.status)">{{ statusLabel(batch.status) }}</span>
            <dl class="batch-counts"><div><dt>成功</dt><dd>{{ batch.successCount }}</dd></div><div><dt>警告</dt><dd class="count-warning">{{ batch.warningCount }}</dd></div><div><dt>失败</dt><dd class="count-error">{{ batch.failureCount }}</dd></div></dl>
            <p v-if="batch.errorSummary" class="batch-error">{{ batch.errorSummary }}</p>
            <div v-if="batch.warningCount || batch.failureCount" class="batch-actions"><button class="secondary-button compact-button" type="button" :aria-expanded="expandedBatch === String(batch.id)" :aria-controls="`batch-issues-${batch.id}`" @click="toggleIssues(batch.id)">{{ expandedBatch === String(batch.id) ? '收起问题' : '查看问题' }}</button><a class="secondary-button compact-button" :href="issuesCsvUrl(batch.id)" download>下载问题明细</a></div>
            <div v-if="expandedBatch === String(batch.id)" :id="`batch-issues-${batch.id}`" class="batch-issues">
              <p v-if="loadingIssues === String(batch.id)" class="section-note" aria-live="polite">正在加载问题明细</p>
              <div v-else-if="issueErrors[String(batch.id)]" class="issue-load-error" role="alert"><span>{{ issueErrors[String(batch.id)] }}</span><button type="button" class="text-button" @click="toggleIssues(batch.id).then(() => toggleIssues(batch.id))">重试</button></div>
              <p v-else-if="!issuesByBatch[String(batch.id)]?.length" class="section-note">该批次没有问题明细。</p>
              <div v-else class="issue-results">
                <div class="table-wrap"><table><thead><tr><th>行号</th><th>级别</th><th>类型</th><th>字段</th><th>说明</th><th>原始值</th></tr></thead><tbody><tr v-for="issue in issuesByBatch[String(batch.id)]" :key="issue.id"><td>{{ issue.rowNumber ?? '—' }}</td><td><span class="issue-severity" :class="severityTone(issue.severity)">{{ severityLabel(issue.severity) }}</span></td><td>{{ issueTypeLabel(issue.issueType) }}</td><td>{{ fieldLabel(issue.fieldName) }}</td><td>{{ issue.message }}</td><td>{{ issue.rawValue || '—' }}</td></tr></tbody></table></div>
                <div class="mobile-issue-cards">
                  <article v-for="issue in issuesByBatch[String(batch.id)]" :key="issue.id" class="mobile-issue-card">
                    <header><span class="issue-severity" :class="severityTone(issue.severity)">{{ severityLabel(issue.severity) }}</span><strong>{{ issueTypeLabel(issue.issueType) }}</strong><small>行 {{ issue.rowNumber ?? '—' }} · {{ fieldLabel(issue.fieldName) }}</small></header>
                    <p>{{ issue.message }}</p>
                    <p v-if="issue.rawValue" class="mobile-issue-raw">原始值：{{ issue.rawValue }}</p>
                  </article>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.import-page { gap: 18px; }
.compact-page-header { padding-bottom: 18px; }
.upload-workbench--compact { grid-template-columns: minmax(240px, .7fr) minmax(280px, 1.3fr); gap: 18px 24px; padding: 20px; }
.upload-workbench--compact { position: relative; }
.uploading-mask {
  position: absolute;
  z-index: 10;
  inset: 0;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 9px;
  padding: 22px;
  background: rgba(255, 255, 255, .88);
  backdrop-filter: blur(2px);
  text-align: center;
}
.uploading-mask strong { color: var(--ink); font-size: 1.05rem; }
.uploading-mask small { color: var(--muted); font-size: .88rem; line-height: 1.5; }
.uploading-spinner {
  width: 34px;
  height: 34px;
  border: 4px solid var(--primary-soft);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: upload-spin .8s linear infinite;
}
@keyframes upload-spin {
  to { transform: rotate(360deg); }
}
.upload-copy p { margin: 8px 0 0; color: var(--muted); font-size: .9rem; line-height: 1.6; }
.file-picker-panel { display: flex; min-height: 92px; align-items: center; gap: 16px; padding: 16px; border: 1px solid var(--line-strong); background: var(--surface-soft); }
.file-picker-panel.is-dragging { border-style: dashed; border-color: var(--primary); background: var(--primary-soft); }
.upload-queue-actions { display: flex; justify-content: flex-end; gap: 10px; }
.file-picker-panel .primary-button { min-width: 132px; }
.file-picker-panel > span { color: var(--muted); font-size: .86rem; line-height: 1.5; }
.upload-queue { gap: 10px; }
.quality-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--line); background: var(--surface); }
.quality-summary > div { display: grid; gap: 5px; min-width: 0; padding: 14px; border-right: 1px solid var(--line); }
.quality-summary > div:last-child { border-right: 0; }
.quality-summary span,
.quality-summary small { color: var(--muted); font-size: .85rem; line-height: 1.4; }
.quality-summary strong { overflow-wrap: anywhere; font-size: 1rem; }
.quality-summary strong.is-alert { color: var(--danger); }
.batch-list { gap: 9px; }
.batch-row { grid-template-columns: minmax(180px, 1fr) auto minmax(190px, .7fr) auto; gap: 12px; padding: 14px; }
.batch-counts dd.count-warning { color: var(--warning); }
.batch-counts dd.count-error { color: var(--danger); }
.batch-actions { gap: 8px; }
.batch-issues { padding-top: 12px; }
.mobile-issue-cards { display: none; }
.mobile-detail-toggle { display: none; }
.import-mobile-history { display: grid; gap: 18px; }
.issue-severity { display: inline-flex; padding: 4px 7px; border-radius: var(--radius-sm); font-size: .85rem; font-weight: 700; }
.issue-warning { background: #f8edda; color: var(--warning); }
.issue-error { background: #f8e4e2; color: var(--danger); }
.overwrite-prompt { display: flex; grid-column: 1 / -1; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 14px; border-left: 4px solid var(--warning); background: #fff7df; }
.overwrite-prompt span { color: #5c5545; font-size: .88rem; line-height: 1.5; }
.overwrite-prompt strong { display: block; color: var(--ink); font-size: .92rem; }

@media (max-width: 820px) {
  .upload-workbench--compact { grid-template-columns: 1fr; }
  .quality-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .quality-summary > div:nth-child(2) { border-right: 0; }
  .quality-summary > div:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
  .batch-row { grid-template-columns: minmax(0, 1fr) auto; }
  .batch-counts,
  .batch-error,
  .batch-actions { grid-column: 1 / 3; }
  .batch-actions { justify-content: flex-start; }
}

@media (min-width: 561px) {
  .import-mobile-history { display: grid !important; }
}

@media (max-width: 560px) {
  .mobile-detail-toggle { display: flex; width: 100%; min-height: 44px; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface); color: var(--primary-dark); font-size: .95rem; font-weight: 800; }
  .import-mobile-history { gap: 12px; }
  .upload-workbench--compact { gap: 12px; padding: 12px; }
  .upload-copy p { display: none; }
  .file-picker-panel { min-height: 64px; padding: 12px; }
  .quality-summary > div { gap: 2px; padding: 8px; }
  .quality-summary small { display: none; }
  .file-picker-panel { align-items: stretch; flex-direction: column; }
  .quality-summary > div { padding: 12px; }
  .batch-row { padding: 12px; }
  .batch-actions { flex-wrap: wrap; }
  .batch-actions .compact-button { flex: 1 1 130px; }
  .batch-issues .table-wrap table { min-width: 680px; }
  .dashboard-section > .section-heading {
    position: sticky;
    z-index: 20;
    top: calc(var(--app-header-height) + var(--app-tabs-height) + 8px);
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: rgba(255, 255, 255, .95);
  }
  .issue-results { min-width: 0; }
  .issue-results .table-wrap { display: none; }
  .mobile-issue-cards { display: grid; gap: 8px; }
  .mobile-issue-card { display: grid; gap: 7px; padding: 11px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface-soft); }
  .mobile-issue-card header { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
  .mobile-issue-card header strong { font-size: .95rem; }
  .mobile-issue-card header small { color: var(--muted); font-size: .8rem; }
  .mobile-issue-card p { margin: 0; line-height: 1.5; }
  .mobile-issue-raw { color: var(--muted); font-size: .82rem; overflow-wrap: anywhere; }
}
</style>
