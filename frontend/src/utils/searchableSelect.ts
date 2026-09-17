export type SearchableOption = { value: string; label: string }

export function filterSearchableOptions(
  options: SearchableOption[],
  keyword: string,
): SearchableOption[] {
  const needle = keyword.trim().toLocaleLowerCase()
  if (!needle) return options
  return options.filter((option) => option.label.toLocaleLowerCase().includes(needle))
}

export function searchableOptionLabel(
  options: SearchableOption[],
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? ''
}
