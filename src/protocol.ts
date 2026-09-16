/**
 * Wire contract between the plugin's host half and its browser half. The host
 * answers every endpoint with a fresh {@link WorktreeSnapshot} so the client
 * never has to merge partial updates.
 *
 * Transport: exact Fetch routes on the shared, authenticated `/api` channel
 * (`/api/left-panel/<endpoint>`), speaking the Connection RPC envelope so the
 * browser half can use `connection.rpc.call(CHANNEL, methodOf(endpoint), payload)`.
 *
 * The plugin keeps no per-repository switches: registering a repository's
 * worktrees is its default behaviour, and reconciliation runs on its own
 * (startup, workspace changes, git filesystem events, a slow poll), so the
 * browser only asks for a snapshot or for a refresh.
 */

/** Shared Connection channel the plugin's routes live under. */
export const CHANNEL = '/api'

/** First path segment of every endpoint of this plugin below {@link CHANNEL}. */
export const ENDPOINT_PREFIX = 'left-panel'

/**
 * Endpoint names; every one resolves to a {@link WorktreeSnapshot}.
 * - `list`: current snapshot without touching git.
 * - `sync`: reconcile now, then answer (the browser's Refresh action).
 * - `setRepoName`: set the repository's display name; an empty name restores the derived one.
 * - `setWorkspaceTitle`: rename one worktree Workspace, with conflicts scoped to its repository.
 * - `deleteWorkspace`: remove only a linked-worktree Workspace record and retain a tombstone.
 * - `restoreWorkspace`: clear that tombstone and register the unchanged worktree directory again.
 */
export type Endpoint = 'list' | 'sync' | 'setRepoName' | 'setWorkspaceTitle' | 'deleteWorkspace' | 'restoreWorkspace'

export const ENDPOINTS: readonly Endpoint[] = [
  'list', 'sync', 'setRepoName', 'setWorkspaceTitle', 'deleteWorkspace', 'restoreWorkspace',
]

/** The method name the browser passes to `connection.rpc.call`; also the route path below {@link CHANNEL}. */
export function methodOf(endpoint: Endpoint): string {
  return `${ENDPOINT_PREFIX}/${endpoint}`
}

/** One checked-out worktree as the host last observed it. */
export interface WorktreeInfo {
  /** Canonical (realpath) worktree directory. */
  readonly path: string
  /** Full commit hash of HEAD, or '' for a bare entry. */
  readonly head: string
  /** Short branch name (without refs/heads/), or null when detached or bare. */
  readonly branch: string | null
  readonly detached: boolean
  /** The repository's main worktree (first entry git reports). */
  readonly main: boolean
  readonly bare: boolean
  readonly locked: boolean
  /** git marks the worktree prunable: its directory is gone or its gitdir link is broken. */
  readonly prunable: boolean
  /** The directory currently exists on disk. */
  readonly exists: boolean
  /** Display title the plugin derives for this worktree (branch, or short hash when detached). */
  readonly title: string
  /** Registered Workspace id when this worktree currently has one. */
  readonly workspaceId: string | null
}

/** One git repository: every registered worktree-root Workspace that shares a common git dir. */
export interface RepoInfo {
  /** Canonical common git dir; stable identity of the repository. */
  readonly key: string
  /** Display name: the name the user gave this repository, else basename of the main worktree. */
  readonly name: string
  /** Canonical path of the main worktree. */
  readonly mainPath: string
  readonly worktrees: readonly WorktreeInfo[]
  /** Worktree Workspace records explicitly removed by the user and available for restoration. */
  /** Optional while an older host snapshot is still cached during a plugin upgrade. */
  readonly deletedWorktrees?: readonly DeletedWorktreeInfo[]
  /** Last git failure for this repository, when the scan could not complete. */
  readonly error?: string
}

export interface DeletedWorktreeInfo {
  readonly path: string
  readonly branch: string | null
  readonly title: string
}

/** Everything the browser half needs to draw repositories and their worktrees. */
export interface WorktreeSnapshot {
  readonly repos: readonly RepoInfo[]
  /** Registered Workspace id → owning repository key, for every worktree-root Workspace. */
  readonly workspaceRepo: Readonly<Record<string, string>>
  /** Epoch ms of the last completed reconcile; 0 before the first one. */
  readonly syncedAt: number
}

/** Empty `name` restores the derived display name. */
export interface SetRepoNameRequest { readonly repoKey: string; readonly name: string }

/** Worktree Workspace title mutation; duplicate titles are rejected only within its repository. */
export interface SetWorkspaceTitleRequest { readonly workspaceId: string; readonly title: string }
