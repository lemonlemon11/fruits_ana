<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import { deleteEntryDraft, getEntryDraft, getImportIssues, getImports, issuesCsvUrl, previewImports, resolveImportIssue, type EntryDraft, type ImportBatch, type ImportIssue } from '../api/client'
import { currentUser } from '../auth'
import { useRouter } from 'vue-router'
import { formatDateTime } from '../utils/format'
import { isFileDrag } from '../utils/importFiles'
import { describeEntryDraft, draftTitle } from '../utils/entryDraft'
import { downloadFile } from '../utils/fileDownload'
import DataTable, { type DataTableColumn } from '../components/DataTable.vue'

const batches = ref<ImportBatch[]>([])
const router = useRouter()
const canEnter = computed(() => Boolean(currentUser.value?.permissions.includes('entry:view')))
const entryDraft = ref<EntryDraft | null>(null)
const hasEntryDraft = computed(() => Boolean(entryDraft.value))
// 问题明细列固定，行号 / 级别 / 类型 / 字段 / 说明 / 原始值由通用列表组件渲染。
const issueRowKey = (issue: ImportIssue) => issue.id

const issueColumns: DataTableColumn<ImportIssue>[] = [
  { key: 'rowNumber', label: '行号', numeric: true, value: (issue) => issue.rowNumber ?? '—' },
  { key: 'severity', label: '级别', value: (issue) => severityLabel(issue.severity) },
  { key: 'issueType', label: '类型', value: (issue) => issueTypeLabel(issue.issueType) },
  { key: 'fieldName', label: '字段', value: (issue) => fieldLabel(issue.fieldName) },
  { key: 'message', label: '说明', wrap: true },
  { key: 'rawValue', label: '原始值', wrap: true, value: (issue) => issue.rawValue || '—' },
]
// 导入记录逐页展示，避免批次过多时把页面撑得很长。
const batchPage = ref(1)
const batchPageSize = 5
const selectedFiles = ref<File[]>([])
const loading = ref(true)
const uploading = ref(false)
const error = ref('')
const notice = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const expandedBatch = ref('')
const loadingIssues = ref('')
const issuesByBatch = reactive<Record<string, ImportIssue[]>>({})
const issueErrors = reactive<Record<string, string>>({})
const confirmBatchId = ref('')
const confirmIssueBusy = ref('')
const downloadingIssuesBatch = ref('')
const issueDownloadNotice = ref('')
const issueDownloadError = ref('')
const dragging = ref(false)
const detailOpen = ref(false)
let dragDepth = 0

// 手机端没有拖拽能力，文案与桌面端区分，避免承诺做不到的交互。
const narrowQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-width: 820px)')
  : null
const isNarrow = ref(narrowQuery?.matches ?? false)
function onNarrowChange(event: MediaQueryListEvent) { isNarrow.value = event.matches }

const warningBatches = computed(() => batches.value.filter((batch) => batch.warningCount > 0).length)
const failedBatches = computed(() => batches.value.filter((batch) => batch.failureCount > 0 || batch.status.toLowerCase() === 'failed').length)
const totalIssues = computed(() => batches.value.reduce((total, batch) => total + batch.warningCount + batch.failureCount, 0))
const latestBatch = computed(() => batches.value[0])
const totalBatchPages = computed(() => Math.max(1, Math.ceil(batches.value.length / batchPageSize)))
const pagedBatches = computed(() => {
  const start = (batchPage.value - 1) * batchPageSize
  return batches.value.slice(start, start + batchPageSize)
})
const confirmBatch = computed(() => batches.value.find((batch) => String(batch.id) === confirmBatchId.value) ?? null)
const confirmIssues = computed(() => issuesByBatch[confirmBatchId.value] ?? [])
const confirmWarningIssues = computed(() => confirmIssues.value.filter((issue) => issue.severity.toLowerCase() !== 'error'))

// 一次可选多个文件，队列里只显示第一个文件名会让人以为漏选，这里补上数量与总大小。
const uploadQueueSummary = computed(() => {
  const files = selectedFiles.value
  if (!files.length) return { title: '', detail: '' }
  if (files.length === 1) return { title: files[0].name, detail: formatFileSize(files[0].size) }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  return { title: `已选 ${files.length} 个文件`, detail: `${files[0].name} 等 · 共 ${formatFileSize(totalBytes)}` }
})

function goBatchPage(page: number) {
  batchPage.value = Math.min(Math.max(1, page), totalBatchPages.value)
}

