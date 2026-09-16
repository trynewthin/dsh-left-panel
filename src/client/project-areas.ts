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

/** Reorder one custom area around another; the default Projects area is not part of this order. */
export function moveProjectAreaOrder(
  order: readonly string[],
  sourceId: string,
  targetId: string,
  half: 'before' | 'after',
): string[] {
  if (sourceId === targetId || !order.includes(sourceId) || !order.includes(targetId)) return [...order]
  const next = order.filter(id => id !== sourceId)
  const targetIndex = next.indexOf(targetId)
  next.splice(targetIndex + (half === 'after' ? 1 : 0), 0, sourceId)
  return next
}
