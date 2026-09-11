/** AI 分析结论的展示解析：把大模型输出按固定小标题切成小节。 */

export interface AnalysisSection {
  title: string
  points: string[]
}

/** 与后端提示词约定的小标题顺序保持一致。 */
export const ANALYSIS_HEADINGS = ['整体行情', 'A果', 'B果', 'C果', '可以留意的地方'] as const

/** 「等级细分」AI 小结的小标题，与后端 grade_detail 提示词保持一致。 */
export const GRADE_DETAIL_HEADINGS = [
  '这批货的等级结构',
  '哪个号最值钱',
  '哪个号在拖后腿',
  '可以留意的地方',
] as const

const FALLBACK_TITLE = '分析结论'
const HAS_CHINESE = /[\u4e00-\u9fff]/

export interface HighlightSegment {
  text: string
  strong: boolean
}

/** 数字前面不是字母或斜杠才算指标数字，避免把 A5、B6/7 里的数字也当成价格高亮。 */
const NUMBER_PATTERN = /(?<![A-Za-z0-9/])\d+(?:\.\d+)?%?/g

/**
 * 把一条结论拆成「普通文字 / 数字」片段，数字单独加粗。
 * 例：「913 件、平均每件 514.52 元」→ 913、514.52 高亮。
 */
export function highlightNumbers(text: string): HighlightSegment[] {
  const source = text ?? ''
  const segments: HighlightSegment[] = []
  let cursor = 0
  for (const match of source.matchAll(NUMBER_PATTERN)) {
    const start = match.index ?? 0
    if (start > cursor) segments.push({ text: source.slice(cursor, start), strong: false })
    segments.push({ text: match[0], strong: true })
    cursor = start + match[0].length
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor), strong: false })
  return segments.length ? segments : [{ text: source, strong: false }]
}

/** 判断一个小节是不是「给建议」的小节，用于加醒目底色。 */
export function isAdviceHeading(title: string): boolean {
  return /留意|建议|注意/.test(title ?? '')
}

/** 把上游报错转成给果农看的中文提示；后端已经给中文时原样保留。 */
export function friendlyErrorMessage(message: string, fallback = '生成失败，请稍后重试'): string {
  const text = (message ?? '').trim()
  return HAS_CHINESE.test(text) ? text : fallback
}

function cleanLine(rawLine: string): string {
  return rawLine.replace(/^[#>\s]+/, '').replace(/\*\*/g, '').trim()
}

function matchHeading(line: string, headings: readonly string[]): string | null {
  for (const heading of headings) {
    if (line === heading) return heading
    const rest = line.slice(heading.length)
    if (line.startsWith(heading) && /^[：:，,。\s]/.test(rest)) return heading
  }
  return null
}

function stripBullet(line: string): string {
  return line.replace(/^[-*·—•]\s*/, '').trim()
}

/** 把结论文本切成「小标题 + 要点」结构；没有小标题时归入「分析结论」。 */
export function parseAnalysisSections(
  content: string,
  headings: readonly string[] = ANALYSIS_HEADINGS,
): AnalysisSection[] {
  const sections: AnalysisSection[] = []
  let current: AnalysisSection | null = null

  function push(title: string): AnalysisSection {
    const section: AnalysisSection = { title, points: [] }
    sections.push(section)
    return section
  }

  for (const rawLine of (content ?? '').split(/\r?\n/)) {
    const line = cleanLine(rawLine)
    if (!line) continue

    const heading = matchHeading(line, headings)
    if (heading) {
      const remainder = stripBullet(line.slice(heading.length).replace(/^[：:，,。\s]+/, ''))
      const section = push(heading)
      if (remainder) section.points.push(remainder)
      current = section
      continue
    }

    const point = stripBullet(line)
    if (!point) continue
    if (current === null) current = push(FALLBACK_TITLE)
    current.points.push(point)
  }

  const withPoints = sections.filter((section) => section.points.length > 0)
  return withPoints.length ? withPoints : sections
}