// 批次增删后回到第一页，避免停留在越界页码上。
watch(() => batches.value.length, () => { batchPage.value = 1 })

function selectFiles(files: File[]) {
  if (!files.length) return
  const supported = files.filter((file) => /\.xlsx$/i.test(file.name))
  if (!supported.length) {
    selectedFiles.value = []
    error.value = '不支持的文件格式，请选择 XLSX 文件。'
    return
  }
  const skipped = files.length - supported.length
  selectedFiles.value = supported
  error.value = ''
  notice.value = skipped > 0 ? `已忽略 ${skipped} 个不支持的文件，保留 ${supported.length} 个受支持文件。` : ''
}

function onInput(event: Event) {
  selectFiles(Array.from((event.target as HTMLInputElement).files ?? []))
  // 桌面上选文件即导入，少一次点击；手机上没有撤销入口，误选会直接把文件推上去，
  // 因此手机端停在「已选 N 个文件 + 开始导入」这一步，由用户确认（也顺带让清空选择有用）。
  if (isNarrow.value) return
  if (selectedFiles.value.length) void submit()
}
function openFilePicker() { fileInput.value?.click() }
function clearFiles() { selectedFiles.value = []; if (fileInput.value) fileInput.value.value = '' }
function goManualEntry() {
  void router.push(hasEntryDraft.value ? '/entry?draft=1' : '/entry')
}

async function startNewEntry() {
  try {
    await deleteEntryDraft()
    entryDraft.value = null
  } catch {
    // 清不掉服务端草稿时仍允许打开空白录单。
  }
  void router.push('/entry')
}

async function loadEntryDraft() {
  if (!canEnter.value) return
  try {
    entryDraft.value = await getEntryDraft()
  } catch {
    entryDraft.value = null
  }
}

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
  if (selectedFiles.value.length) void submit()
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

async function submit() {
  if (!selectedFiles.value.length) return
  const files = [...selectedFiles.value]
  uploading.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await previewImports(files)
    selectedFiles.value = []
    if (fileInput.value) fileInput.value.value = ''
    await loadBatches()
    const failures = result.failures ?? []
    const failureText = failures.length
      ? `；${failures.length} 个文件解析失败：${failures.map((item) => `${item.fileName}：${item.error}`).join('；')}`
      : ''
    notice.value = `已生成 ${result.draftCount} 条待确认草稿${failureText}，正在打开复核页`
    await new Promise((resolve) => window.setTimeout(resolve, failures.length ? 1600 : 400))
    await router.push({ path: '/import-review', query: { job: result.token } })
  } catch (caught) { error.value = caught instanceof Error ? friendlyUploadError(caught.message) : '文件上传失败' }
  finally { uploading.value = false }
}

async function loadIssues(batchId: string | number) {
  const key = String(batchId)
  if (issuesByBatch[key] || loadingIssues.value === key) return
  loadingIssues.value = key
  issueErrors[key] = ''
  try { issuesByBatch[key] = await getImportIssues(batchId) }
  catch (caught) { issueErrors[key] = caught instanceof Error ? caught.message : '问题明细加载失败' }
  finally { loadingIssues.value = '' }
}

async function toggleIssues(batchId: string | number) {
  const key = String(batchId)
  if (expandedBatch.value === key) { expandedBatch.value = ''; return }
  expandedBatch.value = key
  await loadIssues(batchId)
}

async function openConfirmDialog(batch: ImportBatch) {
  confirmBatchId.value = String(batch.id)
  confirmIssueBusy.value = ''
  await loadIssues(batch.id)
}

function closeConfirmDialog() {
  confirmBatchId.value = ''
  confirmIssueBusy.value = ''
}

