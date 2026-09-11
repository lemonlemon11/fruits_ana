/**
 * 商号展示口径（ADR-016）。
 *
 * 填写人员的商号写法不统一（`单637` / `单624` / `626` / `640`），后端把原始商号与
 * 「适配后商号」一起存库；页面统一展示适配后的写法，原始写法保留在数据库。
 *
 * 注意：下拉框取值、接口参数与地址栏仍然使用**原始商号** `merchantNo`（业务唯一键），
 * 只有展示走 `merchantNoNormalized`。
 */

export interface MerchantNoFields {
  merchantNo?: string | null
  merchantNoNormalized?: string | null
}

/** 页面统一展示的适配后商号；缺失时回退原始商号，兼容未回填的历史数据。 */
export function displayMerchantNo(item: MerchantNoFields): string {
  return item.merchantNoNormalized?.trim() || item.merchantNo?.trim() || ''
}

/** 填写人员的原始商号，仅用于追溯提示。 */
export function rawMerchantNo(item: MerchantNoFields): string {
  return item.merchantNo?.trim() || ''
}
