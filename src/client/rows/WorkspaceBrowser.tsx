/**
 * Derived from @deepseek-ai/dsh-client-ui-workspace 0.1.6-alpha.2 (MIT License,
 * Copyright (c) 2026 DeepSeek). Adapted for dsh-left-panel: repositories
 * group their worktrees and Workspace registration follows git.
 */
/**
 * The workspace/session browsing region filling the sidebar shell's
 * `sidebar.workspaces` hole: section header (title + view options + add
 * workspace), search, the grouped tree or flat list, and the workspace
 * dialogs. Wide state renders the full browser; rail state renders the two
 * region icons (search / add workspace) as 36px controls on the shell's shared
 * rail entry path, each requesting expansion through the owner share. Adding
 * is the header button's one action, so it raises the directory flow with no
 * menu in between; the flow and its error dialog live in WorkspacePicker
 * (same package — direct composition, no slot between them).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  Button, Checkbox, IconChevronsUpDownOutlineRegular, IconCloseFillRegular, IconPersonalizationOutlineRegular,
  IconPlusOutlineRegular, IconProjectAddOutlineRegular, IconRefreshOutlineRegular, IconSearchOutlineRegular, IconTriangleRightFillRegular, Menu, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  SessionSearchResultItem,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceBrowserProps } from '../contract/slots.ts'
import type { GroupNode, SessionBranch, SessionNode, TreeSection } from '../tree.ts'
import {
  activeScheduleSessionIds, arrangeSections, deriveActive, deriveFlat, deriveGroups, deriveProjectSessions, deriveSearchResults, mainSessionId,
  owningGroupKey, planWorkspaceMove, repoGroupKey, sortProjectsByRecency, UNGROUPED_KEY, workspaceDropAllowed,
} from '../tree.ts'
import { ProjectAreaHeader, ProjectRowItem, RepoRowItem, SearchResultItem, SessionNodeItem } from './Rows.tsx'
import type { ProjectOrderBy, SessionGroupBy } from '../stores.ts'
import { moveProjectAreaOrder, projectAreasOrEmpty, type ProjectArea } from '../project-areas.ts'
import type { BranchOptions, WorktreeInfo, WorktreeSnapshot } from '../../protocol.ts'
import css from './WorkspaceBrowser.module.css'

/**
 * Column slide length (--ds-transition-duration-slow): rail-search focus waits it out —
 * focus() forces a synchronous layout and would jank the slide.
 */
const EXPAND_SLIDE_MS = 300
/** Pause between the latest keystroke and a Host content-search request. */
const SEARCH_DEBOUNCE_MS = 250
/** `session.search` wire bound, measured in JavaScript UTF-16 code units. */
const SEARCH_QUERY_MAX_CODE_UNITS = 500
/** Session rows visible per Workspace before the local overflow control. */
const COLLAPSED_SESSION_LIMIT = 5
const DEFAULT_PROJECT_AREA_KEY = 'project-area:default'

function projectAreaExpansionKey(id: string): string {
  return `project-area:${id}`
}

/** The worktree a registered Workspace id maps to, if it is one. */
function worktreeOfWorkspace(snapshot: WorktreeSnapshot, workspaceId: WorkspaceId | undefined): WorktreeInfo | undefined {
  if (workspaceId === undefined) return undefined
  for (const repo of snapshot.repos) {
    const found = repo.worktrees.find(worktree => worktree.workspaceId === workspaceId)
    if (found !== undefined) return found
  }
  return undefined
}

/** Fold one Workspace without charging its provisional New Session against the ordinary-row limit. */
function collapsedSessionRows(sessions: readonly SessionNode[]): {
  rows: readonly SessionNode[]
  hiddenCount: number
} {
  let ordinaryCount = 0
  const rows = sessions.filter((session) => {
    if (session.blank && session.title === '') return true
    if (ordinaryCount >= COLLAPSED_SESSION_LIMIT) return false
    ordinaryCount += 1
    return true
  })
  return { rows, hiddenCount: sessions.length - rows.length }
}

/** Keep controlled input and RPC payload inside the session.search wire contract. */
function sanitizeSearchQuery(value: string): string {
  const withoutNul = value.replaceAll('\0', '')
  if (withoutNul.length <= SEARCH_QUERY_MAX_CODE_UNITS) return withoutNul
  let end = SEARCH_QUERY_MAX_CODE_UNITS
  const last = withoutNul.charCodeAt(end - 1)
  const next = withoutNul.charCodeAt(end)
  if (last >= 0xD800 && last <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end--
  return withoutNul.slice(0, end)
}

/** Immutable membership toggle for the local expand-all array. */
function toggled(list: readonly string[], key: string): string[] {
  return list.includes(key) ? list.filter(k => k !== key) : [...list, key]
}

/**
 * Accept the native drag at document level while a row drag is active: row
 * hover still owns the insertion marker, and releasing outside the list must
 * not be rendered as a rejected drop before dragend commits that last marker.
 */
function useNativeDragAcceptance(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const acceptDrag = (event: DragEvent): void => {
      event.preventDefault()
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
    }
    const acceptDrop = (event: DragEvent): void => { event.preventDefault() }
    document.addEventListener('dragover', acceptDrag)
    document.addEventListener('drop', acceptDrop)
    return () => {
      document.removeEventListener('dragover', acceptDrag)
      document.removeEventListener('drop', acceptDrop)
    }
  }, [active])
}

/** Grouping and ordering menu; own open state so it resets with the wide chrome. */
function ViewOptionsMenu({ groupBy, projectOrderBy, showActive, showTreeGuides, onGroupPick, onOrderPick, onActiveToggle, onTreeGuidesToggle, t }: {
  groupBy: SessionGroupBy
  projectOrderBy: ProjectOrderBy
  showActive: boolean
  showTreeGuides: boolean
  onGroupPick: (mode: SessionGroupBy) => void
  onOrderPick: (mode: ProjectOrderBy) => void
  onActiveToggle: () => void
  onTreeGuidesToggle: () => void
  t: WorkspaceBrowserProps['t']
}) {
  const [open, setOpen] = useState(false)
  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={[
        { type: 'label' as const, id: 'group-by', text: t('groupBy.label') },
        { id: 'workspace', label: t('groupBy.workspace') },
        { id: 'project', label: t('groupBy.project') },
        { id: 'flat', label: t('groupBy.flat') },
        { type: 'separator' as const, id: 'order-by-separator' },
        { type: 'label' as const, id: 'order-by', text: t('projectOrderBy.label') },
        { id: 'manual', label: t('projectOrderBy.manual') },
        { id: 'updated', label: t('projectOrderBy.updated') },
        { type: 'separator' as const, id: 'active-separator' },
        { id: 'active-sessions', label: t('viewOptions.activeSessions') },
        ...(groupBy === 'project' ? [] : [{ id: 'tree-guides', label: t('viewOptions.treeGuides') }]),
      ]}
      selectedIds={[groupBy, projectOrderBy,
        ...(showActive ? ['active-sessions'] : []),
        ...(groupBy !== 'project' && showTreeGuides ? ['tree-guides'] : []),
      ]}
      onSelect={(id) => {
        if (id === 'workspace' || id === 'project' || id === 'flat') onGroupPick(id)
        else if (id === 'manual' || id === 'updated') onOrderPick(id)
        else if (id === 'active-sessions') onActiveToggle()
        else if (id === 'tree-guides') onTreeGuidesToggle()
        setOpen(false)
      }}
      align="end"
      dense
      // Portal: the section header clips overflow, so an in-place list would
      // be cut off at the header's bounds.
      portal
      anchor={(
        <Tooltip label={t('viewOptions.label')} side="bottom" delayMs={500}>
          <button
            type="button"
            className={clsx(css.iconButton, css.wide)}
            aria-label={t('viewOptions.label')}
            onClick={() => { setOpen(v => !v) }}
          >
            <IconPersonalizationOutlineRegular />
          </button>
        </Tooltip>
      )}
    />
  )
}

/** In-flight root-row drag: source identity plus the current insert marker. */
/** In-flight Workspace-row drag: the moving block (one row, or a whole repository) plus the marker. */
interface WorkspaceDragState {
  /** Workspace ids the drag carries, in durable order. */
  ids: readonly string[]
  /** Repository boundary for a nested worktree drag; absent for top-level section drags. */
  repoKey?: string | undefined
  /** Repository identity for a top-level project-node drag. */
  projectKey?: string | undefined
  /** Area the top-level project occupied when dragging began; null is the default area. */
  sourceAreaId?: string | null | undefined
  /** Area header currently accepting this project; undefined means none. */
  overAreaId?: string | null | undefined
  /** Entire target section, so dropping after a repository clears all of its worktrees. */
  over: { ids: readonly string[]; half: 'before' | 'after' } | null
}

interface ProjectAreaDragState {
  id: string
  over: { id: string; half: 'before' | 'after' } | null
}

