/**
 * Derived from @deepseek-ai/dsh-client-ui-workspace 0.1.5-rc.2 (MIT License,
 * Copyright (c) 2026 DeepSeek). Adapted for dsh-left-panel: repositories
 * group their worktrees and Workspace registration follows git.
 */
/**
 * Browser contract. One registration shadows the sidebar shell's
 * `sidebar.workspaces` hole with a repository-aware WorkspaceBrowser: the
 * whole browsing region (section header, search, grouped/flat session list,
 * workspace dialogs). It registers this plugin's viewing store and consumes
 * the shell's two-fact owner share (wide / expandSidebar).
 *
 * Adding a Workspace goes through the Host-native directory picker
 * (`uiWorkspace.pickDirectory`) instead of a directory-flow child hole: the
 * shipped browser entry already declares that hole and a slot child has
 * exactly one declaring entry.
 */
import type { HostObservable, PropsHooks, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the owner SlotMap merge for `sidebar.workspaces`.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: the standard hooks (useWorkspaces, useSessions, usePanelInfo) merged into the props.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the shared `common` vocabulary reachable through every namespace seat.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { SessionSearchResultItem } from '@deepseek-ai/dsh-api-session-controller/client'
import type { RemoteHostFacts } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { createWorkspaceViewStore } from '../stores.ts'
import type { WorktreeSnapshot } from '../../protocol.ts'
import type { WorktreeActions } from '../worktrees.ts'
import type { LeftPanelKey } from '../locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The repository-aware workspace browsing region copy. */
    'left-panel': LeftPanelKey
  }
}

/**
 * Browser-private injected share (arrives via the register inject factory).
 * Data reads use the global framework hooks; these are the Host actions the
 * browsing region drives.
 */
export type WorkspaceBrowserInjected = {
  hooks: {
    /**
     * Fixed Host facts, reached through a hook rather than injected as values:
     * the renderer memoizes an entry's inject result for the registration's
     * lifetime, so facts read there would freeze at whatever the first render
     * saw. Select the field the surface needs (`info => info.home`).
     */
    hostInfo: HostObservable<RemoteHostFacts>
    /** Repositories and their worktrees as the host last observed them. */
    worktrees: HostObservable<WorktreeSnapshot>
  }
  /**
   * Start a New Session in a Workspace: reuse-or-create its blank session and
   * open it; without an explicit workspace, inherit the current Session
   * Workspace, then the recent Workspace, or clear into the New Session view.
   */
  startSession: (workspaceId?: WorkspaceId) => void
  /** Open a real Session. */
  open: (sessionId: SessionId) => void
  /**
   * Search current visible conversation messages. The Host fixes the result
   * bound; `hasMore` means the query needs narrowing.
   */
  searchSessions: (
    query: string,
    signal: AbortSignal,
  ) => Promise<{ items: readonly SessionSearchResultItem[]; hasMore: boolean }>
  /** Maximum number of merged rows rendered for one search. */
  searchResultLimit: number
  /** Rename a Session (explicit user title; resolves on host acceptance). */
  renameSession: (sessionId: SessionId, title: string) => Promise<void>
  /** Fork a Session at its last completed turn and open the child. */
  forkSession: (sessionId: SessionId) => void
  /** Rename a Host Workspace (rejects on name conflict; resolves on durability). */
  renameWorkspace: (workspaceId: WorkspaceId, title: string) => Promise<void>
  /** Delete only a Host Workspace registration; directory and Session logs remain. */
  deleteWorkspace: (workspaceId: WorkspaceId) => Promise<void>
  /**
   * Reorder a Workspace in the durable registry display order.
   * Omitted anchor appends to the end.
   */
  insertWorkspaceBefore: (workspaceId: WorkspaceId, beforeWorkspaceId?: WorkspaceId) => Promise<void>
  /**
   * Archive a Session into the registry-global set: hidden from grouping
   * surfaces, log and accounting slot retained. Archiving the current
   * session clears the selection into the New Session view state.
   */
  archiveSession: (sessionId: SessionId) => Promise<void>
  /**
   * Reorder a session inside its Workspace account (DOM-insertBefore
   * semantics: omitted anchor appends to the end). The view refreshes from
   * the Host response/changed frame; failures leave the order unchanged.
   */
  insertSessionBefore: (workspaceId: WorkspaceId, sessionId: SessionId, beforeSessionId?: SessionId) => Promise<void>
  /** Adopt a picked host directory as a real Workspace before targeting a Session. */
  createWorkspace: (input: { path: string }) => Promise<WorkspaceView>
  /** Open the Host-native directory picker; null when the operator cancels, rejects when no picker is available. */
  pickDirectory: () => Promise<string | null>
  /** Worktree registration actions answered by the plugin's host half. */
  worktrees: WorktreeActions
}

/** Full browser props: shell owner share + viewing store + injected actions + the locale seat. */
export type WorkspaceBrowserProps =
  PropsRuntime<'sidebar.workspaces'>
  & PropsStore<ReturnType<typeof createWorkspaceViewStore>>
  & Omit<WorkspaceBrowserInjected, 'hooks'>
  & PropsHooks<WorkspaceBrowserInjected['hooks']>
  & PropsLocale<'left-panel'>