async function confirmIssue(batchId: string | number, issue: ImportIssue) {
  const batch = batches.value.find((item) => String(item.id) === String(batchId))
  const wasResolved = issue.resolved
  confirmIssueBusy.value = String(issue.id)
  try {
    await resolveImportIssue(batchId, issue.id)
    issue.resolved = true
    if (!wasResolved && issue.severity.toLowerCase() !== 'error' && batch?.warningCount) {
      batch.warningCount -= 1
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '问题确认失败'
  } finally {
    confirmIssueBusy.value = ''
  }
}

async function downloadIssues(batchId: string | number) {
  const key = String(batchId)
  if (downloadingIssuesBatch.value === key) return
  downloadingIssuesBatch.value = key
  issueDownloadNotice.value = ''
  issueDownloadError.value = ''
  try {
    const filename = await downloadFile(issuesCsvUrl(batchId), `数据问题-${key}.csv`)
    issueDownloadNotice.value = `${filename} 已开始下载`
  } catch (caught) {
    issueDownloadError.value = caught instanceof Error ? caught.message : '问题明细下载失败'
  } finally {
    downloadingIssuesBatch.value = ''
  }
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
    amount: '金额', quantity: '数量', unit_price: '单价', sale_date: '销售日期',
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

/*
 * 上传接口解析失败时后端返回 detail = { message, failures[] }，
 * 直接展示会是一整段 JSON（手机上一屏都放不下）。这里只取人话部分：
 * 结论 + 第一个失败原因，明细仍可在导入记录里看到。
 */
function friendlyUploadError(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const detail = parsed as { message?: unknown; failures?: unknown }
      if (typeof detail.message === 'string') {
        const failures = Array.isArray(detail.failures) ? detail.failures as { error?: unknown }[] : []
        const firstError = failures.find((item) => item && typeof item.error === 'string')?.error
        return typeof firstError === 'string' ? `${detail.message}：${firstError}` : detail.message
      }
    }
  } catch {
    // 不是 JSON，按原文展示
  }
  return raw
}

onMounted(() => {
  loadBatches()
  void loadEntryDraft()
  // 拖到拖拽区外时避免浏览器直接打开文件、把单页应用顶掉。
  window.addEventListener('dragover', preventBrowserFileOpen)
  window.addEventListener('drop', preventBrowserFileOpen)
  narrowQuery?.addEventListener('change', onNarrowChange)
})
onBeforeUnmount(() => {
  window.removeEventListener('dragover', preventBrowserFileOpen)
  window.removeEventListener('drop', preventBrowserFileOpen)
  narrowQuery?.removeEventListener('change', onNarrowChange)
})
</script>

