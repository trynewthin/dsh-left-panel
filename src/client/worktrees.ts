/**
 * Browser-side view of the host's worktree snapshot: one observable the slot
 * renderer binds into `useWorktrees`, refreshed by polling, by every Workspace
 * change, and after each action the user takes. Actions resolve once the host
 * has answered with the resulting snapshot.
 */
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

import { CHANNEL, methodOf, type Endpoint, type WorktreeSnapshot } from '../protocol.ts'

export const EMPTY_SNAPSHOT: WorktreeSnapshot = { repos: [], workspaceRepo: {}, syncedAt: 0 }

export interface WorktreeActions {
  /** Reconcile now and answer with the fresh snapshot (the Refresh action). */
  refresh(): Promise<void>
  /** Set a repository's display name; an empty name restores the derived one. */
  setRepoName(repoKey: string, name: string): Promise<void>
  /** Rename a worktree Workspace; title conflicts are scoped to its repository. */
  setWorkspaceTitle(workspaceId: string, title: string): Promise<void>
  /** Remove only a Workspace registration and retain a restorable tombstone. */
  deleteWorkspace(workspaceId: string): Promise<void>
  /** Re-register a tombstoned worktree path and reattach its sessions. */
  restoreWorkspace(path: string): Promise<void>
}

export interface WorktreeClient {
  readonly source: HostObservable<WorktreeSnapshot>
  readonly actions: WorktreeActions
  /** Begin polling and following Workspace changes. */
  start(): () => void
}

const POLL_MS = 15_000
const FOLLOW_DEBOUNCE_MS = 300

function isSnapshot(value: unknown): value is WorktreeSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate.repos)
    && typeof candidate.workspaceRepo === 'object' && candidate.workspaceRepo !== null
    && typeof candidate.syncedAt === 'number'
}

export function createWorktreeClient(connection: ConnectionHandle, workspaces: IWorkspaces): WorktreeClient {
  let snapshot = EMPTY_SNAPSHOT
  const listeners = new Set<() => void>()
  const publish = (next: WorktreeSnapshot): void => {
    snapshot = next
    for (const listener of listeners) listener()
  }
  const call = async (endpoint: Endpoint, payload: unknown = {}): Promise<void> => {
    const result = await connection.rpc.call(CHANNEL, methodOf(endpoint), payload)
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    if (!isSnapshot(result.value)) throw new Error(`left-panel: malformed snapshot from ${endpoint}`)
    publish(result.value)
  }
  const refresh = (): void => {
    call('list').catch((reason: unknown) => { console.warn('left-panel: worktree list failed:', reason) })
  }
  return {
    source: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    actions: {
      refresh: () => call('sync'),
      setRepoName: (repoKey, name) => call('setRepoName', { repoKey, name }),
      setWorkspaceTitle: (workspaceId, title) => call('setWorkspaceTitle', { workspaceId, title }),
      deleteWorkspace: workspaceId => call('deleteWorkspace', { workspaceId }),
      restoreWorkspace: path => call('restoreWorkspace', { path }),
    },
    start() {
      refresh()
      const timer = window.setInterval(refresh, POLL_MS)
      let debounce: number | undefined
      const unsubscribe = workspaces.list.subscribe(() => {
        if (debounce !== undefined) window.clearTimeout(debounce)
        debounce = window.setTimeout(() => {
          debounce = undefined
          refresh()
        }, FOLLOW_DEBOUNCE_MS)
      })
      return () => {
        window.clearInterval(timer)
        if (debounce !== undefined) window.clearTimeout(debounce)
        unsubscribe()
      }
    },
  }
}
