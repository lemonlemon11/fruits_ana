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