/** Resolve an insertion side from the full rendered workspace group. */
function workspaceGroupHalf(e: { clientY: number; currentTarget: HTMLElement }): 'before' | 'after' {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

type SessionTreeProps = Pick<
  WorkspaceBrowserProps,
  'useSessions' | 'useSessionStatus' | 'startSession' | 'open' | 'forkSession'
  | 'insertWorkspaceBefore' | 't' | 'usePanelInfo' | 'worktrees'
> & {
  /** Host account home for POSIX hover-path abbreviation. */
  home?: string | undefined
  workspaces: readonly WorkspaceView[]
  /** Repositories and worktrees as the plugin's host half last observed them. */
  snapshot: WorktreeSnapshot
  /** Whether the current Workspace stream has a complete Host baseline. */
  workspaceReady: boolean
  /** List each project's sessions directly under its repository row. */
  projectView: boolean
  /** Explicit persisted zero-or-five-session state by Workspace group. */
  groupExpansion: Readonly<Record<string, boolean>>
  /** Persist one Workspace group's zero-or-five-session state. */
  setGroupExpanded: (key: string, expanded: boolean) => void
  /** Registry-global archive set (hidden rows). */
  archivedSessionIds: readonly SessionNode['id'][]
  /** Open the browser-owned rename dialog for a real Workspace group. */
  onRenameRequest: (workspaceId: WorkspaceId, currentTitle: string) => void
  /** Open the browser-owned branch-rename dialog for a worktree row. */
  onBranchRenameRequest: (workspaceId: WorkspaceId, currentBranch: string) => void
  /** Open the browser-owned rename dialog for a repository node. */
  onRepoRenameRequest: (repoKey: string, currentName: string) => void
  /** Plugin-owned project sections and their mutations. */
  projectAreas: readonly ProjectArea[]
  onProjectAreaRenameRequest: (areaId: string, currentName: string) => void
  onProjectAreaDissolve: (areaId: string) => void
  onRepoProjectAreaChange: (repoKey: string, areaId: string | null) => void
  onProjectAreaOrderChange: (areaIds: string[]) => void
  /** Open the browser-owned delete-confirmation dialog for a real Workspace group. */
  onDeleteRequest: (workspaceId: WorkspaceId, currentTitle: string) => void
  /** Remove every Workspace registration under one repository after confirmation. */
  onRepoDeleteRequest: (repoKey: string, title: string, workspaceIds: readonly WorkspaceId[]) => void
  /** Open the browser-owned new-worktree dialog for a repository node. */
  onRepoCreateWorktree: (repoKey: string) => void
  /** Open the browser-owned session rename dialog. */
  onSessionRename: (sessionId: SessionNode['id'], currentTitle: string) => void
  /** Archive a session (row menu action; the row disappears on the state echo). */
  onSessionArchive: (sessionId: SessionNode['id']) => void
  /** Sessions whose Host reminder catalog entry is active (row clock mark). */
  activeSchedules: ReadonlySet<SessionId>
  /** Ordering policy for projects within an area. */
  projectOrderBy: ProjectOrderBy
  /** Pin the derived running/pending/unread sessions above the section tree. */
  showActiveSessions: boolean
  /** Fold the pinned active-sessions section down to its heading row. */
  activeSessionsCollapsed: boolean
  /** Toggle the pinned section's folded state. */
  onActiveSessionsToggle: () => void
  /** Draw tree-guide connectors in the worktree indent gutter. */
  showTreeGuides: boolean
  /** One Session chosen from search that must be exposed and scrolled into view. */
  revealSessionId?: SessionId | undefined
  /** Acknowledge that the chosen Session row has been revealed. */
  onSessionRevealed: (sessionId: SessionId) => void
  /** Request the tree to expand and reveal the owning session row (active list jumps). */
  onSessionRevealRequest?: ((sessionId: SessionId) => void) | undefined
  /** Session row to pulse-emphasize right after a jump (clears on its own timer). */
  flashSessionId?: SessionId | undefined
}

/** The scrolling session tree; unmounting drops the sessions subscription and expand-all state. */
function SessionTree({
  useSessions, useSessionStatus, startSession, open, forkSession, workspaces, archivedSessionIds,
  workspaceReady, projectView, usePanelInfo,
  onRenameRequest, onBranchRenameRequest, onDeleteRequest, onRepoDeleteRequest, onSessionRename, onSessionArchive, onRepoRenameRequest,
  onRepoCreateWorktree,
  insertWorkspaceBefore, projectOrderBy, showActiveSessions, activeSessionsCollapsed, onActiveSessionsToggle, showTreeGuides, activeSchedules,
  groupExpansion, setGroupExpanded,
  home, t,
  revealSessionId, onSessionRevealed, onSessionRevealRequest, flashSessionId, snapshot, worktrees,
  projectAreas, onProjectAreaRenameRequest, onProjectAreaDissolve, onRepoProjectAreaChange,
  onProjectAreaOrderChange,
}: SessionTreeProps) {
  const panelActive = usePanelInfo(info => info.activePanelId !== null)
  const list = useSessions(s => s)
  const statuses = useSessionStatus(s => s)
  const current = panelActive ? undefined : mainSessionId(list)
  const revealGroup = revealSessionId === undefined || !workspaceReady
    ? undefined
    : owningGroupKey(workspaces, revealSessionId)
  const [expandedSessionGroups, setExpandedSessionGroups] = useState<string[]>([])
  const [workspaceDrag, setWorkspaceDrag] = useState<WorkspaceDragState | null>(null)
  const workspaceDropCommitted = useRef(false)
  const [projectAreaDrag, setProjectAreaDrag] = useState<ProjectAreaDragState | null>(null)
  const projectAreaDropCommitted = useRef(false)
  useNativeDragAcceptance(workspaceDrag !== null || projectAreaDrag !== null)
  const currentGroup = current === undefined || !workspaceReady
    ? undefined
    : owningGroupKey(workspaces, current)
  const projectKeyByWorkspace = useMemo(() => {
    const keys = new Map<string, string>()
    if (!projectView) return keys
    const repos = new Set(snapshot.repos.map(repo => repo.key))
    for (const workspace of workspaces) {
      const repoKey = snapshot.workspaceRepo[workspace.workspaceId]
      if (repoKey !== undefined && repos.has(repoKey)) keys.set(workspace.workspaceId, repoGroupKey(repoKey))
    }
    return keys
  }, [projectView, snapshot, workspaces])
  useEffect(() => {
    if (currentGroup === undefined || projectKeyByWorkspace.has(currentGroup) || Object.hasOwn(groupExpansion, currentGroup)) return
    setGroupExpanded(currentGroup, true)
  }, [currentGroup, projectKeyByWorkspace, setGroupExpanded, groupExpansion])
  const expandedGroups = useMemo(() => {
    const keys = Object.entries(groupExpansion).filter(([, expanded]) => expanded).map(([key]) => key)
    for (const [workspaceId, projectKey] of projectKeyByWorkspace) {
      if (groupExpansion[projectKey] !== false) keys.push(workspaceId)
    }
    return keys
  }, [groupExpansion, projectKeyByWorkspace])
  const groups = useMemo(
    () => deriveGroups(list, workspaces, archivedSessionIds, statuses, activeSchedules, { expandedGroups }),
    [list, workspaces, archivedSessionIds, statuses, activeSchedules, expandedGroups],
  )
  const sections = useMemo(
    () => arrangeSections(groups, snapshot, groupExpansion),
    [groups, snapshot, groupExpansion],
  )
  const projectRows = useMemo(() => {
    const projects = new Map<string, {
      sessions: SessionNode[]
      branches: Map<SessionId, SessionBranch>
    }>()
    if (!projectView) return projects
    for (const section of sections) {
      if (section.kind !== 'repo' || !section.expanded) continue
      const rows = deriveProjectSessions(section)
      projects.set(section.key, {
        sessions: rows.map(row => row.node),
        branches: new Map(rows.map(row => [row.node.id, row.branch])),
      })
    }
    return projects
  }, [projectView, sections])
  // The pinned jump list derives from the raw list, not the group projection,
  // so folded Workspaces still contribute their active sessions.
  const activeSessions = useMemo(
    () => showActiveSessions ? deriveActive(list, archivedSessionIds, statuses, activeSchedules) : [],
    [showActiveSessions, list, archivedSessionIds, statuses, activeSchedules],
  )
  const updatedAtByWorkspace = useMemo(() => {
    const latestByWorkspace = new Map<string, number>()
    if (projectOrderBy !== 'updated') return latestByWorkspace
    for (const workspace of workspaces) {
      let latest = -Infinity
      for (const id of workspace.sessionIds) {
        latest = Math.max(latest, list.byId[id]?.updatedAt ?? -Infinity)
      }
      latestByWorkspace.set(workspace.workspaceId, latest)
    }
    return latestByWorkspace
  }, [list.byId, projectOrderBy, workspaces])
  const warnRejected = (what: string) => (reason: unknown): void => { console.warn(`${what} rejected:`, reason) }
  const areaByRepo = useMemo(() => {
    const areas = new Map<string, string>()
    for (const area of projectAreas) {
      for (const repoKey of area.repoKeys) if (!areas.has(repoKey)) areas.set(repoKey, area.id)
    }
    return areas
  }, [projectAreas])
  const revealProject = revealGroup === undefined ? undefined : projectKeyByWorkspace.get(revealGroup)
  const revealListKey = revealProject ?? revealGroup
  useEffect(() => {
    if (revealGroup === undefined || revealListKey === undefined) return
    const repoKey = snapshot.workspaceRepo[revealGroup]
    const areaId = repoKey === undefined ? undefined : areaByRepo.get(repoKey)
    const keys = [revealListKey]
    if (repoKey !== undefined && revealProject === undefined) keys.push(repoGroupKey(repoKey))
    if (projectAreas.length > 0) keys.push(areaId === undefined ? DEFAULT_PROJECT_AREA_KEY : projectAreaExpansionKey(areaId))
    for (const key of keys) if (groupExpansion[key] !== true) setGroupExpanded(key, true)
  }, [areaByRepo, groupExpansion, projectAreas.length, revealGroup, revealListKey, revealProject, setGroupExpanded, snapshot])
  useEffect(() => {
    if (revealSessionId === undefined || revealListKey === undefined) return
    const rows = revealProject === undefined
      ? groups.find(group => group.key === revealListKey)?.sessions
      : projectRows.get(revealProject)?.sessions
    if (rows === undefined || !rows.some(row => row.id === revealSessionId)) return
    if (collapsedSessionRows(rows).rows.some(row => row.id === revealSessionId)) return
    setExpandedSessionGroups(keys => keys.includes(revealListKey) ? keys : [...keys, revealListKey])
  }, [groups, projectRows, revealListKey, revealProject, revealSessionId])
  const now = Date.now()
  const commitWorkspaceDrag = (
    activeDrag: WorkspaceDragState,
    over: NonNullable<WorkspaceDragState['over']>,
  ): void => {
    if (workspaceDropCommitted.current) return
    workspaceDropCommitted.current = true
    setWorkspaceDrag(null)
    const move = planWorkspaceMove(
      workspaces.map(workspace => workspace.workspaceId as string),
      activeDrag.ids,
      over,
    )
    if (move === undefined) return
    // Each Workspace lands in front of the same anchor, so the block keeps its
    // internal order and the durable Host order carries the new arrangement.
    void (async () => {
      for (const id of move.ids) {
        await insertWorkspaceBefore(id as WorkspaceId, move.anchor as WorkspaceId | undefined)
      }
    })().catch((reason: unknown) => { console.warn('workspace reorder rejected:', reason) })
  }
  const commitProjectArea = (activeDrag: WorkspaceDragState, areaId: string | null): void => {
    if (workspaceDropCommitted.current || activeDrag.projectKey === undefined) return
    workspaceDropCommitted.current = true
    setWorkspaceDrag(null)
    if (activeDrag.sourceAreaId !== areaId) onRepoProjectAreaChange(activeDrag.projectKey, areaId)
  }
  const commitProjectAreaOrder = (
    activeDrag: ProjectAreaDragState,
    over: NonNullable<ProjectAreaDragState['over']>,
  ): void => {
    if (projectAreaDropCommitted.current) return
    projectAreaDropCommitted.current = true
    setProjectAreaDrag(null)
    const current = projectAreas.map(area => area.id)
    const next = moveProjectAreaOrder(current, activeDrag.id, over.id, over.half)
    if (!next.every((id, index) => id === current[index])) onProjectAreaOrderChange(next)
  }
  const renderSessionRows = (
    key: string,
    sessions: readonly SessionNode[],
    branches?: ReadonlyMap<SessionId, SessionBranch>,
  ) => {
    const collapsed = collapsedSessionRows(sessions)
    const sessionsExpanded = expandedSessionGroups.includes(key)
    return (
      <>
        {(sessionsExpanded ? sessions : collapsed.rows).map(node => (
          <SessionNodeItem
            key={node.id}
            node={node}
            currentId={current}
            now={now}
            onOpen={open}
            onRename={onSessionRename}
            onFork={forkSession}
            onArchive={onSessionArchive}
            onReveal={node.id === revealSessionId && key === revealListKey
              ? () => { onSessionRevealed(node.id) }
              : undefined}
            flash={node.id === flashSessionId}
            branch={branches?.get(node.id)}
            t={t}
          />
        ))}
        {collapsed.hiddenCount > 0 && (
          <button
            type="button"
            className={css.sessionOverflowButton}
            aria-expanded={sessionsExpanded}
            onClick={() => { setExpandedSessionGroups(keys => toggled(keys, key)) }}
          >
            {sessionsExpanded
              ? t('sessions.collapse')
              : t('sessions.expand', { n: collapsed.hiddenCount })}
          </button>
        )}
      </>
    )
  }
  /** One Workspace group: header row + expanded top-level session rows. */
  const renderGroup = (group: GroupNode, nested: boolean, repoKey?: string) => {
    const workspaceId = group.workspaceId
    const groupWorktree = nested ? worktreeOfWorkspace(snapshot, workspaceId) : undefined
    const workspaceMarker = workspaceId !== undefined && workspaceDrag?.over?.ids.includes(workspaceId)
      ? workspaceDrag.over.half
      : null
    const workspaceDragProps = workspaceId === undefined ? undefined : {
      start: () => {
        workspaceDropCommitted.current = false
        setWorkspaceDrag({
          ids: [workspaceId as string],
          ...(nested ? { repoKey } : { sourceAreaId: null }),
          over: null,
        })
      },
      end: () => {
        if (workspaceDrag?.over !== null && workspaceDrag?.over !== undefined) {
          commitWorkspaceDrag(workspaceDrag, workspaceDrag.over)
        } else {
          setWorkspaceDrag(null)
        }
        workspaceDropCommitted.current = false
      },
    }
    const acceptsWorkspaceDrag = workspaceId !== undefined && workspaceDrag !== null
      && (workspaceDrag.projectKey === undefined || (projectOrderBy === 'manual' && workspaceDrag.sourceAreaId === null))
      && workspaceDropAllowed(workspaceDrag.repoKey, nested ? repoKey : undefined)
    const hoverWorkspace = !acceptsWorkspaceDrag
      ? undefined
      : (half: 'before' | 'after') => {
        setWorkspaceDrag(active => active === null
          ? active
          : { ...active, over: { ids: [workspaceId], half } })
      }
    const dropWorkspace = !acceptsWorkspaceDrag
      ? undefined
      : (half: 'before' | 'after') => {
        if (workspaceDrag === null) return
        commitWorkspaceDrag(workspaceDrag, { ids: [workspaceId], half })
      }
    return (
    // Group section: header row + expanded top-level session rows. The
    // inter-group breathing room is the section's own margin
    // (WorkspaceBrowser.module.css).
      <div
        key={group.key}
        className={clsx(
          css.groupSection,
          nested && css.nestedSection,
          workspaceMarker === 'before' && css.workspaceDropBefore,
          workspaceMarker === 'after' && css.workspaceDropAfter,
        )}
        onDragOver={workspaceDrag === null || hoverWorkspace === undefined
          ? undefined
          : (e) => {
            e.preventDefault()
            if (nested) e.stopPropagation()
            e.dataTransfer.dropEffect = 'move'
            hoverWorkspace(workspaceGroupHalf(e))
          }}
        onDrop={workspaceDrag === null || dropWorkspace === undefined
          ? undefined
          : (e) => {
            e.preventDefault()
            if (nested) e.stopPropagation()
            dropWorkspace(workspaceGroupHalf(e))
          }}
      >
        <ProjectRowItem
          group={group}
          home={home}
          t={t}
          nested={nested}
          onToggle={() => {
            if (group.expanded) {
              setExpandedSessionGroups(keys => keys.filter(key => key !== group.key))
            }
            setGroupExpanded(group.key, !group.expanded)
          }}
          onCreate={() => {
            if (group.workspaceId !== undefined) {
              setGroupExpanded(group.key, true)
              startSession(group.workspaceId)
            }
          }}
          drag={workspaceDragProps}
          actions={group.workspaceId === undefined
            ? undefined
            : {
              rename: () => {
                if (group.workspaceId !== undefined) onRenameRequest(group.workspaceId, group.label)
              },
              ...(nested && groupWorktree?.branch != null
                ? {
                  renameBranch: () => {
                    onBranchRenameRequest(group.workspaceId as WorkspaceId, groupWorktree.branch as string)
                  },
                }
                : {}),
              delete: () => { onDeleteRequest(group.workspaceId as WorkspaceId, group.label) },
              deleteDisabled: nested && groupWorktree?.main === true,
            }}
        />
        {renderSessionRows(group.key, group.sessions)}
      </div>
    )
  }
  const sectionsByArea = new Map(projectAreas.map(area => [area.id, [] as TreeSection[]]))
  const defaultSections: TreeSection[] = []
  for (const section of sections) {
    if (section.kind !== 'repo') {
      defaultSections.push(section)
      continue
    }
    const areaId = areaByRepo.get(section.repo.key)
    const bucket = areaId === undefined ? undefined : sectionsByArea.get(areaId)
    if (bucket === undefined) defaultSections.push(section)
    else bucket.push(section)
  }
  const orderArea = (rows: readonly TreeSection[]): readonly TreeSection[] => projectOrderBy === 'updated'
    ? sortProjectsByRecency(rows, updatedAtByWorkspace)
    : rows
  const renderTopSection = (section: TreeSection, areaId: string | null) => {
    if (section.kind === 'group') return renderGroup(section.group, false)
    const project = projectRows.get(section.key)
    const mainWorktree = section.repo.worktrees.find(worktree => worktree.main && worktree.exists && !worktree.bare)
    const mainWorkspaceId = section.groups.find(group => group.workspaceId === mainWorktree?.workspaceId)?.workspaceId
    // The node is reordered by moving its Workspaces as one block, so the
    // durable Host order still reads sensibly outside this plugin.
    const anchorId = section.workspaceIds[0]
    const sectionMarker = workspaceDrag?.repoKey === undefined
      && workspaceDrag?.sourceAreaId === areaId
      && anchorId !== undefined && workspaceDrag?.over?.ids.includes(anchorId)
      ? workspaceDrag.over.half
      : null
    const nodeDrag = anchorId === undefined || (projectOrderBy === 'updated' && projectAreas.length === 0) ? undefined : {
      start: () => {
        workspaceDropCommitted.current = false
        setWorkspaceDrag({
          ids: section.workspaceIds,
          projectKey: section.repo.key,
          sourceAreaId: areaId,
          over: null,
        })
      },
      end: () => {
        if (workspaceDrag?.overAreaId !== undefined) {
          commitProjectArea(workspaceDrag, workspaceDrag.overAreaId)
        } else if (workspaceDrag?.over !== null && workspaceDrag?.over !== undefined) {
          commitWorkspaceDrag(workspaceDrag, workspaceDrag.over)
        } else {
          setWorkspaceDrag(null)
        }
        workspaceDropCommitted.current = false
      },
    }
    const acceptsOrder = projectOrderBy !== 'updated' && workspaceDrag !== null && workspaceDrag.repoKey === undefined
      && workspaceDrag.sourceAreaId === areaId && anchorId !== undefined
    return (
      <div
        key={section.key}
        className={clsx(
          css.groupSection,
          sectionMarker === 'before' && css.workspaceDropBefore,
          sectionMarker === 'after' && css.workspaceDropAfter,
        )}
        onDragOver={!acceptsOrder
          ? undefined
          : (e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            const half = workspaceGroupHalf(e)
            setWorkspaceDrag(active => (active === null ? active : {
              ...active,
              overAreaId: undefined,
              over: { ids: section.workspaceIds, half },
            }))
          }}
        onDrop={!acceptsOrder
          ? undefined
          : (e) => {
            e.preventDefault()
            if (workspaceDrag !== null) {
              commitWorkspaceDrag(workspaceDrag, { ids: section.workspaceIds, half: workspaceGroupHalf(e) })
            }
          }}
      >
        <RepoRowItem
          section={section}
          home={home}
          t={t}
          drag={nodeDrag}
          onCreateSession={mainWorkspaceId === undefined ? undefined : () => {
            setGroupExpanded(section.key, true)
            if (!projectView) setGroupExpanded(mainWorkspaceId, true)
            startSession(mainWorkspaceId)
          }}
          onToggle={() => {
            if (projectView && section.expanded) {
              setExpandedSessionGroups(keys => keys.filter(key => key !== section.key))
            }
            setGroupExpanded(section.key, !section.expanded)
          }}
          onRefresh={() => { worktrees.refresh().catch(warnRejected('worktree refresh')) }}
          onRename={() => { onRepoRenameRequest(section.repo.key, section.repo.name) }}
          onDelete={() => { onRepoDeleteRequest(section.repo.key, section.repo.name, section.workspaceIds as readonly WorkspaceId[]) }}
          onRestore={(path) => { worktrees.restoreWorkspace(path).catch(warnRejected('workspace restore')) }}
          onCreateWorktree={() => { onRepoCreateWorktree(section.repo.key) }}
        />
        {projectView
          ? project !== undefined && (
            <div role="group">
              {renderSessionRows(section.key, project.sessions, project.branches)}
            </div>
          )
          : section.expanded && section.groups.map(group => renderGroup(group, true, section.repo.key))}
      </div>
    )
  }
  const renderAreaHeader = (area: ProjectArea | null) => {
    const areaId = area?.id ?? null
    const expansionKey = area === null ? DEFAULT_PROJECT_AREA_KEY : projectAreaExpansionKey(area.id)
    const expanded = groupExpansion[expansionKey] ?? true
    const canAccept = projectAreaDrag === null
      && workspaceDrag?.projectKey !== undefined && workspaceDrag.sourceAreaId !== areaId
    return (
      <ProjectAreaHeader
        key={area?.id ?? '__default_project_area__'}
        name={area?.name ?? t('area.default')}
        expanded={expanded}
        active={workspaceDrag?.overAreaId === areaId}
        drag={area === null ? undefined : {
          active: projectAreaDrag !== null,
          marker: projectAreaDrag?.over?.id === area.id ? projectAreaDrag.over.half : null,
          start: () => {
            projectAreaDropCommitted.current = false
            setProjectAreaDrag({ id: area.id, over: null })
          },
          hover: (half) => {
            setProjectAreaDrag(current => current === null
              ? current
              : { ...current, over: { id: area.id, half } })
          },
          drop: (half) => {
            if (projectAreaDrag !== null) commitProjectAreaOrder(projectAreaDrag, { id: area.id, half })
          },
          end: () => {
            if (projectAreaDrag?.over !== null && projectAreaDrag?.over !== undefined) {
              commitProjectAreaOrder(projectAreaDrag, projectAreaDrag.over)
            } else {
              setProjectAreaDrag(null)
            }
            projectAreaDropCommitted.current = false
          },
        }}
        onToggle={() => { setGroupExpanded(expansionKey, !expanded) }}
        t={t}
        {...area === null ? {} : {
          onRename: () => { onProjectAreaRenameRequest(area.id, area.name) },
          onDissolve: () => { onProjectAreaDissolve(area.id) },
        }}
        onDragOver={!canAccept ? undefined : (e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setWorkspaceDrag(active => active === null ? active : { ...active, over: null, overAreaId: areaId })
        }}
        onDrop={!canAccept ? undefined : (e) => {
          e.preventDefault()
          if (workspaceDrag !== null) commitProjectArea(workspaceDrag, areaId)
        }}
      />
    )
  }
  const firstRowId = (() => {
    const first = sections[0]
    if (first === undefined) return undefined
    return first.kind === 'group' ? (first.group.workspaceId as string | undefined) : first.workspaceIds[0]
  })()
  const workspaceDropAtListStart = firstRowId !== undefined
    && workspaceDrag?.repoKey === undefined
    && workspaceDrag?.over?.ids[0] === firstRowId
    && workspaceDrag.over.half === 'before'

  return (
    <div className={clsx(css.treeBody, css.wide)}>
      {workspaceDropAtListStart && <span className={css.listTopDropIndicator} aria-hidden="true" />}
      <div
        className={clsx(css.list, showTreeGuides && css.treeGuides, workspaceDropAtListStart && css.listTopDropActive)}
        role="tree"
        aria-label={t('section.sessions')}
      >
        {activeSessions.length > 0 && (
          <div className={css.groupSection} role="group" aria-label={t('activeSessions.label')}>
            <div
              className={css.activeHeader}
              role="button"
              tabIndex={0}
              aria-expanded={!activeSessionsCollapsed}
              onClick={onActiveSessionsToggle}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onActiveSessionsToggle()
              }}
            >
              <span className={css.activeHeaderName}>{t('activeSessions.label')}</span>
              <span className={css.activeChevron}>
                <IconTriangleRightFillRegular className={clsx(css.activeArrow, !activeSessionsCollapsed && css.activeArrowOpen)} />
              </span>
            </div>
            {!activeSessionsCollapsed && activeSessions.map(node => (
              <SessionNodeItem
                key={node.id}
                node={node}
                currentId={current}
                now={now}
                onOpen={(id) => {
                  onSessionRevealRequest?.(id)
                  open(id)
                }}
                onRename={onSessionRename}
                onFork={forkSession}
                onArchive={onSessionArchive}
                t={t}
              />
            ))}
          </div>
        )}
        {groups.length === 0 && (
          <div className={css.empty}>{t('empty.none')}</div>
        )}
        {projectAreas.length === 0
          ? orderArea(defaultSections).map(section => renderTopSection(section, null))
          : (
            <>
              {projectAreas.map(area => (
                <div key={area.id} className={css.projectArea}>
                  {renderAreaHeader(area)}
                  {(groupExpansion[projectAreaExpansionKey(area.id)] ?? true)
                    && orderArea(sectionsByArea.get(area.id) ?? []).map(section => renderTopSection(section, area.id))}
                </div>
              ))}
              <div className={css.projectArea}>
                {renderAreaHeader(null)}
                {(groupExpansion[DEFAULT_PROJECT_AREA_KEY] ?? true)
                  && orderArea(defaultSections).map(section => renderTopSection(section, null))}
              </div>
            </>
          )}
      </div>
    </div>
  )
}

