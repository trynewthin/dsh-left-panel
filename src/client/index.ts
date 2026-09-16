/**
 * Browser half. One registration shadows the shipped WorkspaceBrowser in the
 * sidebar shell's `sidebar.workspaces` hole (lower priority renders) with a
 * repository-aware browser: git repositories become fold nodes whose children
 * are their worktrees, each a real Host Workspace. The shipped ui-workspace
 * plugin stays loaded — its `uiWorkspace` service and `useWorkspaces` hook are
 * reused, while the sidebar and conversation-hero picker are grouped by repository.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteHostFacts } from '@deepseek-ai/dsh-api-remotes/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: Context merges for ctx.locale, ctx.slots, ctx.layout, ctx.remote, ctx.uiWorkspace.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { GroupedWorkspacePickerInjected, WorkspaceBrowserInjected } from './contract/slots.ts'
import { GroupedWorkspacePicker } from './GroupedWorkspacePicker.tsx'
import { en, NS, zh } from './locales.ts'
import { WorkspaceBrowser } from './rows/WorkspaceBrowser.tsx'
import { createWorkspaceViewStore } from './stores.ts'
import { createWorktreeClient } from './worktrees.ts'

export type { WorkspaceBrowserInjected, WorkspaceBrowserProps } from './contract/slots.ts'
export type { LeftPanelKey } from './locales.ts'

export const name = 'left-panel'

/**
 * Required services (cordis fiber inject). The target slot is declared by the
 * ui-sidebar apply, whose activation order relative to this one is not
 * constrained, so registration waits on the declaration through `slots.inject()`.
 */
export const inject = [
  'slots', 'sessions', 'workspaces', 'locale', 'remote', 'layout', 'uiWorkspace', 'connection',
]

/** Below the shipped entry's default 0: the lowest priority renders. */
const SHADOW_PRIORITY = -1

export function apply(ctx: Context): void {
  // The host halves of these services merge their own Context types into this
  // program; the browser-side faces are what the client runtime provides.
  const sessions = ctx.get('sessions') as unknown as ISessions
  const workspaces = ctx.get('workspaces') as IWorkspaces
  const connection = ctx.get('connection') as unknown as ConnectionHandle
  const uiWorkspace = ctx.uiWorkspace
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'left-panel: dictionaries')

  const worktrees = createWorktreeClient(connection, workspaces)
  ctx.effect(() => worktrees.start(), 'left-panel: worktree snapshot')

  const searchSessions: WorkspaceBrowserInjected['searchSessions'] = async (query, signal) => {
    const result = await sessions.search(query, signal)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const hostInfo: HostObservable<RemoteHostFacts> = {
    getSnapshot: () => ctx.remote.$host,
    subscribe: listener => ctx.on('connection/reset', listener),
  }

  const injected = (): WorkspaceBrowserInjected => ({
    startSession: (workspaceId) => { uiWorkspace.startSession(workspaceId) },
    open: (sessionId) => { uiWorkspace.openSession(sessionId) },
    searchSessions,
    searchResultLimit: sessions.searchResultLimit,
    renameSession: async (sessionId, title) => {
      const session = sessions.binding(sessionId)?.session
      if (session === undefined) throw new Error(`unknown session "${sessionId}"`)
      const result = await session.rename(title)
      if (!result.ok) throw new Error(result.error.message)
    },
    forkSession: (sessionId) => {
      uiWorkspace.forkSession(sessionId).catch(() => {
        // Fork or child-rename failure keeps the current selection.
      })
    },
    renameWorkspace: async (workspaceId, title) => { await workspaces.rename(workspaceId, title) },
    insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
      await workspaces.insertBefore(workspaceId, beforeWorkspaceId)
    },
    archiveSession: async (sessionId) => { await uiWorkspace.archiveSession(sessionId) },
    insertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
      await workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId)
    },
    createWorkspace: input => workspaces.create(input),
    pickDirectory: () => uiWorkspace.pickDirectory(),
    worktrees: worktrees.actions,
    hooks: { hostInfo, worktrees: worktrees.source },
  })
  const pickerInjected = (): GroupedWorkspacePickerInjected => ({
    createWorkspace: input => workspaces.create(input),
    pickDirectory: () => uiWorkspace.pickDirectory(),
    hooks: { worktrees: worktrees.source },
  })

  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register(
    {
      name: 'sidebar.workspaces',
      priority: SHADOW_PRIORITY,
      store: createWorkspaceViewStore(),
      inject: injected,
      locale: NS,
    },
    WorkspaceBrowser,
  ))
  ctx.slots.inject('conversation.hero.workspace', () => ctx.slots.register(
    {
      name: 'conversation.hero.workspace',
      priority: SHADOW_PRIORITY,
      inject: pickerInjected,
      locale: NS,
    },
    GroupedWorkspacePicker,
  ))
}
