import { parseSpecRange } from './specRange.ts'

export const FIXED_FEES = ['代卖佣金', '运费', '车位费', '入场费', '搬运费', '打冷费'] as const

export interface EntrySaleDraft {
  saleDate: string
  variety: string
  /** 归一后的规格文本，支持区间写法（`3/4`、`9/10`）。 */
  headCount: string
  specKg: string
  salesQuantity: number
  unitPrice: number
  remark: string
}

export interface EntryAfterSaleDraft {
  content: string
  summary: string
  amount: number
}

export interface EntryFeeDraft {
  name: string
  amount: number
  isCustom: boolean
}

export interface EntryTotals {
  totalPieces: number
  salesAmount: number
  afterAmount: number
  goodsAmount: number
  feeAmount: number
  payable: number
}

export function createEmptySale(): EntrySaleDraft {
  return {
    saleDate: '',
    variety: '',
    headCount: '',
    specKg: '',
    salesQuantity: 0,
    unitPrice: 0,
    remark: '',
  }
}

export function createEmptyAfterSale(): EntryAfterSaleDraft {
  return { content: '', summary: '', amount: 0 }
}

export function createCustomFee(): EntryFeeDraft {
  return { name: '', amount: 0, isCustom: true }
}

export function fixedFeeDrafts(values: Record<string, number>): EntryFeeDraft[] {
  return FIXED_FEES.map((name) => ({ name, amount: values[name] ?? 0, isCustom: false }))
}

export function saleAmount(row: EntrySaleDraft): number {
  return roundMoney((row.salesQuantity || 0) * (row.unitPrice || 0))
}

/** 单行头数代表值：区间取上限（客户口径），解析不出来按 0 计。 */
export function salePieces(row: EntrySaleDraft): number {
  return parseSpecRange(row.headCount)?.representative ?? 0
}

export function computeEntryTotals(
  sales: EntrySaleDraft[],
  afterSales: EntryAfterSaleDraft[],
  fees: EntryFeeDraft[],
  arrivalQuantity: number | null,
): EntryTotals {
  const totalPieces = sales.reduce((total, row) => total + Number(row.salesQuantity || 0), 0)
  const salesAmount = sales.reduce((total, row) => total + saleAmount(row), 0)
  const afterAmount = afterSales.reduce((total, row) => total + Number(row.amount || 0), 0)
  const feeAmount = fees.reduce((total, row) => total + Number(row.amount || 0), 0)
  const goodsAmount = salesAmount - afterAmount
  return {
    totalPieces,
    salesAmount: roundMoney(salesAmount),
    afterAmount: roundMoney(afterAmount),
    goodsAmount: roundMoney(goodsAmount),
    feeAmount: roundMoney(feeAmount),
    payable: roundMoney(goodsAmount - feeAmount),
  }
}

export function arrivalPiecesDiff(arrivalQuantity: number | null, totalPieces: number): number | null {
  return arrivalQuantity === null ? null : arrivalQuantity - totalPieces
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function money(value: number): string {
  return roundMoney(value).toFixed(2)
}
