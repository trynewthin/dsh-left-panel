/** One plugin-owned visual bucket for repository nodes. */
export interface ProjectArea {
  id: string
  name: string
  /** Repository keys assigned to this area. A repository belongs to at most one area. */
  repoKeys: string[]
}

/** Stable migration fallback for persisted pre-section view documents. */
export const EMPTY_PROJECT_AREAS: readonly ProjectArea[] = Object.freeze([])

/** Preserve reference identity while an older persisted document lacks projectAreas. */
export function projectAreasOrEmpty(value: readonly ProjectArea[] | undefined): readonly ProjectArea[] {
  return value ?? EMPTY_PROJECT_AREAS
}
