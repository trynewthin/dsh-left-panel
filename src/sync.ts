/**
 * Pure reconcile planning: given the registered Workspaces, the repositories
 * git reports, and the plugin's memory, decide which Workspaces to create,
 * delete, or retitle. No I/O lives here so every rule is unit-testable.
 *
 * Rules:
 * - a present, unregistered, un-ignored worktree of an auto repository is created;
 * - a registered linked worktree that git no longer lists, or whose directory
 *   is gone, is deleted once it has been gone for {@link REMOVAL_GRACE_MS};
 * - the main worktree is never deleted automatically;
 * - a worktree Workspace still carrying the title the plugin gave it follows
 *   its branch; a user-renamed one is left alone;
 * - an ignored path whose worktree disappears from git is released so a future
 *   worktree at that path is picked up again.
 */
import type { WorktreeEntry } from './git.ts'

/** How long a worktree must stay gone before its Workspace registration is dropped. */
export const REMOVAL_GRACE_MS = 5_000

export interface RegisteredWorkspace {
  readonly id: string
  /** Canonical directory. */
  readonly path: string
  readonly title: string
}

export interface ScannedWorktree extends WorktreeEntry {
  /** Canonical path (realpath when the directory exists). */
  readonly path: string
  readonly exists: boolean
  /** The repository's main worktree (first entry git reports). */
  readonly main: boolean
}

export interface ScannedRepo {
  readonly key: string
  readonly mainPath: string
  readonly worktrees: readonly ScannedWorktree[]
}

export interface SyncMemory {
  readonly ignored: ReadonlySet<string>
  /** Missing entries default to automatic. */
  readonly repoAuto: ReadonlyMap<string, boolean>
  /** Worktree path → repository key, for worktrees the plugin has seen registered. */
  readonly knownWorktrees: ReadonlyMap<string, string>
  /** Worktree path → the title the plugin last assigned to its Workspace. */
  readonly autoTitles: ReadonlyMap<string, string>
  /** Worktree path → epoch ms when it was first observed gone. */
  readonly pendingRemoval: ReadonlyMap<string, number>
}

export type SyncAction =
  | { readonly type: 'create'; readonly repoKey: string; readonly path: string; readonly title: string; readonly mainWorkspaceId: string | undefined }
  | { readonly type: 'delete'; readonly repoKey: string; readonly path: string; readonly workspaceId: string; readonly reason: 'worktree-gone' | 'directory-missing' }
  | { readonly type: 'retitle'; readonly path: string; readonly workspaceId: string; readonly title: string }

export interface SyncPlan {
  readonly actions: readonly SyncAction[]
  /** Replacement for {@link SyncMemory.pendingRemoval}. */
  readonly pendingRemoval: ReadonlyMap<string, number>
  /** Replacement for {@link SyncMemory.knownWorktrees}. */
  readonly knownWorktrees: ReadonlyMap<string, string>
  /** Ignored paths to forget. */
  readonly releaseIgnored: readonly string[]
  /** Epoch ms when a pending removal becomes due, when any is pending. */
  readonly nextCheckAt: number | undefined
}

/** Branch name, or the short hash while detached. */
export function worktreeTitle(entry: WorktreeEntry): string {
  if (entry.branch !== null && entry.branch !== '') return entry.branch
  if (entry.head !== '') return entry.head.slice(0, 7)
  return entry.path.split(/[\\/]/).filter(segment => segment !== '').pop() ?? entry.path
}

export function planSync(
  registry: readonly RegisteredWorkspace[],
  repos: readonly ScannedRepo[],
  memory: SyncMemory,
  now: number,
  graceMs: number = REMOVAL_GRACE_MS,
): SyncPlan {
  const byPath = new Map(registry.map(workspace => [workspace.path, workspace]))
  const actions: SyncAction[] = []
  const pendingRemoval = new Map<string, number>()
  const knownWorktrees = new Map(memory.knownWorktrees)
  const listedPaths = new Set<string>()

  const consider = (path: string, repoKey: string, workspaceId: string, reason: 'worktree-gone' | 'directory-missing'): void => {
    const since = memory.pendingRemoval.get(path) ?? now
    if (now - since >= graceMs) {
      actions.push({ type: 'delete', repoKey, path, workspaceId, reason })
      knownWorktrees.delete(path)
      return
    }
    pendingRemoval.set(path, since)
  }

  for (const repo of repos) {
    const auto = memory.repoAuto.get(repo.key) ?? true
    const main = repo.worktrees.find(worktree => worktree.main)
    const mainWorkspaceId = main === undefined ? undefined : byPath.get(main.path)?.id
    const repoPaths = new Set<string>()

    for (const worktree of repo.worktrees) {
      if (worktree.bare) continue
      repoPaths.add(worktree.path)
      listedPaths.add(worktree.path)
      const registered = byPath.get(worktree.path)
      const present = worktree.exists && !worktree.prunable
      if (registered !== undefined) {
        knownWorktrees.set(worktree.path, repo.key)
        if (!present) {
          if (!worktree.main && auto) consider(worktree.path, repo.key, registered.id, 'directory-missing')
          continue
        }
        const title = worktreeTitle(worktree)
        const assigned = memory.autoTitles.get(worktree.path)
        if (assigned !== undefined && registered.title === assigned && title !== assigned) {
          actions.push({ type: 'retitle', path: worktree.path, workspaceId: registered.id, title })
        }
        continue
      }
      if (!present || !auto || memory.ignored.has(worktree.path)) continue
      actions.push({ type: 'create', repoKey: repo.key, path: worktree.path, title: worktreeTitle(worktree), mainWorkspaceId })
    }

    for (const [path, key] of memory.knownWorktrees) {
      if (key !== repo.key || repoPaths.has(path)) continue
      const registered = byPath.get(path)
      if (registered === undefined) {
        knownWorktrees.delete(path)
        continue
      }
      if (path === repo.mainPath || !auto) continue
      consider(path, repo.key, registered.id, 'worktree-gone')
    }
  }

  const releaseIgnored = [...memory.ignored].filter(path => !listedPaths.has(path))
  let nextCheckAt: number | undefined
  for (const since of pendingRemoval.values()) {
    const due = since + graceMs
    if (nextCheckAt === undefined || due < nextCheckAt) nextCheckAt = due
  }
  return { actions, pendingRemoval, knownWorktrees, releaseIgnored, nextCheckAt }
}
