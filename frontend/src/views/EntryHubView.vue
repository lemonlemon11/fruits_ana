<script setup lang="ts">
import ClipboardPen from '@lucide/vue/dist/esm/icons/clipboard-pen.mjs'
import Upload from '@lucide/vue/dist/esm/icons/upload.mjs'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getImports, previewImports, type ImportBatch } from '../api/client'
import { currentUser } from '../auth'
import { isFileDrag } from '../utils/importFiles'
import {
  batchStatusDetail,
  batchStatusKind,
  batchStatusLabel,
  batchTitle,
  recentBatches,
} from '../utils/entryHub'
import {
  describeEntryDraft,
  draftTitle,
  readEntryDraft,
  type EntryDraft,
} from '../utils/entryDraft'
import { formatDateTime } from '../utils/format'
const router = useRouter()
const batches = ref<ImportBatch[]>([])
const loading = ref(true)
const batchError = ref('')
const uploadError = ref('')
const draft = ref<EntryDraft | null>(null)
const selectedFiles = ref<File[]>([])
const uploading = ref(false)
const notice = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
let dragDepth = 0
// 手工录单需要 entry:view（operator 也可录单），没有权限的用户只看到文件导入。
const canEnter = computed(() => Boolean(currentUser.value?.permissions.includes('entry:view')))
const recent = computed(() => recentBatches(batches.value))

function go(path: string) {
  void router.push(path)
}
function readDraft() {
  if (!canEnter.value) return
  try {
    draft.value = readEntryDraft(window.localStorage, currentUser.value?.id)
  } catch {
    // 隐私模式下读不到草稿，不影响入口页其余内容。
    draft.value = null
  }
}

async function loadBatches() {
  loading.value = true
  batchError.value = ''
  try {
    batches.value = await getImports()
  } catch (caught) {
    batchError.value = caught instanceof Error ? caught.message : '导入记录加载失败'
  } finally {
    loading.value = false
  }
}

function selectFiles(files: File[]) {
  if (!files.length) return
  const supported = files.filter((file) => /\.(csv|xlsx)$/i.test(file.name))
  if (!supported.length) {
    selectedFiles.value = []
    uploadError.value = '不支持的文件格式，请选择 CSV 或 XLSX 文件。'
    return
  }
  selectedFiles.value = [supported[0]]
  uploadError.value = ''
  notice.value = files.length > 1 ? '一次只能导入一个文件，已保留第一个文件。' : ''
}

function onInput(event: Event) {
  selectFiles(Array.from((event.target as HTMLInputElement).files ?? []))
  if (selectedFiles.value.length) void submitUpload()
}

function openFilePicker() { fileInput.value?.click() }

function clearFiles() {
  selectedFiles.value = []
  if (fileInput.value) fileInput.value.value = ''
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
  if (selectedFiles.value.length) void submitUpload()
}

function preventBrowserFileOpen(event: DragEvent) {
  if (isFileDrag(event.dataTransfer)) event.preventDefault()
}

