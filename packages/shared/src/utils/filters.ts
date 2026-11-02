// Filter state for any list that narrows by a few named choices (exercises by muscle and
// equipment today; anything else later). Platform-agnostic on purpose: the web and mobile
// filter sheets are different components over the same rules, so the rules live here once.
//
// A screen declares its filters as `FilterGroup[]` and holds a `FilterValues` map. Each
// group is single-select, because that is what the API takes (`muscle_group=chest`), and a
// null value means "any". Everything below returns new objects, so the result can go
// straight into `setState` or a URL.

export interface FilterOption {
  /** What goes to the API and into the URL. */
  value: string
  /** What the person reads. */
  label: string
}

export interface FilterGroup {
  /** Stable id: the key in `FilterValues` and the URL parameter name. */
  key: string
  label: string
  options: readonly FilterOption[]
}

export type FilterValues = Record<string, string | null>

export interface ActiveFilter {
  key: string
  value: string
  label: string
  groupLabel: string
}

export function emptyFilters(groups: readonly FilterGroup[]): FilterValues {
  return Object.fromEntries(groups.map((g) => [g.key, null]))
}

export function setFilter(values: FilterValues, key: string, value: string | null): FilterValues {
  return { ...values, [key]: value }
}

// In group order, so the summary row reads the same however the filters were picked. A value
// no option offers is skipped rather than shown: it would filter to nothing with no label to
// explain why.
export function activeFilters(groups: readonly FilterGroup[], values: FilterValues): ActiveFilter[] {
  const out: ActiveFilter[] = []
  for (const g of groups) {
    const value = values[g.key]
    if (value == null) continue
    const option = g.options.find((o) => o.value === value)
    if (option) out.push({ key: g.key, value, label: option.label, groupLabel: g.label })
  }
  return out
}

export function activeFilterCount(groups: readonly FilterGroup[], values: FilterValues): number {
  return activeFilters(groups, values).length
}

// Builds values from anything that can answer "what is set for this key" (a URLSearchParams,
// stored settings). A value is trusted only if the group offers it: a hand-edited
// `?muscle=bogus` would otherwise filter to nothing with no chip lit to explain why.
export function parseFilters(
  groups: readonly FilterGroup[],
  read: (key: string) => string | null | undefined,
): FilterValues {
  return Object.fromEntries(
    groups.map((g) => {
      const raw = read(g.key)
      return [g.key, raw != null && g.options.some((o) => o.value === raw) ? raw : null]
    }),
  )
}
