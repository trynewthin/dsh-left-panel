import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'

import { workspacePickerEntries } from '../src/client/workspace-picker-tree.ts'
import type { WorktreeInfo, WorktreeSnapshot } from '../src/protocol.ts'

function workspace(id: string, title: string): WorkspaceView {
  return {
    workspaceId: id as WorkspaceView['workspaceId'], path: `/${id}`, title,
    sessionIds: [], createdAt: '', updatedAt: '',
  }
}

function checkout(workspaceId: string | null, branch: string | null, overrides: Partial<WorktreeInfo> = {}): WorktreeInfo {
  return {
    path: `/${workspaceId ?? 'unregistered'}`, head: 'abc1234', branch, detached: branch === null,
    main: false, bare: false, locked: false, prunable: false, exists: true,
    title: branch ?? 'abc1234', workspaceId, ...overrides,
  }
}

test('groups choices by project and uses Git branch names in Workspace order', () => {
  const workspaces = [workspace('a2', 'Custom title'), workspace('plain', 'notes'), workspace('a1', 'main'), workspace('b1', 'main')]
  const snapshot: WorktreeSnapshot = {
    repos: [
      { key: 'repo-a', name: 'Project A', mainPath: '/a', worktrees: [checkout('a1', 'main', { main: true }), checkout('a2', 'feature/login')] },
      { key: 'repo-b', name: 'Project B', mainPath: '/b', worktrees: [checkout('b1', 'main', { main: true })] },
    ],
    workspaceRepo: { a1: 'repo-a', a2: 'repo-a', b1: 'repo-b' },
    syncedAt: 1,
  }
  assert.deepEqual(workspacePickerEntries(workspaces, snapshot), [
    { kind: 'project', id: 'repo:repo-a', name: 'Project A', branches: [
      { workspaceId: 'a2', name: 'feature/login', main: false }, { workspaceId: 'a1', name: 'main', main: true },
    ] },
    { kind: 'workspace', workspace: workspaces[1] },
    { kind: 'project', id: 'repo:repo-b', name: 'Project B', branches: [{ workspaceId: 'b1', name: 'main', main: true }] },
  ])
})

test('offers a branch only when its worktree exists and is registered', () => {
  const workspaces = ['main', 'detached', 'broken', 'bare', 'stale', 'missing'].map(id => workspace(id, id))
  const snapshot: WorktreeSnapshot = {
    repos: [
      { key: 'repo-a', name: 'Project A', mainPath: '/a', worktrees: [
        checkout('main', 'main', { main: true }), checkout('detached', null), checkout('broken', 'broken', { prunable: true }),
        checkout('bare', 'bare', { bare: true }), checkout('missing', 'missing', { exists: false }),
        checkout(null, 'unregistered'), checkout('not-in-stream', 'not-in-stream'),
      ] },
    ],
    workspaceRepo: Object.fromEntries(workspaces.map(ws => [ws.workspaceId, 'repo-a'])),
    syncedAt: 1,
  }
  assert.deepEqual(workspacePickerEntries(workspaces, snapshot), [
    { kind: 'project', id: 'repo:repo-a', name: 'Project A', branches: [{ workspaceId: 'main', name: 'main', main: true }] },
  ])
})
