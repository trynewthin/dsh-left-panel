/**
 * Wire contract between the plugin's host half and its browser half. The host
 * answers every endpoint with a fresh {@link WorktreeSnapshot} so the client
 * never has to merge partial updates.
 *
 * Transport: exact Fetch routes on the shared, authenticated `/api` channel
 * (`/api/left-panel/<endpoint>`), speaking the Connection RPC envelope so the
 * browser half can use `connection.rpc.call(CHANNEL, methodOf(endpoint), payload)`.
 */

/** Shared Connection channel the plugin's routes live under. */
export const CHANNEL = '/api'

/** First path segment of every endpoint of this plugin below {@link CHANNEL}. */
export const ENDPOINT_PREFIX = 'left-panel'

/**
 * Endpoint names; every one resolves to a {@link WorktreeSnapshot}.
 * - `list`: current snapshot without touching git.
 * - `sync`: reconcile now, then answer.
 * - `ignore`: unregister a worktree's Workspace and stop registering it automatically.
 * - `unignore`: allow automatic registration again (an automatic repository registers it at once).
 * - `register`: register one worktree now, clearing any ignore.
 * - `setRepoAuto`: switch automatic registration for one repository.
 * - `setRepoName`: set the repository's display name; an empty name restores the derived one.
 */
export type Endpoint = 'list' | 'sync' | 'ignore' | 'unignore' | 'register' | 'setRepoAuto' | 'setRepoName'

export const ENDPOINTS: readonly Endpoint[] = [
  'list', 'sync', 'ignore', 'unignore', 'register', 'setRepoAuto', 'setRepoName',
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
  /** The user removed this worktree's Workspace; the plugin will not register it again until un-ignored. */
  readonly ignored: boolean
}

/** One git repository: every registered worktree-root Workspace that shares a common git dir. */
export interface RepoInfo {
  /** Canonical common git dir; stable identity of the repository. */
  readonly key: string
  /** Display name: the name the user gave this repository, else basename of the main worktree. */
  readonly name: string
  /** Canonical path of the main worktree. */
  readonly mainPath: string
  /** Automatic register/unregister is enabled for this repository. */
  readonly auto: boolean
  readonly worktrees: readonly WorktreeInfo[]
  /** Last git failure for this repository, when the scan could not complete. */
  readonly error?: string
}

/** Everything the browser half needs to draw repositories and their worktrees. */
export interface WorktreeSnapshot {
  readonly repos: readonly RepoInfo[]
  /** Registered Workspace id → owning repository key, for every worktree-root Workspace. */
  readonly workspaceRepo: Readonly<Record<string, string>>
  /** Epoch ms of the last completed reconcile; 0 before the first one. */
  readonly syncedAt: number
  readonly syncing: boolean
}

export interface IgnoreRequest { readonly path: string }
export interface SetRepoAutoRequest { readonly repoKey: string; readonly auto: boolean }
/** Empty `name` restores the derived display name. */
export interface SetRepoNameRequest { readonly repoKey: string; readonly name: string }
export interface RegisterRequest { readonly path: string }
