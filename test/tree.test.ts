import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  arrangeSections, deriveActive, deriveFlat, deriveGroups, deriveSearchResults, planWorkspaceMove,
  repoGroupKey, workspaceDropAllowed, type GroupNode,
} from '../src/client/tree.ts'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RepoInfo, WorktreeInfo, WorktreeSnapshot } from '../src/protocol.ts'

function group(workspaceId: string, label: string, cwd: string, containsCurrent = false): GroupNode {
  return {
    key: workspaceId,
    workspaceId: workspaceId as GroupNode['workspaceId'],
    cwd,
    createdAt: 0,
    label,
    sessionCount: 0,
    expanded: true,
    containsCurrent,
    running: false,
    completedUnread: false,
    pendingInteraction: false,
    sessions: [],
  }
}

function worktree(path: string, title: string, workspaceId: string | null, main = false): WorktreeInfo {
  return {
    path, head: 'a'.repeat(40), branch: title, detached: false, main, bare: false,
    locked: false, prunable: false, exists: true, title, workspaceId,
  }
}

function repo(key: string, worktrees: WorktreeInfo[]): RepoInfo {
  return {
    key,
    name: key.split('/').slice(-2, -1)[0] ?? key,
    mainPath: worktrees.find(w => w.main)?.path ?? '',
    worktrees,
    deletedWorktrees: [],
  }
}

function snapshot(repos: RepoInfo[]): WorktreeSnapshot {
  const workspaceRepo: Record<string, string> = {}
  for (const entry of repos) {
    for (const worktree of entry.worktrees) {
      if (worktree.workspaceId !== null) workspaceRepo[worktree.workspaceId] = entry.key
    }
  }
  return { repos, workspaceRepo, syncedAt: 1 }
}

test('folds worktree groups under their repository in durable Host order', () => {
  const wsA = 'ws-a', wsB = 'ws-b'
  const sections = arrangeSections(
    [group(wsA, 'feat/login', '/wt/login'), group('ws-plain', 'plain', '/plain'), group(wsB, 'fix/sidebar', '/wt/sidebar')],
    snapshot([repo('/repo/.git', [
      worktree('/repo', 'main', 'ws-main', true),
      worktree('/wt/login', 'feat/login', wsA),
      worktree('/wt/sidebar', 'fix/sidebar', wsB),
    ])]),
    {},
  )
  assert.equal(sections.length, 2)
  const first = sections[0]
  assert.ok(first?.kind === 'repo')
  assert.equal(first.repo.key, '/repo/.git')
  assert.deepEqual(first.groups.map(g => g.label), ['feat/login', 'fix/sidebar'])
  const second = sections[1]
  assert.ok(second?.kind === 'group')
  assert.equal(second.group.label, 'plain')
})

test('a repository shows only registered groups: no row is invented from the snapshot', () => {
  // /repo is registered (ws-main) but its group is absent — for example the
  // Workspace was just deleted and the Workspaces stream has not caught up.
  // The row must vanish rather than be re-synthesized from the worktree list.
  const sections = arrangeSections(
    [group('ws-a', 'feat/a', '/wt/a')],
    snapshot([repo('/repo/.git', [
      worktree('/repo', 'main', 'ws-main', true),
      worktree('/wt/a', 'feat/a', 'ws-a'),
    ])]),
    {},
  )
  assert.equal(sections.length, 1)
  const section = sections[0]
  assert.ok(section?.kind === 'repo')
  assert.deepEqual(section.groups.map(g => g.label), ['feat/a'])
})

test('repo node placement follows its first workspace, not its own order', () => {
  const sections = arrangeSections(
    [group('ws-plain', 'plain', '/plain'), group('ws-a', 'feat/a', '/wt/a')],
    snapshot([repo('/repo/.git', [
      worktree('/repo', 'main', 'ws-main', true),
      worktree('/wt/a', 'feat/a', 'ws-a'),
    ])]),
    {},
  )
  assert.equal(sections.length, 2)
  assert.equal(sections[0]?.kind, 'group')
  assert.equal(sections[1]?.kind, 'repo')
})

test('a repository whose every worktree is gone renders no section at all', () => {
  const sections = arrangeSections([], snapshot([repo('/repo/.git', [
    worktree('/repo', 'main', 'ws-main', true),
  ])]), {})
  assert.deepEqual(sections, [])
})

