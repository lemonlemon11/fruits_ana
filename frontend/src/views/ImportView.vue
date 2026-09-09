<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { getImportIssues, getImports, issuesCsvUrl, uploadImports, type ImportBatch, type ImportIssue } from '../api/client'
import { formatDateTime } from '../utils/format'

const batches = ref<ImportBatch[]>([])
const selectedFiles = ref<File[]>([])
const loading = ref(true)
const uploading = ref(false)
const dragging = ref(false)
const error = ref('')
const notice = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const expandedBatch = ref('')
const loadingIssues = ref('')
const issuesByBatch = reactive<Record<string, ImportIssue[]>>({})
const issueErrors = reactive<Record<string, string>>({})

const selectedSize = computed(() => selectedFiles.value.reduce((total, file) => total + file.size, 0))
const warningBatches = computed(() => batches.value.filter((batch) => batch.warningCount > 0).length)
const failedBatches = computed(() => batches.value.filter((batch) => batch.failureCount > 0 || batch.status.toLowerCase() === 'failed').length)
const totalIssues = computed(() => batches.value.reduce((total, batch) => total + batch.warningCount + batch.failureCount, 0))
const latestBatch = computed(() => batches.value[0])

function selectFiles(files: File[]) {
  const allowed = files.filter((file) => /\.(csv|xlsx)$/i.test(file.name))
  selectedFiles.value = allowed
  error.value = allowed.length === files.length ? '' : '已忽略非 CSV / XLSX 文件'
}

function onInput(event: Event) { selectFiles(Array.from((event.target as HTMLInputElement).files ?? [])) }
function onDrop(event: DragEvent) { dragging.value = false; selectFiles(Array.from(event.dataTransfer?.files ?? [])) }

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
    notice.value = `已处理 ${result.length} 个文件，解析结果已进入质量检查`
    selectedFiles.value = []
    if (fileInput.value) fileInput.value.value = ''
    await loadBatches()
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
  return labels[status.toLowerCase()] ?? status
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase()
  return normalized === 'failed' ? 'status-failed' : normalized === 'warning' || normalized === 'partial' ? 'status-warning' : 'status-success'
}

function severityLabel(severity: string): string {
  const labels: Record<string, string> = { error: '错误', warning: '警告', info: '提示' }
  return labels[severity.toLowerCase()] ?? severity
}

function severityTone(severity: string): string { return severity.toLowerCase() === 'error' ? 'issue-error' : 'issue-warning' }

onMounted(loadBatches)
</script>

