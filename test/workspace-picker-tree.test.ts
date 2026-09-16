import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'

import { visibleWorkspacePickerEntries, workspacePickerEntries } from '../src/client/workspace-picker-tree.ts'
import type { WorktreeSnapshot } from '../src/protocol.ts'

function workspace(id: string, title: string): WorkspaceView {
  return {
    workspaceId: id as WorkspaceView['workspaceId'], path: `/${id}`, title,
    sessionIds: [], createdAt: '', updatedAt: '',
  }
}

test('groups New Session workspace choices by repository in durable order', () => {
  const workspaces = [workspace('a2', 'feature'), workspace('plain', 'notes'), workspace('a1', 'main'), workspace('b1', 'main')]
  const snapshot: WorktreeSnapshot = {
    repos: [
      { key: 'repo-a', name: 'Project A', mainPath: '/a', worktrees: [], deletedWorktrees: [] },
      { key: 'repo-b', name: 'Project B', mainPath: '/b', worktrees: [], deletedWorktrees: [] },
    ],
    workspaceRepo: { a1: 'repo-a', a2: 'repo-a', b1: 'repo-b' },
    syncedAt: 1,
  }
  assert.deepEqual(workspacePickerEntries(workspaces, snapshot).map(entry => entry.kind === 'project'
    ? `project:${entry.name}`
    : `${entry.nested ? 'branch' : 'workspace'}:${entry.workspace.title}`), [
    'project:Project A', 'branch:feature', 'branch:main',
    'workspace:notes',
    'project:Project B', 'branch:main',
  ])
})

test('folds nested workspace choices while keeping project headings and plain workspaces visible', () => {
  const workspaces = [workspace('a1', 'main'), workspace('a2', 'feature'), workspace('plain', 'notes'), workspace('b1', 'main')]
  const snapshot: WorktreeSnapshot = {
    repos: [
      { key: 'repo-a', name: 'Project A', mainPath: '/a', worktrees: [], deletedWorktrees: [] },
      { key: 'repo-b', name: 'Project B', mainPath: '/b', worktrees: [], deletedWorktrees: [] },
    ],
    workspaceRepo: { a1: 'repo-a', a2: 'repo-a', b1: 'repo-b' },
    syncedAt: 1,
  }
  const visible = visibleWorkspacePickerEntries(
    workspacePickerEntries(workspaces, snapshot),
    new Set(['repo:repo-b']),
  )
  assert.deepEqual(visible.map(entry => entry.kind === 'project'
    ? `project:${entry.name}`
    : `${entry.nested ? 'branch' : 'workspace'}:${entry.workspace.title}`), [
    'project:Project A',
    'workspace:notes',
    'project:Project B', 'branch:main',
  ])
})