test('containsCurrent rolls up from the worktree groups', () => {
  const snap = snapshot([repo('/repo/.git', [
    worktree('/repo', 'main', 'ws-main', true),
    worktree('/wt/a', 'feat/a', 'ws-a'),
  ])])
  const quiet = arrangeSections(
    [group('ws-main', 'main', '/repo'), group('ws-a', 'feat/a', '/wt/a')],
    snap, {},
  )
  assert.equal(quiet[0]?.kind === 'repo' ? quiet[0].containsCurrent : undefined, false)
  const active = arrangeSections(
    [group('ws-main', 'main', '/repo'), group('ws-a', 'feat/a', '/wt/a', true)],
    snap, {},
  )
  assert.equal(active[0]?.kind === 'repo' ? active[0].containsCurrent : undefined, true)
})

test('repository sections expose their workspace ids in durable order', () => {
  const sections = arrangeSections(
    [group('ws-wt', 'feat/a', '/wt/a'), group('ws-main', 'main', '/repo')],
    snapshot([repo('/repo/.git', [
      worktree('/repo', 'main', 'ws-main', true),
      worktree('/wt/a', 'feat/a', 'ws-wt'),
    ])]),
    {},
  )
  const section = sections[0]
  assert.ok(section?.kind === 'repo')
  assert.deepEqual(section.groups.map(group => group.label), ['feat/a', 'main'])
  assert.deepEqual(section.workspaceIds, ['ws-wt', 'ws-main'], 'durable order, not display order')
})

test('planWorkspaceMove reorders a single workspace against the durable order', () => {
  const order = ['a', 'b', 'c']
  assert.deepEqual(planWorkspaceMove(order, ['c'], { ids: ['a'], half: 'before' }), { ids: ['c'], anchor: 'a' })
  assert.deepEqual(planWorkspaceMove(order, ['a'], { ids: ['b'], half: 'after' }), { ids: ['a'], anchor: 'c' })
  assert.equal(planWorkspaceMove(order, ['a'], { ids: ['a'], half: 'before' }), undefined, 'dropping on itself')
  assert.equal(planWorkspaceMove(order, ['a'], { ids: ['b'], half: 'before' }), undefined, 'already there')
  assert.deepEqual(planWorkspaceMove(order, ['a'], { ids: ['c'], half: 'after' }), { ids: ['a'], anchor: undefined }, 'to the end')
})

test('workspace drops stay within the same hierarchy level and repository', () => {
  assert.equal(workspaceDropAllowed(undefined, undefined), true, 'top-level sections')
  assert.equal(workspaceDropAllowed('repo-a', 'repo-a'), true, 'same repository')
  assert.equal(workspaceDropAllowed('repo-a', 'repo-b'), false, 'different repositories')
  assert.equal(workspaceDropAllowed('repo-a', undefined), false, 'worktree onto top level')
  assert.equal(workspaceDropAllowed(undefined, 'repo-a'), false, 'top level onto worktree')
})

test('planWorkspaceMove moves a repository block as one unit, keeping its order', () => {
  const order = ['a1', 'a2', 'b1', 'c1']
  // block a (a1,a2) dropped after the b row: it lands before c1 and keeps a1,a2 order.
  assert.deepEqual(planWorkspaceMove(order, ['a1', 'a2'], { ids: ['b1'], half: 'after' }), { ids: ['a1', 'a2'], anchor: 'c1' })
  // block c dropped before a: anchor is a's first workspace.
  assert.deepEqual(planWorkspaceMove(order, ['c1'], { ids: ['a1', 'a2'], half: 'before' }), { ids: ['c1'], anchor: 'a1' })
  // a block dropped onto one of its own rows never reorders.
  assert.equal(planWorkspaceMove(order, ['a1', 'a2'], { ids: ['a1', 'a2'], half: 'before' }), undefined)
  // a block already in front of its target is a no-op.
  assert.equal(planWorkspaceMove(order, ['a1', 'a2'], { ids: ['b1'], half: 'before' }), undefined)
})