/** The flat "In one list" body: session rows in update order. */
function FlatList({
  useSessions, useSessionStatus, open, forkSession, onSessionRename, onSessionArchive,
  archivedSessionIds, usePanelInfo,
  activeSchedules, revealSessionId, onSessionRevealed, t,
}: Pick<
  SessionTreeProps,
  | 'useSessions'
  | 'useSessionStatus'
  | 'open'
  | 'forkSession'
  | 'onSessionRename'
  | 'onSessionArchive'
  | 'archivedSessionIds'
  | 'usePanelInfo'
  | 'revealSessionId'
  | 'onSessionRevealed'
  | 'activeSchedules'
  | 't'
>) {
  const panelActive = usePanelInfo(info => info.activePanelId !== null)
  const list = useSessions(s => s)
  const statuses = useSessionStatus(s => s)
  const rows = useMemo(
    () => deriveFlat(list, archivedSessionIds, statuses, activeSchedules),
    [list, archivedSessionIds, statuses, activeSchedules],
  )
  const now = Date.now()
  return (
    <div className={clsx(css.treeBody, css.wide)}>
      <div className={clsx(css.list, css.flatList)} role="tree" aria-label={t('section.sessions')}>
        {rows.length === 0 && (
          <div className={css.empty}>{t('empty.none')}</div>
        )}
        {rows.map(node => (
          <SessionNodeItem
            key={node.id}
            node={node}
            currentId={panelActive ? undefined : mainSessionId(list)}
            now={now}
            onOpen={open}
            onRename={onSessionRename}
            onFork={forkSession}
            onArchive={onSessionArchive}
            onReveal={node.id === revealSessionId
              ? () => { onSessionRevealed(node.id) }
              : undefined}
            flat
            t={t}
          />
        ))}
      </div>
    </div>
  )
}

