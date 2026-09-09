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

function selectFiles(files: File[]) {
  const allowed = files.filter((file) => /\.(csv|xlsx)$/i.test(file.name))
  selectedFiles.value = allowed
  error.value = allowed.length === files.length ? '' : '已忽略非 CSV / XLSX 文件'
}

function onInput(event: Event) {
  selectFiles(Array.from((event.target as HTMLInputElement).files ?? []))
}

function onDrop(event: DragEvent) {
  dragging.value = false
  selectFiles(Array.from(event.dataTransfer?.files ?? []))
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
  uploading.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await uploadImports(selectedFiles.value)
    notice.value = `已处理 ${result.length} 个文件`
    selectedFiles.value = []
    if (fileInput.value) fileInput.value.value = ''
    await loadBatches()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '文件上传失败'
  } finally { uploading.value = false }
}

async function toggleIssues(batchId: string | number) {
  const key = String(batchId)
  if (expandedBatch.value === key) {
    expandedBatch.value = ''
    return
  }
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

onMounted(loadBatches)
</script>

<template>
  <div class="page-stack">
    <header class="page-header"><div><p class="eyebrow">DATA INTAKE</p><h1>导入与数据质量</h1><p>批量接收结算单，并集中处理字段、等级与金额问题。</p></div></header>
    <section class="upload-workbench" aria-labelledby="upload-title">
      <div class="upload-copy"><p class="eyebrow">NEW IMPORT</p><h2 id="upload-title">导入结算单</h2><p>支持 CSV、XLSX，可一次选择多个文件。</p></div>
      <div
        class="drop-zone"
        :class="{ dragging }"
        @dragenter.prevent="dragging = true"
        @dragover.prevent
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <input id="settlement-files" ref="fileInput" class="sr-only" type="file" multiple accept=".csv,.xlsx" @change="onInput">
        <label class="secondary-button" for="settlement-files">选择文件</label>
        <span>或将文件拖放到此处</span>
      </div>
      <div v-if="selectedFiles.length" class="upload-queue" aria-live="polite">
        <div><strong>待导入 {{ selectedFiles.length }} 个文件</strong><span>{{ (selectedSize / 1024 / 1024).toFixed(2) }} MB</span></div>
        <ul><li v-for="file in selectedFiles" :key="`${file.name}-${file.size}`"><span>{{ file.name }}</span><small>{{ (file.size / 1024).toFixed(0) }} KB</small></li></ul>
        <button class="primary-button" type="button" :disabled="uploading" @click="submit">{{ uploading ? '正在解析…' : '开始导入' }}</button>
      </div>
      <div v-if="uploading" class="progress-line" role="progressbar" aria-label="正在导入文件"><span /></div>
      <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
      <p v-if="notice" class="form-message success" aria-live="polite">{{ notice }}</p>
    </section>

    <section class="dashboard-section" aria-labelledby="history-title">
      <header class="section-heading"><div><p class="eyebrow">IMPORT HISTORY</p><h2 id="history-title">导入批次</h2></div><button class="text-button" type="button" :disabled="loading" @click="loadBatches">刷新</button></header>
      <div v-if="loading" class="history-skeleton skeleton-block">正在加载导入记录</div>
      <div v-else-if="!batches.length" class="empty-state prominent"><strong>还没有导入记录</strong><span>完成首次文件导入后，批次与质量统计会显示在这里。</span></div>
      <div v-else class="batch-list">
        <article v-for="batch in batches" :key="batch.id" class="batch-row">
          <div class="batch-file"><strong>{{ batch.fileName }}</strong><small>{{ formatDateTime(batch.importedAt) }} · 批次 #{{ batch.id }}</small></div>
          <span class="status-badge" :class="`status-${batch.status.toLowerCase()}`">{{ statusLabel(batch.status) }}</span>
          <dl class="batch-counts"><div><dt>成功</dt><dd>{{ batch.successCount }}</dd></div><div><dt>警告</dt><dd>{{ batch.warningCount }}</dd></div><div><dt>失败</dt><dd>{{ batch.failureCount }}</dd></div></dl>
          <p v-if="batch.errorSummary" class="batch-error">{{ batch.errorSummary }}</p>
          <div v-if="batch.warningCount || batch.failureCount" class="batch-actions">
            <button
              class="secondary-button compact-button"
              type="button"
              :aria-expanded="expandedBatch === String(batch.id)"
              :aria-controls="`batch-issues-${batch.id}`"
              @click="toggleIssues(batch.id)"
            >{{ expandedBatch === String(batch.id) ? '收起问题' : '查看问题' }}</button>
            <a class="secondary-button compact-button" :href="issuesCsvUrl(batch.id)" download>下载错误 CSV</a>
          </div>
          <div v-if="expandedBatch === String(batch.id)" :id="`batch-issues-${batch.id}`" class="batch-issues">
            <p v-if="loadingIssues === String(batch.id)" class="section-note" aria-live="polite">正在加载问题明细</p>
            <div v-else-if="issueErrors[String(batch.id)]" class="issue-load-error" role="alert">
              <span>{{ issueErrors[String(batch.id)] }}</span><button type="button" class="text-button" @click="toggleIssues(batch.id).then(() => toggleIssues(batch.id))">重试</button>
            </div>
            <p v-else-if="!issuesByBatch[String(batch.id)]?.length" class="section-note">该批次没有问题明细。</p>
            <div v-else class="table-wrap">
              <table>
                <thead><tr><th>行号</th><th>级别</th><th>类型</th><th>字段</th><th>说明</th><th>原始值</th></tr></thead>
                <tbody><tr v-for="issue in issuesByBatch[String(batch.id)]" :key="issue.id">
                  <td>{{ issue.rowNumber ?? '—' }}</td><td>{{ issue.severity }}</td><td>{{ issue.issueType }}</td>
                  <td>{{ issue.fieldName || '—' }}</td><td>{{ issue.message }}</td><td>{{ issue.rawValue || '—' }}</td>
                </tr></tbody>
              </table>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
