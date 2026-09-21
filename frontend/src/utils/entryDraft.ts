import type { EntryDraft, EntryPayload } from '../api/types'

/** 手工录单草稿的内容判断与列表展示；实际读写已迁移到后端数据库。 */

export const ENTRY_DRAFT_KEY_PREFIX = 'fruit-entry-draft:v1'

export type { EntryDraft }

export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function entryDraftKey(userKey: string | number | undefined): string {
  return `${ENTRY_DRAFT_KEY_PREFIX}:${userKey ?? 'anonymous'}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 解析存储内容；结构不完整时按「没有草稿」处理，避免脏数据把页面打挂。 */
export function parseEntryDraft(raw: string | null): EntryDraft | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || typeof parsed.updatedAt !== 'string' || !isRecord(parsed.payload)) return null
    return {
      updatedAt: parsed.updatedAt,
      editing: parsed.editing === true,
      merchantNo: String(parsed.merchantNo ?? ''),
      orderNo: String(parsed.orderNo ?? ''),
      salesCount: Number(parsed.salesCount ?? 0),
      payload: parsed.payload as unknown as EntryPayload,
    }
  } catch {
    return null
  }
}

export function readEntryDraft(storage: DraftStorage, userKey: string | number | undefined): EntryDraft | null {
  return parseEntryDraft(storage.getItem(entryDraftKey(userKey)))
}

export function saveEntryDraft(
  storage: DraftStorage,
  userKey: string | number | undefined,
  draft: EntryDraft,
): void {
  storage.setItem(entryDraftKey(userKey), JSON.stringify(draft))
}

export function clearEntryDraft(storage: DraftStorage, userKey: string | number | undefined): void {
  storage.removeItem(entryDraftKey(userKey))
}

function blanks(...values: string[]): boolean {
  return values.every((value) => !value.trim())
}

/** 只有真正填过东西才留草稿，避免进页面就产生一条空记录。 */
export function hasEntryDraftContent(payload: EntryPayload): boolean {
  const basics = blanks(
    payload.merchantNo,
    payload.orderNo,
    payload.containerNo,
    payload.vehicleNo,
    payload.market,
    payload.arrivalDate,
  )
  if (!basics) return true
  if (payload.arrivalQuantity !== null && payload.arrivalQuantity > 0) return true
  const saleFilled = payload.sales.some((row) => Boolean(row.saleDate?.trim()) || Number(row.salesQuantity) > 0)
  const afterFilled = payload.afterSales.some((row) => Boolean(row.content?.trim()) || Number(row.amount) > 0)
  const feeFilled = payload.fees.some((row) => Number(row.amount) > 0)
  return saleFilled || afterFilled || feeFilled
}

/** 相对时间：草稿列表只需要「多久没动了」。 */
export function draftRelativeTime(updatedAt: string, now: number = Date.now()): string {
  const time = Date.parse(updatedAt)
  if (Number.isNaN(time)) return '时间未知'
  const minutes = Math.floor(Math.max(0, now - time) / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

export function describeEntryDraft(draft: EntryDraft, now: number = Date.now()): string {
  const parts: string[] = []
  if (draft.orderNo.trim()) parts.push(draft.orderNo.trim())
  parts.push(`${draft.salesCount} 行明细`)
  parts.push(`最后编辑 ${draftRelativeTime(draft.updatedAt, now)}`)
  return parts.join(' · ')
}

export function draftTitle(draft: EntryDraft): string {
  const merchantNo = draft.merchantNo.trim()
  if (merchantNo) return `商号 ${merchantNo}`
  return draft.editing ? '正在修改的单据' : '未命名的手工单'
}
