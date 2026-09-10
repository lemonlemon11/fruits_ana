/** 导入页文件选择：统一处理“选择文件”与“拖入文件”的多文件累加与过滤。 */

const SUPPORTED_FILE = /\.(csv|xlsx)$/i

export interface FileSelection {
  files: File[]
  ignored: number
}

export function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

/** 把新拖入/选中的文件累加到已选列表，跳过不支持的类型与重复文件。 */
export function addSelectedFiles(current: File[], incoming: File[]): FileSelection {
  const allowed = incoming.filter((file) => SUPPORTED_FILE.test(file.name))
  const seen = new Set(current.map(fileKey))
  const files = [...current]
  for (const file of allowed) {
    const key = fileKey(file)
    if (seen.has(key)) continue
    seen.add(key)
    files.push(file)
  }
  return { files, ignored: incoming.length - allowed.length }
}

/** 拖拽事件是否携带文件，避免把选中文本的拖拽当成导入。 */
export function isFileDrag(transfer: DataTransfer | null): boolean {
  return Boolean(transfer && Array.from(transfer.types).includes('Files'))
}
