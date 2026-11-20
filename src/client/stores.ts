/**
 * Derived from @deepseek-ai/dsh-client-ui-workspace 0.1.6-alpha.2 (MIT License,
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

/** Session-list grouping mode: worktree sections, projects, or one flat list. */
export type SessionGroupBy = 'workspace' | 'project' | 'flat'
/** Order of projects within each area. */
export type ProjectOrderBy = 'manual' | 'updated'

/** Workspace browser viewing state persisted across surface remounts and reloads. */
type WorkspaceViewState = {
  groupBy: SessionGroupBy
  projectOrderBy: ProjectOrderBy
  /** Explicit zero-or-five-session state keyed by Workspace group identity. */
  groupExpansion: Record<string, boolean>
  /** Optional visual grouping layered above repository nodes. */
  projectAreas: ProjectArea[]
  /** Pin a "活跃会话" section of running/pending/unread sessions at the top of the tree. */
  showActiveSessions: boolean
  /** Fold the pinned active-sessions section down to its heading row. */
  activeSessionsCollapsed: boolean
  /** Draw tree-guide lines in the indent gutter under each project row. */
  treeGuides: boolean
}

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type WorkspaceViewActions = {
  setGroupBy: (draft: WorkspaceViewState, mode: SessionGroupBy) => void
  setProjectOrderBy: (draft: WorkspaceViewState, mode: ProjectOrderBy) => void
  setShowActiveSessions: (draft: WorkspaceViewState, show: boolean) => void
  setActiveSessionsCollapsed: (draft: WorkspaceViewState, collapsed: boolean) => void
  setTreeGuides: (draft: WorkspaceViewState, show: boolean) => void
  setGroupExpanded: (draft: WorkspaceViewState, key: string, expanded: boolean) => void
  retainExpansionKeys: (draft: WorkspaceViewState, keys: readonly string[]) => void
  createProjectArea: (draft: WorkspaceViewState, id: string, name: string) => void
  renameProjectArea: (draft: WorkspaceViewState, id: string, name: string) => void
  dissolveProjectArea: (draft: WorkspaceViewState, id: string) => void
  setRepoProjectArea: (draft: WorkspaceViewState, repoKey: string, areaId: string | null) => void
  setProjectAreaOrder: (draft: WorkspaceViewState, areaIds: string[]) => void
}

const PERSIST_V1 = 'dsh-left-panel.workspace.view.v1'
const PERSIST_V2 = 'dsh-left-panel.workspace.view.v2'

/**
 * Carry the v1 persisted document forward: the persist key is the storage
 * identity, so swapping keys wholesale would drop every user's section
 * layout and expansion state. The only intentional change in this migration is
 * showActiveSessions, which v2 makes the default; everything else survives.
 * Runs before defineStore so the engine hydrates from the migrated document.
 */
function migratePersistedView(): void {
  try {
    if (localStorage.getItem(PERSIST_V2) !== null) return
    const raw = localStorage.getItem(PERSIST_V1)
    if (raw === null) return
    const doc = JSON.parse(raw) as Record<string, unknown>
    doc.showActiveSessions = true
    localStorage.setItem(PERSIST_V2, JSON.stringify(doc))
    localStorage.removeItem(PERSIST_V1)
  } catch {
    // Unavailable or corrupt storage: hydrate fresh.
  }
}

/**
 * Create the workspace browser viewing store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createWorkspaceViewStore(): EngineStoreHandle<WorkspaceViewState, WorkspaceViewActions> {
  migratePersistedView()
  return defineStore({
    init: (): WorkspaceViewState => ({
      groupBy: 'workspace',
      projectOrderBy: 'manual',
      groupExpansion: {},
      projectAreas: [],
      showActiveSessions: true,
      activeSessionsCollapsed: false,
      treeGuides: false,
    }),
    // v2: showActiveSessions defaults on and treeGuides is new.
    // migratePersistedView carries the v1 document forward so the key bump
    // costs no persisted state.
    persist: PERSIST_V2,
    actions: {
      setGroupBy: (d, mode: SessionGroupBy) => { d.groupBy = mode },
      setProjectOrderBy: (d, mode: ProjectOrderBy) => { d.projectOrderBy = mode },
      setShowActiveSessions: (d, show: boolean) => { d.showActiveSessions = show },
      setActiveSessionsCollapsed: (d, collapsed: boolean) => { d.activeSessionsCollapsed = collapsed },
      setTreeGuides: (d, show: boolean) => { d.treeGuides = show },
      setGroupExpanded: (d, key: string, expanded: boolean) => { d.groupExpansion[key] = expanded },
      retainExpansionKeys: (d, keys: readonly string[]) => {
        const retained = new Set(keys)
        d.groupExpansion = Object.fromEntries(
          Object.entries(d.groupExpansion).filter(([key]) => retained.has(key)),
        )
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
      setProjectAreaOrder: (d, areaIds: string[]) => {
        d.projectAreas ??= []
        const byId = new Map(d.projectAreas.map(area => [area.id, area]))
        const included = new Set<string>()
        const ordered: ProjectArea[] = []
        for (const id of areaIds) {
          const area = byId.get(id)
          if (area === undefined || included.has(id)) continue
          ordered.push(area)
          included.add(id)
        }
        for (const area of d.projectAreas) if (!included.has(area.id)) ordered.push(area)
        d.projectAreas = ordered
      },
    },
  })
}