interface RemoteSearchState {
  query: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  items: readonly SessionSearchResultItem[]
  hasMore: boolean
}

/** Flat search body: local metadata matches plus the current Host result page. */
function SearchResults({
  useSessions,
  useSessionStatus,
  open,
  onSessionRename,
  forkSession,
  onSessionArchive,
  workspaces,
  archivedSessionIds,
  query,
  remote,
  resultLimit,
  activeSchedules,
  usePanelInfo,
  t,
}: Pick<SessionTreeProps, 'useSessions' | 'useSessionStatus' | 'open' | 't' | 'usePanelInfo' | 'onSessionRename' | 'forkSession' | 'onSessionArchive'> & {
  workspaces: readonly WorkspaceView[]
  archivedSessionIds: readonly SessionNode['id'][]
  query: string
  remote: RemoteSearchState
  resultLimit: number
  activeSchedules: ReadonlySet<SessionId>
}) {
  const panelActive = usePanelInfo(info => info.activePanelId !== null)
  const list = useSessions(s => s)
  const statuses = useSessionStatus(s => s)
  const currentRemote = remote.query === query
    ? remote
    : { query, status: 'loading' as const, items: [], hasMore: false }
  const results = useMemo(
    () => deriveSearchResults(
      list,
      workspaces,
      query,
      archivedSessionIds,
      statuses,
      activeSchedules,
      currentRemote,
      resultLimit,
    ),
    [list, workspaces, query, archivedSessionIds, statuses, activeSchedules, currentRemote, resultLimit],
  )
  const pending = currentRemote.status === 'loading'
  const failed = currentRemote.status === 'error'

  return (
    <div className={clsx(css.treeBody, css.wide)}>
      <div className={css.list}>
        <div className={css.searchTree} role="tree" aria-label={t('search.results.aria')}>
          {results.items.map(result => (
            <SearchResultItem
              key={result.id}
              result={result}
              currentId={panelActive ? undefined : mainSessionId(list)}
              onOpen={open}
              onRename={onSessionRename}
              onFork={forkSession}
              onArchive={onSessionArchive}
              t={t}
            />
          ))}
        </div>
        {pending && (
          <div className={css.searchStatus} role="status">{t('search.pending')}</div>
        )}
        {failed && (
          <div className={css.searchWarning} role="status">
            {t('search.unavailable')}
          </div>
        )}
        {!pending && results.items.length === 0 && (
          <div className={css.empty}>{t('search.noMatches')}</div>
        )}
        {results.hasMore && (
          <div className={css.searchStatus}>
            {t('search.hasMore', { n: resultLimit })}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Render the browsing region.
 * @param props - composed slot props (shell owner share + store + injected actions).
 * @returns the region element tree.
 */
export function WorkspaceBrowser({
  wide,
  usePanelInfo,
  expandSidebar,
  useSessions,
  useSessionStatus,
  useWorkspaces,
  useStore,
  actions,
  startSession,
  open,
  renameSession,
  forkSession,
  renameWorkspace,
  insertWorkspaceBefore,
  archiveSession,
  createWorkspace,
  searchSessions,
  searchResultLimit,
  useHostInfo,
  useWorktrees,
  useScheduleCatalog,
  pickDirectory,
  worktrees,
  t,
}: WorkspaceBrowserProps) {
  const home = useHostInfo(info => info.home)
  const workspaces = useWorkspaces(state => state.items)
  const workspacePhase = useWorkspaces(state => state.phase)
  const workspaceStreamState = useWorkspaces(state => state.state)
  const archivedSessionIds = useWorkspaces(state => state.archivedSessionIds)
  const snapshot = useWorktrees(state => state)
  const scheduleCatalog = useScheduleCatalog(entries => entries)
  const activeSchedules = useMemo(() => activeScheduleSessionIds(scheduleCatalog), [scheduleCatalog])
  const groupBy = useStore(s => s.groupBy)
  const projectOrderBy = useStore(s => s.projectOrderBy ?? 'manual')
  // Old persisted v1 documents lack the toggle; absent reads as off.
  const showActiveSessions = useStore(s => s.showActiveSessions === true)
  // Old persisted v1 documents lack the fold flag; absent reads as expanded.
  const activeSessionsCollapsed = useStore(s => s.activeSessionsCollapsed === true)
  const treeGuides = useStore(s => s.treeGuides === true)
  const groupExpansion = useStore(s => s.groupExpansion)
  // Old persisted v1 documents lack projectAreas. The module-level fallback
  // must retain identity or this value retriggers the expansion-retention effect
  // after every store write (React maximum update depth / invariant 185).
  const persistedProjectAreas = useStore(s => s.projectAreas as ProjectArea[] | undefined)
  const projectAreas = projectAreasOrEmpty(persistedProjectAreas)
  useEffect(() => {
    if (workspacePhase !== 'ready') return
    actions.retainExpansionKeys([
      UNGROUPED_KEY,
      ...workspaces.map(workspace => workspace.workspaceId as string),
      ...snapshot.repos.map(repo => repoGroupKey(repo.key)),
      DEFAULT_PROJECT_AREA_KEY,
      ...projectAreas.map(area => projectAreaExpansionKey(area.id)),
    ])
  }, [actions.retainExpansionKeys, workspacePhase, workspaces, snapshot.repos, projectAreas])
  // The query outlives the tree and the input (both wide-only) so collapsing
  // does not silently drop an in-progress filter.
  const [query, setQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [revealSessionId, setRevealSessionId] = useState<SessionId | undefined>(undefined)
  // Flash is decoupled from the reveal ack: the row keeps pulsing ~2s after
  // it has been scrolled into view, so the user can spot its real location.
  const [flashSessionId, setFlashSessionId] = useState<SessionId | undefined>(undefined)
  const flashTimer = useRef<number | undefined>(undefined)
  const requestSessionReveal = (sessionId: SessionId): void => {
    setRevealSessionId(sessionId)
    setFlashSessionId(sessionId)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => { setFlashSessionId(undefined) }, 2000)
  }
  const normalizedQuery = sanitizeSearchQuery(query).trim()
  const [remoteSearch, setRemoteSearch] = useState<RemoteSearchState>({
    query: '',
    status: 'idle',
    items: [],
    hasMore: false,
  })
  const searchRoot = useRef<HTMLDivElement | null>(null)
  const searchInput = useRef<HTMLInputElement | null>(null)
  const composingRef = useRef(false)

  // Add flow: the header ＋ opens the Host-native directory picker and adopts
  // the pick. Where no picker exists (a plain browser against a remote host)
  // the flow falls back to a typed absolute path. Failures land in a dialog
  // whose retry reopens the picker.
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [pathPrompt, setPathPrompt] = useState<string | null>(null)
  const adoptDirectory = (path: string): void => {
    setAddBusy(true)
    setAddError(null)
    createWorkspace({ path }).then((workspace) => {
      setPathPrompt(null)
      startSession(workspace.workspaceId)
    }).catch((reason: unknown) => {
      setAddError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setAddBusy(false) })
  }
  const addWorkspace = (): void => {
    if (addBusy) return
    setAddError(null)
    setAddBusy(true)
    pickDirectory().then((picked) => {
      setAddBusy(false)
      if (picked !== null) adoptDirectory(picked)
    }).catch(() => {
      setAddBusy(false)
      setPathPrompt('')
    })
  }
  const pathPromptTrimmed = (pathPrompt ?? '').trim()

  // Project sections are view-only plugin data: these actions never mutate a
  // repository or Host Workspace.
  const [areaDialog, setAreaDialog] = useState<{ mode: 'create' } | { mode: 'rename'; id: string } | null>(null)
  const [areaDraft, setAreaDraft] = useState('')
  const areaTrimmed = areaDraft.trim()
  const closeAreaDialog = () => { setAreaDialog(null); setAreaDraft('') }
  const confirmAreaDialog = () => {
    if (areaDialog === null || areaTrimmed === '') return
    if (areaDialog.mode === 'create') actions.createProjectArea(crypto.randomUUID(), areaTrimmed)
    else actions.renameProjectArea(areaDialog.id, areaTrimmed)
    closeAreaDialog()
  }

  const openSearchResult = (sessionId: SessionId): void => {
    setRevealSessionId(sessionId)
    setQuery('')
    setSearchExpanded(false)
    open(sessionId)
  }
  const acknowledgeSessionReveal = (sessionId: SessionId): void => {
    setRevealSessionId(current => current === sessionId ? undefined : current)
  }
  useEffect(() => {
    if (normalizedQuery !== '') setRevealSessionId(undefined)
  }, [normalizedQuery])

  // Rail search = expand + land in the search box: the flag arms before the
  // expand request; once the shell flips wide the input mounts and takes focus.
  const [searchOnExpand, setSearchOnExpand] = useState(false)
  useEffect(() => {
    if (wide && searchOnExpand) {
      const timer = window.setTimeout(() => {
        searchInput.current?.focus({ preventScroll: true })
        setSearchOnExpand(false)
      }, EXPAND_SLIDE_MS)
      return () => { window.clearTimeout(timer) }
    }
  }, [wide, searchOnExpand])

  useEffect(() => {
    if (!wide || !searchExpanded || searchOnExpand) return
    searchInput.current?.focus({ preventScroll: true })
  }, [wide, searchExpanded, searchOnExpand])

  // Outside-click dismissal stays off while the rail gesture is in flight
  // (searchOnExpand): the rail click flips the shell wide and mounts this
  // listener during its own dispatch, then keeps bubbling to document with
  // the now-unmounted rail button as its target — outside searchRoot, so the
  // listener would dismiss the search that click just opened.
  useEffect(() => {
    if (!wide || !searchExpanded || searchOnExpand) return
    const onClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Node) || searchRoot.current?.contains(event.target) === true) return
      searchInput.current?.blur()
      if (normalizedQuery !== '') return
      setSearchExpanded(false)
    }
    document.addEventListener('click', onClick)
    return () => { document.removeEventListener('click', onClick) }
  }, [normalizedQuery, wide, searchExpanded, searchOnExpand])

  useEffect(() => {
    if (normalizedQuery === '') {
      setRemoteSearch({ query: '', status: 'idle', items: [], hasMore: false })
      return
    }
    const controller = new AbortController()
    setRemoteSearch({
      query: normalizedQuery,
      status: 'loading',
      items: [],
      hasMore: false,
    })
    const timer = window.setTimeout(() => {
      searchSessions(normalizedQuery, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        setRemoteSearch({
          query: normalizedQuery,
          status: 'ready',
          items: result.items,
          hasMore: result.hasMore,
        })
      }).catch(() => {
        if (controller.signal.aborted) return
        setRemoteSearch({
          query: normalizedQuery,
          status: 'error',
          items: [],
          hasMore: false,
        })
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [normalizedQuery, searchSessions])

  // Rename dialog (browser-owned so it outlives row unmounts during collapse).
  const [renameTarget, setRenameTarget] = useState<{ workspaceId: WorkspaceId; currentTitle: string; branch?: string | undefined } | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const renameTrimmed = renameDraft.trim()
  const renameRepoKey = renameTarget === null
    ? undefined
    : snapshot.workspaceRepo[renameTarget.workspaceId as string]
  const renameDuplicate = renameTarget !== null && renameTrimmed !== '' && renameTrimmed !== renameTarget.currentTitle
    && workspaces.some(w => w.workspaceId !== renameTarget.workspaceId && w.title === renameTrimmed
      && (renameRepoKey === undefined || snapshot.workspaceRepo[w.workspaceId as string] === renameRepoKey))
  const renameBlocked = renaming || renameTrimmed === ''
    || renameTarget === null || renameTrimmed === renameTarget.currentTitle || renameDuplicate
  const closeRename = () => {
    if (renaming) return
    setRenameTarget(null)
    setRenameError(null)
  }
  const confirmRename = () => {
    if (renameBlocked) return
    setRenaming(true)
    setRenameError(null)
    const rename = renameRepoKey === undefined
      ? renameWorkspace(renameTarget.workspaceId, renameTrimmed)
      : worktrees.setWorkspaceTitle(renameTarget.workspaceId as string, renameTrimmed)
    rename.then(() => {
      setRenaming(false)
      setRenameTarget(null)
    }).catch((reason: unknown) => {
      setRenaming(false)
      setRenameError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  // Branch rename dialog: renames the git branch itself (`git branch -m`),
  // so all validation lives host-side and the field is a plain input.
  const [branchRenameTarget, setBranchRenameTarget] = useState<{ workspaceId: WorkspaceId; currentBranch: string } | null>(null)
  const [branchRenameDraft, setBranchRenameDraft] = useState('')
  const [branchRenaming, setBranchRenaming] = useState(false)
  const [branchRenameError, setBranchRenameError] = useState<string | null>(null)
  const branchRenameTrimmed = branchRenameDraft.trim()
  const branchRenameBlocked = branchRenaming || branchRenameTrimmed === ''
    || branchRenameTarget === null || branchRenameTrimmed === branchRenameTarget.currentBranch
  const closeBranchRename = () => {
    if (branchRenaming) return
    setBranchRenameTarget(null)
    setBranchRenameError(null)
  }
  const confirmBranchRename = () => {
    if (branchRenameBlocked || branchRenameTarget === null) return
    setBranchRenaming(true)
    setBranchRenameError(null)
    worktrees.renameBranch(branchRenameTarget.workspaceId as string, branchRenameTrimmed).then(() => {
      setBranchRenaming(false)
      setBranchRenameTarget(null)
    }).catch((reason: unknown) => {
      setBranchRenaming(false)
      setBranchRenameError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  // Session rename dialog (same browser-owned pattern as workspace rename;
  // sessions have no client-side name-conflict rule — the host normalizes).
  // Unlike workspace rename, an unchanged title is NOT blocked: confirming
  // the current automatic title is the gesture that pins it.
  const [sessionRenameTarget, setSessionRenameTarget] = useState<{ sessionId: SessionNode['id']; currentTitle: string } | null>(null)
  const [sessionRenameDraft, setSessionRenameDraft] = useState('')
  const [sessionRenaming, setSessionRenaming] = useState(false)
  const [sessionRenameError, setSessionRenameError] = useState<string | null>(null)
  const sessionRenameTrimmed = sessionRenameDraft.trim()
  const sessionRenameBlocked = sessionRenaming || sessionRenameTrimmed === '' || sessionRenameTarget === null
  const closeSessionRename = () => {
    if (sessionRenaming) return
    setSessionRenameTarget(null)
    setSessionRenameError(null)
  }
  const confirmSessionRename = () => {
    if (sessionRenameBlocked) return
    setSessionRenaming(true)
    setSessionRenameError(null)
    renameSession(sessionRenameTarget.sessionId, sessionRenameTrimmed).then(() => {
      setSessionRenaming(false)
      setSessionRenameTarget(null)
    }).catch((reason: unknown) => {
      setSessionRenaming(false)
      setSessionRenameError(reason instanceof Error ? reason.message : String(reason))
    })
  }
  const onSessionRename = (sessionId: SessionNode['id'], currentTitle: string) => {
    setSessionRenameTarget({ sessionId, currentTitle })
    setSessionRenameDraft(currentTitle)
    setSessionRenameError(null)
  }

  // Archive is dialog-free: not destructive (the log and the accounting slot
  // remain), so the menu action commits directly; the row disappears when the
  // archive-set echo lands. Failures are non-fatal console diagnostics, the
  // same posture as reorder rejections.
  const onSessionArchive = (sessionId: SessionNode['id']) => {
    archiveSession(sessionId).catch((reason: unknown) => {
      console.warn('session archive rejected:', reason)
    })
  }

  // Repository rename dialog: the name lives in the plugin's own state (the
  // repository is not a DSH Workspace), so it is one Host round-trip and, being
  // plugin-owned, disappears with the plugin.
  const [repoRenameTarget, setRepoRenameTarget] = useState<{ repoKey: string; currentName: string } | null>(null)
  const [repoRenameDraft, setRepoRenameDraft] = useState('')
  const [repoRenaming, setRepoRenaming] = useState(false)
  const [repoRenameError, setRepoRenameError] = useState<string | null>(null)
  const repoRenameTrimmed = repoRenameDraft.trim()
  const closeRepoRename = () => {
    if (repoRenaming) return
    setRepoRenameTarget(null)
    setRepoRenameError(null)
  }
  const confirmRepoRename = () => {
    /* v8 ignore next -- the Modal is absent without a target and its button is disabled while renaming. */
    if (repoRenameTarget === null || repoRenaming) return
    setRepoRenaming(true)
    setRepoRenameError(null)
    worktrees.setRepoName(repoRenameTarget.repoKey, repoRenameTrimmed).then(() => {
      setRepoRenaming(false)
      setRepoRenameTarget(null)
    }).catch((reason: unknown) => {
      setRepoRenaming(false)
      setRepoRenameError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  // New-worktree dialog: branch (typed, or picked from the unchecked-out
  // locals) plus a location input prefilled with the sibling-directory
  // convention. Options come from the host because only it can ask git; the
  // typed branch decides whether `git worktree add` checks out or grows one.
  const [worktreeDialog, setWorktreeDialog] = useState<{ repoKey: string; repoName: string } | null>(null)
  const [worktreeOptions, setWorktreeOptions] = useState<
    | { readonly status: 'loading' }
    | { readonly status: 'error'; readonly message: string }
    | { readonly status: 'ready'; readonly options: BranchOptions }
    | null
  >(null)
  const [branchDraft, setBranchDraft] = useState('')
  const [branchMenuOpen, setBranchMenuOpen] = useState(false)
  const [parentMenuOpen, setParentMenuOpen] = useState(false)
  const [pathParent, setPathParent] = useState<string | null>(null)
  const [pathDraft, setPathDraft] = useState('')
  const [pathEdited, setPathEdited] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  useEffect(() => {
    if (worktreeDialog === null) return
    const repoKey = worktreeDialog.repoKey
    setWorktreeOptions({ status: 'loading' })
    worktrees.branchOptions(repoKey).then((options) => {
      setWorktreeOptions({ status: 'ready', options })
    }).catch((reason: unknown) => {
      setWorktreeOptions({ status: 'error', message: reason instanceof Error ? reason.message : String(reason) })
    })
  }, [worktreeDialog, worktrees])
  const options = worktreeOptions?.status === 'ready' ? worktreeOptions.options : null
  const branchTrimmed = branchDraft.trim()
  const worktreeParent = pathParent ?? options?.parents[0] ?? ''
  // Same convention the demo and `git worktree` users reach for: the main
  // worktree's sibling named after the repository and the branch.
  const suggestedPath = worktreeParent === '' || options === null || branchTrimmed === ''
    ? ''
    : `${worktreeParent === '/' ? '' : worktreeParent}/${options.dirName}-${branchTrimmed.replaceAll('/', '-')}`
  const pathValue = pathEdited ? pathDraft : suggestedPath
  const branchIsNew = options !== null && branchTrimmed !== '' && !options.availableBranches.includes(branchTrimmed)
  const branchChoices = options === null ? [] : options.availableBranches
    .filter(branch => branch.toLowerCase().includes(branchTrimmed.toLowerCase()))
  const closeWorktreeDialog = () => {
    if (creating) return
    setWorktreeDialog(null)
    setCreateError(null)
  }
  const confirmWorktreeCreate = () => {
    if (worktreeDialog === null || creating || branchTrimmed === '' || pathValue.trim() === '') return
    setCreating(true)
    setCreateError(null)
    worktrees.createWorktree({ repoKey: worktreeDialog.repoKey, branch: branchTrimmed, path: pathValue.trim() }).then(() => {
      setCreating(false)
      setWorktreeDialog(null)
    }).catch((reason: unknown) => {
      setCreating(false)
      setCreateError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  // Delete dialog is separate from the row so a successful removal can
  // unmount that row without tearing down the in-flight confirmation state.
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'workspace'; workspaceId: WorkspaceId; title: string }
    | { kind: 'repository'; repoKey: string; workspaceIds: readonly WorkspaceId[]; title: string }
    | null
  >(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteCommittedIds, setDeleteCommittedIds] = useState<readonly WorkspaceId[] | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteAlsoBranch, setDeleteAlsoBranch] = useState(false)
  const [deleteForce, setDeleteForce] = useState(false)
  useEffect(() => {
    if (deleteCommittedIds === null
      || workspaces.some(workspace => deleteCommittedIds.includes(workspace.workspaceId))) return
    setDeleting(false)
    setDeleteCommittedIds(null)
    setDeleteTarget(null)
    setDeleteAlsoBranch(false)
    setDeleteForce(false)
  }, [deleteCommittedIds, workspaces])
  // "Also delete the branch" is offered on a non-main worktree sitting on a branch.
  const deleteWorktree = deleteTarget?.kind === 'workspace'
    ? worktreeOfWorkspace(snapshot, deleteTarget.workspaceId)
    : undefined
  const deleteBranchOffered = deleteWorktree !== undefined && !deleteWorktree.main && deleteWorktree.branch !== null
  const closeDelete = () => {
    if (deleting) return
    setDeleteTarget(null)
    setDeleteError(null)
    setDeleteAlsoBranch(false)
    setDeleteForce(false)
  }
  const confirmDelete = () => {
    /* v8 ignore next -- the Modal is absent without a target and its button is disabled while deleting. */
    if (deleting || deleteTarget === null) return
    setDeleting(true)
    setDeleteCommittedIds(null)
    setDeleteError(null)
    const target = deleteTarget
    const removal = target.kind === 'repository'
      ? worktrees.deleteRepository(target.repoKey)
      : worktrees.deleteWorkspace(target.workspaceId, deleteBranchOffered && deleteAlsoBranch
        ? { deleteBranch: true, force: deleteForce }
        : undefined)
    removal.then(() => {
      // Wait until the official Workspace stream acknowledges every removal.
      setDeleteCommittedIds(target.kind === 'repository' ? target.workspaceIds : [target.workspaceId])
    }).catch((reason: unknown) => {
      setDeleting(false)
      const message = reason instanceof Error ? reason.message : String(reason)
      // A dirty worktree or unmerged branch bounces once into the dialog's
      // second confirmation; the same button then repeats with force.
      if (message.startsWith('left-panel/unsafe-delete')) {
        setDeleteForce(true)
        return
      }
      setDeleteError(message)
    })
  }

  return (
    <div className={clsx(css.root, !wide && css.rail)}>
      <div className={css.sectionHeader}>
        {wide && (
          <span className={clsx(css.sectionLabel, css.wide, searchExpanded && css.sectionLabelHidden)}>
            {groupBy === 'flat' ? t('section.sessions') : t('section.workspaces')}
          </span>
        )}
        {wide && (
          <div className={clsx(css.searchSlot, searchExpanded && css.searchSlotExpanded)}>
            <div
              ref={searchRoot}
              className={clsx(css.search, searchExpanded && css.searchExpanded)}
              onClick={() => {
                setSearchExpanded(true)
                searchInput.current?.focus()
              }}
            >
              <Tooltip label={t('search')} side="bottom" delayMs={500} disabled={searchExpanded}>
                <button
                  type="button"
                  className={css.searchButton}
                  aria-label={t('search.sessions.aria')}
                  aria-expanded={searchExpanded}
                  onClick={() => {
                    setSearchExpanded(true)
                  }}
                >
                  <IconSearchOutlineRegular size={searchExpanded ? 11 : 14} />
                </button>
              </Tooltip>
              <input
                ref={searchInput}
                className={css.searchInput}
                type="text"
                placeholder={t('search.placeholder')}
                maxLength={SEARCH_QUERY_MAX_CODE_UNITS}
                value={query}
                tabIndex={searchExpanded ? 0 : -1}
                onChange={(e) => { setQuery(sanitizeSearchQuery(e.target.value)) }}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return
                  setQuery('')
                  setSearchExpanded(false)
                }}
              />
              {searchExpanded && (
                <button
                  type="button"
                  className={css.clearButton}
                  aria-label={t('search.clear')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setQuery('')
                    setSearchExpanded(false)
                  }}
                >
                  <IconCloseFillRegular />
                </button>
              )}
            </div>
          </div>
        )}
        <div className={clsx(css.headerActions, wide && searchExpanded && css.headerActionsHidden)}>
          {wide && groupBy !== 'flat' && (
            <Tooltip label={t('area.add')} side="bottom" delayMs={500}>
              <button
                type="button"
                className={css.iconButton}
                aria-label={t('area.add')}
                onClick={() => { setAreaDraft(''); setAreaDialog({ mode: 'create' }) }}
              >
                <IconPlusOutlineRegular />
              </button>
            </Tooltip>
          )}
          {wide && (
            <ViewOptionsMenu
              groupBy={groupBy}
              projectOrderBy={projectOrderBy}
              showActive={showActiveSessions}
              showTreeGuides={treeGuides}
              onGroupPick={(mode) => { actions.setGroupBy(mode) }}
              onOrderPick={(mode) => { actions.setProjectOrderBy(mode) }}
              onActiveToggle={() => { actions.setShowActiveSessions(!showActiveSessions) }}
              onTreeGuidesToggle={() => { actions.setTreeGuides(!treeGuides) }}
              t={t}
            />
          )}
          {/* Adding is the button's one action: it opens the Host-native
              directory picker (or the typed-path fallback) directly. */}
          <Tooltip label={t('workspace.add')} side="bottom" delayMs={500}>
            <button
              type="button"
              className={css.iconButton}
              aria-label={t('workspace.add')}
              disabled={addBusy}
              onClick={addWorkspace}
            >
              <IconProjectAddOutlineRegular size={wide ? 16 : 18} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* The collapsed rail keeps search as its own 36px control. */}
      {!wide && <div className={css.search}>
        <Tooltip label={t('search')}>
          <button
            type="button"
            className={css.searchButton}
            aria-label={t('search.sessions.aria')}
            onClick={() => {
              setSearchExpanded(true)
              setSearchOnExpand(true)
              expandSidebar()
            }}
          >
            <IconSearchOutlineRegular size={18} />
          </button>
        </Tooltip>
      </div>}

      {/* Always-mounted seat keeps the region's flex slot while the list
          itself is wide-only. */}
      <div className={css.listArea}>
        {wide && (normalizedQuery !== ''
          ? (
            <SearchResults
              usePanelInfo={usePanelInfo}
              useSessions={useSessions}
              useSessionStatus={useSessionStatus}
              open={openSearchResult}
              onSessionRename={onSessionRename}
              forkSession={forkSession}
              onSessionArchive={onSessionArchive}
              workspaces={workspaces}
              archivedSessionIds={archivedSessionIds}
              query={normalizedQuery}
              remote={remoteSearch}
              resultLimit={searchResultLimit}
              activeSchedules={activeSchedules}
              t={t}
            />
          )
          : groupBy === 'flat'
            ? (
              <FlatList
                usePanelInfo={usePanelInfo}
                useSessions={useSessions} useSessionStatus={useSessionStatus}
                open={open} forkSession={forkSession}
                onSessionRename={onSessionRename} onSessionArchive={onSessionArchive}
                archivedSessionIds={archivedSessionIds}
                activeSchedules={activeSchedules}
                revealSessionId={revealSessionId}
                onSessionRevealed={acknowledgeSessionReveal}
                t={t}
              />
            )
            : (
              <SessionTree
                usePanelInfo={usePanelInfo}
                useSessions={useSessions}
                useSessionStatus={useSessionStatus}
                onSessionRename={onSessionRename}
                onSessionArchive={onSessionArchive}
                forkSession={forkSession}
                workspaces={workspaces}
                projectView={groupBy === 'project'}
                workspaceReady={workspacePhase === 'ready' && workspaceStreamState !== 'loading'}
                groupExpansion={groupExpansion}
                setGroupExpanded={actions.setGroupExpanded}
                archivedSessionIds={archivedSessionIds}
                activeSchedules={activeSchedules}
                startSession={startSession}
                open={open}
                insertWorkspaceBefore={insertWorkspaceBefore}
                projectOrderBy={projectOrderBy}
                showActiveSessions={showActiveSessions}
                showTreeGuides={groupBy === 'workspace' && treeGuides}
                activeSessionsCollapsed={activeSessionsCollapsed}
                onActiveSessionsToggle={() => { actions.setActiveSessionsCollapsed(!activeSessionsCollapsed) }}
                revealSessionId={revealSessionId}
                onSessionRevealed={acknowledgeSessionReveal}
                onSessionRevealRequest={requestSessionReveal}
                flashSessionId={flashSessionId}
                home={home}
                t={t}
                snapshot={snapshot}
                worktrees={worktrees}
                projectAreas={projectAreas}
                onProjectAreaRenameRequest={(areaId, currentName) => {
                  setAreaDraft(currentName)
                  setAreaDialog({ mode: 'rename', id: areaId })
                }}
                onProjectAreaDissolve={(areaId) => { actions.dissolveProjectArea(areaId) }}
                onRepoProjectAreaChange={(repoKey, areaId) => { actions.setRepoProjectArea(repoKey, areaId) }}
                onProjectAreaOrderChange={(areaIds) => { actions.setProjectAreaOrder(areaIds) }}
                onRenameRequest={(workspaceId, currentTitle) => {
                  setRenameTarget({
                    workspaceId,
                    currentTitle,
                    branch: worktreeOfWorkspace(snapshot, workspaceId)?.branch ?? undefined,
                  })
                  setRenameDraft(currentTitle)
                  setRenameError(null)
                }}
                onBranchRenameRequest={(workspaceId, currentBranch) => {
                  setBranchRenameTarget({ workspaceId, currentBranch })
                  setBranchRenameDraft(currentBranch)
                  setBranchRenameError(null)
                }}
                onDeleteRequest={(workspaceId, title) => {
                  setDeleteTarget({ kind: 'workspace', workspaceId, title })
                  setDeleteError(null)
                  setDeleteAlsoBranch(false)
                  setDeleteForce(false)
                }}
                onRepoDeleteRequest={(repoKey, title, workspaceIds) => {
                  setDeleteTarget({ kind: 'repository', repoKey, title, workspaceIds })
                  setDeleteError(null)
                  setDeleteAlsoBranch(false)
                  setDeleteForce(false)
                }}
                onRepoRenameRequest={(repoKey, currentName) => {
                  setRepoRenameTarget({ repoKey, currentName })
                  setRepoRenameDraft(currentName)
                  setRepoRenameError(null)
                }}
                onRepoCreateWorktree={(repoKey) => {
                  const repo = snapshot.repos.find(candidate => candidate.key === repoKey)
                  setWorktreeDialog({ repoKey, repoName: repo?.name ?? repoKey })
                  setBranchDraft('')
                  setBranchMenuOpen(false)
                  setParentMenuOpen(false)
                  setPathParent(null)
                  setPathDraft('')
                  setPathEdited(false)
                  setCreateError(null)
                }}
              />
            ))}
      </div>

      <Modal
        open={areaDialog !== null}
        onClose={closeAreaDialog}
        closeLabel={t('close')}
        title={t(areaDialog?.mode === 'rename' ? 'area.rename.title' : 'area.create.title')}
        footer={(
          <>
            <Button variant="outline" onClick={closeAreaDialog}>{t('cancel')}</Button>
            <Button variant="primary" disabled={areaTrimmed === ''} onClick={confirmAreaDialog}>
              {areaDialog?.mode === 'rename' ? t('rename') : t('add.confirm')}
            </Button>
          </>
        )}
      >
        <input
          className={css.renameInput}
          value={areaDraft}
          aria-label={t('field.areaName')}
          autoFocus
          onFocus={(e) => { e.target.select() }}
          onChange={(e) => { setAreaDraft(e.target.value) }}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !composingRef.current) {
              e.preventDefault()
              confirmAreaDialog()
            }
          }}
        />
      </Modal>

      <Modal
        open={renameTarget !== null}
        onClose={closeRename}
        closeLabel={t('close')}
        title={t('rename.workspace.title')}
        footer={(
          <>
            <Button variant="outline" disabled={renaming} onClick={closeRename}>{t('cancel')}</Button>
            <Button variant="primary" disabled={renameBlocked} onClick={confirmRename}>{t('rename')}</Button>
          </>
        )}
      >
        <div className={css.comboRow}>
          <input
            className={css.renameInput}
            value={renameDraft}
            aria-label={t('field.workspaceName')}
            autoFocus
            disabled={renaming}
            onFocus={(e) => { e.target.select() }}
            onChange={(e) => { setRenameDraft(e.target.value); setRenameError(null) }}
            onCompositionStart={() => { composingRef.current = true }}
            onCompositionEnd={() => { composingRef.current = false }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !composingRef.current) {
                e.preventDefault()
                confirmRename()
              }
            }}
          />
          {renameTarget?.branch != null && (
            <button
              type="button"
              className={css.comboButton}
              aria-label={t('worktree.rename.reset')}
              title={t('worktree.rename.reset')}
              disabled={renaming || renameDraft === renameTarget.branch}
              onClick={() => { setRenameDraft(renameTarget.branch as string); setRenameError(null) }}
            >
              <IconRefreshOutlineRegular />
            </button>
          )}
        </div>
        {renameDuplicate && (
          <div className={css.renameError} role="alert">{t('conflict.named', { name: renameTrimmed })}</div>
        )}
        {renameError !== null && <div className={css.renameError} role="alert">{renameError}</div>}
      </Modal>

      <Modal
        open={branchRenameTarget !== null}
        onClose={closeBranchRename}
        closeLabel={t('close')}
        title={t('worktree.rename.branch')}
        footer={(
          <>
            <Button variant="outline" disabled={branchRenaming} onClick={closeBranchRename}>{t('cancel')}</Button>
            <Button variant="primary" disabled={branchRenameBlocked} onClick={confirmBranchRename}>{t('rename')}</Button>
          </>
        )}
      >
        <input
          className={css.renameInput}
          value={branchRenameDraft}
          aria-label={t('worktree.rename.branch.aria')}
          autoFocus
          disabled={branchRenaming}
          onFocus={(e) => { e.target.select() }}
          onChange={(e) => { setBranchRenameDraft(e.target.value); setBranchRenameError(null) }}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !composingRef.current) {
              e.preventDefault()
              confirmBranchRename()
            }
          }}
        />
        {branchRenameError !== null && <div className={css.renameError} role="alert">{branchRenameError}</div>}
      </Modal>

      <Modal
        open={repoRenameTarget !== null}
        onClose={closeRepoRename}
        closeLabel={t('close')}
        title={t('repo.rename.title')}
        description={t('repo.rename.hint')}
        footer={(
          <>
            <Button variant="outline" disabled={repoRenaming} onClick={closeRepoRename}>{t('cancel')}</Button>
            <Button variant="primary" disabled={repoRenaming} onClick={confirmRepoRename}>{t('rename')}</Button>
          </>
        )}
      >
        <input
          className={css.renameInput}
          value={repoRenameDraft}
          aria-label={t('field.repoName')}
          placeholder={repoRenameTarget?.currentName ?? ''}
          autoFocus
          disabled={repoRenaming}
          onFocus={(e) => { e.target.select() }}
          onChange={(e) => { setRepoRenameDraft(e.target.value); setRepoRenameError(null) }}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !composingRef.current) {
              e.preventDefault()
              confirmRepoRename()
            }
          }}
        />
        {repoRenameError !== null && <div className={css.renameError} role="alert">{repoRenameError}</div>}
      </Modal>

      <Modal
        open={worktreeDialog !== null}
        onClose={closeWorktreeDialog}
        closeLabel={t('close')}
        title={t('worktree.create.title')}
        footer={(
          <>
            <span className={css.footerHint}>{t('worktree.create.footer.hint')}</span>
            <Button variant="outline" disabled={creating} onClick={closeWorktreeDialog}>{t('cancel')}</Button>
            <Button
              variant="primary"
              disabled={creating || options === null || branchTrimmed === '' || pathValue.trim() === ''}
              onClick={confirmWorktreeCreate}
            >
              {t('worktree.create.confirm')}
            </Button>
          </>
        )}
      >
        {worktreeOptions?.status === 'error' && (
          <div className={css.renameError} role="alert">{worktreeOptions.message}</div>
        )}
        <>
            <div className={css.fieldLabel}>{t('worktree.create.branch')}</div>
            <div className={css.comboRow}>
              <input
                className={css.renameInput}
                value={branchDraft}
                aria-label={t('worktree.create.branch')}
                autoFocus
                disabled={creating || options === null}
                onChange={(e) => { setBranchDraft(e.target.value); setCreateError(null) }}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={() => { composingRef.current = false }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !composingRef.current) {
                    e.preventDefault()
                    confirmWorktreeCreate()
                  }
                }}
              />
              <Menu
                open={branchMenuOpen}
                onClose={() => { setBranchMenuOpen(false) }}
                items={branchChoices.length > 0
                  ? branchChoices.map(branch => ({ id: branch, label: branch }))
                  : [{ type: 'label' as const, id: 'empty', text: t('worktree.create.branches.empty') }]}
                onSelect={(id) => { setBranchMenuOpen(false); setBranchDraft(id) }}
                portal
                closeOnPointerLeave
                anchor={(
                  <button
                    type="button"
                    className={css.comboButton}
                    aria-label={t('worktree.create.branches.aria')}
                    disabled={creating || options === null}
                    onClick={() => { setBranchMenuOpen(v => !v) }}
                  >
                    <IconChevronsUpDownOutlineRegular />
                  </button>
                )}
              />
            </div>
            {options !== null && branchIsNew && (
              <div className={css.fieldHint}>{t('worktree.create.base', { base: options.base })}</div>
            )}
            <div className={css.fieldLabel}>{t('worktree.create.path')}</div>
            <div className={css.comboRow}>
              <input
                className={css.renameInput}
                value={pathValue}
                aria-label={t('worktree.create.path')}
                disabled={creating || options === null}
                onChange={(e) => { setPathDraft(e.target.value); setPathEdited(true); setCreateError(null) }}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={() => { composingRef.current = false }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !composingRef.current) {
                    e.preventDefault()
                    confirmWorktreeCreate()
                  }
                }}
              />
              <Menu
                open={parentMenuOpen}
                onClose={() => { setParentMenuOpen(false) }}
                items={options !== null && options.parents.length > 0
                  ? options.parents.map(parent => ({ id: parent, label: parent }))
                  : [{ type: 'label' as const, id: 'empty', text: t('worktree.create.parents.empty') }]}
                onSelect={(id) => {
                  setParentMenuOpen(false)
                  setPathParent(id)
                  setPathEdited(false)
                }}
                portal
                closeOnPointerLeave
                anchor={(
                  <button
                    type="button"
                    className={css.comboButton}
                    aria-label={t('worktree.create.parents.aria')}
                    disabled={creating || options === null}
                    onClick={() => { setParentMenuOpen(v => !v) }}
                  >
                    <IconChevronsUpDownOutlineRegular />
                  </button>
                )}
              />
            </div>
        </>
        {creating && <div className={css.deleteStatus} role="status">{t('worktree.create.pending')}</div>}
        {createError !== null && <div className={css.renameError} role="alert">{createError}</div>}
      </Modal>

      <Modal
        open={sessionRenameTarget !== null}
        onClose={closeSessionRename}
        closeLabel={t('close')}
        title={t('rename.session.title')}
        footer={(
          <>
            <Button variant="outline" disabled={sessionRenaming} onClick={closeSessionRename}>{t('cancel')}</Button>
            <Button variant="primary" disabled={sessionRenameBlocked} onClick={confirmSessionRename}>{t('rename')}</Button>
          </>
        )}
      >
        <input
          className={css.renameInput}
          value={sessionRenameDraft}
          aria-label={t('field.sessionName')}
          autoFocus
          disabled={sessionRenaming}
          onFocus={(e) => { e.target.select() }}
          onChange={(e) => { setSessionRenameDraft(e.target.value); setSessionRenameError(null) }}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !composingRef.current) {
              e.preventDefault()
              confirmSessionRename()
            }
          }}
        />
        {sessionRenameError !== null && <div className={css.renameError} role="alert">{sessionRenameError}</div>}
      </Modal>
      <Modal
        open={deleteTarget !== null}
        onClose={closeDelete}
        closeLabel={t('close')}
        title={t(deleteTarget?.kind === 'repository' ? 'delete.repository' : 'delete.workspace')}
        {...deleteTarget === null
          ? {}
          : { description: t(deleteTarget.kind === 'repository' ? 'delete.repository.desc' : 'delete.desc', { name: deleteTarget.title }) }}
        footer={(
          <>
            <Button variant="outline" disabled={deleting} onClick={closeDelete}>{t('cancel')}</Button>
            <Button
              variant="outline"
              className={css.deleteAction}
              disabled={deleting}
              onClick={confirmDelete}
            >
              {t(deleteForce
                ? 'delete.confirm.force'
                : deleteTarget?.kind === 'repository' ? 'delete.repository' : 'delete.workspace')}
            </Button>
          </>
        )}
      >
        {deleteBranchOffered && (
          <Checkbox
            className={css.deleteCheck}
            checked={deleteAlsoBranch}
            disabled={deleting}
            onChange={setDeleteAlsoBranch}
            label={t('delete.workspace.branch', { branch: deleteWorktree?.branch ?? '' })}
          />
        )}
        {deleteForce && <div className={css.renameError} role="alert">{t('delete.unsafe')}</div>}
        {deleting && <div className={css.deleteStatus} role="status">{t('delete.pending')}</div>}
        {deleteError !== null && <div className={css.renameError} role="alert">{deleteError}</div>}
      </Modal>

      {/* Typed-path fallback when the Host offers no native directory picker. */}
      <Modal
        open={pathPrompt !== null}
        onClose={() => { if (!addBusy) { setPathPrompt(null); setAddError(null) } }}
        closeLabel={t('close')}
        title={t('workspace.add')}
        description={t('add.path.desc')}
        footer={(
          <>
            <Button variant="outline" disabled={addBusy} onClick={() => { setPathPrompt(null); setAddError(null) }}>{t('cancel')}</Button>
            <Button
              variant="primary"
              disabled={addBusy || pathPromptTrimmed === ''}
              onClick={() => { adoptDirectory(pathPromptTrimmed) }}
            >
              {t('add.confirm')}
            </Button>
          </>
        )}
      >
        <input
          className={css.renameInput}
          value={pathPrompt ?? ''}
          aria-label={t('field.workspacePath')}
          autoFocus
          disabled={addBusy}
          onChange={(e) => { setPathPrompt(e.target.value); setAddError(null) }}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !composingRef.current && pathPromptTrimmed !== '' && !addBusy) {
              e.preventDefault()
              adoptDirectory(pathPromptTrimmed)
            }
          }}
        />
        {pathPrompt !== null && addError !== null && <div className={css.renameError} role="alert">{addError}</div>}
      </Modal>

      {/* Adoption failure after a native pick: retry reopens the picker. */}
      <Modal
        open={pathPrompt === null && addError !== null}
        onClose={() => { setAddError(null) }}
        closeLabel={t('close')}
        title={t('folderError.title')}
        footer={(
          <>
            <Button variant="outline" onClick={() => { setAddError(null) }}>{t('cancel')}</Button>
            <Button variant="primary" disabled={addBusy} onClick={addWorkspace}>{t('folderError.retry')}</Button>
          </>
        )}
      >
        <div className={css.renameError} role="alert">{addError}</div>
      </Modal>
    </div>
  )
}