<template>
  <div class="page-stack import-page">
    <section class="entry-modes" :class="{ 'is-uploading': uploading }" :aria-busy="uploading">
      <article class="mode-card upload-mode">
        <div class="mode-card-head">
          <h2 id="upload-title">上传结算单</h2>
          <span>仅支持表格文件上传</span>
        </div>
        <p class="mode-desc">{{ isNarrow ? '选择文件上传后会自动解析并生成待确认草稿，导入记录就在下方查看。' : '拖入文件会自动解析并生成待确认草稿，导入记录就在下方查看。' }}</p>
        <div
          class="file-picker-panel"
          :class="{ 'is-dragging': dragging }"
          @click="openFilePicker"
          @dragenter.prevent.stop="onDragEnter"
          @dragover.prevent.stop="onDragOver"
          @dragleave.prevent.stop="onDragLeave"
          @drop.prevent.stop="onDrop"
        >
          <input id="settlement-files" ref="fileInput" class="sr-only" type="file" multiple accept=".xlsx" @click.stop @change="onInput">
          <button class="primary-button" type="button" @click.stop="openFilePicker">选择结算单</button>
          <span>仅支持 Excel 表格文件，可一次选择多个</span>
        </div>
        <div v-if="selectedFiles.length" class="upload-queue" aria-live="polite">
          <div v-if="selectedFiles.length" class="upload-queue-summary"><strong>{{ uploadQueueSummary.title }}</strong><span>{{ uploadQueueSummary.detail }}</span></div>

          <div class="upload-queue-actions">
            <button class="secondary-button" type="button" :disabled="uploading" @click="clearFiles">清空选择</button>
            <button class="primary-button" type="button" :disabled="uploading" @click="submit()">{{ uploading ? '正在导入' : '开始导入' }}</button>
          </div>
        </div>
        <p v-if="error" class="form-message error" role="alert">{{ error }}</p><p v-if="notice" class="form-message success" aria-live="polite">{{ notice }}</p>
      </article>

      <article v-if="canEnter" class="mode-card manual-mode">
        <div class="mode-card-head">
          <h2>手工录单</h2>
          <span>无表格或现场补录</span>
        </div>
        <p class="mode-desc">按结算单模板逐项填写，保存后生成结算单。</p>
        <div v-if="entryDraft" class="draft-resume">
          <span class="draft-badge">有未完成草稿</span>
          <strong>{{ draftTitle(entryDraft) }}</strong>
          <small>{{ describeEntryDraft(entryDraft) }}</small>
          <div class="draft-actions">
            <button class="primary-button" type="button" @click="goManualEntry">继续录单</button>
            <button class="secondary-button" type="button" @click="startNewEntry">重新录单</button>
          </div>
        </div>
        <div v-else class="manual-empty">
          <span>还没有暂存的手工单</span>
          <button class="secondary-button" type="button" @click="goManualEntry">手工录单</button>
        </div>
      </article>

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
      <div><span>等级口径</span><strong>按管理端转换规则</strong><small>统计等级动态生成，明细保留原文</small></div>
    </section>

    <button type="button" class="mobile-detail-toggle" :aria-expanded="detailOpen" aria-controls="import-mobile-history" @click="detailOpen = !detailOpen">{{ detailOpen ? '收起导入记录' : '查看导入记录' }}</button>

    <div v-show="detailOpen" id="import-mobile-history" class="import-mobile-history">
      <section class="dashboard-section" aria-labelledby="history-title">
        <header class="section-heading"><div><h2 id="history-title">导入记录</h2><p class="section-note">只在需要时展开问题明细</p></div><button class="secondary-button" type="button" :disabled="loading" @click="loadBatches">重新加载</button></header>
        <p v-if="issueDownloadError" class="form-message error" role="alert">{{ issueDownloadError }}</p>
        <p v-else-if="issueDownloadNotice" class="form-message success" role="status" aria-live="polite">{{ issueDownloadNotice }}</p>
        <div v-if="loading" class="history-skeleton skeleton-block">正在加载导入记录</div>
        <div v-else-if="!batches.length" class="empty-state prominent"><strong>还没有导入记录</strong><span>完成首次文件导入后，批次与质量统计会显示在这里。</span></div>
        <div v-else class="batch-list">
          <article v-for="batch in pagedBatches" :key="batch.id" class="batch-row">
            <div class="batch-file"><strong>{{ batchTitle(batch) }}</strong><small>{{ batchSubtitle(batch) }}</small></div>
            <span class="status-badge" :class="statusTone(batch.status)">{{ statusLabel(batch.status) }}</span>
            <dl class="batch-counts"><div><dt>成功</dt><dd>{{ batch.successCount }}</dd></div><div><dt>警告</dt><dd class="count-warning">{{ batch.warningCount }}</dd></div><div><dt>失败</dt><dd class="count-error">{{ batch.failureCount }}</dd></div></dl>
            <p v-if="batch.errorSummary" class="batch-error">{{ batch.errorSummary }}</p>
            <div v-if="batch.warningCount || batch.failureCount" class="batch-actions"><button class="secondary-button compact-button" type="button" :aria-expanded="expandedBatch === String(batch.id)" :aria-controls="`batch-issues-${batch.id}`" @click="toggleIssues(batch.id)">{{ expandedBatch === String(batch.id) ? '收起问题' : '查看问题' }}</button><button v-if="batch.warningCount > 0" class="secondary-button compact-button" type="button" @click="openConfirmDialog(batch)">确认无误</button><button class="secondary-button compact-button" type="button" :disabled="downloadingIssuesBatch === String(batch.id)" @click="downloadIssues(batch.id)">{{ downloadingIssuesBatch === String(batch.id) ? '下载中…' : '下载问题明细' }}</button></div>
            <div v-if="expandedBatch === String(batch.id)" :id="`batch-issues-${batch.id}`" class="batch-issues">
              <p v-if="loadingIssues === String(batch.id)" class="section-note" aria-live="polite">正在加载问题明细</p>
              <div v-else-if="issueErrors[String(batch.id)]" class="issue-load-error" role="alert"><span>{{ issueErrors[String(batch.id)] }}</span><button type="button" class="text-button" @click="loadIssues(batch.id)">重试</button></div>
              <p v-else-if="!issuesByBatch[String(batch.id)]?.length" class="section-note">该批次没有问题明细。</p>
              <div v-else class="issue-results">
                <DataTable
                  :columns="issueColumns"
                  :rows="issuesByBatch[String(batch.id)] ?? []"
                  :row-key="issueRowKey"
                  caption="该批次的数据问题明细"
                  min-width="680px"
                  bordered
                >
                  <template #cell-severity="{ row }">
                    <span class="issue-severity" :class="severityTone(row.severity)">{{ severityLabel(row.severity) }}</span>
                  </template>
                </DataTable>
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
        <nav v-if="totalBatchPages > 1" class="batch-pagination" aria-label="导入记录分页">
          <span>共 {{ batches.length }} 批 · 第 {{ batchPage }} / {{ totalBatchPages }} 页</span>
          <button type="button" :disabled="batchPage <= 1" @click="goBatchPage(batchPage - 1)">上一页</button>
          <button type="button" :disabled="batchPage >= totalBatchPages" @click="goBatchPage(batchPage + 1)">下一页</button>
        </nav>
      </section>
    </div>
    <div v-if="confirmBatch" class="issue-confirm-overlay" role="dialog" aria-modal="true" aria-label="确认无误">
      <section class="issue-confirm-dialog">
        <header class="issue-confirm-head">
          <div><h2>确认无误</h2><p>{{ batchTitle(confirmBatch) }}</p></div>
          <button class="issue-confirm-close" type="button" aria-label="关闭确认框" @click="closeConfirmDialog">×</button>
        </header>
        <p class="issue-confirm-prompt">请确认是否对警告项知悉，并且确认无误。</p>
        <div v-if="loadingIssues === String(confirmBatch.id)" class="section-note" aria-live="polite">正在加载问题明细</div>
        <div v-else-if="issueErrors[String(confirmBatch.id)]" class="issue-load-error" role="alert"><span>{{ issueErrors[String(confirmBatch.id)] }}</span><button type="button" class="text-button" @click="loadIssues(confirmBatch.id)">重试</button></div>
        <div v-else class="issue-confirm-list">
          <p v-if="!confirmWarningIssues.length" class="section-note">该批次没有待确认的警告项。</p>
          <article v-for="issue in confirmWarningIssues" :key="issue.id" class="issue-confirm-row" :class="{ resolved: issue.resolved }">
            <header><span class="issue-severity" :class="severityTone(issue.severity)">{{ severityLabel(issue.severity) }}</span><strong>{{ issueTypeLabel(issue.issueType) }}</strong><small>行 {{ issue.rowNumber ?? '—' }} · {{ fieldLabel(issue.fieldName) }}</small></header>
            <p>{{ issue.message }}<span v-if="issue.rawValue" class="issue-confirm-raw">原始值：{{ issue.rawValue }}</span></p>
            <button class="secondary-button compact-button" type="button" :disabled="confirmIssueBusy === String(issue.id) || issue.resolved" @click="confirmIssue(confirmBatch.id, issue)">{{ issue.resolved ? '已确认处理' : confirmIssueBusy === String(issue.id) ? '处理中…' : '确认处理' }}</button>
          </article>
        </div>
        <footer class="issue-confirm-actions">
          <button class="secondary-button" type="button" @click="closeConfirmDialog">取消</button>
          <button class="primary-button" type="button" @click="closeConfirmDialog">确认</button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.import-page { gap: 18px; }