async function submitUpload() {
  if (!selectedFiles.value.length || uploading.value) return
  const files = [...selectedFiles.value]
  uploading.value = true
  uploadError.value = ''
  notice.value = ''
  try {
    const result = await previewImports(files)
    selectedFiles.value = []
    if (fileInput.value) fileInput.value.value = ''
    await loadBatches()
    notice.value = `已生成 ${result.draftCount} 条待确认草稿，正在打开复核页`
    await router.push({ path: '/import-review', query: { job: result.token } })
  } catch (caught) {
    uploadError.value = caught instanceof Error ? caught.message : '文件上传失败'
  } finally {
    uploading.value = false
  }
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} 兆字节`
  return `${(bytes / 1024).toFixed(0)} 千字节`
}

onMounted(() => {
  readDraft()
  void loadBatches()
  window.addEventListener('dragover', preventBrowserFileOpen)
  window.addEventListener('drop', preventBrowserFileOpen)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragover', preventBrowserFileOpen)
  window.removeEventListener('drop', preventBrowserFileOpen)
})
</script>

<template>
  <section class="entry-hub">
    <header class="hub-head upload-head">
      <button v-if="canEnter" class="ghost-button manual-entry-button" type="button" @click="go('/entry')">
        <ClipboardPen :size="16" aria-hidden="true" />
        手工录单
      </button>
    </header>

    <section
      class="upload-card"
      :class="{ 'is-dragging': dragging, 'is-uploading': uploading }"
      aria-labelledby="upload-title"
      :aria-busy="uploading"
      @dragenter.prevent.stop="onDragEnter"
      @dragover.prevent.stop="onDragOver"
      @dragleave.prevent.stop="onDragLeave"
      @drop.prevent.stop="onDrop"
    >
      <input id="entry-settlement-files" ref="fileInput" class="sr-only" type="file" accept=".csv,.xlsx" @click.stop @change="onInput">
      <div class="upload-zone">
        <span class="upload-icon"><Upload :size="24" aria-hidden="true" /></span>
        <div class="upload-copy">
          <strong id="upload-title">拖动文件到这里上传</strong>
          <p>支持常见表格文件；一次只导入一个文件</p>
        </div>
        <button class="primary-button" type="button" :disabled="uploading" @click="openFilePicker">选择文件</button>
      </div>

      <div v-if="selectedFiles.length" class="upload-file" aria-live="polite">
        <div>
          <strong>{{ selectedFiles[0].name }}</strong>
          <span>{{ formatFileSize(selectedFiles[0].size) }}</span>
        </div>
        <button v-if="!uploading" class="text-button" type="button" @click="clearFiles">移除</button>
      </div>

      <p v-if="uploadError" class="form-message error" role="alert">{{ uploadError }}</p>
      <p v-if="notice" class="form-message success" aria-live="polite">{{ notice }}</p>

      <div v-if="uploading" class="uploading-mask" role="status" aria-live="polite">
        <span class="uploading-spinner" aria-hidden="true"></span>
        <strong>正在导入，请稍候</strong>
        <small>系统正在解析文件并生成待确认草稿，请不要关闭页面。</small>
      </div>
    </section>

    <section class="hub-card">
      <div class="hub-card-head">
        <h2>最近导入</h2>
        <button class="link-button" type="button" @click="go('/imports')">查看全部</button>
      </div>
      <p v-if="loading" class="hub-note">正在读取导入记录…</p>
      <p v-else-if="batchError" class="hub-note is-error">{{ batchError }}</p>
      <p v-else-if="!recent.length" class="hub-note">还没有导入记录，先上传一份结算单表格试试。</p>
      <ul v-else class="batch-list">
        <li v-for="batch in recent" :key="batch.id">
          <div class="batch-main">
            <strong>{{ batchTitle(batch) }}</strong>
            <small>{{ formatDateTime(batch.importedAt) }} · {{ batchStatusDetail(batch) }}</small>
          </div>
          <span class="pill" :class="batchStatusKind(batch)">{{ batchStatusLabel(batchStatusKind(batch)) }}</span>
        </li>
      </ul>
    </section>

    <section v-if="canEnter" class="hub-card">
      <div class="hub-card-head">
        <h2>未完成的手工单</h2>
        <span>填到一半切走的单子会留在这里，接着填就行</span>
      </div>
      <ul v-if="draft" class="batch-list">
        <li>
          <div class="batch-main">
            <strong>{{ draftTitle(draft) }}</strong>
            <small>{{ describeEntryDraft(draft) }}</small>
          </div>
          <button class="ghost-button" type="button" @click="go('/entry?draft=1')">继续录单</button>
        </li>
      </ul>
      <p v-else class="hub-note">暂时没有没填完的单子。</p>
    </section>
  </section>
</template>

<style scoped>
.entry-hub { width: 100%; display: grid; gap: 14px; padding: 4px 0 44px; }
.upload-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: flex-end; gap: 12px; }
.manual-entry-button { display: inline-flex; align-items: center; gap: 7px; min-height: 38px; padding: 0 14px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface); color: var(--ink); font-weight: 800; }
.manual-entry-button:hover { border-color: var(--primary); color: var(--primary); }
.upload-card { position: relative; padding: 18px; border: 1px solid var(--line); border-top: 3px solid var(--primary); border-radius: var(--radius-md); background: var(--surface); box-shadow: var(--shadow); }
.upload-zone { display: flex; align-items: center; gap: 14px; min-height: 120px; padding: 18px; border: 1px dashed var(--line-strong); border-radius: var(--radius); background: var(--surface-soft); }
.upload-card.is-dragging .upload-zone { border-color: var(--primary); background: var(--primary-soft); }
.upload-icon { display: grid; flex: none; place-items: center; width: 46px; height: 46px; border-radius: 12px; background: var(--primary-soft); color: var(--primary); }
.upload-copy { flex: 1 1 auto; min-width: 0; }
.upload-copy strong { display: block; font-size: 1.02rem; overflow-wrap: anywhere; }
.upload-copy p { margin: 5px 0 0; color: var(--muted); font-size: .86rem; line-height: 1.5; }
.upload-zone .primary-button { flex: none; min-height: 42px; padding: 0 16px; font-size: .95rem; }
.upload-file { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-soft); }
.upload-file div { display: grid; gap: 2px; min-width: 0; }
.upload-file strong { font-size: .92rem; overflow-wrap: anywhere; }
.upload-file span { color: var(--muted); font-size: .8rem; }
.upload-file .text-button { flex: none; min-height: 34px; padding: 0 10px; font-size: .85rem; }
.upload-card .form-message { margin-top: 12px; }
.uploading-mask { position: absolute; z-index: 10; inset: 0; display: grid; align-content: center; justify-items: center; gap: 9px; padding: 22px; border-radius: inherit; background: rgba(255, 255, 255, .88); backdrop-filter: blur(2px); text-align: center; }
.uploading-mask strong { color: var(--ink); font-size: 1.05rem; }
.uploading-mask small { color: var(--muted); font-size: .88rem; line-height: 1.5; }
.uploading-spinner { width: 34px; height: 34px; border: 4px solid var(--primary-soft); border-top-color: var(--primary); border-radius: 50%; animation: upload-spin .8s linear infinite; }
@keyframes upload-spin { to { transform: rotate(360deg); } }
.hub-card { min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.hub-card-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.hub-card-head h2 { margin: 0; font-size: 1.02rem; }
.hub-card-head span { color: var(--muted); font-size: .82rem; }
.link-button { border: 0; background: transparent; color: var(--primary); font-weight: 800; font-size: .84rem; padding: 4px 0; }
.batch-list { margin: 0; padding: 0; list-style: none; }
.batch-list li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.batch-list li:last-child { border-bottom: 0; padding-bottom: 0; }
.batch-main { display: grid; gap: 2px; min-width: 0; }
.batch-main strong { font-size: .94rem; overflow-wrap: anywhere; }
.batch-main small { color: var(--muted); font-size: .8rem; }
.pill { flex: none; padding: 3px 9px; border-radius: 999px; font-size: .76rem; font-weight: 800; }
.pill.ok { background: var(--primary-soft); color: var(--primary); }
.pill.warn { background: #fdf3e2; color: #86540d; }
.pill.bad { background: #fbe9e7; color: var(--danger); }
.hub-note { margin: 0; color: var(--muted); font-size: .88rem; }
.hub-note.is-error { color: var(--danger); }
.ghost-button { flex: none; min-height: 36px; padding: 0 14px; border: 1px solid var(--line-strong); border-radius: 999px; background: #fff; color: var(--ink); font-weight: 800; }
.ghost-button:hover { border-color: var(--primary); color: var(--primary); }
@media (max-width: 720px) {
  .hub-card, .upload-card { padding: 14px; }
  .upload-zone { align-items: stretch; flex-direction: column; min-height: 0; }
  .upload-zone .primary-button { width: 100%; }
  .upload-icon { width: 42px; height: 42px; }
}
</style>