test('dropping after a repository targets the end of all its worktrees', () => {
  const order = ['a1', 'a2', 'b1', 'b2', 'b3', 'c1']
  assert.deepEqual(
    planWorkspaceMove(order, ['a1', 'a2'], { ids: ['b1', 'b2', 'b3'], half: 'after' }),
    { ids: ['a1', 'a2'], anchor: 'c1' },
  )
  assert.deepEqual(
    planWorkspaceMove(order, ['c1'], { ids: ['a1', 'a2'], half: 'after' }),
    { ids: ['c1'], anchor: 'b1' },
  )
})

function session(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: id as SessionId,
    displayTitle: id,
    running: false,
    retainedBy: {},
    blank: false,
    updatedAt: 1,
    ...overrides,
  }
}

function sessionState(sessions: readonly SessionSummary[]): SessionListState {
  return {
    ids: sessions.map(entry => entry.id),
    byId: Object.fromEntries(sessions.map(entry => [entry.id, entry])),
    phase: 'ready',
    projectionsBySession: {},
  }
}

function workspaceView(id: string, sessionIds: readonly SessionId[]): WorkspaceView {
  return {
    workspaceId: id as WorkspaceView['workspaceId'],
    path: `/tmp/${id}`,
    title: id,
    sessionIds,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
}

test('a renamed blank Session stays visible with its title after selection moves', () => {
  const ordinary = session('ordinary', { displayTitle: 'Existing work', retainedBy: { mainView: 1 } })
  const named = session('named', { blank: true, title: 'Draft label' })
  const unnamed = session('unnamed', { blank: true, title: '' })
  const list = sessionState([ordinary, named, unnamed])
  const workspaces = [workspaceView('ws', list.ids)]

  const groups = deriveGroups(list, workspaces, [], new Map(), new Set(), { expandedGroups: ['ws'] })
  assert.deepEqual(groups[0]?.sessions.map(row => row.id), ['ordinary', 'named'])
  const namedRow = groups[0]?.sessions.find(row => row.id === 'named')
  assert.equal(namedRow?.title, 'Draft label')
  assert.equal(namedRow?.blank, true, 'the row still has no turn, so its menu must omit fork')

  // The flat list follows the same visibility contract.
  assert.deepEqual(deriveFlat(list, [], new Map(), new Set()).map(row => row.id), ['named', 'ordinary'])

  // A named blank is searchable by its durable title; unnamed blanks remain excluded.
  const namedHits = deriveSearchResults(
    list, workspaces, 'draft', [], new Map(), new Set(), { items: [], hasMore: false }, 10,
  )
  assert.deepEqual(namedHits.items.map(row => row.id), ['named'])
  assert.equal(namedHits.items[0]?.blank, true)
  const unnamedHits = deriveSearchResults(
    list, workspaces, 'unnamed', [], new Map(), new Set(), { items: [], hasMore: false }, 10,
  )
  assert.deepEqual(unnamedHits.items, [])
})

test('deriveActive pins running, pending, and unread sessions newest-first regardless of expansion', () => {
  const running = session('running', { running: true, updatedAt: 1 })
  const idle = session('idle', { updatedAt: 4 })
  const unread = session('unread', { updatedAt: 3 })
  const pending = session('pending', { updatedAt: 2 })
  const archived = session('archived', { running: true, updatedAt: 5 })
  const list = sessionState([archived, idle, unread, pending, running])
  const statuses = new Map<string, { completionUnread?: boolean; pendingInteraction?: { kind: string } }>([
    ['unread', { completionUnread: true }],
    ['pending', { pendingInteraction: { kind: 'approval' } }],
  ])

  // No group expansion is consulted: active rows come straight from the list.
  assert.deepEqual(
    deriveActive(list, ['archived' as SessionId], statuses as never, new Set()).map(row => row.id),
    ['unread', 'pending', 'running'],
  )
})

test('the selected unnamed blank Session keeps its localized placeholder title', () => {
  const current = session('current', { blank: true, title: '', retainedBy: { mainView: 1 } })
  const list = sessionState([current])
  const groups = deriveGroups(list, [workspaceView('ws', list.ids)], [], new Map(), new Set(), { expandedGroups: ['ws'] })
  assert.deepEqual(groups[0]?.sessions.map(row => row.id), ['current'])
  assert.equal(groups[0]?.sessions[0]?.title, '', 'the renderer localizes the placeholder label')
})
