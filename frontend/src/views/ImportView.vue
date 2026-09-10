<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { getImportIssues, getImports, issuesCsvUrl, uploadImports, type ImportBatch, type ImportIssue } from '../api/client'
import { formatDateTime } from '../utils/format'
import { summarizeImportResults } from '../utils/importStatus'

const batches = ref<ImportBatch[]>([])
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

const warningBatches = computed(() => batches.value.filter((batch) => batch.warningCount > 0).length)
const failedBatches = computed(() => batches.value.filter((batch) => batch.failureCount > 0 || batch.status.toLowerCase() === 'failed').length)
const totalIssues = computed(() => batches.value.reduce((total, batch) => total + batch.warningCount + batch.failureCount, 0))
const latestBatch = computed(() => batches.value[0])

function selectFiles(files: File[]) {
  const allowed = files.filter((file) => /\.(csv|xlsx)$/i.test(file.name))
  selectedFiles.value = allowed
  error.value = allowed.length === files.length ? '' : '已忽略不支持的文件格式，请选择表格文件。'
}

function onInput(event: Event) { selectFiles(Array.from((event.target as HTMLInputElement).files ?? [])) }
function openFilePicker() { fileInput.value?.click() }

async function loadBatches() {
  loading.value = true
  error.value = ''
  try { batches.value = await getImports() }
  catch (caught) { error.value = caught instanceof Error ? caught.message : '导入记录加载失败' }
  finally { loading.value = false }
}

async function submit() {
  if (!selectedFiles.value.length) return
  uploading.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await uploadImports(selectedFiles.value)
    selectedFiles.value = []
    if (fileInput.value) fileInput.value.value = ''
    await loadBatches()
    const summary = summarizeImportResults(result)
    if (result.some((item) => item.status.toLowerCase() === 'failed')) error.value = summary
    else notice.value = summary
  } catch (caught) { error.value = caught instanceof Error ? caught.message : '文件上传失败' }
  finally { uploading.value = false }
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
  const labels: Record<string, string> = { success: '成功', completed: '成功', warning: '有警告', partial: '有警告', failed: '失败' }
  return labels[status.toLowerCase()] ?? '待确认'
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase()
  return normalized === 'failed' ? 'status-failed' : normalized === 'warning' || normalized === 'partial' ? 'status-warning' : 'status-success'
}

function severityLabel(severity: string): string {
  const labels: Record<string, string> = { error: '错误', warning: '警告', info: '提示' }
  return labels[severity.toLowerCase()] ?? '提示'
}

