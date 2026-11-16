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
 * - `deleteWorkspace`: remove any Workspace record — an ordinary directory or any worktree of a
 *   scanned repository, the main worktree included — while retaining its directory and sessions;
 *   a worktree path also keeps a durable tombstone so reconciliation cannot recreate it. Adding the
 *   directory back by hand clears only that path's tombstone. With `deleteBranch` a non-main worktree
 *   is also removed from disk (`git worktree remove`) and its branch deleted, leaving no tombstone;
 *   a dirty worktree or unmerged branch is rejected until `force` is passed (the dialog's second
 *   confirmation).
 * - `deleteRepository`: remove every registered Workspace of one repository in a single operation,
 *   tombstoning all of its scanned worktrees first.
 * - `restoreWorkspace`: clear that tombstone and register the unchanged worktree directory again.
 * - `branchOptions`: the choices the new-worktree dialog offers — local branches not checked out,
 *   the new-branch start point, and the sibling directories already in use. Answers a
 *   {@link BranchOptions} rather than a snapshot; it is the one read endpoint that touches git.
 * - `createWorktree`: run `git worktree add` for one repository — checking an existing branch out
 *   or growing a new one — then reconcile so the new worktree registers like a manual `git` add.
 * - `renameBranch`: rename the git branch checked out in a worktree (`git branch -m`); a Workspace
 *   title that still mirrors the old branch name follows the rename.
 */
export type Endpoint = 'list' | 'sync' | 'setRepoName' | 'setWorkspaceTitle' | 'deleteWorkspace' | 'deleteRepository' | 'restoreWorkspace' | 'branchOptions' | 'createWorktree' | 'renameBranch'

export const ENDPOINTS: readonly Endpoint[] = [
  'list', 'sync', 'setRepoName', 'setWorkspaceTitle', 'deleteWorkspace', 'deleteRepository', 'restoreWorkspace',
  'branchOptions', 'createWorktree', 'renameBranch',
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

/** Workspace removal; the extras apply only to a non-main worktree sitting on a branch. */
export interface DeleteWorkspaceRequest {
  readonly workspaceId: string
  /** Also `git worktree remove` the directory and delete its branch; no tombstone is kept. */
  readonly deleteBranch?: boolean | undefined
  /** Second-confirmation acknowledgement: drop uncommitted changes and unmerged commits too. */
  readonly force?: boolean | undefined
}

/** Rename the branch checked out in a worktree. */
export interface RenameBranchRequest {
  readonly workspaceId: string
  /** New short branch name; must pass `git check-ref-format` and not collide with an existing branch. */
  readonly branch: string
}

/** The choices the new-worktree dialog offers for one repository. */
export interface BranchOptions {
  readonly repoKey: string
  /** Local branch names not checked out in any of the repository's worktrees. */
  readonly availableBranches: readonly string[]
  /** Start point a new branch grows from (the main worktree's checked-out branch or short hash). */
  readonly base: string
  /** Parent directories the repository's worktrees already live in, the main worktree's first. */
  readonly parents: readonly string[]
  /** Basename of the main worktree directory; the path suggestion's name prefix. */
  readonly dirName: string
}

/** Create one worktree under a repository: check out `branch`, or grow it when unknown. */
export interface CreateWorktreeRequest {
  readonly repoKey: string
  /** Branch to check out, or to create when no local branch of that name exists. */
  readonly branch: string
  /** Absolute directory to create the worktree at; must not exist. */
  readonly path: string
  /** Start point for a new branch; defaults to the repository's main-worktree HEAD. */
  readonly base?: string | undefined
}
