/**
 * Derived from @deepseek-ai/dsh-client-ui-workspace 0.1.5-rc.2 (MIT License,
 * Copyright (c) 2026 DeepSeek). Adapted for dsh-left-panel: repositories
 * group their worktrees and Workspace registration follows git.
 */
/**
 * The workspace browser's viewing store: the session-list grouping mode,
 * persisted across reloads. Module level exports the factory only (a
 * module-level handle would pin the store identity across plugin reloads);
 * register() receives the factory and the browser derives its PropsStore
 * share from the return type.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { ProjectArea } from './project-areas.ts'

export type { ProjectArea } from './project-areas.ts'

/** Browser-local order account for the hierarchy-free flat Session list. */
export const FLAT_SESSION_ORDER_KEY = '__flat_session_order__'

/** Session-list grouping mode: workspace sections or one flat recency list. */
export type SessionGroupBy = 'workspace' | 'flat'
/** Session order: user-arranged only, or user-arranged plus activity promotion. */
export type SessionOrderBy = 'manual' | 'updated'

/** Workspace browser viewing state persisted across surface remounts and reloads. */
type WorkspaceViewState = {
  groupBy: SessionGroupBy
  orderBy: SessionOrderBy
  /** Explicit zero-or-five-session state keyed by Workspace group identity. */
  groupExpansion: Record<string, boolean>
  /** Shared editable order per Workspace group plus the browser-local flat-list account. */
  sessionOrderByAccount: Record<string, string[]>
  /** Last observed update timestamps per order account for one-time promotion events. */
  sessionUpdatedAtByAccount: Record<string, Record<string, number>>
  /** Optional visual grouping layered above repository nodes. */
  projectAreas: ProjectArea[]
}

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type WorkspaceViewActions = {
  setGroupBy: (draft: WorkspaceViewState, mode: SessionGroupBy) => void
  setOrderBy: (draft: WorkspaceViewState, mode: SessionOrderBy) => void
  setGroupExpanded: (draft: WorkspaceViewState, key: string, expanded: boolean) => void
  retainAccountKeys: (draft: WorkspaceViewState, workspaceKeys: readonly string[]) => void
  syncSessionOrderAccount: (
    draft: WorkspaceViewState,
    accountKey: string,
    order: string[],
    updatedAt: Record<string, number>,
  ) => void
  setSessionOrder: (draft: WorkspaceViewState, accountKey: string, order: string[]) => void
  createProjectArea: (draft: WorkspaceViewState, id: string, name: string) => void
  renameProjectArea: (draft: WorkspaceViewState, id: string, name: string) => void
  dissolveProjectArea: (draft: WorkspaceViewState, id: string) => void
  setRepoProjectArea: (draft: WorkspaceViewState, repoKey: string, areaId: string | null) => void
}

/**
 * Create the workspace browser viewing store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createWorkspaceViewStore(): EngineStoreHandle<WorkspaceViewState, WorkspaceViewActions> {
  return defineStore({
    init: (): WorkspaceViewState => ({
      groupBy: 'workspace',
      orderBy: 'updated',
      groupExpansion: {},
      sessionOrderByAccount: {},
      sessionUpdatedAtByAccount: {},
      projectAreas: [],
    }),
    persist: 'dsh-left-panel.workspace.view.v1',
    actions: {
      setGroupBy: (d, mode: SessionGroupBy) => { d.groupBy = mode },
      setOrderBy: (d, mode: SessionOrderBy) => { d.orderBy = mode },
      setGroupExpanded: (d, key: string, expanded: boolean) => { d.groupExpansion[key] = expanded },
      retainAccountKeys: (d, workspaceKeys: readonly string[]) => {
        const retained = new Set(workspaceKeys)
        d.groupExpansion = Object.fromEntries(
          Object.entries(d.groupExpansion).filter(([key]) => retained.has(key)),
        )
        d.sessionOrderByAccount = Object.fromEntries(
          Object.entries(d.sessionOrderByAccount).filter(([key]) => retained.has(key)),
        )
        d.sessionUpdatedAtByAccount = Object.fromEntries(
          Object.entries(d.sessionUpdatedAtByAccount).filter(([key]) => retained.has(key)),
        )
      },
      syncSessionOrderAccount: (d, accountKey: string, order: string[], updatedAt: Record<string, number>) => {
        d.sessionOrderByAccount[accountKey] = order
        d.sessionUpdatedAtByAccount[accountKey] = updatedAt
      },
      setSessionOrder: (d, accountKey: string, order: string[]) => {
        d.sessionOrderByAccount[accountKey] = order
      },
      createProjectArea: (d, id: string, name: string) => {
        d.projectAreas ??= []
        if (d.projectAreas.some(area => area.id === id)) return
        d.projectAreas.push({ id, name, repoKeys: [] })
      },
      renameProjectArea: (d, id: string, name: string) => {
        const area = d.projectAreas?.find(candidate => candidate.id === id)
        if (area !== undefined) area.name = name
      },
      dissolveProjectArea: (d, id: string) => {
        d.projectAreas = (d.projectAreas ?? []).filter(area => area.id !== id)
      },
      setRepoProjectArea: (d, repoKey: string, areaId: string | null) => {
        d.projectAreas ??= []
        for (const area of d.projectAreas) area.repoKeys = area.repoKeys.filter(key => key !== repoKey)
        if (areaId === null) return
        const target = d.projectAreas.find(area => area.id === areaId)
        if (target !== undefined) target.repoKeys.push(repoKey)
      },
    },
  })
}