function severityTone(severity: string): string { return severity.toLowerCase() === 'error' ? 'issue-error' : 'issue-warning' }

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)}兆字节`
  return `${(bytes / 1024).toFixed(0)}千字节`
}

function fieldLabel(fieldName: string): string {
  const labels: Record<string, string> = {
    amount: '金额', quantity: '数量', unit_price: '单价', sale_date: '销售日期',
    grade: '等级', container_id: '货柜号', container_name: '货柜名称',
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

onMounted(loadBatches)
</script>

<template>
  <div class="page-stack import-page">
    <header class="page-header compact-page-header">
      <div><h1>数据导入</h1><p>上传结算单，查看导入结果和需要核对的问题。</p></div>
    </header>

    <section class="how-to" aria-label="导入方法">
      <strong>怎么查看</strong>
      <span>第一步：点击“选择结算单”并选好文件。第二步：点击“开始导入”，然后查看导入结果。</span>
    </section>

    <section class="upload-workbench upload-workbench--compact" aria-labelledby="upload-title">
      <div class="upload-copy"><h2 id="upload-title">选择结算单</h2><p>可以一次选择多个文件。系统会记录导入结果，方便以后核对。</p></div>
      <div class="file-picker-panel">
        <input id="settlement-files" ref="fileInput" class="sr-only" type="file" multiple accept=".csv,.xlsx" @click.stop @change="onInput">
        <button class="primary-button" type="button" @click="openFilePicker">选择结算单</button>
        <span>支持常见表格文件，单个文件不超过 20 兆字节</span>
      </div>
      <div v-if="selectedFiles.length" class="upload-queue" aria-live="polite">
        <div><strong>已选择 {{ selectedFiles.length }} 个文件</strong><span>{{ formatFileSize(selectedFiles.reduce((total, file) => total + file.size, 0)) }}</span></div>
        <ul><li v-for="file in selectedFiles" :key="`${file.name}-${file.size}`"><span>{{ file.name }}</span><small>{{ formatFileSize(file.size) }}</small></li></ul>
        <button class="primary-button" type="button" :disabled="uploading" @click="submit">{{ uploading ? '正在导入' : '开始导入' }}</button>
      </div>
      <p v-if="error" class="form-message error" role="alert">{{ error }}</p><p v-if="notice" class="form-message success" aria-live="polite">{{ notice }}</p>
    </section>

    <section class="quality-summary" aria-label="数据质量概览">
      <div><span>累计批次</span><strong>{{ batches.length }}</strong><small>{{ latestBatch ? `最近 ${formatDateTime(latestBatch.importedAt)}` : '等待首次导入' }}</small></div>
      <div><span>需关注批次</span><strong :class="{ 'is-alert': warningBatches }">{{ warningBatches }}</strong><small>{{ totalIssues }} 条问题待处理</small></div>
      <div><span>失败批次</span><strong :class="{ 'is-alert': failedBatches }">{{ failedBatches }}</strong><small>{{ failedBatches ? '请先修复后重新导入' : '当前没有失败批次' }}</small></div>
      <div><span>等级口径</span><strong>A果 / B果 / C果</strong><small>原始BC等级自动归入C果</small></div>
    </section>

    <section class="dashboard-section" aria-labelledby="history-title">
      <header class="section-heading"><div><h2 id="history-title">导入记录和问题</h2><p class="section-note">只在需要时展开问题明细</p></div><button class="secondary-button" type="button" :disabled="loading" @click="loadBatches">重新加载</button></header>
      <div v-if="loading" class="history-skeleton skeleton-block">正在加载导入记录</div>
      <div v-else-if="!batches.length" class="empty-state prominent"><strong>还没有导入记录</strong><span>完成首次文件导入后，批次与质量统计会显示在这里。</span></div>
      <div v-else class="batch-list">
        <article v-for="batch in batches" :key="batch.id" class="batch-row">
          <div class="batch-file"><strong>{{ batch.fileName }}</strong><small>{{ formatDateTime(batch.importedAt) }} · 第 {{ batch.id }} 批</small></div>
          <span class="status-badge" :class="statusTone(batch.status)">{{ statusLabel(batch.status) }}</span>
          <dl class="batch-counts"><div><dt>成功</dt><dd>{{ batch.successCount }}</dd></div><div><dt>警告</dt><dd class="count-warning">{{ batch.warningCount }}</dd></div><div><dt>失败</dt><dd class="count-error">{{ batch.failureCount }}</dd></div></dl>
          <p v-if="batch.errorSummary" class="batch-error">{{ batch.errorSummary }}</p>
          <div v-if="batch.warningCount || batch.failureCount" class="batch-actions"><button class="secondary-button compact-button" type="button" :aria-expanded="expandedBatch === String(batch.id)" :aria-controls="`batch-issues-${batch.id}`" @click="toggleIssues(batch.id)">{{ expandedBatch === String(batch.id) ? '收起问题' : '查看问题' }}</button><a class="secondary-button compact-button" :href="issuesCsvUrl(batch.id)" download>下载问题明细</a></div>
          <div v-if="expandedBatch === String(batch.id)" :id="`batch-issues-${batch.id}`" class="batch-issues">
            <p v-if="loadingIssues === String(batch.id)" class="section-note" aria-live="polite">正在加载问题明细</p>
            <div v-else-if="issueErrors[String(batch.id)]" class="issue-load-error" role="alert"><span>{{ issueErrors[String(batch.id)] }}</span><button type="button" class="text-button" @click="toggleIssues(batch.id).then(() => toggleIssues(batch.id))">重试</button></div>
            <p v-else-if="!issuesByBatch[String(batch.id)]?.length" class="section-note">该批次没有问题明细。</p>
            <div v-else class="table-wrap"><table><thead><tr><th>行号</th><th>级别</th><th>类型</th><th>字段</th><th>说明</th><th>原始值</th></tr></thead><tbody><tr v-for="issue in issuesByBatch[String(batch.id)]" :key="issue.id"><td>{{ issue.rowNumber ?? '—' }}</td><td><span class="issue-severity" :class="severityTone(issue.severity)">{{ severityLabel(issue.severity) }}</span></td><td>{{ issueTypeLabel(issue.issueType) }}</td><td>{{ fieldLabel(issue.fieldName) }}</td><td>{{ issue.message }}</td><td>{{ issue.rawValue || '—' }}</td></tr></tbody></table></div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.import-page { gap: 18px; }
.compact-page-header { padding-bottom: 18px; }
.upload-workbench--compact { grid-template-columns: minmax(240px, .7fr) minmax(280px, 1.3fr); gap: 18px 24px; padding: 20px; }
.upload-copy p { margin: 8px 0 0; color: var(--muted); font-size: .9rem; line-height: 1.6; }
.file-picker-panel { display: flex; min-height: 92px; align-items: center; gap: 16px; padding: 16px; border: 1px solid var(--line-strong); background: var(--surface-soft); }
.file-picker-panel .primary-button { min-width: 132px; }
.file-picker-panel > span { color: var(--muted); font-size: .86rem; line-height: 1.5; }
.upload-queue { gap: 10px; }
.quality-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--line); background: var(--surface); }
.quality-summary > div { display: grid; gap: 5px; min-width: 0; padding: 14px; border-right: 1px solid var(--line); }
.quality-summary > div:last-child { border-right: 0; }
.quality-summary span,
.quality-summary small { color: var(--muted); font-size: .8rem; line-height: 1.4; }
.quality-summary strong { overflow-wrap: anywhere; font-size: 1rem; }
.quality-summary strong.is-alert { color: var(--danger); }
.batch-list { gap: 9px; }
.batch-row { grid-template-columns: minmax(180px, 1fr) auto minmax(190px, .7fr) auto; gap: 12px; padding: 14px; }
.batch-counts dd.count-warning { color: var(--warning); }
.batch-counts dd.count-error { color: var(--danger); }
.batch-actions { gap: 8px; }
.batch-issues { padding-top: 12px; }
.issue-severity { display: inline-flex; padding: 4px 7px; border-radius: var(--radius-sm); font-size: .78rem; font-weight: 700; }
.issue-warning { background: #f8edda; color: var(--warning); }
.issue-error { background: #f8e4e2; color: var(--danger); }

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

@media (max-width: 560px) {
  .file-picker-panel { align-items: stretch; flex-direction: column; }
  .quality-summary > div { padding: 12px; }
  .batch-row { padding: 12px; }
  .batch-actions { flex-wrap: wrap; }
  .batch-actions .compact-button { flex: 1 1 130px; }
  .batch-issues .table-wrap table { min-width: 680px; }
}
</style>
