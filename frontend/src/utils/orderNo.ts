/**
 * 单号展示口径（ADR-015）。
 *
 * 填写人员的原始单号写法不统一（`宝贝01` / `宝贝003` / `宝贝L004`），
 * 后端会把原始单号与「适配后单号」一起存库；页面统一展示适配后的写法，
 * 原始写法保留在数据库，需要时用 `rawOrderNo` 作为提示信息。
 *
 * 适配规则里序号只保留数字：字母标记（如 `宝贝L004` 的 `L`）不参与命名，
 * 因此适配后单号是 `宝贝-004`，而不是 `宝贝-L004`。
 */

export interface OrderNoFields {
  orderNo?: string | null
  orderNoNormalized?: string | null
}

/** 页面统一展示的适配后单号；缺失时回退原始单号，兼容未回填的历史数据。 */
export function displayOrderNo(item: OrderNoFields): string {
  return item.orderNoNormalized?.trim() || item.orderNo?.trim() || ''
}

/** 填写人员的原始单号，仅用于追溯提示。 */
export function rawOrderNo(item: OrderNoFields): string {
  return item.orderNo?.trim() || ''
}
