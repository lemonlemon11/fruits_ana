/**
 * 规格（头数 / KG）归一：与后端 `app/parser/spec_range.py` 保持同一套口径。
 *
 * 客户确认的 A1~A11 处理方案见 `docs/2026-09-16-导入异常数据处理确认单.md`：
 * - 头数区间保留、端点升序：`3/4`、`6/8`、`5/7`
 * - 三段区间原样保留：`5/7/8`
 * - KG 区间原样保留：`9/10`、`10/11`
 *   （2026-09-24 起：KG 提交只允许单个数值，区间写法由校验层拒绝；头数仍允许区间）
 * - 单位 / 全角 / 括号不闭合容错；括号里不是数字时整段当后缀
 * - 解析不出来返回 null，由界面标红让人工补全，绝不猜数
 */

const SEPARATOR_RE = /[/\-~—–]+/
const NUMBER_RE = /^\d+(?:\.\d+)?$/
const UNIT_RE = /(公斤|千克|kgs|kg|斤)/gi
const LETTER_RE = /[A-Za-z]+/g
const HEAD_RANGE_RE = /\d+(?:\.\d+)?(?:\s*[/\-~—–]\s*\d+(?:\.\d+)?)*/
const LEADING_GRADE_RE = /^\s*([A-Za-z]{1,3})/
const DASH_ONLY = ['', '-', '—', '–', '~', '/', '无', '空']

export interface SpecRange {
  canonical: string
  minimum: number
  maximum: number
  /** 标量指标用的代表值：客户口径取上限。 */
  representative: number
}

export interface SpecCell {
  raw: string
  gradeRaw: string | null
  headCount: SpecRange | null
  specKg: SpecRange | null
  suffix: string
  isSalesRow: boolean
}

export function formatSpecNumber(value: number): string {
  return String(Number(value.toFixed(6)))
}

export function normalizeSpecText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).normalize('NFKC').trim()
}

/** 把 `9/10KG`、`9-10`、`3/4`、`10` 解析成规范区间；无法解析返回 null。 */
export function parseSpecRange(value: unknown): SpecRange | null {
  const text = cleanForRange(normalizeSpecText(value))
  if (DASH_ONLY.includes(text)) return null

  const numbers: number[] = []
  for (const part of text.split(SEPARATOR_RE)) {
    if (!part) continue
    if (!NUMBER_RE.test(part)) return null
    const number = Number(part)
    if (!Number.isFinite(number) || number <= 0) return null
    if (!numbers.includes(number)) numbers.push(number)
  }
  if (!numbers.length) return null

  numbers.sort((left, right) => left - right)
  return {
    canonical: numbers.map(formatSpecNumber).join('/'),
    minimum: numbers[0],
    maximum: numbers[numbers.length - 1],
    representative: numbers[numbers.length - 1],
  }
}

/** 把结算单「品种(规格)」单元格拆成等级 / 头数 / KG / 后缀（导入链路的兜底校验）。 */
export function splitSpecCell(value: unknown): SpecCell | null {
  const text = normalizeSpecText(value)
  if (!text) return null

  const gradeMatch = text.match(LEADING_GRADE_RE)
  const gradeRaw = gradeMatch ? gradeMatch[1].toUpperCase() : null
  const rest = gradeMatch ? text.slice(gradeMatch[0].length) : text
  if (!gradeRaw) {
    return { raw: text, gradeRaw: null, headCount: null, specKg: null, suffix: text, isSalesRow: false }
  }

  const { headText, parenText, tailText } = splitParentheses(rest)
  const suffixParts: string[] = []

  let specKg: SpecRange | null = null
  if (parenText) {
    if (/\d/.test(parenText)) specKg = parseSpecRange(parenText)
    if (!specKg) suffixParts.push(parenText)
  }

  const strippedHead = headText.replace(LETTER_RE, '')
  const headMatch = strippedHead.match(HEAD_RANGE_RE)
  const headCount = headMatch ? parseSpecRange(headMatch[0]) : null
  suffixParts.push(headMatch ? strippedHead.slice(headMatch[0].length + headMatch.index!) : headText)
  if (tailText) suffixParts.push(tailText)

  return {
    raw: text,
    gradeRaw,
    headCount,
    specKg,
    suffix: suffixParts.map((part) => part.trim()).join('').trim(),
    isSalesRow: true,
  }
}

function cleanForRange(text: string): string {
  return text.toLowerCase().replace(UNIT_RE, '').replace(LETTER_RE, '').replace(/\s+/g, '')
}

function splitParentheses(text: string): { headText: string; parenText: string; tailText: string } {
  const start = text.indexOf('(')
  if (start < 0) return { headText: text, parenText: '', tailText: '' }
  const headText = text.slice(0, start)
  const remainder = text.slice(start + 1)
  const close = remainder.indexOf(')')
  if (close < 0) return { headText, parenText: remainder, tailText: '' }
  return { headText, parenText: remainder.slice(0, close), tailText: remainder.slice(close + 1) }
}