.entry-modes { position: relative; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.mode-card { min-width: 0; padding: 18px; border: 1px solid var(--line); border-top: 3px solid var(--primary); border-radius: var(--radius-md); background: var(--surface); box-shadow: var(--shadow); }
.mode-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.mode-card-head h2 { margin: 0; font-size: 1.05rem; }
.mode-card-head span { color: var(--muted); font-size: .78rem; white-space: nowrap; }
.mode-desc { margin: 8px 0 14px; color: var(--muted); font-size: .86rem; line-height: 1.5; }
.draft-resume,
.manual-empty { display: grid; gap: 9px; min-height: 124px; align-content: center; padding: 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-soft); }
.draft-resume { justify-items: start; }
.draft-badge { padding: 3px 8px; border-radius: 999px; background: #fff4dc; color: #8a5b00; font-size: .76rem; font-weight: 800; }
.draft-resume strong { overflow-wrap: anywhere; font-size: .98rem; }
.draft-resume small { color: var(--muted); font-size: .82rem; line-height: 1.5; }
.manual-empty { justify-items: start; }
.manual-empty span { color: var(--muted); font-size: .88rem; }
.draft-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.draft-resume .primary-button,
.draft-resume .secondary-button,
.manual-empty .secondary-button { min-height: 38px; padding: 0 14px; font-size: .92rem; }
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
.batch-list { gap: 12px; }
.batch-row { grid-template-columns: minmax(200px, 1.15fr) auto minmax(230px, .85fr); gap: 16px 20px; padding: 18px 20px; }
.batch-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: .59rem;
  margin-top: .71rem;
  color: var(--muted);
  font-size: .9rem;
}
.batch-pagination button {
  min-height: 2.35rem;
  padding: 0 .71rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font-weight: 700;
}
.batch-pagination button:hover:not(:disabled) { border-color: var(--primary); color: var(--primary-dark); }
.batch-pagination button:disabled { cursor: not-allowed; opacity: .45; }
.batch-counts dd.count-warning { color: var(--warning); }
.batch-counts dd.count-error { color: var(--danger); }
.batch-actions { display: flex; grid-column: 1 / -1; align-items: center; flex-wrap: nowrap; justify-content: flex-start; gap: 10px; }
.batch-actions .compact-button { flex: 0 0 auto; white-space: nowrap; }
.batch-error { grid-column: 1 / -1; }
/* 问题明细可能几十行：限高后滚动留在表格内部，页面不被撑长。 */
.batch-issues :deep(.data-table) { max-height: 22rem; }
.mobile-issue-cards { display: none; }
.mobile-detail-toggle { display: none; }
.import-mobile-history { display: grid; gap: 18px; }
.issue-severity { display: inline-flex; padding: 4px 7px; border-radius: var(--radius-sm); font-size: .85rem; font-weight: 700; }
.issue-warning { background: #f8edda; color: var(--warning); }
.issue-error { background: #f8e4e2; color: var(--danger); }
.issue-confirm-overlay { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 18px; background: rgb(24 49 42 / 52%); }
.issue-confirm-dialog { width: min(720px, 100%); max-height: min(80vh, 720px); display: flex; flex-direction: column; padding: 18px; border-radius: 14px; background: #fff; box-shadow: 0 16px 44px rgb(0 0 0 / 22%); }
.issue-confirm-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.issue-confirm-head h2 { margin: 0; font-size: 1.15rem; }
.issue-confirm-head p { margin: 3px 0 0; color: var(--muted); font-size: .84rem; }
.issue-confirm-close { flex: none; min-height: 34px; padding: 0 11px; border: 1px solid var(--line-strong); border-radius: 999px; background: #fff; color: var(--ink); font-weight: 800; }
.issue-confirm-close:hover { border-color: var(--danger); color: var(--danger); }
.issue-confirm-prompt { margin: 14px 0 10px; padding: 10px 12px; border-left: 4px solid var(--warning); background: var(--warning-soft); color: var(--ink); font-weight: 800; line-height: 1.5; }
.issue-confirm-list { flex: 1; min-height: 0; overflow: auto; display: grid; gap: 9px; padding-right: 4px; }
.issue-confirm-row { display: grid; gap: 7px; padding: 11px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-soft); }
.issue-confirm-row.resolved { opacity: .62; background: var(--primary-soft); }
.issue-confirm-row header { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.issue-confirm-row header strong { font-size: .95rem; }
.issue-confirm-row header small { color: var(--muted); font-size: .8rem; }
.issue-confirm-row p { margin: 0; line-height: 1.5; }
.issue-confirm-row .compact-button { justify-self: end; }
.issue-confirm-raw { display: block; margin-top: 4px; color: var(--muted); font-size: .82rem; overflow-wrap: anywhere; }
.issue-confirm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
.overwrite-prompt { display: flex; grid-column: 1 / -1; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 14px; border-left: 4px solid var(--warning); background: #fff7df; }
.overwrite-prompt span { color: #5c5545; font-size: .88rem; line-height: 1.5; }
.overwrite-prompt strong { display: block; color: var(--ink); font-size: .92rem; }

@media (max-width: 820px) {
  .entry-modes { grid-template-columns: 1fr; }
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
  .entry-modes { gap: 12px; }
  .mode-card { padding: 14px; }
  .file-picker-panel { min-height: 64px; padding: 12px; }
  .quality-summary > div { gap: 2px; padding: 8px; }
  .quality-summary small { display: none; }
  .file-picker-panel { align-items: stretch; flex-direction: column; }
  .quality-summary > div { padding: 12px; }
  .batch-row { padding: 12px; }
  .batch-actions { flex-wrap: nowrap; }
  .batch-actions .compact-button { flex: 0 0 auto; }
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
  .issue-results :deep(.data-table) { display: none; }
  .mobile-issue-cards { display: grid; gap: 8px; }
  .mobile-issue-card { display: grid; gap: 7px; padding: 11px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface-soft); }
  .mobile-issue-card header { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
  .mobile-issue-card header strong { font-size: .95rem; }
  .mobile-issue-card header small { color: var(--muted); font-size: .8rem; }
  .mobile-issue-card p { margin: 0; line-height: 1.5; }
  .mobile-issue-raw { color: var(--muted); font-size: .82rem; overflow-wrap: anywhere; }
}
</style>
