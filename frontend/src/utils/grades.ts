export const GRADES = ['A', 'B', 'AB', 'C', 'D', 'E', 'F', 'OTHER'] as const

export type Grade = (typeof GRADES)[number]

export const gradeLabels: Record<Grade, string> = {
  A: 'A果',
  B: 'B果',
  AB: 'AB果',
  C: 'C果',
  D: 'D果',
  E: 'E果',
  F: 'F果',
  OTHER: '其他',
}

export const gradeColors: Record<Grade, string> = {
  A: '#16856b',
  B: '#bd7414',
  AB: '#8a6f2f',
  C: '#b94a3c',
  D: '#2f6f8f',
  E: '#7a5aa6',
  F: '#b34f82',
  OTHER: '#6e7780',
}

export function gradeLabel(grade: Grade): string {
  return gradeLabels[grade]
}

export function normalizeGrade(value: unknown): Grade | null {
  const grade = String(value ?? '').trim().toUpperCase()
  if (!grade) return null
  if (grade === 'A') return 'A'
  if (grade === 'B') return 'B'
  if (grade === 'AB') return 'AB'
  if (grade === 'C') return 'C'
  if (grade === 'D') return 'D'
  if (grade === 'E') return 'E'
  if (grade === 'F') return 'F'
  if (grade === 'OTHER' || grade === '其他') return 'OTHER'
  return 'OTHER'
}

/** 从一组等级指标/明细行里提取实际出现过的等级，并按平台固定顺序排列。 */
export function activeGrades(rows: ReadonlyArray<{ grade?: unknown }>): Grade[] {
  const present = new Set<Grade>()
  rows.forEach((row) => {
    const grade = normalizeGrade(row.grade)
    if (grade) present.add(grade)
  })
  return GRADES.filter((grade) => present.has(grade))
}

export function emptyGradeRecord<T>(value: T): Record<Grade, T> {
  return { A: value, B: value, AB: value, C: value, D: value, E: value, F: value, OTHER: value }
}