<template>
  <div class="page-stack import-page">
    <header class="page-header compact-page-header">
      <div><p class="eyebrow">DATA INTAKE</p><h1>导入与数据质量</h1><p>把结算单变成可分析的 A / B / C 等级数据，并在进入看板前完成质量确认。</p></div>
      <div class="page-header-note"><span>支持格式</span><strong>CSV · XLSX</strong><small>重复文件会自动拦截</small></div>
    </header>

    <ol class="import-steps" aria-label="导入流程">
      <li class="is-active"><span>01</span><div><strong>接收文件</strong><small>选择或拖放结算单</small></div></li>
      <li><span>02</span><div><strong>解析归一</strong><small>等级与金额统一口径</small></div></li>
      <li><span>03</span><div><strong>质量确认</strong><small>查看问题后进入分析</small></div></li>
    </ol>

    <section class="upload-workbench upload-workbench--compact" aria-labelledby="upload-title">
      <div class="upload-copy"><p class="eyebrow">STEP 01 · NEW IMPORT</p><h2 id="upload-title">导入结算单</h2><p>支持一次选择多个文件；系统会保留批次、问题与来源，方便后续追溯。</p><div class="upload-rules"><span>CSV / XLSX</span><span>单文件 ≤ 20 MB</span><span>不上传原始附件到仓库</span></div></div>
      <div class="drop-zone" :class="{ dragging }" @dragenter.prevent="dragging = true" @dragover.prevent @dragleave.prevent="dragging = false" @drop.prevent="onDrop">
        <input id="settlement-files" ref="fileInput" class="sr-only" type="file" multiple accept=".csv,.xlsx" @change="onInput">
        <span class="drop-zone__icon" aria-hidden="true">↑</span><div><strong>拖放结算单到这里</strong><span>或点击选择文件</span></div><label class="secondary-button" for="settlement-files">选择文件</label>
      </div>
      <div v-if="selectedFiles.length" class="upload-queue" aria-live="polite">
        <div><strong>待导入 {{ selectedFiles.length }} 个文件</strong><span>{{ (selectedSize / 1024 / 1024).toFixed(2) }} MB</span></div>
        <ul><li v-for="file in selectedFiles" :key="`${file.name}-${file.size}`"><span>{{ file.name }}</span><small>{{ (file.size / 1024).toFixed(0) }} KB</small></li></ul>
        <button class="primary-button" type="button" :disabled="uploading" @click="submit">{{ uploading ? '正在解析…' : '开始导入' }}</button>
      </div>
      <div v-if="uploading" class="progress-line" role="progressbar" aria-label="正在导入文件"><span /></div>
      <p v-if="error" class="form-message error" role="alert">{{ error }}</p><p v-if="notice" class="form-message success" aria-live="polite">{{ notice }}</p>
    </section>

    <section class="quality-summary" aria-label="数据质量概览">
      <div><span>累计批次</span><strong>{{ batches.length }}</strong><small>{{ latestBatch ? `最近 ${formatDateTime(latestBatch.importedAt)}` : '等待首次导入' }}</small></div>
      <div><span>需关注批次</span><strong :class="{ 'is-alert': warningBatches }">{{ warningBatches }}</strong><small>{{ totalIssues }} 条问题待处理</small></div>
      <div><span>失败批次</span><strong :class="{ 'is-alert': failedBatches }">{{ failedBatches }}</strong><small>{{ failedBatches ? '请先修复后重新导入' : '当前没有失败批次' }}</small></div>
      <div><span>等级口径</span><strong>A / B / C</strong><small>BC 自动归入 C 果</small></div>
    </section>

    <section class="dashboard-section" aria-labelledby="history-title">
      <header class="section-heading"><div><p class="eyebrow">IMPORT HISTORY</p><h2 id="history-title">导入批次与问题处理</h2></div><button class="text-button" type="button" :disabled="loading" @click="loadBatches">刷新</button></header>
      <div v-if="loading" class="history-skeleton skeleton-block">正在加载导入记录</div>
      <div v-else-if="!batches.length" class="empty-state prominent"><strong>还没有导入记录</strong><span>完成首次文件导入后，批次与质量统计会显示在这里。</span></div>
      <div v-else class="batch-list">
        <article v-for="batch in batches" :key="batch.id" class="batch-row">
          <div class="batch-file"><strong>{{ batch.fileName }}</strong><small>{{ formatDateTime(batch.importedAt) }} · 批次 #{{ batch.id }}</small></div>
          <span class="status-badge" :class="statusTone(batch.status)">{{ statusLabel(batch.status) }}</span>
          <dl class="batch-counts"><div><dt>成功</dt><dd>{{ batch.successCount }}</dd></div><div><dt>警告</dt><dd class="count-warning">{{ batch.warningCount }}</dd></div><div><dt>失败</dt><dd class="count-error">{{ batch.failureCount }}</dd></div></dl>
          <p v-if="batch.errorSummary" class="batch-error">{{ batch.errorSummary }}</p>
          <div v-if="batch.warningCount || batch.failureCount" class="batch-actions"><button class="secondary-button compact-button" type="button" :aria-expanded="expandedBatch === String(batch.id)" :aria-controls="`batch-issues-${batch.id}`" @click="toggleIssues(batch.id)">{{ expandedBatch === String(batch.id) ? '收起问题' : '查看问题' }}</button><a class="secondary-button compact-button" :href="issuesCsvUrl(batch.id)" download>下载问题 CSV</a></div>
          <div v-if="expandedBatch === String(batch.id)" :id="`batch-issues-${batch.id}`" class="batch-issues">
            <p v-if="loadingIssues === String(batch.id)" class="section-note" aria-live="polite">正在加载问题明细</p>
            <div v-else-if="issueErrors[String(batch.id)]" class="issue-load-error" role="alert"><span>{{ issueErrors[String(batch.id)] }}</span><button type="button" class="text-button" @click="toggleIssues(batch.id).then(() => toggleIssues(batch.id))">重试</button></div>
            <p v-else-if="!issuesByBatch[String(batch.id)]?.length" class="section-note">该批次没有问题明细。</p>
            <div v-else class="table-wrap"><table><thead><tr><th>行号</th><th>级别</th><th>类型</th><th>字段</th><th>说明</th><th>原始值</th></tr></thead><tbody><tr v-for="issue in issuesByBatch[String(batch.id)]" :key="issue.id"><td>{{ issue.rowNumber ?? '—' }}</td><td><span class="issue-severity" :class="severityTone(issue.severity)">{{ severityLabel(issue.severity) }}</span></td><td>{{ issue.issueType }}</td><td>{{ issue.fieldName || '—' }}</td><td>{{ issue.message }}</td><td>{{ issue.rawValue || '—' }}</td></tr></tbody></table></div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.import-page { gap: 16px; }.compact-page-header { padding-bottom: 16px; }.page-header-note { display: grid; justify-items: end; gap: 2px; padding: 9px 12px; border-left: 3px solid var(--primary); background: var(--surface); }.page-header-note span, .page-header-note small { color: var(--muted); font-size: .64rem; }.page-header-note strong { font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .86rem; }
.import-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin: 0; padding: 0; border: 1px solid var(--line); background: var(--line); list-style: none; }.import-steps li { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 10px 12px; background: var(--surface); }.import-steps li > span { display: grid; width: 26px; height: 26px; flex: 0 0 26px; place-items: center; border: 1px solid var(--line-strong); border-radius: 50%; color: var(--muted); font-family: Bahnschrift, sans-serif; font-size: .66rem; }.import-steps li.is-active { background: var(--primary-soft); }.import-steps li.is-active > span { border-color: var(--primary); background: var(--primary); color: #fff; }.import-steps div { display: grid; gap: 2px; min-width: 0; }.import-steps strong { font-size: .75rem; }.import-steps small { color: var(--muted); font-size: .62rem; overflow-wrap: anywhere; }
.upload-workbench--compact { grid-template-columns: minmax(220px, .72fr) minmax(300px, 1.28fr); gap: 16px 24px; padding: 18px 20px; }.upload-copy p:last-child { margin-bottom: 10px; }.upload-rules { display: flex; flex-wrap: wrap; gap: 5px; }.upload-rules span { padding: 4px 7px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: .62rem; }.drop-zone { position: relative; min-height: 122px; gap: 12px; }.drop-zone__icon { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 50%; background: var(--primary-soft); color: var(--primary-dark); font-size: 1.15rem; font-weight: 800; }.drop-zone > div { display: grid; gap: 3px; }.drop-zone > div strong { color: var(--ink); font-size: .8rem; }.drop-zone > div span { color: var(--muted); font-size: .66rem; }.upload-queue { gap: 8px; }.upload-queue .primary-button { min-height: 38px; }.quality-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--line); background: var(--surface); }.quality-summary > div { display: grid; gap: 3px; min-width: 0; padding: 10px 12px; border-right: 1px solid var(--line); }.quality-summary > div:last-child { border-right: 0; }.quality-summary span, .quality-summary small { color: var(--muted); font-size: .64rem; }.quality-summary strong { overflow-wrap: anywhere; font-family: Bahnschrift, "Microsoft YaHei", sans-serif; font-size: .9rem; }.quality-summary strong.is-alert { color: var(--danger); }
.batch-list { gap: 7px; }.batch-row { grid-template-columns: minmax(180px, 1fr) auto minmax(190px, .7fr) auto; gap: 10px; padding: 11px 12px; }.batch-counts dd.count-warning { color: var(--warning); }.batch-counts dd.count-error { color: var(--danger); }.batch-actions { gap: 6px; }.batch-issues { padding-top: 10px; }.issue-severity { display: inline-flex; padding: 3px 6px; border-radius: 999px; font-size: .62rem; font-weight: 700; }.issue-warning { background: color-mix(in srgb, var(--warning) 12%, var(--surface)); color: var(--warning); }.issue-error { background: color-mix(in srgb, var(--danger) 12%, var(--surface)); color: var(--danger); }
@media (max-width: 820px) { .page-header-note { justify-items: start; width: max-content; }.import-steps { grid-template-columns: 1fr; }.import-steps li { padding: 9px 11px; }.upload-workbench--compact { grid-template-columns: 1fr; }.quality-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }.quality-summary > div:nth-child(2) { border-right: 0; }.quality-summary > div:nth-child(-n+2) { border-bottom: 1px solid var(--line); }.batch-row { grid-template-columns: minmax(0, 1fr) auto; }.batch-counts, .batch-error, .batch-actions { grid-column: 1 / 3; }.batch-actions { justify-content: flex-start; } }
@media (max-width: 560px) { .page-header-note { width: 100%; }.drop-zone { flex-direction: column; text-align: center; }.quality-summary > div { padding: 9px 10px; }.quality-summary strong { font-size: .82rem; }.batch-row { padding: 10px; }.batch-row .compact-button { grid-column: auto; }.batch-actions { flex-wrap: wrap; }.batch-actions .compact-button { flex: 1 1 130px; }.batch-issues .table-wrap table { min-width: 680px; } }
</style>
